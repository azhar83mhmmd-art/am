// AM Premify v4.9 - Gerbang & tampilan maintenance
// Dipakai di semua halaman publik (menutup website saat maintenance) dan di maintenance.html.
// Tampilan dibuat di dalam Shadow DOM supaya tidak tercampur CSS website. Semua teks dari admin
// dipasang lewat textContent (aman dari HTML/script). Jika server tidak terjangkau, website dibiarkan jalan.
(function () {
  'use strict';
  if (window.__amMaint) return;
  window.__amMaint = true;

  const PAGE = document.documentElement.hasAttribute('data-mt-page');
  const PREVIEW = PAGE && /[?&]preview=1(&|$)/.test(location.search);
  const KEY = 'am_mt', RL = 'am_mt_rl', POLL = 15000;
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const DEFAULTS = {
    badge: 'Pemeliharaan', title: 'Kami sedang berbenah',
    message: 'Layanan sedang kami tingkatkan supaya lebih cepat dan stabil. Website akan terbuka kembali otomatis setelah selesai.',
    eta: '', contact_label: '', contact_url: ''
  };

  let state = null, host = null, sh = null, pillHost = null, shown = false, offset = 0, busy = false, tickT = 0, btnT = 0;

  /* ---------- tampilan ---------- */
  const CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0}
.wrap{position:fixed;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;display:grid;place-items:center;
  padding:max(22px,env(safe-area-inset-top)) 18px max(22px,env(safe-area-inset-bottom));
  background:#06070b;color:#e8ebf5;font-family:'Outfit','Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.bg{position:fixed;inset:0;overflow:hidden;pointer-events:none}
.blob{position:absolute;border-radius:50%;filter:blur(70px);opacity:.55;will-change:transform}
.b1{width:56vmax;height:56vmax;left:-18vmax;top:-22vmax;background:radial-gradient(circle,#6d4cff,transparent 65%);animation:d1 18s ease-in-out infinite alternate}
.b2{width:48vmax;height:48vmax;right:-16vmax;top:12vmax;background:radial-gradient(circle,#0fb5d6,transparent 65%);animation:d2 22s ease-in-out infinite alternate;opacity:.4}
.b3{width:44vmax;height:44vmax;left:18vmax;bottom:-24vmax;background:radial-gradient(circle,#ff4fa8,transparent 65%);animation:d3 26s ease-in-out infinite alternate;opacity:.28}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:46px 46px;
  -webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 45%,#000 20%,transparent 75%);mask-image:radial-gradient(ellipse 70% 60% at 50% 45%,#000 20%,transparent 75%)}
@keyframes d1{to{transform:translate(8vmax,10vmax) scale(1.15)}}
@keyframes d2{to{transform:translate(-10vmax,6vmax) scale(.9)}}
@keyframes d3{to{transform:translate(12vmax,-8vmax) scale(1.2)}}

.card{position:relative;width:100%;max-width:520px;margin:auto;padding:34px 28px 24px;border-radius:30px;text-align:center;
  background:linear-gradient(160deg,rgba(255,255,255,.085),rgba(255,255,255,.025));
  -webkit-backdrop-filter:blur(24px) saturate(150%);backdrop-filter:blur(24px) saturate(150%);
  box-shadow:0 40px 90px -24px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.14);animation:rise .7s cubic-bezier(.2,.8,.2,1) both}
.card::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
  background:linear-gradient(140deg,rgba(140,110,255,.85),rgba(255,255,255,.07) 42%,rgba(34,211,238,.6));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
@keyframes rise{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}

.orb{position:relative;width:118px;height:118px;margin:0 auto 18px}
.orb svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.spin{transform-origin:60px 60px;animation:spin 20s linear infinite}
.spin2{transform-origin:60px 60px;animation:spin 7s linear infinite}
.rock{transform-origin:60px 60px;animation:rock 3.4s ease-in-out infinite}
.glow{position:absolute;inset:24px;border-radius:50%;background:radial-gradient(circle,rgba(124,92,255,.55),transparent 70%);filter:blur(14px);animation:pulse 3s ease-in-out infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes rock{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}
@keyframes pulse{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}

.chip{display:inline-flex;align-items:center;gap:9px;max-width:100%;padding:7px 14px 7px 12px;border-radius:999px;background:rgba(255,184,0,.1);border:1px solid rgba(255,184,0,.28);
  color:#ffd166;font:600 .7rem/1 'JetBrains Mono',ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase}
.chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dot{flex:none;width:8px;height:8px;border-radius:50%;background:#ffb800;box-shadow:0 0 0 0 rgba(255,184,0,.6);animation:ping 1.8s ease-out infinite}
@keyframes ping{70%{box-shadow:0 0 0 9px rgba(255,184,0,0)}100%{box-shadow:0 0 0 0 rgba(255,184,0,0)}}

h1{margin:18px 0 12px;font-size:clamp(1.6rem,6.2vw,2.2rem);font-weight:800;line-height:1.14;letter-spacing:-.025em;overflow-wrap:anywhere;
  background:linear-gradient(120deg,#fff 25%,#c4b5ff 60%,#7ee8fa);-webkit-background-clip:text;background-clip:text;color:transparent}
.msg{color:#a4abc2;font-size:.98rem;line-height:1.72;white-space:pre-line;overflow-wrap:anywhere}

.eta{margin-top:24px}
.eta small{display:block;margin-bottom:10px;font:600 .66rem 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#7a84a3}
.cd{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.tile{padding:13px 4px 10px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.tile b{display:block;font:600 clamp(1.3rem,6vw,1.7rem)/1 'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:#fff}
.tile span{display:block;margin-top:7px;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:#7a84a3}
.when{margin-top:11px;font-size:.84rem;color:#8c95b3}
.soon{padding:14px;border-radius:16px;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.25);color:#7ee8fa;font-weight:600;font-size:.92rem}

.bar{height:4px;margin:26px 2px 0;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
.bar i{display:block;width:38%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7c5cff,#22d3ee);animation:slide 1.9s cubic-bezier(.5,0,.5,1) infinite}
@keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}

.acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.btn{flex:1 1 150px;display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:48px;padding:0 18px;border-radius:15px;border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);color:#eef0fa;font:600 .92rem 'Outfit',system-ui,sans-serif;text-decoration:none;cursor:pointer;transition:transform .15s,background .2s,box-shadow .2s}
.btn:hover{background:rgba(255,255,255,.11);transform:translateY(-1px)}
.btn:active{transform:translateY(1px) scale(.98)}
.btn:focus-visible{outline:2px solid #9a85ff;outline-offset:2px}
.btn.main{border-color:transparent;background:linear-gradient(120deg,#6d4cff,#18b8d8);color:#fff;box-shadow:0 10px 28px -10px rgba(109,76,255,.8)}
.btn.main:hover{box-shadow:0 14px 34px -10px rgba(109,76,255,.95)}
.btn svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.btn.load svg{animation:spin .8s linear infinite}
.btn[hidden]{display:none}

.foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,.07);
  font:500 .68rem 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.08em;color:#667091;text-transform:uppercase}

.pill{position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:1;display:flex;align-items:center;gap:9px;max-width:calc(100vw - 16px);
  padding:6px 8px 6px 12px;border-radius:999px;background:rgba(10,11,18,.92);color:#ffd166;border:1px solid rgba(255,184,0,.4);box-shadow:0 8px 30px rgba(0,0,0,.4);
  font:600 .66rem/1.2 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;pointer-events:auto}
.pill a,.pill button{flex:none;padding:5px 9px;border-radius:99px;border:0;background:rgba(255,184,0,.16);color:#ffd166;font:inherit;text-decoration:none;cursor:pointer}
.pill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:420px){.card{padding:28px 18px 20px;border-radius:26px}.acts .btn{flex-basis:100%}.pill span{display:none}.pill::before{content:'Maintenance aktif';white-space:nowrap}}
@media (prefers-reduced-motion:reduce){*,*::before{animation:none!important;transition:none!important}}
`;

  const ICON_REFRESH = '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>';
  const ICON_LINK = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';

  const HTML = `
<div class="wrap" role="alertdialog" aria-modal="true" aria-labelledby="t">
  <div class="bg"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="grid"></div></div>
  <main class="card">
    <div class="orb" aria-hidden="true">
      <div class="glow"></div>
      <svg viewBox="0 0 120 120">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f74ff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
        </defs>
        <g class="spin"><circle cx="60" cy="60" r="56" fill="none" stroke="url(#g1)" stroke-width="1.6" stroke-dasharray="3 9" stroke-linecap="round" opacity=".9"/></g>
        <circle cx="60" cy="60" r="44" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1"/>
        <g class="spin2"><circle cx="60" cy="16" r="4" fill="#22d3ee"/><circle cx="60" cy="16" r="8" fill="#22d3ee" opacity=".25"/></g>
        <circle cx="60" cy="60" r="31" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.16)"/>
        <g class="rock"><g transform="translate(60 60) scale(1.05) translate(-12 -12)">
          <path fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </g></g>
      </svg>
    </div>
    <div class="chip"><i class="dot"></i><span id="badge"></span></div>
    <h1 id="t"></h1>
    <p class="msg" id="msg"></p>
    <section class="eta" id="eta" hidden>
      <small id="etaLabel">Estimasi selesai dalam</small>
      <div class="cd" id="cd">
        <div class="tile"><b id="d">00</b><span>Hari</span></div>
        <div class="tile"><b id="h">00</b><span>Jam</span></div>
        <div class="tile"><b id="m">00</b><span>Menit</span></div>
        <div class="tile"><b id="s">00</b><span>Detik</span></div>
      </div>
      <div class="soon" id="soon" hidden>Hampir selesai. Halaman ini akan terbuka sendiri begitu siap.</div>
      <p class="when" id="when"></p>
    </section>
    <div class="bar" aria-hidden="true"><i></i></div>
    <div class="acts">
      <a class="btn" id="contact" target="_blank" rel="noopener noreferrer" hidden><span id="contactTxt"></span>${ICON_LINK}</a>
      <button class="btn main" id="retry" type="button">${ICON_REFRESH}<span id="retryTxt">Periksa lagi</span></button>
    </div>
    <div class="foot"><span>AM Premify</span><span id="upd"></span></div>
  </main>
</div>`;

  function ensureFonts() {
    if (document.getElementById('am-mt-fonts') || !document.head) return;
    const l = document.createElement('link');
    l.id = 'am-mt-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;800&family=JetBrains+Mono:wght@500;600&display=swap';
    document.head.appendChild(l);
  }

  function mount() {
    if (host) return;
    ensureFonts();
    host = document.createElement('div');
    host.id = 'am-maint';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block;';
    sh = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style'); st.textContent = CSS;
    const box = document.createElement('div'); box.innerHTML = HTML;
    sh.append(st, box.firstElementChild);
    document.documentElement.appendChild(host);
    $('#retry').addEventListener('click', onRetry);
  }
  const $ = (s) => sh.querySelector(s);
  const pad = (n) => String(Math.max(0, n)).padStart(2, '0');

  function lock(on) {
    if (PAGE) return;
    const go = () => {
      const b = document.body; if (!b) return;
      if (on) { b.setAttribute('inert', ''); b.setAttribute('aria-hidden', 'true'); }
      else { b.removeAttribute('inert'); b.removeAttribute('aria-hidden'); }
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go, { once: true });
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }

  function fmtWhen(iso) {
    const d = new Date(iso);
    const day = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
    return day + ' · ' + time;
  }

  function render(s) {
    mount();
    removePill();
    const v = Object.assign({}, DEFAULTS, s);
    $('#badge').textContent = String(v.badge || DEFAULTS.badge);
    $('#t').textContent = String(v.title || DEFAULTS.title);
    $('#msg').textContent = String(v.message || DEFAULTS.message);
    if (PAGE) document.title = String(v.title || DEFAULTS.title) + ' - AM Premify';

    const c = $('#contact');
    let url = '';
    try { const u = new URL(String(v.contact_url || '')); if (/^https?:$/.test(u.protocol)) url = u.href; } catch {}
    c.hidden = !url;
    if (url) { c.href = url; $('#contactTxt').textContent = String(v.contact_label || 'Hubungi kami'); }

    const eta = v.eta ? Date.parse(v.eta) : NaN;
    host.__eta = Number.isFinite(eta) ? eta : 0;
    $('#eta').hidden = !host.__eta;
    if (host.__eta) $('#when').textContent = fmtWhen(host.__eta);
    const up = v.updated_at ? Date.parse(v.updated_at) : NaN;
    $('#upd').textContent = Number.isFinite(up) ? 'Diperbarui ' + new Date(up).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.') : '';

    clearInterval(tickT);
    if (host.__eta) { tick(); tickT = setInterval(tick, 1000); }
    if (!shown) { shown = true; lock(true); }
  }

  function tick() {
    if (!host || !host.__eta) return;
    const left = Math.floor((host.__eta - (Date.now() + offset)) / 1000);
    const done = left <= 0;
    $('#cd').hidden = done;
    $('#soon').hidden = !done;
    $('#etaLabel').textContent = done ? 'Estimasi selesai' : 'Estimasi selesai dalam';
    if (done) return;
    $('#d').textContent = pad(Math.floor(left / 86400));
    $('#h').textContent = pad(Math.floor(left % 86400 / 3600));
    $('#m').textContent = pad(Math.floor(left % 3600 / 60));
    $('#s').textContent = pad(left % 60);
  }

  function unmount() {
    clearInterval(tickT);
    if (host) { host.remove(); host = sh = null; }
    if (shown) { shown = false; lock(false); }
  }

  /* Pita kecil untuk admin: website tetap bisa dipakai saat maintenance aktif */
  function showPill() {
    if (pillHost || sessionStorage.getItem('am_mt_pill') === '0') return;
    pillHost = document.createElement('div');
    pillHost.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const s = pillHost.attachShadow({ mode: 'open' });
    s.innerHTML = '<style>' + CSS + '</style><div class="pill"><i class="dot"></i><span>Maintenance aktif · hanya admin yang bisa membuka situs</span><a href="/admin#mnt">Kelola</a><button type="button" aria-label="Tutup">×</button></div>';
    s.querySelector('button').addEventListener('click', () => { try { sessionStorage.setItem('am_mt_pill', '0'); } catch {} removePill(); });
    document.documentElement.appendChild(pillHost);
  }
  function removePill() { if (pillHost) { pillHost.remove(); pillHost = null; } }

  /* ---------- status dari server ---------- */
  function safeReload() {
    let last = 0; try { last = Number(sessionStorage.getItem(RL)) || 0; } catch {}
    if (Date.now() - last < 6000) return; // cegah loop muat-ulang
    try { sessionStorage.setItem(RL, String(Date.now())); } catch {}
    if (PAGE && location.pathname === '/maintenance') location.replace('/index'); else location.reload();
  }

  function handle(s) {
    state = s;
    if (PREVIEW) return;
    try {
      if (s.on && !s.admin) localStorage.setItem(KEY, JSON.stringify({ s, t: Date.now() })); else localStorage.removeItem(KEY);
    } catch {}
    if (PAGE) { if (s.on) render(s); else safeReload(); return; }
    if (s.on && !s.admin) render(s);
    else if (s.on && s.admin) { if (shown) unmount(); showPill(); }
    else { removePill(); if (shown) { unmount(); safeReload(); } }
  }

  async function check() {
    if (busy || !nativeFetch) return;
    busy = true;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await nativeFetch('/api/maintenance?_=' + Date.now(), { cache: 'no-store', credentials: 'same-origin', signal: ctl.signal });
      if (!r.ok) throw new Error('x');
      const s = await r.json();
      if (!s || typeof s.on !== 'boolean') throw new Error('x');
      offset = (Number(s.now) || Date.now()) - Date.now();
      if (PREVIEW) { if (!window.__mtPosted) render(s); } else handle(s);
    } catch (e) { /* offline / server tidak ada: biarkan website berjalan */ }
    finally { clearTimeout(to); busy = false; }
  }

  async function onRetry() {
    const b = $('#retry'), t = $('#retryTxt');
    if (b.classList.contains('load')) return;
    b.classList.add('load'); t.textContent = 'Memeriksa…';
    const t0 = Date.now();
    await check();
    setTimeout(() => {
      if (!sh) return;
      b.classList.remove('load'); t.textContent = 'Masih dalam perbaikan';
      clearTimeout(btnT); btnT = setTimeout(() => { if (sh) t.textContent = 'Periksa lagi'; }, 2200);
    }, Math.max(0, 700 - (Date.now() - t0)));
  }

  /* ---------- mulai ---------- */
  if (PREVIEW) {
    // Pratinjau di menu admin: tampil walau maintenance mati, teks bisa diubah langsung dari form admin
    const pick = (d) => ({ badge: d.badge, title: d.title, message: d.message, eta: d.eta, contact_label: d.contact_label, contact_url: d.contact_url, updated_at: new Date().toISOString() });
    render(Object.assign({}, window.__MT_STATE || {}));
    check();
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'mt-preview' || !e.data.data) return;
      window.__mtPosted = true;
      render(pick(e.data.data));
    });
    return;
  }

  if (PAGE && window.__MT_STATE && window.__MT_STATE.on) { state = window.__MT_STATE; offset = (Number(state.now) || Date.now()) - Date.now(); render(state); }
  else if (!PAGE) {
    // Pernah ditutup dalam 30 menit terakhir: tampilkan langsung tanpa menunggu jaringan, lalu verifikasi
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (c && c.s && c.s.on && Date.now() - c.t < 30 * 60000) render(c.s);
    } catch {}
  }

  check();
  setInterval(() => { if (!document.hidden) check(); }, POLL);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('online', check);
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });

  // Permintaan API yang ditolak 503 maintenance -> cek ulang sekarang juga
  if (!PAGE && nativeFetch) {
    window.fetch = function () {
      return nativeFetch.apply(window, arguments).then((r) => {
        if (r && r.status === 503 && !/\/api\/maintenance/.test(r.url || '')) check();
        return r;
      });
    };
  }
})();
