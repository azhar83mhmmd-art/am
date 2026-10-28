/* ============================================================
   PT GONDAM — admin.js
   Dashboard admin: auth guard (Supabase Auth), tab switching,
   CRUD akun/tawaran/pengajuan/transaksi/kategori, pengaturan
   situs, realtime notif. Migrasi: semua panggilan /api/* diganti
   query Supabase langsung (RLS membatasi ke role admin).
   ============================================================ */

(function () {
  const shell = document.querySelector('[data-admin-shell]');
  if (!shell) return; // bukan halaman admin.html

  let categoriesCache = [];

  // ── Auth guard (Supabase Auth + role admin di tabel profiles) ─
  async function checkAuth() {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        window.location.href = 'login.html';
        return false;
      }
      const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error || !profile || profile.role !== 'admin') {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return false;
      }
      shell.style.display = '';
      return true;
    } catch (e) {
      window.location.href = 'login.html';
      return false;
    }
  }

  // Kalau sesi berakhir/logout dari tab lain, ikut terlempar ke login.
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.href = 'login.html';
  });

  // ── Logout ───────────────────────────────────────────────────
  document.querySelector('[data-logout-btn]')?.addEventListener('click', async () => {
    try {
      await supabaseClient.auth.signOut();
    } finally {
      window.location.href = 'login.html';
    }
  });

  // ── Tab switching ────────────────────────────────────────────
  const tabButtons = document.querySelectorAll('[data-tab-btn]');
  const tabPanels = document.querySelectorAll('[data-tab-panel]');
  const loadedTabs = new Set();

  function switchTab(tabName) {
    tabButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tabBtn === tabName));
    tabPanels.forEach((panel) => {
      panel.style.display = panel.dataset.tabPanel === tabName ? '' : 'none';
    });
    loadTabData(tabName);
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tabBtn));
  });

  function loadTabData(tabName) {
    switch (tabName) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'accounts':
        loadAccountsTable();
        if (!loadedTabs.has('categories-cache')) loadCategoriesCache();
        break;
      case 'offers':
        loadOffersTable();
        break;
      case 'sell-requests':
        loadSellRequestsTable();
        break;
      case 'transactions':
        loadTransactionsTable();
        break;
      case 'categories':
        loadCategoriesTable();
        break;
      case 'banners':
        loadBannersGrid();
        break;
      case 'settings':
        loadSettingsForm();
        break;
    }
  }

  // ── Dashboard stats ──────────────────────────────────────────
  async function loadDashboard() {
    const grid = document.querySelector('[data-dashboard-stats]');
    try {
      const countOf = (table, eqCol, eqVal) => {
        let q = supabaseClient.from(table).select('id', { count: 'exact', head: true });
        if (eqCol) q = q.eq(eqCol, eqVal);
        return q;
      };
      const [totalAccounts, availableAccounts, soldAccounts, pendingSellRequests, pendingOffers, totalTransactions] =
        await Promise.all([
          countOf('accounts'),
          countOf('accounts', 'status', 'AVAILABLE'),
          countOf('accounts', 'status', 'SOLD'),
          countOf('sell_requests', 'status', 'PENDING'),
          countOf('offers', 'status', 'PENDING'),
          countOf('transactions'),
        ]);

      const values = [
        totalAccounts.count || 0,
        availableAccounts.count || 0,
        soldAccounts.count || 0,
        pendingSellRequests.count || 0,
        pendingOffers.count || 0,
        totalTransactions.count || 0,
      ];
      grid.querySelectorAll('.stat-card__value').forEach((el, idx) => (el.textContent = values[idx] ?? '—'));
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  }

  // ══════════════════════════════════════════════════════════
  // CARI AKUN (Dashboard) — cari lewat Kode Akun acak sistem
  // (contoh: ARZ-7F3K9X), bukan lagi kode berurutan seperti ACC-00019.
  // ══════════════════════════════════════════════════════════
  const lookupForm = document.querySelector('[data-account-lookup-form]');
  const lookupResult = document.querySelector('[data-account-lookup-result]');

  lookupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = lookupForm.querySelector('button[type="submit"]');
    const rawCode = lookupForm.querySelector('[name="code"]').value.trim();
    if (!rawCode) {
      GONDAM.toast('Masukkan kode akun terlebih dahulu.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Mencari...';
    lookupResult.innerHTML = '';

    try {
      const { data, error } = await supabaseClient
        .from('accounts')
        .select('*, account_images(id, image_url, is_primary), categories(name)')
        .ilike('account_code', rawCode)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        lookupResult.innerHTML = `<div class="admin-empty" style="padding:14px 0;">Akun dengan kode "${GONDAM.escapeAttr(rawCode)}" tidak ditemukan.</div>`;
        return;
      }

      const primary = (data.account_images || []).find((i) => i.is_primary) || data.account_images?.[0];
      lookupResult.innerHTML = `
        <div class="admin-lookup-card">
          ${primary ? `<img class="table-thumb" style="width:56px; height:56px;" src="${GONDAM.escapeAttr(primary.image_url)}" alt="" />` : `<div class="table-thumb" style="width:56px; height:56px;"></div>`}
          <div style="flex:1; min-width:0;">
            <div class="mono" style="font-weight:700;">${GONDAM.escapeAttr(data.account_code)}</div>
            <div style="font-weight:600;">${GONDAM.escapeAttr(data.name)} — ${GONDAM.escapeAttr(data.platform)}</div>
            <div style="font-size:0.85rem; color:var(--ink-soft);">${GONDAM.formatRupiah(data.price)} · <span class="badge ${data.status === 'SOLD' ? 'badge--sold' : 'badge--available'}">${data.status}</span></div>
          </div>
          <button type="button" class="btn btn-sm btn-primary" data-lookup-edit="${data.id}">Buka / Edit</button>
        </div>`;

      lookupResult.querySelector('[data-lookup-edit]')?.addEventListener('click', () => {
        switchTab('accounts');
        openAccountDrawer(data.id);
      });
    } catch (err) {
      GONDAM.toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Cari Akun';
    }
  });

  // ── Kategori cache (dipakai dropdown akun) ──────────────────
  async function loadCategoriesCache() {
    try {
      const { data, error } = await supabaseClient.from('categories').select('*').order('name', { ascending: true });
      if (error) throw error;
      categoriesCache = data || [];
      loadedTabs.add('categories-cache');
      const select = document.getElementById('acc-category');
      if (select) {
        select.innerHTML =
          '<option value="">Pilih kategori</option>' +
          categoriesCache.map((c) => `<option value="${c.id}">${GONDAM.escapeAttr(c.name)}</option>`).join('');
      }
    } catch (e) {
      // diamkan, dropdown tetap kosong
    }
  }

  // ══════════════════════════════════════════════════════════
  // AKUN
  // ══════════════════════════════════════════════════════════

  let accountsCache = [];
  const accountsSearchInput = document.querySelector('[data-accounts-table-search]');

  function matchesAccountSearch(acc, query) {
    if (!query) return true;
    const q = query.trim().toLowerCase();
    return (
      (acc.account_code || '').toLowerCase().includes(q) ||
      (acc.name || '').toLowerCase().includes(q) ||
      (acc.username || '').toLowerCase().includes(q)
    );
  }

  function renderAccountsTable(rows) {
    const tbody = document.querySelector('[data-accounts-table]');
    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="admin-empty">Tidak ada akun yang cocok.</td></tr>`;
      return;
    }
    renderAccountsRows(rows, tbody);
  }

  accountsSearchInput?.addEventListener('input', () => {
    renderAccountsTable(accountsCache.filter((acc) => matchesAccountSearch(acc, accountsSearchInput.value)));
  });

  async function loadAccountsTable() {
    const tbody = document.querySelector('[data-accounts-table]');
    tbody.innerHTML = `<tr><td colspan="8" class="admin-empty">Memuat...</td></tr>`;
    try {
      const { data: all, error } = await supabaseClient
        .from('accounts')
        .select('*, account_images(id, image_url, is_primary)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      accountsCache = all || [];

      if (!all || all.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="admin-empty">Belum ada akun. Klik "+ Tambah Akun" untuk memulai.</td></tr>`;
        return;
      }

      const filtered = accountsSearchInput?.value
        ? accountsCache.filter((acc) => matchesAccountSearch(acc, accountsSearchInput.value))
        : accountsCache;

      renderAccountsRows(filtered, tbody);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  // Dipisah dari loadAccountsTable supaya bisa dipakai ulang saat
  // hasil pencarian (client-side filter) di-render tanpa fetch ulang.
  function renderAccountsRows(all, tbody) {
    try {
      tbody.innerHTML = all
        .map((acc) => {
          const primary = (acc.account_images || []).find((i) => i.is_primary) || acc.account_images?.[0];
          return `
          <tr data-account-row="${acc.id}">
            <td>${primary ? `<img class="table-thumb" src="${GONDAM.escapeAttr(primary.image_url)}" alt="" />` : `<div class="table-thumb"></div>`}</td>
            <td class="mono">${GONDAM.escapeAttr(acc.account_code || '')}</td>
            <td>${GONDAM.escapeAttr(acc.name)}</td>
            <td>${GONDAM.escapeAttr(acc.platform)}</td>
            <td class="mono">${GONDAM.formatRupiah(acc.price)}</td>
            <td><span class="badge ${acc.status === 'SOLD' ? 'badge--sold' : 'badge--available'}">${acc.status}</span></td>
            <td>${acc.featured ? '<span class="badge badge--featured">Featured</span>' : '-'}</td>
            <td class="admin-table__actions">
              <button class="btn btn-sm" data-edit-account="${acc.id}">Edit</button>
              <button class="btn btn-sm" data-toggle-status="${acc.id}" data-current-status="${acc.status}">${acc.status === 'SOLD' ? 'Tandai Available' : 'Tandai Sold'}</button>
              <button class="btn btn-sm" style="background:var(--danger-soft); color:var(--danger);" data-delete-account="${acc.id}">Hapus</button>
            </td>
          </tr>`;
        })
        .join('');

      tbody.querySelectorAll('[data-edit-account]').forEach((btn) => {
        btn.addEventListener('click', () => openAccountDrawer(btn.dataset.editAccount));
      });
      tbody.querySelectorAll('[data-toggle-status]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const newStatus = btn.dataset.currentStatus === 'SOLD' ? 'AVAILABLE' : 'SOLD';
          try {
            const { error } = await supabaseClient.from('accounts').update({ status: newStatus }).eq('id', btn.dataset.toggleStatus);
            if (error) throw error;
            GONDAM.toast('Status akun diperbarui.', 'success');
            loadAccountsTable();
            loadDashboard();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });
      tbody.querySelectorAll('[data-delete-account]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus akun ini secara permanen?')) return;
          try {
            const { error } = await supabaseClient.from('accounts').delete().eq('id', btn.dataset.deleteAccount);
            if (error) throw error;
            GONDAM.toast('Akun dihapus.', 'success');
            loadAccountsTable();
            loadDashboard();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  // Bersihkan massal: hapus semua akun berstatus SOLD sekaligus,
  // beserta transaksi terkaitnya (bersih total, supaya penyimpanan
  // server tidak penuh). account_credentials ikut terhapus otomatis
  // lewat "on delete cascade" saat baris accounts dihapus, jadi tidak
  // perlu dihapus manual di sini.
  document.querySelector('[data-cleanup-sold-accounts]')?.addEventListener('click', async () => {
    if (
      !confirm(
        'Hapus SEMUA akun berstatus Sold beserta riwayat transaksinya secara permanen? Data ini tidak bisa dipulihkan. Tindakan ini tidak bisa dibatalkan.'
      )
    )
      return;
    const btn = document.querySelector('[data-cleanup-sold-accounts]');
    btn.disabled = true;
    try {
      const { data: soldAccounts, error: selErr } = await supabaseClient.from('accounts').select('id').eq('status', 'SOLD');
      if (selErr) throw selErr;
      const ids = (soldAccounts || []).map((a) => a.id);
      if (ids.length === 0) {
        GONDAM.toast('Tidak ada akun berstatus Sold untuk dihapus.', 'success');
        return;
      }
      const { error: txErr, count: txCount } = await supabaseClient
        .from('transactions')
        .delete({ count: 'exact' })
        .in('account_id', ids);
      if (txErr) throw txErr;
      const { error: accErr, count: accCount } = await supabaseClient
        .from('accounts')
        .delete({ count: 'exact' })
        .in('id', ids);
      if (accErr) throw accErr;
      GONDAM.toast(`${accCount ?? ids.length} akun terjual dan ${txCount ?? 0} transaksi terkait berhasil dihapus.`, 'success');
      loadAccountsTable();
      loadDashboard();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Drawer tambah/edit akun ─────────────────────────────────
  const drawer = document.querySelector('[data-account-drawer]');
  const accountForm = document.querySelector('[data-account-form]');
  const drawerTitle = document.querySelector('[data-drawer-title]');
  const imagesGrid = document.querySelector('[data-account-images]');
  let pendingNewImages = [];
  let editingAccountId = null;

  function toDatetimeLocalValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function updateDiscountFieldsVisibility() {
    const active = accountForm.discount_active.checked;
    const wrap = accountForm.querySelector('[data-discount-fields]');
    if (wrap) wrap.style.display = active ? '' : 'none';
  }
  accountForm?.querySelector('[data-discount-toggle]')?.addEventListener('change', updateDiscountFieldsVisibility);

  function updateDiscountPercentPreview() {
    const price = Number(accountForm.price.value) || 0;
    const discountPrice = Number(accountForm.discount_price.value) || 0;
    const preview = accountForm.querySelector('[data-discount-percent-preview]');
    if (!preview) return;
    if (price > 0 && discountPrice > 0 && discountPrice < price) {
      const pct = Math.round(((price - discountPrice) / price) * 100);
      preview.textContent = `Diskon ${pct}% (hemat ${GONDAM.formatRupiah(price - discountPrice)})`;
    } else {
      preview.textContent = '';
    }
  }
  accountForm?.querySelector('#acc-discount-price')?.addEventListener('input', updateDiscountPercentPreview);
  accountForm?.querySelector('#acc-price')?.addEventListener('input', updateDiscountPercentPreview);

  // (toggle show/hide password ditangani global di app.js init())

  function openAccountDrawer(accountId = null) {
    editingAccountId = accountId;
    pendingNewImages = [];
    accountForm.reset();
    imagesGrid.innerHTML = '';
    drawerTitle.textContent = accountId ? 'Edit Akun' : 'Tambah Akun';
    updateDiscountFieldsVisibility();
    updateDiscountPercentPreview();
    const pwInput = document.getElementById('acc-password-login');
    if (pwInput) pwInput.type = 'password';
    document.querySelector('[data-toggle-password="acc-password-login"]').textContent = 'Show';

    if (categoriesCache.length === 0) loadCategoriesCache();

    if (accountId) {
      supabaseClient
        .from('accounts')
        .select('*, account_images(id, image_url, is_primary)')
        .eq('id', accountId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) throw error || new Error('Akun tidak ditemukan.');
          accountForm.id.value = data.id;
          accountForm.name.value = data.name;
          accountForm.platform.value = data.platform;
          accountForm.category_id.value = data.category_id || '';
          accountForm.price.value = data.price;
          accountForm.discount_active.checked = Boolean(data.discount_active);
          accountForm.discount_price.value = data.discount_price ?? '';
          accountForm.promo_label.value = data.promo_label || '';
          accountForm.discount_starts_at.value = toDatetimeLocalValue(data.discount_starts_at);
          accountForm.discount_ends_at.value = toDatetimeLocalValue(data.discount_ends_at);
          updateDiscountFieldsVisibility();
          updateDiscountPercentPreview();
          accountForm.username.value = data.username || '';
          accountForm.description.value = data.description || '';
          accountForm.details.value = data.details || '';
          accountForm.features.value = data.features || '';
          accountForm.status.value = data.status;
          accountForm.featured.checked = Boolean(data.featured);
          renderExistingImages(data.account_images || [], data.id);
        })
        .catch((e) => GONDAM.toast(e.message, 'error'));

      // Kredensial akun dimuat terpisah — hanya email yang ditampilkan
      // langsung; password TIDAK di-prefill (biar tidak pernah muncul
      // plaintext tanpa aksi eksplisit "Show" + admin memang membuka field).
      supabaseClient
        .from('account_credentials')
        .select('account_email')
        .eq('account_id', accountId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) accountForm.account_email.value = data.account_email || '';
        });
    }

    drawer.classList.add('is-open');
  }

  function closeAccountDrawer() {
    drawer.classList.remove('is-open');
  }

  document.querySelector('[data-open-account-drawer]')?.addEventListener('click', () => openAccountDrawer());
  document.querySelector('[data-close-drawer]')?.addEventListener('click', closeAccountDrawer);
  drawer?.addEventListener('click', (e) => {
    if (e.target === drawer) closeAccountDrawer();
  });

  async function removeExistingImage(imageId, btnEl) {
    try {
      const { error } = await supabaseClient.from('account_images').delete().eq('id', imageId);
      if (error) throw error;
      btnEl.closest('.image-manage-item').remove();
      GONDAM.toast('Foto dihapus.', 'success');
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  }

  function renderExistingImages(images) {
    imagesGrid.innerHTML = images
      .map(
        (img) => `
      <div class="image-manage-item ${img.is_primary ? 'is-primary' : ''}" data-existing-image="${img.id}">
        <img src="${GONDAM.escapeAttr(img.image_url)}" alt="" />
        <button type="button" class="image-manage-item__remove" data-remove-existing-image="${img.id}">×</button>
      </div>`
      )
      .join('');

    imagesGrid.querySelectorAll('[data-remove-existing-image]').forEach((btn) => {
      btn.addEventListener('click', () => removeExistingImage(btn.dataset.removeExistingImage, btn));
    });
  }

  function renderPendingImages() {
    const pendingHtml = pendingNewImages
      .map(
        (item, idx) => `
      <div class="image-manage-item" data-pending-image="${idx}">
        <img src="${item.previewUrl}" alt="" />
        <button type="button" class="image-manage-item__remove" data-remove-pending-image="${idx}">×</button>
      </div>`
      )
      .join('');
    const existingHtml = Array.from(imagesGrid.querySelectorAll('[data-existing-image]'))
      .map((el) => el.outerHTML)
      .join('');
    imagesGrid.innerHTML = existingHtml + pendingHtml;

    imagesGrid.querySelectorAll('[data-remove-pending-image]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingNewImages.splice(Number(btn.dataset.removePendingImage), 1);
        renderPendingImages();
      });
    });
    imagesGrid.querySelectorAll('[data-remove-existing-image]').forEach((btn) => {
      btn.addEventListener('click', () => removeExistingImage(btn.dataset.removeExistingImage, btn));
    });
  }

  const accountDropzone = document.querySelector('[data-account-dropzone]');
  const accountPhotoInput = document.querySelector('[data-account-photo-input]');

  accountDropzone?.addEventListener('click', () => accountPhotoInput.click());
  accountDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    accountDropzone.classList.add('is-dragover');
  });
  accountDropzone?.addEventListener('dragleave', () => accountDropzone.classList.remove('is-dragover'));
  accountDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    accountDropzone.classList.remove('is-dragover');
    handleAccountPhotos(e.dataTransfer.files);
  });
  accountPhotoInput?.addEventListener('change', () => {
    handleAccountPhotos(accountPhotoInput.files);
    accountPhotoInput.value = '';
  });

  function handleAccountPhotos(fileList) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    for (const file of Array.from(fileList)) {
      if (!validTypes.includes(file.type)) {
        GONDAM.toast(`${file.name}: format tidak didukung.`, 'error');
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        GONDAM.toast(`${file.name}: ukuran melebihi 5MB.`, 'error');
        continue;
      }
      pendingNewImages.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    renderPendingImages();
  }

  function extFromMime(mime) {
    switch (mime) {
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'bin';
    }
  }

  // Upload langsung ke Supabase Storage (bucket account-images/accounts/),
  // lalu insert baris account_images. Menggantikan POST /api/uploads?context=accounts.
  async function uploadPendingImages(accountId) {
    if (pendingNewImages.length === 0) return;
    const hasExistingImages = imagesGrid.querySelectorAll('[data-existing-image]').length > 0;

    let uploadedCount = 0;
    for (let i = 0; i < pendingNewImages.length; i++) {
      const { file } = pendingNewImages[i];
      const ext = extFromMime(file.type);
      const path = `accounts/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

      const { error: uploadErr } = await supabaseClient.storage
        .from('account-images')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadErr) {
        GONDAM.toast(`${file.name}: gagal diunggah (${uploadErr.message}).`, 'error');
        continue;
      }
      const { data: publicUrlData } = supabaseClient.storage.from('account-images').getPublicUrl(path);
      if (!publicUrlData?.publicUrl) continue;

      const { error: insertErr } = await supabaseClient.from('account_images').insert({
        account_id: accountId,
        image_url: publicUrlData.publicUrl,
        is_primary: !hasExistingImages && uploadedCount === 0,
      });
      if (insertErr) throw insertErr;
      uploadedCount++;
    }
    pendingNewImages = [];
  }

  accountForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = accountForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    try {
      const price = Number(accountForm.price.value);
      const discountActive = accountForm.discount_active.checked;
      const discountPriceRaw = accountForm.discount_price.value;
      const discountPrice = discountActive && discountPriceRaw !== '' ? Number(discountPriceRaw) : null;
      if (discountActive) {
        if (discountPrice === null) throw new Error('Isi harga diskon atau nonaktifkan diskon.');
        if (discountPrice >= price) throw new Error('Harga diskon harus lebih kecil dari harga normal.');
      }
      const startsAt = accountForm.discount_starts_at.value ? new Date(accountForm.discount_starts_at.value).toISOString() : null;
      const endsAt = accountForm.discount_ends_at.value ? new Date(accountForm.discount_ends_at.value).toISOString() : null;

      const payload = {
        name: accountForm.name.value.trim(),
        platform: accountForm.platform.value.trim(),
        category_id: accountForm.category_id.value || null,
        price,
        discount_active: discountActive,
        discount_price: discountActive ? discountPrice : null,
        promo_label: accountForm.promo_label.value.trim() || null,
        discount_starts_at: discountActive ? startsAt : null,
        discount_ends_at: discountActive ? endsAt : null,
        username: accountForm.username.value.trim(),
        description: accountForm.description.value.trim(),
        details: accountForm.details.value.trim(),
        features: accountForm.features.value.trim(),
        status: accountForm.status.value,
        featured: accountForm.featured.checked,
      };

      let accountId = editingAccountId;

      if (accountId) {
        const { error } = await supabaseClient.from('accounts').update(payload).eq('id', accountId);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from('accounts').insert(payload).select('id').single();
        if (error) throw error;
        accountId = data.id;
      }

      // Kredensial akun (email/password) — tabel terpisah, jangan pernah
      // dikirim sebagai bagian dari payload accounts di atas.
      const credEmail = accountForm.account_email.value.trim();
      const credPassword = accountForm.account_password.value;
      if (credEmail || credPassword) {
        const credPayload = { account_id: accountId };
        if (credEmail) credPayload.account_email = credEmail;
        if (credPassword) credPayload.account_password = credPassword;
        const { error: credError } = await supabaseClient
          .from('account_credentials')
          .upsert(credPayload, { onConflict: 'account_id' });
        if (credError) throw credError;
      }

      await uploadPendingImages(accountId);

      GONDAM.toast('Akun berhasil disimpan.', 'success');
      closeAccountDrawer();
      loadAccountsTable();
      loadDashboard();
    } catch (err) {
      GONDAM.toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Simpan Akun';
    }
  });

  // ══════════════════════════════════════════════════════════
  // TAWARAN
  // ══════════════════════════════════════════════════════════

  let currentOffersFilter = '';

  async function loadOffersTable() {
    const tbody = document.querySelector('[data-offers-table]');
    tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Memuat...</td></tr>`;
    try {
      let query = supabaseClient
        .from('offers')
        .select('*, accounts(name, account_code, platform)')
        .order('created_at', { ascending: false });
      if (currentOffersFilter) query = query.eq('status', currentOffersFilter);
      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Tidak ada tawaran.</td></tr>`;
        return;
      }

      tbody.innerHTML = data
        .map(
          (offer) => `
        <tr>
          <td>${GONDAM.escapeAttr(offer.accounts?.name || '-')}</td>
          <td class="mono">${GONDAM.formatRupiah(offer.original_price)}</td>
          <td class="mono">${GONDAM.formatRupiah(offer.offer_price)}</td>
          <td>${GONDAM.escapeAttr(offer.buyer_name)}</td>
          <td class="mono">${GONDAM.escapeAttr(offer.buyer_whatsapp)}</td>
          <td><span class="badge badge--neutral">${offer.status}</span></td>
          <td class="admin-table__actions">
            ${offer.status === 'PENDING' ? `
              <button class="btn btn-sm" data-offer-action="${offer.id}" data-offer-status="ACCEPTED">Terima</button>
              <button class="btn btn-sm" data-offer-action="${offer.id}" data-offer-status="REJECTED">Tolak</button>
            ` : ''}
            ${offer.status === 'ACCEPTED' ? `<button class="btn btn-sm" data-offer-action="${offer.id}" data-offer-status="COMPLETED">Selesai</button>` : ''}
            ${['REJECTED', 'COMPLETED'].includes(offer.status) ? `<button class="btn btn-sm" style="background:var(--danger-soft); color:var(--danger);" data-delete-offer="${offer.id}" title="Hapus tawaran yang sudah selesai">Hapus</button>` : ''}
          </td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('[data-offer-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            const { error } = await supabaseClient
              .from('offers')
              .update({ status: btn.dataset.offerStatus })
              .eq('id', btn.dataset.offerAction);
            if (error) throw error;
            GONDAM.toast('Status tawaran diperbarui.', 'success');
            loadOffersTable();
            loadDashboard();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });

      // Hapus satu tawaran (hanya yang sudah selesai/ditolak) — mengurangi
      // jumlah baris di tabel `offers` supaya query & realtime tetap ringan.
      tbody.querySelectorAll('[data-delete-offer]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus tawaran ini secara permanen? Tindakan ini tidak bisa dibatalkan.')) return;
          try {
            const { error } = await supabaseClient.from('offers').delete().eq('id', btn.dataset.deleteOffer);
            if (error) throw error;
            GONDAM.toast('Tawaran dihapus.', 'success');
            loadOffersTable();
            loadDashboard();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  // Bersihkan massal: hapus semua tawaran berstatus REJECTED/COMPLETED
  // sekaligus, supaya admin tidak perlu klik Hapus satu-satu.
  document.querySelector('[data-cleanup-offers]')?.addEventListener('click', async () => {
    if (!confirm('Hapus SEMUA tawaran yang sudah Diterima-Selesai atau Ditolak? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      const { error, count } = await supabaseClient
        .from('offers')
        .delete({ count: 'exact' })
        .in('status', ['REJECTED', 'COMPLETED']);
      if (error) throw error;
      GONDAM.toast(`${count ?? 0} tawaran selesai berhasil dihapus.`, 'success');
      loadOffersTable();
      loadDashboard();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  });

  document.querySelectorAll('[data-offers-filter] .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-offers-filter] .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentOffersFilter = btn.dataset.status;
      loadOffersTable();
    });
  });

  // ══════════════════════════════════════════════════════════
  // PENGAJUAN JUAL
  // ══════════════════════════════════════════════════════════

  let currentSellRequestsFilter = '';

  async function loadSellRequestsTable() {
    const tbody = document.querySelector('[data-sell-requests-table]');
    tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Memuat...</td></tr>`;
    try {
      let query = supabaseClient.from('sell_requests').select('*').order('created_at', { ascending: false });
      if (currentSellRequestsFilter) query = query.eq('status', currentSellRequestsFilter);
      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Tidak ada pengajuan.</td></tr>`;
        return;
      }

      tbody.innerHTML = data
        .map(
          (req) => `
        <tr>
          <td>${GONDAM.escapeAttr(req.account_name)}<br/><span style="font-size:0.78rem; color:var(--ink-soft);">${GONDAM.escapeAttr(req.platform)}</span></td>
          <td>${GONDAM.escapeAttr(req.seller_name)}</td>
          <td class="mono">${GONDAM.escapeAttr(req.seller_whatsapp)}</td>
          <td class="mono">${req.desired_price ? GONDAM.formatRupiah(req.desired_price) : '-'}</td>
          <td><span class="badge badge--neutral">${req.status}</span></td>
          <td class="admin-table__actions">
            ${req.status === 'PENDING' ? `<button class="btn btn-sm" data-sr-action="${req.id}" data-sr-status="REVIEW">Review</button>` : ''}
            ${req.status !== 'ACCEPTED' && req.status !== 'REJECTED' ? `
              <button class="btn btn-sm" data-sr-action="${req.id}" data-sr-status="ACCEPTED">Terima</button>
              <button class="btn btn-sm" data-sr-action="${req.id}" data-sr-status="REJECTED">Tolak</button>
            ` : ''}
            ${req.status === 'ACCEPTED' ? `<button class="btn btn-sm btn-primary" data-sr-convert="${req.id}">+ Marketplace</button>` : ''}
            ${['REJECTED', 'ACCEPTED'].includes(req.status) ? `<button class="btn btn-sm" style="background:var(--danger-soft); color:var(--danger);" data-delete-sr="${req.id}" title="Hapus pengajuan yang sudah selesai">Hapus</button>` : ''}
          </td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('[data-sr-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            const { error } = await supabaseClient
              .from('sell_requests')
              .update({ status: btn.dataset.srStatus })
              .eq('id', btn.dataset.srAction);
            if (error) throw error;
            GONDAM.toast('Status pengajuan diperbarui.', 'success');
            loadSellRequestsTable();
            loadDashboard();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });

      // Hapus satu pengajuan jual (hanya yang sudah Diterima/sudah masuk
      // marketplace atau Ditolak) — tabel `sell_requests` menyimpan foto &
      // kredensial akun sehingga baris lama sebaiknya dibersihkan berkala.
      tbody.querySelectorAll('[data-delete-sr]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus pengajuan jual ini secara permanen? Pastikan sudah dipindahkan ke marketplace jika perlu. Tindakan ini tidak bisa dibatalkan.')) return;
          try {
            const { error } = await supabaseClient.from('sell_requests').delete().eq('id', btn.dataset.deleteSr);
            if (error) throw error;
            GONDAM.toast('Pengajuan dihapus.', 'success');
            loadSellRequestsTable();
            loadDashboard();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });

      tbody.querySelectorAll('[data-sr-convert]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Tambahkan pengajuan ini sebagai akun baru di marketplace?')) return;
          try {
            await convertSellRequestToAccount(btn.dataset.srConvert);
            GONDAM.toast('Akun berhasil ditambahkan ke marketplace.', 'success');
            loadSellRequestsTable();
            loadDashboard();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  // Bersihkan massal: hapus semua pengajuan berstatus REJECTED/ACCEPTED.
  document.querySelector('[data-cleanup-sell-requests]')?.addEventListener('click', async () => {
    if (!confirm('Hapus SEMUA pengajuan yang sudah Diterima atau Ditolak? Pastikan yang perlu masuk marketplace sudah dikonversi. Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      const { error, count } = await supabaseClient
        .from('sell_requests')
        .delete({ count: 'exact' })
        .in('status', ['REJECTED', 'ACCEPTED']);
      if (error) throw error;
      GONDAM.toast(`${count ?? 0} pengajuan selesai berhasil dihapus.`, 'success');
      loadSellRequestsTable();
      loadDashboard();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  });

  // Dulu POST /api/sell-requests/:id/convert (server). Sekarang beberapa
  // langkah Supabase berurutan (aman karena hanya admin yang lolos RLS).
  async function convertSellRequestToAccount(sellRequestId) {
    const { data: sellRequest, error: fetchErr } = await supabaseClient
      .from('sell_requests')
      .select('*')
      .eq('id', sellRequestId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!sellRequest) throw new Error('Pengajuan tidak ditemukan.');
    if (sellRequest.status !== 'ACCEPTED') {
      throw new Error('Pengajuan harus berstatus ACCEPTED sebelum ditambahkan ke marketplace.');
    }

    const { data: account, error: insertErr } = await supabaseClient
      .from('accounts')
      .insert({
        name: sellRequest.account_name,
        platform: sellRequest.platform,
        category_id: sellRequest.category_id,
        username: sellRequest.username,
        price: sellRequest.desired_price || 0,
        description: sellRequest.description,
        details: sellRequest.details,
        features: sellRequest.features,
        status: 'AVAILABLE',
        featured: false,
      })
      .select('*')
      .single();
    if (insertErr) throw insertErr;

    if (Array.isArray(sellRequest.photo_urls) && sellRequest.photo_urls.length > 0) {
      const imageRows = sellRequest.photo_urls.map((url, idx) => ({
        account_id: account.id,
        image_url: url,
        is_primary: idx === 0,
      }));
      const { error: imgErr } = await supabaseClient.from('account_images').insert(imageRows);
      if (imgErr) console.error('[convertSellRequestToAccount] gagal salin gambar:', imgErr.message);
    }

    return account;
  }

  document.querySelectorAll('[data-sell-requests-filter] .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sell-requests-filter] .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentSellRequestsFilter = btn.dataset.status;
      loadSellRequestsTable();
    });
  });

  // ══════════════════════════════════════════════════════════
  // TRANSAKSI
  // ══════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════
  // TRANSAKSI PEMBELIAN (QRIS DANA Bisnis manual)
  // ══════════════════════════════════════════════════════════

  let currentTransactionsFilter = '';
  let currentTxDetail = null;

  const PAYMENT_STATUS_LABEL = {
    PENDING_PAYMENT: 'Menunggu Konfirmasi',
    PROOF_SUBMITTED: 'Perlu Verifikasi',
    VERIFYING: 'Perlu Verifikasi',
    PAID: 'Terverifikasi',
    REJECTED: 'Ditolak',
    EXPIRED: 'Kedaluwarsa',
    COMPLETED: 'Selesai',
  };
  const PAYMENT_STATUS_BADGE = {
    PENDING_PAYMENT: 'badge--pending',
    PROOF_SUBMITTED: 'badge--verifying',
    VERIFYING: 'badge--verifying',
    PAID: 'badge--paid',
    REJECTED: 'badge--rejected',
    EXPIRED: 'badge--expired',
    COMPLETED: 'badge--paid',
  };

  function fmtDateTime(iso) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return iso;
    }
  }

  async function loadTransactionsTable() {
    const tbody = document.querySelector('[data-transactions-table]');
    tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Memuat...</td></tr>`;
    try {
      let query = supabaseClient
        .from('transactions')
        .select('*, accounts(name, account_code, platform)')
        .order('created_at', { ascending: false });
      if (currentTransactionsFilter) query = query.eq('payment_status', currentTransactionsFilter);
      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Tidak ada transaksi.</td></tr>`;
        return;
      }

      tbody.innerHTML = data
        .map((tx) => {
          const label = PAYMENT_STATUS_LABEL[tx.payment_status] || tx.payment_status;
          const badgeClass = PAYMENT_STATUS_BADGE[tx.payment_status] || 'badge--neutral';
          return `
        <tr>
          <td class="mono">${GONDAM.escapeAttr(tx.invoice_id || '-')}</td>
          <td>${GONDAM.escapeAttr(tx.accounts?.name || '-')}</td>
          <td>
            <div>${GONDAM.escapeAttr(tx.buyer_name || tx.buyer_email || '-')}</div>
            <div class="mono" style="font-size:0.78rem; opacity:0.75;">${GONDAM.escapeAttr(tx.buyer_whatsapp || '-')}</div>
          </td>
          <td class="mono">${GONDAM.formatRupiah(tx.price)}</td>
          <td><span class="badge ${badgeClass}">${GONDAM.escapeAttr(label)}</span></td>
          <td style="font-size:0.78rem;">${fmtDateTime(tx.payment_submitted_at)}</td>
          <td class="admin-table__actions">
            <button class="btn btn-sm" data-tx-detail-btn="${tx.id}">Detail</button>
            ${['REJECTED', 'EXPIRED'].includes(tx.payment_status) || tx.transaction_status === 'COMPLETED' ? `<button class="btn btn-sm" style="background:var(--danger-soft); color:var(--danger);" data-delete-tx="${tx.id}" title="Hapus transaksi yang sudah selesai/ditolak/kedaluwarsa">Hapus</button>` : ''}
          </td>
        </tr>`;
        })
        .join('');

      tbody.querySelectorAll('[data-tx-detail-btn]').forEach((btn) => {
        btn.addEventListener('click', () => openTxDetail(btn.dataset.txDetailBtn, data));
      });

      // Hapus satu transaksi (hanya yang sudah Selesai/Ditolak/Kedaluwarsa)
      // — tabel `transactions` paling cepat membesar, jadi paling penting
      // dibersihkan berkala supaya query & realtime Supabase tetap ringan.
      tbody.querySelectorAll('[data-delete-tx]').forEach((btn) => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (!confirm('Hapus transaksi ini secara permanen (termasuk riwayat pembayarannya)? Tindakan ini tidak bisa dibatalkan.')) return;
          try {
            const { error } = await supabaseClient.from('transactions').delete().eq('id', btn.dataset.deleteTx);
            if (error) throw error;
            GONDAM.toast('Transaksi dihapus.', 'success');
            loadTransactionsTable();
            loadDashboard();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  // Bersihkan massal: hapus semua transaksi yang sudah final (Selesai,
  // Ditolak, atau Kedaluwarsa) sekaligus.
  document.querySelector('[data-cleanup-transactions]')?.addEventListener('click', async () => {
    if (!confirm('Hapus SEMUA transaksi yang sudah Selesai, Ditolak, atau Kedaluwarsa? Riwayat pembayarannya ikut terhapus permanen. Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      const { error, count } = await supabaseClient
        .from('transactions')
        .delete({ count: 'exact' })
        .or('payment_status.in.(REJECTED,EXPIRED),transaction_status.eq.COMPLETED');
      if (error) throw error;
      GONDAM.toast(`${count ?? 0} transaksi selesai berhasil dihapus.`, 'success');
      loadTransactionsTable();
      loadDashboard();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  });

  document.querySelectorAll('[data-transactions-filter] .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-transactions-filter] .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentTransactionsFilter = btn.dataset.status;
      loadTransactionsTable();
    });
  });

  // ── Drawer detail transaksi ─────────────────────────────────
  const txDrawer = document.querySelector('[data-tx-drawer]');

  function closeTxDrawer() {
    txDrawer?.classList.remove('is-open');
    currentTxDetail = null;
  }
  document.querySelector('[data-close-tx-drawer]')?.addEventListener('click', closeTxDrawer);
  txDrawer?.addEventListener('click', (e) => {
    if (e.target === txDrawer) closeTxDrawer();
  });

  async function openTxDetail(txId, rows) {
    const tx = rows.find((r) => r.id === txId);
    if (!tx) return;
    currentTxDetail = tx;

    document.querySelector('[data-tx-account-name]').textContent = tx.accounts?.name || '-';
    document.querySelector('[data-tx-account-code]').textContent = tx.accounts?.account_code || '-';
    document.querySelector('[data-tx-platform]').textContent = tx.accounts?.platform || '-';
    document.querySelector('[data-tx-category]').textContent = '-';
    document.querySelector('[data-tx-price]').textContent = GONDAM.formatRupiah(tx.price);
    document.querySelector('[data-tx-buyer-name]').textContent = tx.buyer_name || '-';
    document.querySelector('[data-tx-email]').textContent = tx.buyer_email || '-';
    document.querySelector('[data-tx-note]').textContent = tx.note || '-';
    const waEl = document.querySelector('[data-tx-whatsapp]');
    if (tx.buyer_whatsapp) {
      const waHref = GONDAM.buildWhatsAppUrl(
        `Halo ${tx.buyer_name || 'Kak'}, kami admin PT GONDAM terkait pesanan ${tx.invoice_id || ''} (${tx.accounts?.name || 'akun'}).`,
        tx.buyer_whatsapp
      );
      waEl.innerHTML = `<a href="${GONDAM.escapeAttr(waHref)}" target="_blank" rel="noopener">${GONDAM.escapeAttr(tx.buyer_whatsapp)} ↗ Chat</a>`;
    } else {
      waEl.textContent = '-';
    }
    const methodEl = document.querySelector('[data-tx-method]');
    if (methodEl) methodEl.textContent = tx.payment_method === 'QRIS_DANA_BISNIS' ? 'QRIS DANA Bisnis' : 'Manual via WhatsApp';
    document.querySelector('[data-tx-instagram]').textContent = tx.buyer_instagram || '-';
    document.querySelector('[data-tx-invoice]').textContent = tx.invoice_id || '-';
    document.querySelector('[data-tx-sender-name]').textContent = tx.sender_name || '-';
    document.querySelector('[data-tx-sender-number]').textContent = tx.sender_account_number || '-';
    document.querySelector('[data-tx-submitted-at]').textContent = fmtDateTime(tx.payment_submitted_at);
    document.querySelector('[data-tx-status-label]').textContent = PAYMENT_STATUS_LABEL[tx.payment_status] || tx.payment_status;

    // Kategori akun (query ringan, opsional)
    if (tx.account_id) {
      supabaseClient
        .from('accounts')
        .select('categories(name)')
        .eq('id', tx.account_id)
        .maybeSingle()
        .then(({ data }) => {
          const el = document.querySelector('[data-tx-category]');
          if (el) el.textContent = data?.categories?.name || '-';
        });
    }

    // Bukti pembayaran via signed URL (bucket private)
    const proofWrap = document.querySelector('[data-tx-proof-wrap]');
    proofWrap.innerHTML = `<p style="font-size:0.85rem;">Memuat bukti pembayaran...</p>`;
    if (tx.payment_proof_path) {
      const { data: signed, error: signErr } = await supabaseClient.storage
        .from('payment-proofs')
        .createSignedUrl(tx.payment_proof_path, 3600);
      if (signErr || !signed?.signedUrl) {
        proofWrap.innerHTML = `<p style="font-size:0.85rem;">Bukti pembayaran tidak dapat dimuat.</p>`;
      } else {
        proofWrap.innerHTML = `<img class="tx-proof-img" src="${GONDAM.escapeAttr(signed.signedUrl)}" alt="Bukti pembayaran" data-tx-proof-zoom />`;
        proofWrap.querySelector('[data-tx-proof-zoom]')?.addEventListener('click', () => {
          openProofZoom(signed.signedUrl);
        });
      }
    } else {
      proofWrap.innerHTML = `<p style="font-size:0.85rem;">Pembayaran dikonfirmasi langsung lewat WhatsApp (tanpa upload bukti di website).</p>`;
    }

    const rejectionWrap = document.querySelector('[data-tx-rejection-wrap]');
    if (tx.rejection_reason) {
      rejectionWrap.style.display = '';
      document.querySelector('[data-tx-rejection-reason]').textContent = tx.rejection_reason;
    } else {
      rejectionWrap.style.display = 'none';
    }

    // Tombol aksi mengikuti status saat ini
    const actionsWrap = document.querySelector('[data-tx-actions]');
    const deliveryWrap = document.querySelector('[data-tx-delivery-wrap]');
    const approveBtn = document.querySelector('[data-tx-approve-btn]');
    const rejectBtn = document.querySelector('[data-tx-reject-btn]');

    // Pesanan WhatsApp: admin boleh Approve/Tolak langsung dari status menunggu
    // (pembayaran disepakati & dicek manual di chat), tanpa upload bukti di website.
    const canVerify = ['PENDING_PAYMENT', 'PROOF_SUBMITTED', 'VERIFYING'].includes(tx.payment_status);
    actionsWrap.style.display = canVerify ? '' : 'none';
    approveBtn.disabled = !canVerify;
    rejectBtn.disabled = !canVerify;

    deliveryWrap.style.display = tx.payment_status === 'PAID' ? '' : 'none';
    const isCompleted = tx.transaction_status === 'COMPLETED';
    if (deliveryWrap.style.display !== 'none') {
      document.querySelector('[data-tx-delivery-select]').value =
        ['PROCESSING', 'WAITING_DELIVERY', 'DELIVERED'].includes(tx.transaction_status) ? tx.transaction_status : 'PROCESSING';
      document.querySelector('[data-tx-delivery-select]').disabled = isCompleted;
    }
    // Tombol "Selesaikan Pesanan" terpisah tidak dipakai lagi — approve
    // sekarang langsung menyelesaikan pesanan dalam satu klik.
    const completeWrap = document.querySelector('[data-tx-complete-wrap]');
    const completedBadge = document.querySelector('[data-tx-completed-badge]');
    if (completeWrap) completeWrap.style.display = 'none';
    if (completedBadge) completedBadge.style.display = isCompleted ? '' : 'none';

    const deleteTxBtn = document.querySelector('[data-tx-delete-btn]');
    if (deleteTxBtn) {
      const isFinal = ['REJECTED', 'EXPIRED'].includes(tx.payment_status) || isCompleted;
      deleteTxBtn.style.display = isFinal ? '' : 'none';
    }

    txDrawer.classList.add('is-open');
  }

  // ── Hapus transaksi dari drawer detail ──────────────────────
  document.querySelector('[data-tx-delete-btn]')?.addEventListener('click', async () => {
    if (!currentTxDetail) return;
    if (!confirm('Hapus transaksi ini secara permanen (termasuk riwayat pembayarannya)? Tindakan ini tidak bisa dibatalkan.')) return;
    const btn = document.querySelector('[data-tx-delete-btn]');
    btn.disabled = true;
    try {
      const { error } = await supabaseClient.from('transactions').delete().eq('id', currentTxDetail.id);
      if (error) throw error;
      GONDAM.toast('Transaksi dihapus.', 'success');
      closeTxDrawer();
      loadTransactionsTable();
      loadDashboard();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  function openProofZoom(url) {
    let overlay = document.querySelector('.tx-proof-img-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'tx-proof-img-overlay';
      overlay.innerHTML = `<img src="" alt="Bukti pembayaran (perbesar)" />`;
      overlay.addEventListener('click', () => overlay.classList.remove('is-open'));
      document.body.appendChild(overlay);
    }
    overlay.querySelector('img').src = url;
    overlay.classList.add('is-open');
  }

  // ── Approve ──────────────────────────────────────────────────
  const approveModal = document.querySelector('[data-tx-approve-modal]');
  document.querySelector('[data-tx-approve-btn]')?.addEventListener('click', () => {
    if (!currentTxDetail) return;
    document.querySelector('[data-tx-approve-confirm-text]').textContent =
      `Pastikan pembayaran sebesar ${GONDAM.formatRupiah(currentTxDetail.price)} benar-benar sudah kamu terima dari pembeli (sesuai kesepakatan di WhatsApp).`;
    approveModal.classList.add('is-open');
  });
  document.querySelectorAll('[data-tx-approve-modal] [data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => approveModal.classList.remove('is-open'));
  });
  document.querySelector('[data-tx-approve-confirm-btn]')?.addEventListener('click', async () => {
    if (!currentTxDetail) return;
    const btn = document.querySelector('[data-tx-approve-confirm-btn]');
    btn.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('approve_and_complete_transaction', { p_transaction_id: currentTxDetail.id });
      if (error) throw error;
      GONDAM.toast('Pembayaran diverifikasi & pesanan selesai. Data akun langsung tampil untuk pembeli.', 'success');
      approveModal.classList.remove('is-open');
      closeTxDrawer();
      loadTransactionsTable();
      loadAccountsTable();
      loadDashboard();
    } catch (e) {
      GONDAM.toast(`Gagal verifikasi: ${e.message || 'error tidak diketahui'}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Reject ───────────────────────────────────────────────────
  const rejectModal = document.querySelector('[data-tx-reject-modal]');
  document.querySelector('[data-tx-reject-btn]')?.addEventListener('click', () => {
    if (!currentTxDetail) return;
    document.querySelector('[data-tx-reject-form]').reset();
    rejectModal.classList.add('is-open');
  });
  document.querySelectorAll('[data-tx-reject-modal] [data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => rejectModal.classList.remove('is-open'));
  });
  document.querySelector('[data-tx-reject-reason-select]')?.addEventListener('change', (e) => {
    if (e.target.value) document.querySelector('#tx-reject-reason').value = e.target.value;
  });
  document.querySelector('[data-tx-reject-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentTxDetail) return;
    const reason = e.target.rejection_reason.value.trim();
    if (!reason) return GONDAM.toast('Alasan penolakan wajib diisi.', 'error');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const { error } = await supabaseClient
        .from('transactions')
        .update({ payment_status: 'REJECTED', rejection_reason: reason })
        .eq('id', currentTxDetail.id);
      if (error) throw error;
      GONDAM.toast('Pembayaran ditolak. Akun dikembalikan ke status Available.', 'success');
      rejectModal.classList.remove('is-open');
      closeTxDrawer();
      loadTransactionsTable();
      loadAccountsTable();
      loadDashboard();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ── Status penyerahan akun (pasca PAID, sebelum selesai) ────
  document.querySelector('[data-tx-delivery-select]')?.addEventListener('change', async (e) => {
    if (!currentTxDetail) return;
    try {
      const { error } = await supabaseClient
        .from('transactions')
        .update({ transaction_status: e.target.value })
        .eq('id', currentTxDetail.id);
      if (error) throw error;
      GONDAM.toast('Status penyerahan diperbarui.', 'success');
      loadTransactionsTable();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  });

  // ── SELESAIKAN PESANAN (baru di sini data akun boleh tampil) ─
  // FIX: sebelumnya pakai currentTxDetail.payment_status yang bisa stale
  // (data drawer lama, belum tentu sinkron dengan DB), sehingga kadang
  // membandingkan status basi. Sekarang ambil ulang status fresh dari
  // server tepat sebelum memanggil RPC, dan error dari RPC ditampilkan
  // apa adanya (termasuk kode error Postgres) supaya tidak ada lagi
  // dugaan — pesan error yang tampil akan selalu persis dari database.
  document.querySelector('[data-tx-complete-btn]')?.addEventListener('click', async () => {
    if (!currentTxDetail) return;
    if (!confirm('Selesaikan pesanan ini? Email & password akun akan langsung dapat dilihat pembeli di halaman status transaksinya.')) return;
    const btn = document.querySelector('[data-tx-complete-btn]');
    btn.disabled = true;
    try {
      // Ambil ulang status transaksi fresh dari DB, jangan percaya cache drawer.
      const { data: freshTx, error: freshErr } = await supabaseClient
        .from('transactions')
        .select('id, invoice_id, payment_status, transaction_status')
        .eq('id', currentTxDetail.id)
        .single();
      if (freshErr) throw freshErr;
      if (!freshTx) throw new Error('Transaksi tidak ditemukan di database.');
      if (freshTx.transaction_status === 'COMPLETED') {
        GONDAM.toast('Pesanan ini sudah COMPLETED sebelumnya.', 'success');
        closeTxDrawer();
        loadTransactionsTable();
        return;
      }
      if (freshTx.payment_status !== 'PAID') {
        GONDAM.toast(`Belum bisa diselesaikan: payment_status saat ini masih "${freshTx.payment_status}", bukan PAID.`, 'error');
        return;
      }

      const { data: rpcData, error } = await supabaseClient.rpc('complete_transaction', { p_invoice_id: freshTx.invoice_id });

      if (error) {
        // Tampilkan pesan error MENTAH dari Postgres/Supabase, tanpa
        // ditimpa/di-mapping ke pesan lain apa pun, supaya akar masalah
        // selalu terlihat jelas kalau masih gagal di masa depan.
        console.error('complete_transaction RPC error:', error);
        GONDAM.toast(`Gagal menyelesaikan pesanan: ${error.message || error.code || 'error tidak diketahui'}`, 'error');
        return;
      }

      const resultRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!resultRow || resultRow.transaction_status !== 'COMPLETED') {
        GONDAM.toast('RPC berhasil dipanggil tapi hasilnya tidak sesuai ekspektasi. Cek database secara manual.', 'error');
        console.warn('complete_transaction unexpected result:', rpcData);
        return;
      }

      GONDAM.toast('Pesanan selesai. Data akun kini tampil untuk pembeli.', 'success');
      closeTxDrawer();
      loadTransactionsTable();
    } catch (e) {
      console.error('complete_transaction exception:', e);
      GONDAM.toast(`Gagal menyelesaikan pesanan: ${e.message || 'error tidak diketahui'}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ══════════════════════════════════════════════════════════
  // KATEGORI
  // ══════════════════════════════════════════════════════════

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  async function loadCategoriesTable() {
    const tbody = document.querySelector('[data-categories-table]');
    tbody.innerHTML = `<tr><td colspan="3" class="admin-empty">Memuat...</td></tr>`;
    try {
      const { data, error } = await supabaseClient.from('categories').select('*').order('name', { ascending: true });
      if (error) throw error;
      categoriesCache = data || [];

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="admin-empty">Belum ada kategori.</td></tr>`;
        return;
      }

      tbody.innerHTML = data
        .map(
          (cat) => `
        <tr>
          <td>${GONDAM.escapeAttr(cat.name)}</td>
          <td class="mono">${GONDAM.escapeAttr(cat.slug)}</td>
          <td class="admin-table__actions">
            <button class="btn btn-sm" style="background:var(--danger-soft); color:var(--danger);" data-delete-category="${cat.id}">Hapus</button>
          </td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('[data-delete-category]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus kategori ini?')) return;
          try {
            const { error } = await supabaseClient.from('categories').delete().eq('id', btn.dataset.deleteCategory);
            if (error) throw error;
            GONDAM.toast('Kategori dihapus.', 'success');
            loadCategoriesTable();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  document.querySelector('[data-add-category-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const cleanName = form.name.value.trim();
      const { error } = await supabaseClient.from('categories').insert({ name: cleanName, slug: slugify(cleanName) });
      if (error) {
        if (error.code === '23505') throw new Error('Kategori dengan nama tersebut sudah ada.');
        throw error;
      }
      GONDAM.toast('Kategori ditambahkan.', 'success');
      form.reset();
      loadCategoriesTable();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ══════════════════════════════════════════════════════════
  // POSTER / BANNER HOMEPAGE
  // ══════════════════════════════════════════════════════════
  const bannerDrop = document.querySelector('[data-banner-drop]');
  const bannerFileInput = document.querySelector('[data-banner-file-input]');
  const bannersGrid = document.querySelector('[data-banners-grid]');

  function bannerExtFromMime(mime) {
    switch (mime) {
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'bin';
    }
  }

  async function loadBannersGrid() {
    if (!bannersGrid) return;
    bannersGrid.innerHTML = `<p class="admin-empty">Memuat...</p>`;
    try {
      const { data, error } = await supabaseClient
        .from('banners')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (!data || data.length === 0) {
        bannersGrid.innerHTML = `<p class="admin-empty">Belum ada poster. Tambahkan lewat kotak upload di atas.</p>`;
        return;
      }

      bannersGrid.innerHTML = data
        .map(
          (b, i) => `
        <div class="banner-admin-card ${b.is_active ? '' : 'is-inactive'}" data-banner-card="${b.id}">
          <div class="banner-admin-card__img-wrap">
            <img src="${GONDAM.escapeAttr(b.image_url)}" alt="${GONDAM.escapeAttr(b.title || 'Poster')}" loading="lazy" />
          </div>
          <div class="banner-admin-card__body">
            <div class="banner-admin-card__title">${GONDAM.escapeAttr(b.title || '(Tanpa judul)')}</div>
            <div class="banner-admin-card__meta">${b.is_active ? '🟢 Aktif' : '⚪ Nonaktif'} · Urutan #${i + 1}</div>
            <div class="banner-admin-card__actions">
              <button type="button" class="btn btn-sm" data-banner-move-up="${b.id}" title="Naikkan urutan" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn btn-sm" data-banner-move-down="${b.id}" title="Turunkan urutan" ${i === data.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="btn btn-sm" data-banner-toggle="${b.id}" data-banner-active="${b.is_active}">${b.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              <button type="button" class="btn btn-sm" style="background:var(--danger-soft); color:var(--danger);" data-banner-delete="${b.id}" data-banner-path="${GONDAM.escapeAttr(b.image_url)}">Hapus</button>
            </div>
          </div>
        </div>`
        )
        .join('');

      // Naik / turun urutan (tukar sort_order dengan tetangga)
      bannersGrid.querySelectorAll('[data-banner-move-up]').forEach((btn) => {
        btn.addEventListener('click', () => moveBanner(data, btn.dataset.bannerMoveUp, -1));
      });
      bannersGrid.querySelectorAll('[data-banner-move-down]').forEach((btn) => {
        btn.addEventListener('click', () => moveBanner(data, btn.dataset.bannerMoveDown, 1));
      });

      bannersGrid.querySelectorAll('[data-banner-toggle]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const isActive = btn.dataset.bannerActive === 'true';
          try {
            const { error } = await supabaseClient
              .from('banners')
              .update({ is_active: !isActive })
              .eq('id', btn.dataset.bannerToggle);
            if (error) throw error;
            loadBannersGrid();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });

      bannersGrid.querySelectorAll('[data-banner-delete]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus poster ini? Gambar juga akan dihapus dari penyimpanan.')) return;
          try {
            const { error: delErr } = await supabaseClient.from('banners').delete().eq('id', btn.dataset.bannerDelete);
            if (delErr) throw delErr;

            // Hapus juga file di storage (folder banners/...)
            const imageUrl = btn.dataset.bannerPath;
            const marker = '/account-images/';
            const idx = imageUrl.indexOf(marker);
            if (idx !== -1) {
              const storagePath = decodeURIComponent(imageUrl.slice(idx + marker.length));
              await supabaseClient.storage.from('account-images').remove([storagePath]);
            }

            GONDAM.toast('Poster dihapus.', 'success');
            loadBannersGrid();
          } catch (e) {
            GONDAM.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      console.error('[banners] gagal memuat:', e);
      bannersGrid.innerHTML = `<p class="admin-empty">Data belum dapat dimuat (${GONDAM.escapeAttr(e.message || 'error tidak diketahui')}). Cek konsol browser (F12) untuk detail, dan pastikan migrasi supabase/migration_v6_banners.sql sudah dijalankan di project Supabase Anda.</p>`;
    }
  }

  async function moveBanner(list, id, direction) {
    const idx = list.findIndex((b) => b.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;

    const a = list[idx];
    const b = list[swapIdx];
    try {
      const [{ error: err1 }, { error: err2 }] = await Promise.all([
        supabaseClient.from('banners').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabaseClient.from('banners').update({ sort_order: a.sort_order }).eq('id', b.id),
      ]);
      if (err1 || err2) throw err1 || err2;
      loadBannersGrid();
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  }

  async function uploadBannerFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    // Ambil sort_order tertinggi saat ini supaya poster baru ditaruh di urutan paling akhir
    let nextOrder = 0;
    try {
      const { data } = await supabaseClient
        .from('banners')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1);
      if (data && data.length > 0) nextOrder = data[0].sort_order + 1;
    } catch (e) {
      // biarkan default 0 kalau query gagal
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    let successCount = 0;

    for (const file of Array.from(fileList)) {
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
        GONDAM.toast(`${file.name}: format tidak didukung.`, 'error');
        continue;
      }
      if (file.size > MAX_SIZE) {
        GONDAM.toast(`${file.name}: ukuran melebihi 5MB.`, 'error');
        continue;
      }

      const ext = bannerExtFromMime(file.type);
      const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

      try {
        const { error: uploadErr } = await supabaseClient.storage
          .from('account-images')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadErr) throw uploadErr;

        const { data: publicUrlData } = supabaseClient.storage.from('account-images').getPublicUrl(path);
        if (!publicUrlData?.publicUrl) throw new Error('Gagal mendapatkan URL publik.');

        const { error: insertErr } = await supabaseClient.from('banners').insert({
          image_url: publicUrlData.publicUrl,
          title: file.name.replace(/\.[^.]+$/, ''),
          sort_order: nextOrder,
          is_active: true,
        });
        if (insertErr) throw insertErr;

        nextOrder++;
        successCount++;
      } catch (e) {
        console.error('[banners] gagal upload:', file.name, e);
        GONDAM.toast(`${file.name}: gagal diunggah (${e.message}).`, 'error');
      }
    }

    if (successCount > 0) {
      GONDAM.toast(`${successCount} poster berhasil ditambahkan.`, 'success');
      loadBannersGrid();
    }
  }

  bannerFileInput?.addEventListener('change', (e) => {
    uploadBannerFiles(e.target.files);
    e.target.value = '';
  });

  if (bannerDrop) {
    ['dragover', 'dragenter'].forEach((evt) => {
      bannerDrop.addEventListener(evt, (e) => {
        e.preventDefault();
        bannerDrop.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      bannerDrop.addEventListener(evt, (e) => {
        e.preventDefault();
        bannerDrop.classList.remove('is-dragover');
      });
    });
    bannerDrop.addEventListener('drop', (e) => {
      if (e.dataTransfer?.files?.length) uploadBannerFiles(e.dataTransfer.files);
    });
  }

  // ══════════════════════════════════════════════════════════
  // PENGATURAN
  // ══════════════════════════════════════════════════════════

  async function loadSettingsForm() {
    const form = document.querySelector('[data-settings-form]');
    const paymentForm = document.querySelector('[data-payment-settings-form]');
    try {
      const { data, error } = await supabaseClient.from('site_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      form.site_name.value = data?.site_name || '';
      form.admin_whatsapp.value = GONDAM.ADMIN_WA;
      form.footer_text.value = data?.footer_text || '';
      form.wa_template_buy.value = data?.wa_template_buy || '';
      form.wa_template_offer.value = data?.wa_template_offer || '';
      form.wa_template_sell.value = data?.wa_template_sell || '';

      paymentForm.merchant_name.value = data?.merchant_name || data?.site_name || '';
      paymentForm.dana_business_name.value = data?.dana_business_name || '';
      paymentForm.dana_business_number.value = data?.dana_business_number || '';
      paymentForm.payment_expiration_minutes.value = data?.payment_expiration_minutes ?? 120;
      paymentForm.payment_instruction.value = data?.payment_instruction || '';
      paymentForm.payment_whatsapp_template.value = data?.payment_whatsapp_template || '';

      renderQrisPreview(data?.qris_image_path);
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  }

  function renderQrisPreview(path) {
    const preview = document.querySelector('[data-qris-preview]');
    if (!preview) return;
    if (!path) {
      preview.innerHTML = `<div class="admin-empty" style="padding:20px; border:2px dashed var(--border); border-radius:var(--radius);">Belum ada QRIS</div>`;
      return;
    }
    const { data } = supabaseClient.storage.from('payment-assets').getPublicUrl(path);
    preview.innerHTML = data?.publicUrl
      ? `<img src="${GONDAM.escapeAttr(data.publicUrl)}" alt="QRIS DANA Bisnis" style="width:100%; border:var(--border-w-sm) solid var(--border); border-radius:var(--radius);" />`
      : `<div class="admin-empty" style="padding:20px;">QRIS tidak dapat dimuat</div>`;
  }

  function extFromMimeQris(mime) {
    switch (mime) {
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return null;
    }
  }

  document.querySelector('[data-qris-dropzone]')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-qris-remove]')) return;
    document.querySelector('[data-qris-input]')?.click();
  });

  document.querySelector('[data-qris-input]')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = extFromMimeQris(file.type);
    if (!ext) return GONDAM.toast('Format foto tidak didukung.', 'error');
    if (file.size > 5 * 1024 * 1024) return GONDAM.toast('Ukuran foto maksimal 5 MB.', 'error');

    try {
      const path = `qris-dana-business-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabaseClient.storage
        .from('payment-assets')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error('QRIS gagal diupload. Silakan coba lagi.');

      const { data: current } = await supabaseClient.from('site_settings').select('qris_image_path').eq('id', 1).maybeSingle();
      const oldPath = current?.qris_image_path;

      const { error: updateErr } = await supabaseClient.from('site_settings').update({ qris_image_path: path }).eq('id', 1);
      if (updateErr) throw updateErr;

      if (oldPath && oldPath !== path) {
        await supabaseClient.storage.from('payment-assets').remove([oldPath]);
      }

      renderQrisPreview(path);
      GONDAM.toast('QRIS berhasil diperbarui.', 'success');
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  document.querySelector('[data-qris-remove]')?.addEventListener('click', async () => {
    if (!confirm('Hapus QRIS DANA Bisnis saat ini?')) return;
    try {
      const { data: current } = await supabaseClient.from('site_settings').select('qris_image_path').eq('id', 1).maybeSingle();
      const oldPath = current?.qris_image_path;
      const { error } = await supabaseClient.from('site_settings').update({ qris_image_path: null }).eq('id', 1);
      if (error) throw error;
      if (oldPath) await supabaseClient.storage.from('payment-assets').remove([oldPath]);
      renderQrisPreview(null);
      GONDAM.toast('QRIS dihapus.', 'success');
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    }
  });

  document.querySelector('[data-payment-settings-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';
    try {
      const minutes = Number(form.payment_expiration_minutes.value) || 120;
      const { error } = await supabaseClient
        .from('site_settings')
        .update({
          merchant_name: form.merchant_name.value.trim(),
          dana_business_name: form.dana_business_name.value.trim(),
          dana_business_number: form.dana_business_number.value.trim(),
          payment_expiration_minutes: minutes,
          payment_instruction: form.payment_instruction.value,
          payment_whatsapp_template: form.payment_whatsapp_template.value,
        })
        .eq('id', 1);
      if (error) throw error;
      GONDAM.toast('Pengaturan pembayaran disimpan.', 'success');
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Simpan Pengaturan Pembayaran';
    }
  });

  document.querySelector('[data-settings-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';
    try {
      const { error } = await supabaseClient
        .from('site_settings')
        .update({
          site_name: form.site_name.value.trim(),
          admin_whatsapp: GONDAM.ADMIN_WA,
          footer_text: form.footer_text.value.trim(),
          wa_template_buy: form.wa_template_buy.value,
          wa_template_offer: form.wa_template_offer.value,
          wa_template_sell: form.wa_template_sell.value,
        })
        .eq('id', 1);
      if (error) throw error;
      GONDAM.toast('Pengaturan disimpan.', 'success');
    } catch (e) {
      GONDAM.toast(e.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Simpan Pengaturan';
    }
  });

  // ══════════════════════════════════════════════════════════
  // Realtime notifikasi (dulu Socket.IO admin-room)
  // ══════════════════════════════════════════════════════════

  function initRealtime() {
    const activeTab = () => document.querySelector('[data-tab-btn].is-active')?.dataset.tabBtn;

    const channel = supabaseClient
      .channel('pt-gondam-admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'offers' }, () => {
        GONDAM.toast('Tawaran baru masuk!', 'info');
        loadDashboard();
        if (activeTab() === 'offers') loadOffersTable();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'offers' }, () => {
        if (activeTab() === 'offers') loadOffersTable();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sell_requests' }, () => {
        GONDAM.toast('Pengajuan jual akun baru masuk!', 'info');
        loadDashboard();
        if (activeTab() === 'sell-requests') loadSellRequestsTable();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sell_requests' }, () => {
        if (activeTab() === 'sell-requests') loadSellRequestsTable();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => {
        GONDAM.toast('Ada permintaan pembelian baru!', 'info');
        loadDashboard();
        if (activeTab() === 'transactions') loadTransactionsTable();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
        if (activeTab() === 'transactions') loadTransactionsTable();
        loadDashboard();
        GONDAM.toast(`Pesanan baru masuk: ${payload.new?.invoice_id || ''}. Cek WhatsApp admin.`, 'info', 7000);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions' }, (payload) => {
        if (activeTab() === 'transactions') loadTransactionsTable();
        if (payload.new?.payment_status === 'PROOF_SUBMITTED') {
          GONDAM.toast('Bukti pembayaran baru masuk, perlu diverifikasi.', 'info');
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
        if (activeTab() === 'accounts') loadAccountsTable();
        if (activeTab() === 'dashboard') loadDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        if (activeTab() === 'categories') loadCategoriesTable();
      })
      .subscribe();

    window.addEventListener('beforeunload', () => {
      supabaseClient.removeChannel(channel);
    });
  }

  // ── Init ─────────────────────────────────────────────────────
  (async function init() {
    const ok = await checkAuth();
    if (!ok) return;
    switchTab('dashboard');
    initRealtime();
  })();
})();
