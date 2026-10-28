// AM Premify v4.8 - Kunci premium (1 iklan = 1 kunci = 1 akun premium)
// Semua aturan dicek di server. File ini hanya menampilkan saldo, popup iklan, dan timer.
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const S = { keys: 0, required: true, seconds: 15, max: 5, daily: 30, adUrl: '/ads', loaded: false };
  const say = (msg, type) => { try { if (typeof toast === 'function') toast(msg, type); } catch {} };
  const log = (type, msg) => { try { if (typeof term !== 'undefined') term.log(type, msg); } catch {} };

  const card = $('#key-card'), count = $('#key-count'), hint = $('#key-hint'), watchBtn = $('#key-watch');
  const modal = $('#ad-modal'), frame = $('#ad-frame'), bar = $('#ad-bar'), secEl = $('#ad-sec'), msgEl = $('#ad-msg');
  const retryBtn = $('#ad-retry'), cancelBtn = $('#ad-cancel');

  async function call(url, body) {
    const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const res = await Device.api(url, opts);
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  function render() {
    if (!card) return;
    card.classList.toggle('free', !S.required);
    card.classList.toggle('empty', S.required && S.keys < 1);
    count.textContent = S.required ? String(S.keys) : '\u221E';
    if (!S.required) hint.textContent = 'Akses developer: tanpa kunci.';
    else if (S.keys < 1) hint.textContent = `Kunci habis. Tonton 1 iklan (${S.seconds} detik) untuk mendapat 1 kunci. 1 kunci = 1 akun premium.`;
    else hint.textContent = `1 kunci dipakai tiap akun berhasil jadi premium. Kamu bisa menabung sampai ${S.max} kunci.`;
    watchBtn.classList.toggle('hidden', !S.required);
    watchBtn.disabled = S.required && S.keys >= S.max;
    $('span', watchBtn).textContent = S.keys >= S.max ? 'Kunci Penuh' : 'Tonton Iklan (+1 Kunci)';
  }

  async function refresh() {
    try {
      const r = await call('/api/keys');
      if (r.ok) { Object.assign(S, { keys: r.data.keys, required: r.data.required, seconds: r.data.seconds, max: r.data.max, daily: r.data.daily, adUrl: r.data.adUrl || '/ads', loaded: true }); }
      else if (r.data && r.data.error) log('warn', r.data.error);
    } catch {}
    render();
    return S;
  }

  /* ---------- popup iklan ---------- */
  let run = null; // sesi iklan yang sedang berjalan

  function setMsg(text, err) { msgEl.textContent = text; msgEl.classList.toggle('err', !!err); }
  function setProgress(left) {
    const done = S.seconds - left;
    bar.style.width = Math.max(0, Math.min(100, (done / S.seconds) * 100)) + '%';
    secEl.textContent = left > 0 ? String(Math.ceil(left)) : '0';
  }

  function openModal() { modal.classList.remove('hidden'); document.body.classList.add('no-scroll'); }
  function closeModal() {
    modal.classList.add('hidden');
    document.body.classList.remove('no-scroll');
    frame.removeAttribute('src');
    if (run) { clearInterval(run.timer); const r = run; run = null; r.resolve(r.earned); }
  }

  function loadAd(url, trust) {
    let cross = false;
    try { cross = new URL(url, location.href).origin !== location.origin; } catch {}
    // Halaman iklan satu domain dengan panel: tanpa allow-same-origin agar kode iklan tidak bisa menyentuh panel.
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox' + (cross || trust ? ' allow-same-origin' : ''));
    frame.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  }

  async function claim() {
    if (!run) return;
    setMsg('Mengambil kunci...');
    retryBtn.classList.add('hidden');
    let r;
    try { r = await call('/api/ad/claim', { token: run.token }); } catch { r = { ok: false, data: { error: 'Gagal terhubung ke server.' } }; }
    if (!run) return;
    if (r.ok && r.data && r.data.ok) {
      S.keys = r.data.keys; render();
      run.earned = true;
      setMsg('Kunci didapat! +1');
      secEl.textContent = '\u2713';
      say('+1 kunci premium');
      log('ok', `Kunci bertambah. Saldo: ${S.keys}`);
      setTimeout(closeModal, 700);
      return;
    }
    const d = r.data || {};
    if (r.status === 425 && d.wait) { setMsg(`Hampir selesai, tunggu ${d.wait} detik...`); run.left = d.wait; run.timer = setInterval(tick, 250); return; }
    setMsg(d.error || 'Gagal mengambil kunci.', true);
    if (d.full) { refresh(); return; }
    retryBtn.classList.remove('hidden');
  }

  function tick() {
    if (!run) return;
    const now = performance.now();
    const dt = (now - run.last) / 1000;
    run.last = now;
    // Waktu hanya berjalan saat tab terlihat (pindah tab = iklan berhenti dihitung)
    if (document.visibilityState === 'visible') run.left -= dt;
    else setMsg('Kembali ke halaman ini agar iklan terus dihitung.');
    if (document.visibilityState === 'visible') setMsg('Tonton iklan sampai hitungan selesai.');
    setProgress(run.left);
    if (run.left <= 0) { clearInterval(run.timer); claim(); }
  }

  async function start() {
    setMsg('Menyiapkan iklan...');
    secEl.textContent = '...';
    bar.style.width = '0%';
    retryBtn.classList.add('hidden');
    let r;
    try { r = await call('/api/ad/start', {}); } catch { r = { ok: false, data: { error: 'Gagal terhubung ke server.' } }; }
    if (!run) return;
    const d = r.data || {};
    if (d.free) { S.required = false; render(); run.earned = true; return closeModal(); }
    if (!r.ok || !d.token) {
      setMsg(d.error || 'Iklan tidak bisa dimuat.', true);
      if (d.full) refresh();
      else retryBtn.classList.remove('hidden');
      return;
    }
    S.seconds = d.seconds || S.seconds;
    run.token = d.token;
    run.left = S.seconds;
    run.last = performance.now();
    setProgress(run.left);
    setMsg('Tonton iklan sampai hitungan selesai.');
    loadAd(d.adUrl || S.adUrl, !!d.trust);
    run.timer = setInterval(tick, 250);
  }

  // Buka popup iklan. Promise selesai saat popup ditutup: true jika kunci didapat.
  function watch() {
    if (run) return run.promise;
    if (!S.required) return Promise.resolve(true);
    run = { token: '', left: 0, last: 0, timer: 0, earned: false };
    run.promise = new Promise((resolve) => { run.resolve = resolve; });
    $('#ad-total').textContent = S.seconds;
    openModal();
    start();
    return run.promise;
  }

  // Dipanggil sebelum membuat premium: lolos jika ada kunci, kalau tidak minta pengguna menonton iklan.
  async function need() {
    if (!S.loaded) await refresh();
    if (!S.required || S.keys > 0) return true;
    say('Kunci habis, tonton iklan dulu', 'err');
    return watch();
  }

  retryBtn.addEventListener('click', () => { if (!run) return; clearInterval(run.timer); if (run.token && run.left <= 0) claim(); else start(); });
  cancelBtn.addEventListener('click', closeModal);
  $('#ad-x').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
  watchBtn.addEventListener('click', () => { watch(); });
  window.addEventListener('am:activated', refresh);
  window.addEventListener('am:open-keys', () => { watch(); });

  window.Keys = {
    state: S, refresh, watch, need,
    setKeys(n) { S.keys = Math.max(0, Number(n) || 0); render(); }
  };
  refresh();
})();
