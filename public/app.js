// AM Premify - Premium Panel (frontend)
const CONFIG = {
  user: 'kenz',
  waNumber: '6282357961890' // 082357961890 dalam format internasional
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* Toast */
let toastTimer;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2600);
}

/* Navigasi (URL bersih tanpa .html: /index, /premium, /panduan) */
const ROUTES = { home: '/index', premium: '/premium', guide: '/panduan' };
const TITLES = { home: 'Dashboard', premium: 'Premiumkan Akun', guide: 'Panduan' };
const VIEW_BY_PATH = { '/': 'home', '/index': 'home', '/premium': 'premium', '/panduan': 'guide' };

function show(view, push = true) {
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== view));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === view));
  document.title = `AM Premify - ${TITLES[view]}`;
  if (push && location.pathname !== ROUTES[view]) history.pushState({ view }, '', ROUTES[view]);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'home') renderHome();
}
$$('.tab').forEach((t) => t.addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // buka di tab baru tetap normal
  e.preventDefault();
  show(t.dataset.tab);
}));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));
window.addEventListener('popstate', () => show(VIEW_BY_PATH[location.pathname] || 'home', false));

/* WhatsApp: pesan otomatis (menyertakan email jika sudah diisi) */
function waLink() {
  const email = ($('#email') && $('#email').value.trim()) || '';
  const lines = [
    'Halo kak, saya butuh bantuan terkait AM Premify.',
    '',
    email ? `Email akun: ${email}` : 'Email akun: -',
    'Kendala: '
  ];
  return `https://wa.me/${CONFIG.waNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
}
$$('.js-wa').forEach((a) => {
  a.href = waLink();
  ['pointerdown', 'focus', 'click'].forEach((ev) => a.addEventListener(ev, () => (a.href = waLink())));
});

/* Stepper: 1 email, 2 link, 3 VIP, 4 selesai */
function setStep(n) {
  $$('.stp').forEach((el) => {
    const i = Number(el.dataset.step);
    el.classList.toggle('done', i < n);
    el.classList.toggle('active', i === n);
  });
}

/* Dashboard */
function renderHome() {
  const list = store.get('am_accounts', []);
  const box = $('#recent');
  if (!list.length) { box.innerHTML = '<div class="empty">Belum ada akun premium.</div>'; return; }
  box.innerHTML = list.slice(0, 5).map((u, i) => `
    <div class="item">
      <div class="meta"><b>${esc(u.email)}</b><span>${new Date(u.at).toLocaleString('id-ID')}</span></div>
      <span class="badge">VIP</span>
      <button class="mini" data-del="${i}" aria-label="Hapus"><svg class="ic"><use href="#i-trash"/></svg></button>
    </div>`).join('');
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => {
    const l = store.get('am_accounts', []);
    l.splice(Number(b.dataset.del), 1);
    store.set('am_accounts', l);
    renderHome();
  }));
}

$('#clear-all').addEventListener('click', () => {
  if (!store.get('am_accounts', []).length) return toast('Belum ada data');
  if (!confirm('Hapus semua riwayat akun premium?')) return;
  store.set('am_accounts', []);
  renderHome();
  toast('Riwayat dihapus');
});

/* Terminal */
const term = {
  box: $('#term'),
  body: $('#term-body'),
  cursor: null,
  init() {
    this.cursor = document.createElement('div');
    this.cursor.className = 'cursor-ln';
    this.body.appendChild(this.cursor);
  },
  time() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `[${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}]`;
  },
  // type: sys | ready | info | ok | tip | warn | err | raw
  log(type, text, opts = {}) {
    const ln = document.createElement('div');
    ln.className = 'ln ' + type;
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = opts.label || this.time();
    const msg = document.createElement('span');
    msg.className = 'msg';
    const icon = { ok: 'i-ok', tip: 'i-info', err: 'i-fail', warn: 'i-info' }[type];
    if (icon) msg.innerHTML = `<svg class="ic"><use href="#${icon}"/></svg>`;
    msg.appendChild(document.createTextNode(text));
    ln.append(ts, msg);
    this.body.insertBefore(ln, this.cursor);
    this.body.scrollTop = this.body.scrollHeight;
  },
  welcome() {
    this.log('sys', 'Sistem Verifikasi Alight Motion (AM Premify core) siap digunakan.', { label: '[SYSTEM]' });
    this.log('ready', 'Silakan masukkan alamat email akun Alight Motion lalu klik "Kirim Magic Link".', { label: '[READY]' });
  },
  clear() {
    $$('.ln', this.body).forEach((l) => l.remove());
    this.welcome();
    this.log('info', 'Riwayat verifikasi dibersihkan.');
  },
  text() { return $$('.ln', this.body).map((l) => l.textContent.replace(/\s+/g, ' ').trim()).join('\n'); }
};
term.init();
term.welcome();

$('#term-clear').addEventListener('click', () => { term.clear(); setStep(1); });
$('#term-toggle').addEventListener('click', () => term.box.classList.toggle('collapsed'));
$('#term-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(term.text()); toast('Log disalin'); }
  catch { toast('Gagal menyalin', 'err'); }
});

/* Premiumkan Akun */
async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let data;
  try { data = await res.json(); } catch { data = { success: false, error: 'Respon tidak valid dari server' }; }
  const ok = res.ok && data.success !== false && !data.error;
  return { ok, data, status: res.status };
}

function errText(r) {
  const d = r.data || {};
  const m = d.error || d.message || (d.data && d.data.message) || 'Status ' + r.status;
  return typeof m === 'string' ? m : JSON.stringify(m);
}

function logRaw(data) {
  let t = '';
  try { t = JSON.stringify(data); } catch {}
  if (t.length > 280) t = t.slice(0, 280) + '...';
  if (t) term.log('raw', 'Respon server: ' + t);
}

function setBtn(btn, busy, text) {
  btn.disabled = busy;
  $('span', btn).textContent = text;
}

/* Cloudflare Turnstile: tombol VIP terkunci sampai verifikasi manusia selesai */
const cf = {
  token: '', id: null,
  card: $('#cf-card'), state: $('#cf-state'), btn: $('#verify-btn'),
  set(st, label) { this.card.classList.remove('ok', 'err'); if (st) this.card.classList.add(st); this.state.textContent = label; },
  lock() { this.token = ''; this.btn.disabled = true; },
  ready(token) { this.token = token; this.btn.disabled = false; this.set('ok', 'TERVERIFIKASI'); term.log('ok', 'Verifikasi manusia (Cloudflare) berhasil.'); },
  reset() { this.lock(); this.set('', 'BELUM'); try { if (window.turnstile && this.id !== null) window.turnstile.reset(this.id); } catch {} },
  mount() {
    const key = (window.APP_CONFIG && window.APP_CONFIG.turnstileSiteKey) || '';
    if (!key) { this.set('err', 'ERROR'); $('#cf-loading').textContent = 'Site key Turnstile belum diisi'; return; }
    if (!window.turnstile) { return setTimeout(() => this.mount(), 250); }
    $('#cf-box').innerHTML = '';
    this.id = window.turnstile.render('#cf-box', {
      sitekey: key, theme: 'light', language: 'id',
      callback: (t) => this.ready(t),
      'expired-callback': () => { this.lock(); this.set('', 'KEDALUWARSA'); },
      'timeout-callback': () => { this.lock(); this.set('', 'KEDALUWARSA'); },
      'error-callback': () => { this.lock(); this.set('err', 'GAGAL'); term.log('err', 'Verifikasi Cloudflare gagal dimuat, muat ulang halaman.'); }
    });
  }
};
cf.mount();

$('#email').addEventListener('input', () => setStep(1));

$('#send-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const btn = $('#send-btn');
  setBtn(btn, true, 'Mengirim...');
  term.log('info', `[*] Menghubungi server verifikasi untuk ${email}...`);
  try {
    const r = await postJson('/api/send-link', { email });
    logRaw(r.data);
    if (r.ok) {
      term.log('ok', `Link verifikasi berhasil dikirim ke: ${email}`);
      term.log('tip', 'Buka email masuk lalu tempelkan link verifikasi di Langkah 2');
      setStep(2);
      toast('Magic link terkirim, cek email target');
    } else {
      term.log('err', 'Gagal mengirim link: ' + errText(r));
      toast('Gagal mengirim magic link', 'err');
    }
  } catch (err) {
    term.log('err', 'Gagal terhubung ke server: ' + err.message);
    toast('Gagal terhubung ke server', 'err');
  } finally { setBtn(btn, false, 'Kirim Magic Link'); }
});

$('#verify-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const magicLink = $('#magic').value.trim();
  if (!email) {
    term.log('warn', 'Email target belum diisi. Isi email di Langkah 1 terlebih dahulu.');
    return toast('Isi email target dulu di langkah 1', 'err');
  }
  if (!cf.token) {
    term.log('warn', 'Selesaikan verifikasi manusia (Cloudflare) terlebih dahulu.');
    return toast('Selesaikan verifikasi manusia dulu', 'err');
  }
  const btn = $('#verify-btn');
  setBtn(btn, true, 'Memverifikasi...');
  setStep(3);
  term.log('info', `[*] Memverifikasi link untuk ${email}...`);
  try {
    const r = await postJson('/api/verify-link', { email, magicLink, cfToken: cf.token });
    logRaw(r.data);
    if (r.ok) {
      const list = store.get('am_accounts', []);
      list.unshift({ email, at: Date.now() });
      store.set('am_accounts', list);
      $('#magic').value = '';
      term.log('ok', `Akun berhasil diaktifkan VIP: ${email}`);
      if (r.data && r.data.recorded === true) term.log('info', 'Aktivitas tercatat ke Supabase (statistik real-time diperbarui).');
      else if (r.data && r.data.recorded === false) term.log('warn', 'Aktivitas belum tercatat ke Supabase. Cek isi .env dan jalankan supabase.sql.');
      setStep(4);
      toast('Akun berhasil diaktifkan VIP');
    } else {
      term.log('err', 'Verifikasi gagal: ' + errText(r));
      setStep(2);
      toast('Verifikasi gagal, cek log', 'err');
    }
  } catch (err) {
    term.log('err', 'Gagal terhubung ke server: ' + err.message);
    setStep(2);
    toast('Gagal terhubung ke server', 'err');
  } finally { setBtn(btn, false, 'Verifikasi & Aktifkan VIP'); cf.reset(); }
});


/* Peringatan keras: sisipkan ke semua slot + modal sekali tampil */
$$('[data-warn]').forEach((slot) => slot.appendChild($('#warn-tpl').content.cloneNode(true)));
(function warnModal() {
  const modal = $('#warn-modal');
  if (!store.get('am_warn_ok', false)) modal.classList.remove('hidden');
  $('#warn-ok').addEventListener('click', () => {
    store.set('am_warn_ok', Date.now());
    modal.classList.add('hidden');
  });
})();

/* Statistik real-time (Supabase) */
const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
const clock = (iso) => {
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
};

function animateNum(el, to) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 600;
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
  if (to > from) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

const live = {
  client: null,
  setBadge(kind, text) {
    const b = $('#live-badge');
    b.className = 'live-badge ' + kind;
    $('b', b).textContent = text;
  },
  hint(msg) {
    const h = $('#live-hint');
    h.textContent = msg || '';
    h.classList.toggle('hidden', !msg);
  },
  renderBars(daily) {
    const box = $('#bars');
    if (!Array.isArray(daily) || !daily.length) return;
    const max = Math.max(1, ...daily.map((d) => Number(d.count)));
    const todayKey = daily[daily.length - 1].day;
    box.innerHTML = daily.map((d) => {
      const c = Number(d.count);
      const label = new Date(d.day + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' });
      return `<div class="bar${d.day === todayKey ? ' today' : ''}">
        <b>${fmt(c)}</b>
        <div class="bar-track"><div class="bar-fill" style="height:${c ? Math.max(6, (c / max) * 100) : 0}%"></div></div>
        <span>${esc(label)}</span>
      </div>`;
    }).join('');
  },
  async refresh() {
    const { data, error } = await this.client.rpc('get_activation_stats');
    if (error) {
      this.setBadge('off', 'ERROR');
      this.hint('Gagal memuat statistik: ' + error.message + ' (jalankan supabase.sql di SQL Editor Supabase)');
      return false;
    }
    this.hint('');
    animateNum($('#stat-total'), Number(data.total));
    animateNum($('#stat-today'), Number(data.today));
    this.renderBars(data.daily);
    return true;
  },
  feedItem(row, isNew) {
    const el = document.createElement('div');
    el.className = 'feed-item' + (isNew ? ' new' : '');
    el.innerHTML = `<span class="dot"></span><span>Aktivasi sukses</span><time>${clock(row.created_at)}</time>`;
    return el;
  },
  async loadFeed() {
    const { data } = await this.client.from('activations').select('id,created_at').order('created_at', { ascending: false }).limit(8);
    if (!data || !data.length) return;
    const feed = $('#feed');
    feed.innerHTML = '';
    data.forEach((row) => feed.appendChild(this.feedItem(row, false)));
  },
  pushFeed(row) {
    const feed = $('#feed');
    if (!$('.feed-item', feed)) feed.innerHTML = '';
    feed.prepend(this.feedItem(row, true));
    while (feed.children.length > 8) feed.lastChild.remove();
    setTimeout(() => feed.firstChild && feed.firstChild.classList.remove('new'), 4000);
  },
  async init() {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
      this.setBadge('off', 'OFFLINE');
      this.hint(!window.supabase
        ? 'Library Supabase gagal dimuat. Pastikan HP terhubung internet.'
        : 'Supabase belum dikonfigurasi. Isi file .env lalu restart server.');
      return;
    }
    this.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    if (await this.refresh()) this.loadFeed();

    this.client
      .channel('activations-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activations' }, (payload) => {
        this.pushFeed(payload.new);
        this.refresh();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.setBadge('on', 'LIVE');
        else if (status === 'CONNECTING' || status === 'JOINING') this.setBadge('wait', 'MENYAMBUNG');
        else this.setBadge('off', 'TERPUTUS');
      });

    // Penyegaran berkala: menjaga akurasi saat pergantian hari / koneksi sempat putus
    setInterval(() => this.refresh(), 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  }
};
live.init();


/* Info Pengunjung: IP asli (via server) + baterai perangkat (Battery Status API) */
const visitor = {
  place(city, country) {
    return city && country && city !== country ? `${city}, ${country}` : (country || city || '');
  },
  timeout(ms) {
    return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
  },
  // 1) Lewat server panel
  async fromServer() {
    const r = await fetch('/api/visitor', { cache: 'no-store', signal: this.timeout(12000) });
    if (!(r.headers.get('content-type') || '').includes('json')) throw new Error('endpoint /api/visitor tidak ada');
    const d = await r.json();
    if (!r.ok || !d.ip) throw new Error(d.error || 'status ' + r.status);
    return d;
  },
  // 2) Langsung dari browser (cadangan, juga jalan di hosting statis)
  async fromBrowser() {
    const get = async (url) => (await fetch(url, { cache: 'no-store', signal: this.timeout(6000) })).json();
    try {
      const d = await get('https://ipwho.is/');
      if (d.success && d.ip) return { ip: d.ip, location: this.place(d.city, d.country), isp: (d.connection && (d.connection.org || d.connection.isp)) || '' };
    } catch {}
    try {
      const d = await get('https://ipapi.co/json/');
      if (d.ip && !d.error) return { ip: d.ip, location: this.place(d.city, d.country_name), isp: d.org || '' };
    } catch {}
    try {
      const d = await get('https://ipinfo.io/json');
      if (d.ip) return { ip: d.ip, location: this.place(d.city, d.country), isp: d.org || '' };
    } catch {}
    try {
      const d = await get('https://api64.ipify.org?format=json');
      if (d.ip) return { ip: d.ip, location: '', isp: '' };
    } catch {}
    throw new Error('semua layanan IP gagal dari browser');
  },
  isV4(s) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(s || ''); },
  async getText(url) { return (await (await fetch(url, { cache: 'no-store', signal: this.timeout(6000) })).text()).trim(); },
  // IPv4 langsung dari browser (layanan khusus IPv4, jadi hasilnya tanpa tanda ":")
  async browserV4() {
    const sources = [
      async () => JSON.parse(await this.getText('https://api.ipify.org?format=json')).ip,
      async () => this.getText('https://ipv4.icanhazip.com'),
      async () => this.getText('https://v4.ident.me')
    ];
    for (const src of sources) {
      try { const ip = await src(); if (this.isV4(ip)) return ip; } catch {}
    }
    return '';
  },
  // Lokasi + ISP untuk IPv4 tertentu (server dulu, lalu browser). IP tetap ditampilkan walau lokasi gagal.
  async geoFor(ip) {
    try {
      const r = await fetch('/api/visitor?ip=' + encodeURIComponent(ip), { cache: 'no-store', signal: this.timeout(12000) });
      if ((r.headers.get('content-type') || '').includes('json')) {
        const d = await r.json();
        if (r.ok && d.ip) return d;
      }
    } catch {}
    try {
      const d = JSON.parse(await this.getText(`https://ipwho.is/${ip}`));
      if (d.success) return { ip, location: this.place(d.city, d.country), isp: (d.connection && (d.connection.org || d.connection.isp)) || '' };
    } catch {}
    return { ip, location: '', isp: '' };
  },
  async loadIp(retry = true) {
    const ip = $('#v-ip'), loc = $('#v-loc');
    ip.textContent = 'Memuat...';
    loc.textContent = 'Mendeteksi lokasi...';
    let d = null;
    const errs = [];

    // 1) Utamakan IPv4 (format 13.250.114.33, tanpa titik dua)
    const v4 = await this.browserV4();
    if (v4) d = await this.geoFor(v4);
    else errs.push('ipv4: tidak tersedia');

    // 2) Cadangan: lewat server panel, lalu langsung dari browser (bisa berupa IPv6)
    if (!d) { try { d = await this.fromServer(); } catch (e) { errs.push('server: ' + e.message); } }
    if (!d) { try { d = await this.fromBrowser(); } catch (e) { errs.push('browser: ' + e.message); } }

    if (d) {
      ip.textContent = d.ip;
      const parts = [d.location, d.isp].filter(Boolean);
      if (d.ip.includes(':')) parts.push('jaringanmu hanya IPv6');
      loc.textContent = parts.join(' \u00b7 ') || 'Lokasi tidak tersedia';
      return;
    }
    console.warn('[Info Pengunjung] gagal mendeteksi IP ->', errs.join(' | '));
    ip.textContent = 'Tidak terdeteksi';
    loc.textContent = 'Cek internet, matikan VPN / pemblokir iklan, lalu tekan "Muat ulang info".';
    if (retry) setTimeout(() => { if ($('#v-ip').textContent === 'Tidak terdeteksi') this.loadIp(false); }, 4000);
  },
  battery: null,
  renderBattery() {
    const b = this.battery;
    if (!b) return;
    const pct = Math.round(b.level * 100);
    const bar = $('#v-bat-bar');
    $('#v-bat').textContent = pct + '%';
    bar.style.width = pct + '%';
    bar.className = (pct <= 20 ? 'low' : pct <= 50 ? 'mid' : '') + (b.charging ? ' chg' : '');
    let sub = b.charging ? 'Sedang mengisi' : 'Tidak sedang mengisi';
    if (b.charging && isFinite(b.chargingTime) && b.chargingTime > 0) sub += ` \u00b7 penuh \u00b1${Math.ceil(b.chargingTime / 60)} mnt`;
    if (!b.charging && isFinite(b.dischargingTime) && b.dischargingTime > 0) {
      const m = Math.round(b.dischargingTime / 60);
      sub += ` \u00b7 sisa \u00b1${Math.floor(m / 60)} j ${m % 60} mnt`;
    }
    $('#v-bat-sub').textContent = sub;
  },
  async initBattery() {
    if (!navigator.getBattery) {
      $('#v-bat').textContent = 'Tidak didukung';
      $('#v-bat-sub').textContent = 'Browser ini tidak mengizinkan akses baterai (coba Chrome di Android).';
      return;
    }
    try {
      this.battery = await navigator.getBattery();
      ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange']
        .forEach((ev) => this.battery.addEventListener(ev, () => this.renderBattery()));
      this.renderBattery();
    } catch {
      $('#v-bat').textContent = 'Tidak tersedia';
      $('#v-bat-sub').textContent = 'Akses baterai diblokir oleh browser.';
    }
  },
  init() {
    this.loadIp();
    this.initBattery();
    $('#v-refresh').addEventListener('click', () => { this.loadIp(); this.renderBattery(); toast('Info diperbarui'); });
    $('#v-copy').addEventListener('click', async () => {
      const v = $('#v-ip').textContent;
      if (!/\d/.test(v)) return toast('IP belum tersedia', 'err');
      try { await navigator.clipboard.writeText(v); toast('IP disalin'); } catch { toast('Gagal menyalin', 'err'); }
    });
  }
};
visitor.init();

/* Init */
$$('[data-user]').forEach((el) => (el.textContent = CONFIG.user));
renderHome();
show(VIEW_BY_PATH[location.pathname] || 'home', false);
if (location.pathname === '/') history.replaceState(null, '', '/index');
