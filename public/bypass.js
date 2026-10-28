// Vercel serverless proxy: /api/bypass?url=<link>
// Menghindari masalah CORS saat memanggil API bypass dari browser.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const target = (req.query && req.query.url) || '';
  try {
    const u = new URL(target);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
  } catch (e) {
    return res.status(400).json({ error: 'Parameter url tidak valid' });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch('https://apiii-xrina.my.id/tools/bypassv2?url=' + encodeURIComponent(target), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,*/*' }
    });
    clearTimeout(timer);
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: 'Gagal menghubungi API bypass' });
  }
};
