// AM Premify v4.8.2 - Gerbang pemblokir iklan
// Jika DNS / aplikasi / ekstensi pemblokir iklan (AdGuard, NextDNS, Blokada, uBlock, dll.) terdeteksi,
// website tertutup popup yang meminta pengguna menonaktifkannya. Popup hilang sendiri setelah iklan bisa dimuat.
// Catatan: ini pemeriksaan di browser, jadi bukan pengaman mutlak (orang yang paham teknis bisa melewatinya).
(function () {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  if (!cfg.adGate || !cfg.adProbe) return;

  let overlay = null, checking = false, blocked = false, timer = 0, tries = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Mencoba menjangkau server iklan. Diblokir DNS / ekstensi => fetch gagal seketika (bukan error HTTP).
  async function probe(url) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
      return 'ok';
    } catch (e) { return e && e.name === 'AbortError' ? 'slow' : 'fail'; }
    finally { clearTimeout(to); }
  }

  // Pembanding: kalau website kita sendiri juga tidak terjangkau berarti pengguna offline, bukan pemblokir iklan.
  async function online() {
    try { const r = await fetch('/config.js?c=' + Date.now(), { cache: 'no-store' }); return r.ok; } catch { return false; }
  }

  // Pemblokir berbasis ekstensi menyembunyikan elemen berkelas "iklan".
  async function baitHidden() {
    const b = document.createElement('div');
    b.className = 'adsbox ad-banner ad-placement textads banner-ads';
    b.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:10px;height:10px';
    b.innerHTML = '&nbsp;';
    document.body.appendChild(b);
    await sleep(150);
    const cs = getComputedStyle(b);
    const hidden = !b.offsetHeight || cs.display === 'none' || cs.visibility === 'hidden';
    b.remove();
    return hidden;
  }

  function build() {
    const el = document.createElement('div');
    el.id = 'adgate';
    el.className = 'modal';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'adgate-title');
    el.innerHTML =
      '<div class="modal-card adgate-card">' +
        '<div class="modal-stripe"></div>' +
        '<div class="modal-body">' +
          '<div class="warn-ic big"><svg class="ic"><use href="#i-ban"/></svg></div>' +
          '<h3 id="adgate-title">PEMBLOKIR IKLAN TERDETEKSI</h3>' +
          '<p class="adgate-main">Website ini gratis karena didukung iklan. Matikan DNS atau pemblokir iklanmu dulu agar bisa masuk.</p>' +
          '<ul>' +
            '<li><svg class="ic sm"><use href="#i-arrow"/></svg><span><b>DNS pribadi (Android):</b> Pengaturan &rarr; Jaringan &amp; internet &rarr; DNS pribadi &rarr; pilih <b>Mati</b> atau <b>Otomatis</b>.</span></li>' +
            '<li><svg class="ic sm"><use href="#i-arrow"/></svg><span><b>Aplikasi:</b> matikan AdGuard, NextDNS, Blokada, DNS66, atau VPN pemblokir iklan.</span></li>' +
            '<li><svg class="ic sm"><use href="#i-arrow"/></svg><span><b>Browser:</b> matikan ekstensi AdBlock / uBlock, atau mode hemat data / pemblokir iklan bawaan.</span></li>' +
            '<li><svg class="ic sm"><use href="#i-arrow"/></svg><span>Atau ganti DNS ke bawaan operator, <b>1.1.1.1</b>, atau <b>8.8.8.8</b>.</span></li>' +
          '</ul>' +
          '<p class="adgate-msg" id="adgate-msg" aria-live="polite"></p>' +
          '<button class="btn btn-sand" id="adgate-retry" type="button"><svg class="ic"><use href="#i-refresh"/></svg><span>Saya sudah matikan, cek lagi</span></button>' +
        '</div>' +
      '</div>';
    el.querySelector('#adgate-retry').addEventListener('click', () => { tries++; setMsg('Memeriksa...'); check(true); });
    return el;
  }

  function setMsg(t) { const m = document.getElementById('adgate-msg'); if (m) m.textContent = t; }

  function show() {
    blocked = true;
    if (!overlay) overlay = build();
    if (!overlay.isConnected) document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');
    if (!timer) timer = setInterval(() => check(false), 4000); // otomatis hilang begitu iklan bisa dimuat
  }

  function hide() {
    if (!blocked && !(overlay && overlay.isConnected)) return;
    blocked = false;
    clearInterval(timer); timer = 0;
    if (overlay) overlay.remove();
    document.body.classList.remove('no-scroll');
    window.dispatchEvent(new Event('am:adgate-clear'));
  }

  async function check(manual) {
    if (checking) return;
    checking = true;
    try {
      let bad = false;
      const p = await probe(cfg.adProbe);
      if (p === 'fail') bad = await online();   // gagal + kita online = diblokir
      if (!bad) bad = await baitHidden();
      if (bad) { show(); if (manual) setMsg('Masih terdeteksi pemblokir iklan' + (tries > 1 ? ' (percobaan ' + tries + ')' : '') + '. Matikan lalu coba lagi.'); }
      else hide();
    } finally { checking = false; }
  }

  // Overlay dihapus lewat inspect element? pasang lagi selama masih terblokir
  new MutationObserver(() => { if (blocked && overlay && !overlay.isConnected) document.body.appendChild(overlay); })
    .observe(document.body, { childList: true });
  document.addEventListener('visibilitychange', () => { if (blocked && document.visibilityState === 'visible') check(false); });
  document.addEventListener('keydown', (e) => { if (blocked && e.key === 'Escape') e.preventDefault(); }, true);

  check(false);
})();
