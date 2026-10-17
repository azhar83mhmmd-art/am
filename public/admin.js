// AM Premify v4.3 - Menu admin (/admin)
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const I = (n, cls) => `<svg class="ic${cls ? ' ' + cls : ''}"><use href="#i-${n}"/></svg>`;

  let toastTimer;
  function toast(msg, type) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 2800);
  }

  /* ---------- waktu ---------- */
  const clock = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  const stamp = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  function ago(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 45) return 'baru saja';
    if (s < 3600) return Math.round(s / 60) + ' mnt lalu';
    if (s < 86400) return Math.round(s / 3600) + ' jam lalu';
    if (s < 172800) return 'kemarin';
    return stamp(iso);
  }
  function dayLabel(iso) {
    const d = new Date(iso), t = new Date();
    const key = (x) => x.getFullYear() * 400 + x.getMonth() * 31 + x.getDate();
    if (key(d) === key(t)) return 'Hari ini';
    const y = new Date(t); y.setDate(t.getDate() - 1);
    if (key(d) === key(y)) return 'Kemarin';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
  }
  function uaShort(ua) {
    ua = ua || '';
    const os = /Android ([\d.]+)/.test(ua) ? 'Android ' + RegExp.$1 : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '?';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return os + ' · ' + br;
  }

  /* ---------- API ---------- */
  async function api(path, opts) {
    const o = Object.assign({ method: 'GET', credentials: 'same-origin', headers: {} }, opts);
    if (o.method !== 'GET') {
      o.headers = Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'am-admin' }, o.headers);
      if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
    }
    const r = await fetch(path, o);
    let d = {};
    try { d = await r.json(); } catch {}
    if (r.status === 401 && path !== '/api/admin/login') { showLogin('Sesi admin berakhir. Masuk lagi.'); throw new Error('Sesi berakhir'); }
    if (!r.ok) { const e = new Error(d.error || 'Status ' + r.status); e.status = r.status; throw e; }
    return d;
  }

  /* ---------- state ---------- */
  const S = {
    tab: 'act', acts: [], actMore: true, threads: [], devs: [], q: '', unread: -1, authed: false,
    conv: null, timers: [], lastErr: false
  };

  function live(on) {
    const b = $('#live');
    b.className = 'adm-live ' + (on ? 'on' : 'off');
    $('b', b).textContent = on ? 'LIVE' : 'TERPUTUS';
  }

  /* ---------- login ---------- */
  function stopTimers() { S.timers.forEach(clearInterval); S.timers = []; }
  function showLogin(msg) {
    S.authed = false;
    stopTimers();
    S.conv = null;
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#login-err').textContent = msg || '';
    $('#pw').value = '';
    setTimeout(() => $('#pw').focus(), 50);
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-btn');
    btn.disabled = true;
    $('span', btn).textContent = 'Memeriksa…';
    $('#login-err').textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } });
      $('#pw').value = '';
      enter();
    } catch (err) {
      $('#login-err').textContent = err.message;
    } finally { btn.disabled = false; $('span', btn).textContent = 'Masuk'; }
  });

  $('#logout').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
    showLogin('Kamu sudah keluar.');
  });

  /* ---------- hash router: #act | #chat | #chat/<id>?act=<n> | #dev ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#/, '');
    const [p, q] = h.split('?');
    const [tab, id] = p.split('/');
    return {
      tab: ['act', 'chat', 'dev'].includes(tab) ? tab : 'act',
      id: /^[0-9a-f]{32}$/.test(id || '') ? id : '',
      act: Number(new URLSearchParams(q || '').get('act')) || 0
    };
  }
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

  function route() {
    if (!S.authed) return;
    const h = parseHash();
    S.tab = h.tab;
    $$('.adm-tab').forEach((b) => { const on = b.dataset.tab === h.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    ['act', 'chat', 'dev'].forEach((t) => $('#tab-' + t).classList.toggle('hidden', t !== h.tab));
    if (h.tab === 'act') loadActs(false);
    if (h.tab === 'dev') loadDevs();
    if (h.tab === 'chat') {
      loadThreads();
      if (h.id) openConv(h.id, h.act); else closeConv();
    } else closeConv(true);
  }
  window.addEventListener('hashchange', route);
  $$('.adm-tab').forEach((b) => b.addEventListener('click', () => go('#' + b.dataset.tab)));

  /* ---------- ringkasan ---------- */
  async function loadOverview() {
    const d = await api('/api/admin/overview');
    $('b', $('#st-unread')).textContent = d.unread;
    $('#st-unread').classList.toggle('alert', d.unread > 0);
    $('#st-dev').textContent = d.devices;
    $('b', $('#st-blk')).textContent = d.blocked;
    const badge = $('#tab-badge');
    badge.textContent = d.unread > 99 ? '99+' : d.unread;
    badge.classList.toggle('hidden', !d.unread);
    document.title = (d.unread ? `(${d.unread}) ` : '') + 'Admin - AM Premify';
    if (S.unread >= 0 && d.unread > S.unread && !(S.tab === 'chat' && S.conv)) toast('Pesan baru dari pengguna');
    S.unread = d.unread;
  }

  /* ---------- tag & tombol ---------- */
  function tagsOf(r, withIp) {
    const t = [];
    const n = Number(r.device_acts != null ? r.device_acts : r.acts) || 0;
    t.push(`<span class="atag ${n >= 5 ? 'red' : ''}">${n}× aktivasi</span>`);
    const names = r.names || [];
    if (names.length > 1) t.push(`<span class="atag warn" title="${esc(names.join(', '))}">${names.length} nama dipakai</span>`);
    if (r.blocked) t.push(`<span class="atag red">PREMIUM NONAKTIF${r.blocked_via && r.blocked_via !== 'admin' ? ' · OTOMATIS' : ''}</span>`);
    else if (r.allow) t.push('<span class="atag ok">DIKECUALIKAN</span>');
    if (withIp && r.ip) t.push(`<span class="atag">${esc(r.ip)}</span>`);
    return t.join('');
  }
  const blockBtn = (id, blocked) => blocked
    ? `<button class="ibtn good" data-do="unblock" data-id="${id}" type="button">${I('check')}Aktifkan</button>`
    : `<button class="ibtn danger" data-do="block" data-id="${id}" type="button">${I('ban')}Nonaktifkan</button>`;

  /* ---------- tab Aktivasi ---------- */
  function renderActs() {
    const box = $('#act-list');
    if (!S.acts.length) { box.innerHTML = '<div class="adm-empty">Belum ada aktivasi sukses.</div>'; return; }
    box.innerHTML = S.acts.map((r) => {
      const has = !!r.device_id;
      const nm = r.name || r.device_name || 'Tanpa nama';
      const unread = Number(r.unread) || 0;
      const nameEl = has
        ? `<button class="row-name" data-do="chat" data-id="${r.device_id}" data-aid="${r.id}" type="button" title="Buka chat dengan ${esc(nm)}"><span class="t">${esc(nm)}</span>${unread ? `<span class="abadge">${unread}</span>` : ''}${I('msg')}</button>`
        : `<span class="row-name plain"><span class="t">${esc(nm)}</span></span>`;
      const meta = has ? tagsOf(r, true) : '<span class="atag">DATA LAMA · TANPA PERANGKAT</span>';
      const side = has ? `<div class="row-act">${blockBtn(r.device_id, r.blocked)}</div>` : '';
      return `<article class="arow${r.blocked ? ' blocked' : ''}">
        <div class="row-main">${nameEl}<span class="row-mail">${esc(r.email || '(email tidak tercatat)')}</span><div class="row-meta">${meta}</div></div>
        <div class="row-side"><time datetime="${esc(r.created_at)}">${esc(ago(r.created_at))}</time>${side}</div>
      </article>`;
    }).join('');
    $('#act-more').classList.toggle('hidden', !S.actMore);
  }

  async function loadActs(more) {
    try {
      const before = more && S.acts.length ? S.acts[S.acts.length - 1].id : '';
      const d = await api('/api/admin/activations' + (before ? '?before=' + before : ''));
      const map = new Map(S.acts.map((r) => [r.id, r]));
      d.rows.forEach((r) => map.set(r.id, r));
      S.acts = [...map.values()].sort((a, b) => b.id - a.id);
      if (more || !S.acts.length || d.rows.length < 40) S.actMore = d.rows.length >= 40;
      renderActs();
      live(true);
    } catch (e) { if (e.message !== 'Sesi berakhir') { live(false); $('#act-list').innerHTML = `<div class="adm-empty">${esc(e.message)}</div>`; } }
  }
  $('#act-more').addEventListener('click', () => loadActs(true));

  /* ---------- tab Perangkat ---------- */
  function renderDevs() {
    const box = $('#dev-list');
    if (!S.devs.length) { box.innerHTML = '<div class="adm-empty">Tidak ada perangkat yang cocok.</div>'; return; }
    box.innerHTML = S.devs.map((r) => {
      const alias = (r.names || []).filter((n) => n !== r.name);
      const unread = Number(r.unread) || 0;
      return `<article class="arow${r.blocked ? ' blocked' : ''}">
        <div class="row-main">
          <button class="row-name" data-do="chat" data-id="${r.id}" type="button"><span class="t">${esc(r.name || 'Tanpa nama')}</span>${unread ? `<span class="abadge">${unread}</span>` : ''}${I('msg')}</button>
          ${alias.length ? `<span class="row-mail">Juga memakai: ${esc(alias.join(', '))}</span>` : ''}
          ${r.blocked && r.blocked_reason ? `<span class="row-mail">Alasan: ${esc(r.blocked_reason)}</span>` : ''}
          <div class="row-meta">${tagsOf(r, true)}<span class="atag">${esc(uaShort(r.ua))}</span></div>
        </div>
        <div class="row-side"><time datetime="${esc(r.last_seen)}">${esc('Aktif ' + ago(r.last_seen))}</time><div class="row-act">${blockBtn(r.id, r.blocked)}</div></div>
      </article>`;
    }).join('');
  }
  async function loadDevs() {
    try {
      const d = await api('/api/admin/devices?q=' + encodeURIComponent(S.q));
      S.devs = d.rows;
      renderDevs();
      live(true);
    } catch (e) { if (e.message !== 'Sesi berakhir') { live(false); $('#dev-list').innerHTML = `<div class="adm-empty">${esc(e.message)}</div>`; } }
  }
  let qTimer;
  $('#dev-q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = e.target.value.trim(); loadDevs(); }, 300); });

  /* ---------- tab Chat: daftar percakapan ---------- */
  function renderThreads() {
    const box = $('#th-list');
    if (!S.threads.length) { box.innerHTML = '<div class="adm-empty" style="border:0;border-radius:0">Belum ada percakapan. Klik nama pengguna di tab Aktivasi untuk memulai chat.</div>'; return; }
    box.innerHTML = S.threads.map((t) => {
      const un = Number(t.unread) || 0;
      const initial = (String(t.name || '?').match(/[\p{L}\p{N}]/u) || ['?'])[0];
      return `<button class="th${S.conv && S.conv.id === t.device_id ? ' on' : ''}" data-do="chat" data-id="${t.device_id}" type="button">
        <span class="th-av">${esc(initial)}</span>
        <span class="th-tx"><b><span>${esc(t.name || 'Tanpa nama')}</span>${un ? `<span class="abadge">${un}</span>` : ''}${t.blocked ? '<span class="atag red">NONAKTIF</span>' : ''}</b><small>${t.last_sender === 'admin' ? 'Kamu: ' : ''}${esc(t.last_body)}</small></span>
        <time>${esc(ago(t.last_at))}</time>
      </button>`;
    }).join('');
  }
  async function loadThreads() {
    try { const d = await api('/api/admin/threads'); S.threads = d.rows; renderThreads(); live(true); }
    catch (e) { if (e.message !== 'Sesi berakhir') { live(false); $('#th-list').innerHTML = `<div class="adm-empty" style="border:0">${esc(e.message)}</div>`; } }
  }

  /* ---------- tab Chat: percakapan ---------- */
  function convEmpty() {
    $('#cv').innerHTML = `<div class="cx-empty">${I('msg')}<p style="margin-top:8px">Pilih percakapan di sebelah kiri, atau klik nama pengguna di tab Aktivasi.</p></div>`;
  }
  function closeConv(silent) {
    if (S.conv && S.conv.timer) clearInterval(S.conv.timer);
    S.conv = null;
    $('#cx').classList.remove('conv');
    if (!silent) { convEmpty(); renderThreads(); }
  }

  const nearBottom = (b) => b.scrollHeight - b.scrollTop - b.clientHeight < 100;

  function addMsg(m) {
    const c = S.conv;
    if (!c || c.ids.has(m.id)) return false;
    const body = $('#cv-body');
    if (!body) return false;
    const day = dayLabel(m.created_at);
    if (day !== c.lastDay) { body.appendChild(mk('div', 'chat-day', day)); c.lastDay = day; }
    const mine = m.sender === 'admin';
    const el = mk('div', 'cm ' + (mine ? 'me' : 'ad'));
    if (!mine) el.appendChild(mk('span', 'cm-tag', (c.device && c.device.name) || 'PENGGUNA'));
    el.appendChild(mk('div', 'cm-b', m.body));
    el.appendChild(mk('span', 'cm-t', clock(m.created_at)));
    body.appendChild(el);
    c.ids.add(m.id);
    if (m.id > c.after) c.after = m.id;
    return true;
  }
  function appendMsgs(list, force) {
    const body = $('#cv-body');
    if (!body || !list.length) return;
    const stick = force || nearBottom(body);
    let n = 0;
    list.forEach((m) => { if (addMsg(m)) n++; });
    if (n && stick) { body.style.scrollBehavior = 'auto'; body.scrollTop = body.scrollHeight; }
    const empty = $('.cx-none', body);
    if (empty && S.conv.ids.size) empty.remove();
  }

  function renderConvShell() {
    const c = S.conv, d = c.device;
    const alias = (d.names || []).filter((n) => n !== d.name);
    $('#cv').innerHTML = `
      <div class="cv-head">
        <div class="cv-top">
          <button class="cv-back" id="cv-back" type="button" aria-label="Kembali ke daftar">${I('back')}</button>
          <div class="cv-name"><b>${esc(d.name || 'Tanpa nama')}</b><small>${alias.length ? 'Juga memakai: ' + esc(alias.join(', ')) : 'Nama yang sama sejak pertama'}</small></div>
          <span id="cv-block">${blockBtn(d.id, d.blocked)}</span>
        </div>
        <div class="cv-info" id="cv-info"></div>
      </div>
      <div class="cv-ctx" id="cv-ctx"></div>
      <div class="chat-body" id="cv-body" role="log" aria-live="polite"></div>
      <div class="chat-foot">
        <p class="chat-err" id="cv-err" role="alert"></p>
        <form class="chat-form" id="cv-form" autocomplete="off">
          <textarea class="chat-in" id="cv-in" rows="1" maxlength="600" placeholder="Tulis balasan untuk ${esc(d.name || 'pengguna')}…" aria-label="Tulis balasan"></textarea>
          <button class="chat-send" id="cv-send" type="submit" aria-label="Kirim" disabled>${I('send')}</button>
        </form>
      </div>`;
    fillInfo();
    $('#cv-back').addEventListener('click', () => go('#chat'));
    const inp = $('#cv-in'), send = $('#cv-send');
    const sync = () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 116) + 'px'; send.disabled = !inp.value.trim(); };
    inp.addEventListener('input', sync);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#cv-form').requestSubmit(); }
    });
    $('#cv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = inp.value.trim();
      if (!text || !S.conv) return;
      send.disabled = true;
      $('#cv-err').textContent = '';
      try {
        const r = await api('/api/admin/chat', { method: 'POST', body: { id: S.conv.id, body: text } });
        inp.value = ''; sync();
        appendMsgs([r.message], true);
        loadThreads();
      } catch (err) { $('#cv-err').textContent = err.message; send.disabled = false; }
    });
  }

  function fillInfo() {
    const c = S.conv, d = c.device;
    const bits = [];
    bits.push(`<span class="atag">${c.total || 0}× aktivasi</span>`);
    if (d.blocked) bits.push(`<span class="atag red">PREMIUM NONAKTIF${d.blocked_via && d.blocked_via !== 'admin' ? ' · OTOMATIS' : ''}</span>`);
    else if (d.allow) bits.push('<span class="atag ok">DIKECUALIKAN</span>');
    if (d.blocked && d.blocked_reason) bits.push(`<span class="atag">Alasan: ${esc(d.blocked_reason)}</span>`);
    if (d.ip) bits.push(`<span class="atag">${I('globe', 'sm')}${esc(d.ip)}</span>`);
    bits.push(`<span class="atag">${esc(uaShort(d.ua))}</span>`);
    bits.push(`<span class="atag">Sejak ${esc(stamp(d.first_seen))}</span>`);
    $('#cv-info').innerHTML = bits.join('');
    $('#cv-block').innerHTML = blockBtn(d.id, d.blocked);

    const ctx = $('#cv-ctx');
    if (!c.acts.length) { ctx.classList.add('hidden'); return; }
    ctx.classList.remove('hidden');
    ctx.innerHTML = `<span>Aktivasi oleh perangkat ini</span><div class="cv-acts">${c.acts.map((a) =>
      `<button class="chip-act${c.sel === a.id ? ' on' : ''}" data-pick="${a.id}" type="button">${esc(a.email || '(tanpa email)')} · ${esc(stamp(a.created_at))}</button>`).join('')}</div>
      <button class="ibtn cv-quick" id="cv-ask" type="button">${I('msg')}Tanya: aktivasi ini untuk apa?</button>`;
    $$('[data-pick]', ctx).forEach((b) => b.addEventListener('click', () => { c.sel = Number(b.dataset.pick); fillInfo(); }));
    $('#cv-ask').addEventListener('click', () => askAboutActivation());
  }

  // Isi kolom balasan dengan pertanyaan tentang aktivasi yang dipilih (admin tinggal meninjau lalu kirim)
  function askAboutActivation() {
    const c = S.conv;
    if (!c) return;
    const a = c.acts.find((x) => x.id === c.sel) || c.acts[0];
    if (!a) return;
    c.sel = a.id;
    const inp = $('#cv-in');
    inp.value = `Halo ${c.device.name || ''}, ini admin AM Premify. Admin melihat aktivasi untuk ${a.email || 'sebuah akun'} pada ${stamp(a.created_at)}. Akun itu untuk apa ya?`.replace('Halo ,', 'Halo,');
    inp.dispatchEvent(new Event('input'));
    inp.focus();
    fillInfo();
  }

  async function openConv(id, actId) {
    if (S.conv && S.conv.id === id) {
      if (actId && S.conv.acts.some((a) => a.id === actId)) { S.conv.sel = actId; fillInfo(); }
      $('#cx').classList.add('conv');
      return;
    }
    closeConv(true);
    S.conv = { id, after: 0, ids: new Set(), lastDay: '', device: null, acts: [], sel: actId || 0, total: 0, timer: 0 };
    const mine = S.conv;
    $('#cx').classList.add('conv');
    $('#cv').innerHTML = '<div class="cx-empty">Memuat percakapan…</div>';
    renderThreads();
    try {
      const d = await api(`/api/admin/chat?id=${id}&after=0&mark=1`);
      if (S.conv !== mine) return;
      mine.device = d.device; mine.acts = d.activations || []; mine.total = d.acts_total || 0;
      if (!mine.sel || !mine.acts.some((a) => a.id === mine.sel)) mine.sel = mine.acts[0] ? mine.acts[0].id : 0;
      renderConvShell();
      if (!d.messages.length) $('#cv-body').appendChild(mk('div', 'chat-empty cx-none', 'Belum ada pesan. Mulai percakapan lewat kolom di bawah.'));
      appendMsgs(d.messages, true);
      // Datang dari klik nama di tab Aktivasi: siapkan pertanyaan tentang aktivasi tersebut
      if (actId && mine.acts.some((a) => a.id === actId) && !d.messages.length) askAboutActivation();
      loadThreads(); loadOverview().catch(() => {});
      mine.timer = setInterval(pollConv, 2500);
    } catch (e) {
      if (S.conv === mine) { $('#cv').innerHTML = `<div class="cx-empty">${esc(e.message)}</div>`; }
    }
  }

  async function pollConv() {
    const c = S.conv;
    if (!c || document.hidden || S.tab !== 'chat' || !c.device) return;
    try {
      const d = await api(`/api/admin/chat?id=${c.id}&after=${c.after}&mark=1`);
      if (S.conv !== c) return;
      if (d.messages.length) { appendMsgs(d.messages); loadThreads(); loadOverview().catch(() => {}); }
      live(true);
    } catch (e) { if (e.message !== 'Sesi berakhir') live(false); }
  }

  async function reloadConvInfo() {
    const c = S.conv;
    if (!c) return;
    try {
      const d = await api(`/api/admin/chat?id=${c.id}&after=0`);
      if (S.conv !== c) return;
      c.device = d.device; c.acts = d.activations || []; c.total = d.acts_total || 0;
      fillInfo();
    } catch {}
  }

  /* ---------- blokir / aktifkan fitur premium ---------- */
  function nameOf(id) {
    const a = S.acts.find((r) => r.device_id === id); if (a) return a.device_name || a.name;
    const d = S.devs.find((r) => r.id === id); if (d) return d.name;
    const t = S.threads.find((r) => r.device_id === id); if (t) return t.name;
    return S.conv && S.conv.id === id && S.conv.device ? S.conv.device.name : '';
  }
  function infoOf(id) {
    return S.devs.find((r) => r.id === id) || (S.conv && S.conv.id === id && S.conv.device) || S.acts.find((r) => r.device_id === id) || {};
  }

  async function refreshAll() {
    loadOverview().catch(() => {});
    if (S.tab === 'act') loadActs(false);
    if (S.tab === 'dev') loadDevs();
    if (S.tab === 'chat') loadThreads();
    reloadConvInfo();
  }

  async function doBlock(id) {
    const name = nameOf(id) || 'Pengguna ini';
    let related = 0;
    const r = await UI.confirm({
      tone: 'danger', icon: 'ban',
      title: 'Nonaktifkan fitur premium?',
      message: `${name} tidak akan bisa mengirim magic link maupun mengaktifkan VIP lagi.`,
      itemsTitle: 'Cara kerja', itemIcon: 'check',
      items: [
        'Berlaku untuk perangkatnya, bukan hanya nama: keluar akun atau ganti nama tidak membantu',
        'Dikenali lewat ID perangkat, sidik jari, dan jaringan, termasuk setelah data browser dihapus',
        'Chat dengan admin tetap bisa dipakai untuk banding'
      ],
      field: { label: 'Alasan (tampil ke pengguna)', placeholder: 'mis. spam aktivasi', maxlength: 120 },
      confirmText: 'Nonaktifkan', busyText: 'Menonaktifkan…',
      onConfirm: async (reason) => { const d = await api('/api/admin/block', { method: 'POST', body: { id, reason } }); related = d.related || 0; }
    });
    if (!r) return;
    toast(related ? `Premium dinonaktifkan (+${related} identitas terkait)` : 'Premium dinonaktifkan');
    refreshAll();
  }

  async function doUnblock(id) {
    const name = nameOf(id) || 'Pengguna ini';
    const info = infoOf(id);
    const auto = info.blocked_via && info.blocked_via !== 'admin';
    const r = await UI.confirm({
      tone: 'info', icon: 'check',
      title: 'Aktifkan kembali premium?',
      message: auto
        ? `${name} terblokir otomatis karena mirip dengan perangkat yang diblokir (kemungkinan salah deteksi). Hanya perangkat ini yang diaktifkan dan dikecualikan dari pencocokan otomatis.`
        : `${name} bisa memakai fitur premium lagi. Semua identitas yang ikut terblokir bersama perangkat ini juga diaktifkan kembali.`,
      confirmText: 'Aktifkan kembali', busyText: 'Mengaktifkan…',
      onConfirm: async () => { await api('/api/admin/unblock', { method: 'POST', body: { id } }); }
    });
    if (!r) return;
    toast('Fitur premium diaktifkan kembali');
    refreshAll();
  }

  /* ---------- klik (delegasi) ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-do]');
    if (!el || !S.authed) return;
    const id = el.dataset.id;
    if (el.dataset.do === 'chat') go('#chat/' + id + (el.dataset.aid ? '?act=' + el.dataset.aid : ''));
    else if (el.dataset.do === 'block') doBlock(id);
    else if (el.dataset.do === 'unblock') doUnblock(id);
  });

  /* ---------- mulai ---------- */
  function poll() {
    if (document.hidden) return;
    loadOverview().then(() => live(true)).catch((e) => { if (e.message !== 'Sesi berakhir') live(false); });
    if (S.tab === 'act') loadActs(false);
    else if (S.tab === 'dev') loadDevs();
    else if (S.tab === 'chat') loadThreads();
  }

  function enter() {
    S.authed = true;
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    S.unread = -1;
    loadOverview().catch(() => {});
    route();
    stopTimers();
    S.timers.push(setInterval(poll, 6000));
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.authed) poll(); });

  async function boot() {
    let st = {};
    try { st = await (await fetch('/api/admin/status', { credentials: 'same-origin' })).json(); } catch {}
    const note = $('#login-note');
    if (!st.configured) {
      showLogin();
      note.innerHTML = 'Menu admin belum aktif. Isi <code>ADMIN_PASSWORD</code> (minimal 12 karakter) di file <code>.env</code> lalu restart server.';
      note.classList.remove('hidden');
      $('#login-btn').disabled = true;
      return;
    }
    if (st.supabase === false) {
      note.innerHTML = 'Supabase belum dikonfigurasi di <code>.env</code>, jadi data aktivasi &amp; chat belum bisa dimuat.';
      note.classList.remove('hidden');
    }
    if (st.authed) enter(); else showLogin();
  }
  boot();
})();
