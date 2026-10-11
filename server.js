// AM Premify - Premium Panel
// Jalankan: node server.js  (butuh Node.js 18+, tanpa npm install)
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

// Muat file .env (tanpa dotenv)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch {}

const PORT = process.env.PORT || 8112;
const UPSTREAM = process.env.UPSTREAM || 'https://am.noxxyrorr.biz.id';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
// Cloudflare Turnstile (kunci uji Cloudflare dipakai jika belum diisi: selalu lolos, hanya untuk development)
// Email di feed publik disamarkan: 5 huruf pertama terlihat, sisanya ***, domain utuh (kenzo***@gmail.com).
// Set MASK_EMAIL=false di .env hanya jika ingin menampilkan email penuh.
const MASK_EMAIL = String(process.env.MASK_EMAIL || 'true').toLowerCase() !== 'false';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '1x00000000000000000000AA';
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';

// Pakai folder public/ jika ada, kalau tidak pakai folder yang sama dengan server.js
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : __dirname;
const BLOCKED = ['server.js', 'package.json', 'package-lock.json', 'vercel.json', 'supabase.sql'];

// URL bersih (tanpa .html) -> semuanya dilayani oleh index.html
const PAGES = new Set(['/', '/index', '/premium', '/panduan', '/biodata']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function redirect(res, code, location) {
  res.writeHead(code, { Location: location });
  res.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/* ---------- Supabase: catat aktivasi sukses (hanya server yang boleh insert) ---------- */
function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e)) return '';
  if (!MASK_EMAIL) return e;
  const [u, d] = e.split('@');
  // 5 huruf pertama tetap terlihat, sisanya disensor; domain (@gmail.com dll) tetap utuh
  return u.length > 5 ? u.slice(0, 5) + '***@' + d : e;
}

async function insertActivation(row) {
  return fetch(`${SUPABASE_URL}/rest/v1/activations`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row)
  });
}

async function recordActivation(email) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false;
  try {
    const safe = cleanEmail(email);
    let r = await insertActivation(safe ? { source: 'verify', email: safe } : { source: 'verify' });
    // Kolom email belum ada (supabase.sql belum dijalankan)? Tetap catat tanpa email supaya statistik tidak berhenti.
    if (!r.ok && safe) {
      console.warn('[AM Premify] Insert dengan email gagal (' + r.status + '), coba tanpa email. Jalankan supabase.sql.');
      r = await insertActivation({ source: 'verify' });
    }
    if (!r.ok) console.warn('[AM Premify] Supabase insert gagal:', r.status, await r.text());
    return r.ok;
  } catch (err) {
    console.warn('[AM Premify] Supabase tidak terjangkau:', err.message);
    return false;
  }
}

/* ---------- Cloudflare Turnstile: validasi token di server ---------- */
async function verifyTurnstile(token, ip) {
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  try {
    const params = new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token });
    if (ip && net.isIP(ip)) params.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: params, signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    return d.success === true;
  } catch (err) {
    console.warn('[AM Premify] Turnstile tidak terjangkau:', err.message);
    return false;
  }
}

/* ---------- Proxy ke upstream ---------- */
async function proxyUpstream(req, res, pathname) {
  try {
    let body = await readBody(req);
    let activationEmail = '';

    // Verifikasi VIP wajib lolos Cloudflare Turnstile (dicek di server, bukan hanya di browser)
    if (pathname === '/api/verify-link') {
      let payload = {};
      try { payload = JSON.parse(body.toString('utf8') || '{}'); } catch {}
      const okHuman = await verifyTurnstile(payload.cfToken, clientIp(req));
      if (!okHuman) return sendJson(res, 403, { success: false, error: 'Verifikasi manusia (Cloudflare) gagal atau kedaluwarsa. Ulangi verifikasi.' });
      activationEmail = payload.email;
      delete payload.cfToken;
      body = Buffer.from(JSON.stringify(payload));
    }

    const r = await fetch(UPSTREAM + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    let text = await r.text();

    if (pathname === '/api/verify-link') {
      try {
        const data = JSON.parse(text);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const ok = r.ok && data.success !== false && !data.error;
          if (ok) {
            data.recorded = await recordActivation(activationEmail);
            text = JSON.stringify(data);
          }
        }
      } catch {}
    }

    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8' });
    res.end(text);
  } catch (err) {
    sendJson(res, 502, { success: false, error: err.message });
  }
}

/* ---------- Info pengunjung (IP asli + lokasi + ISP) ---------- */
const geoCache = new Map();   // ip -> { at, data }
const rate = new Map();       // ip -> [timestamps]

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const real = String(req.headers['x-real-ip'] || '').trim();
  const raw = xff || real || req.socket.remoteAddress || '';
  return raw.replace(/^::ffff:/i, '');
}

function isPrivateIp(ip) {
  return !ip || !net.isIP(ip) || ip === '::1' ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|fc|fd|fe80)/i.test(ip);
}

function limited(key) {
  const now = Date.now();
  const list = (rate.get(key) || []).filter((t) => now - t < 60000);
  list.push(now);
  rate.set(key, list);
  if (rate.size > 5000) rate.clear();
  return list.length > 20; // maks 20 permintaan / menit
}

const UA = { 'User-Agent': 'AM-Premify/3.0' };

async function fetchText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(4500), headers: UA });
  if (!r.ok) throw new Error('status ' + r.status);
  return (await r.text()).trim();
}

// IPv4 publik perangkat ini (dipakai saat panel diakses lewat localhost / jaringan lokal).
// Beberapa layanan dicoba bersamaan, yang tercepat dipakai.
const IP_SERVICES = [ // semua layanan ini hanya mengembalikan IPv4
  'https://api.ipify.org',
  'https://ipv4.icanhazip.com',
  'https://v4.ident.me',
  'https://checkip.amazonaws.com'
];
let selfIpCache = { at: 0, ip: '' };

async function selfPublicIp() {
  if (selfIpCache.ip && Date.now() - selfIpCache.at < 5 * 60 * 1000) return selfIpCache.ip;
  try {
    const ip = await Promise.any(IP_SERVICES.map(async (u) => {
      const t = await fetchText(u);
      if (!net.isIPv4(t)) throw new Error('bukan IPv4');
      return t;
    }));
    selfIpCache = { at: Date.now(), ip };
    return ip;
  } catch {
    return '';
  }
}

// Lokasi + ISP untuk sebuah IP (opsional; kalau gagal IP tetap ditampilkan)
async function geoLookup(ip) {
  const attempts = [
    async () => {
      const d = JSON.parse(await fetchText(`https://ipwho.is/${ip}`));
      if (!d.success) throw new Error('ipwho');
      return { ip: d.ip, city: d.city, country: d.country, isp: (d.connection && (d.connection.org || d.connection.isp)) || '' };
    },
    async () => {
      const d = JSON.parse(await fetchText(`https://ipapi.co/${ip ? ip + '/' : ''}json/`));
      if (d.error) throw new Error('ipapi');
      return { ip: d.ip, city: d.city, country: d.country_name, isp: d.org || '' };
    },
    async () => {
      const d = JSON.parse(await fetchText(`https://ipinfo.io/${ip ? ip + '/' : ''}json`));
      if (!d.ip) throw new Error('ipinfo');
      return { ip: d.ip, city: d.city, country: d.country, isp: d.org || '' };
    }
  ];
  for (const attempt of attempts) {
    try { return await attempt(); } catch {}
  }
  return null;
}

async function handleVisitor(req, res) {
  if (limited(req.socket.remoteAddress || 'x')) return sendJson(res, 429, { error: 'Terlalu banyak permintaan, coba lagi sebentar.' });

  const raw = clientIp(req);
  const hint = new URL(req.url, 'http://localhost').searchParams.get('ip') || '';
  const useHint = net.isIPv4(hint) && !isPrivateIp(hint); // IPv4 yang sudah dideteksi browser
  let ip = useHint ? hint : (isPrivateIp(raw) ? await selfPublicIp() : raw);

  // Langkah 1: pastikan IP terdeteksi (tidak bergantung pada layanan lokasi)
  let geo = null;
  if (!ip) {
    geo = await geoLookup('');
    ip = geo && geo.ip;
  }
  if (!ip) return sendJson(res, 502, { error: 'Server tidak dapat menjangkau layanan deteksi IP' });

  // Langkah 2: lokasi + ISP (opsional, di-cache 10 menit)
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) geo = hit.data;
  else if (!geo || !geo.city) {
    geo = (await geoLookup(ip)) || geo;
    if (geo) geoCache.set(ip, { at: Date.now(), data: geo });
  }

  const g = geo || {};
  const place = g.city && g.country && g.city !== g.country ? `${g.city}, ${g.country}` : (g.country || g.city || '');
  sendJson(res, 200, { ip, location: place, isp: g.isp || '' });
}

/* ---------- File statis ---------- */
function serveFile(res, rel, onMissing) {
  const file = path.normalize(decodeURIComponent(rel)).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  const base = path.basename(full);

  if (!full.startsWith(PUBLIC_DIR) || BLOCKED.includes(base) || base.startsWith('.')) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }
  fs.readFile(full, (err, data) => {
    if (err) return onMissing ? onMissing() : sendJson(res, 404, { error: 'Not Found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && (pathname === '/api/send-link' || pathname === '/api/verify-link')) {
    return proxyUpstream(req, res, pathname);
  }
  if (req.method !== 'GET') return sendJson(res, 404, { error: 'Not Found' });

  if (pathname === '/api/visitor') return handleVisitor(req, res);

  // Konfigurasi publik untuk frontend (hanya anon key, bukan service key)
  if (pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('window.APP_CONFIG=' + JSON.stringify({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, turnstileSiteKey: TURNSTILE_SITE_KEY }) + ';');
  }

  // URL bersih: /index.html -> /index
  if (pathname.endsWith('.html')) {
    const clean = pathname.replace(/\.html$/, '');
    return redirect(res, 301, (clean === '/index' || clean === '' ? '/index' : clean) + (search || ''));
  }

  if (PAGES.has(pathname)) return serveFile(res, '/index.html');

  // Aset statis; halaman tak dikenal (tanpa ekstensi) diarahkan ke /index
  return serveFile(res, pathname, () => {
    if (!path.extname(pathname)) return redirect(res, 302, '/index');
    sendJson(res, 404, { error: 'Not Found' });
  });
});

server.listen(PORT, () => {
  console.log(`[AM Premify] Panel aktif di: http://localhost:${PORT}/index`);
  console.log(`[AM Premify] Upstream: ${UPSTREAM}`);
  if (!process.env.TURNSTILE_SITE_KEY || !process.env.TURNSTILE_SECRET_KEY) {
    console.log('[AM Premify] Turnstile: pakai kunci UJI (selalu lolos). Isi TURNSTILE_SITE_KEY & TURNSTILE_SECRET_KEY di .env untuk produksi.');
  }
  if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_KEY) {
    console.log('[AM Premify] Supabase: terhubung (real-time aktif)');
  } else {
    console.log('[AM Premify] Supabase: BELUM diisi. Salin .env.example menjadi .env lalu isi kuncinya.');
  }
});
