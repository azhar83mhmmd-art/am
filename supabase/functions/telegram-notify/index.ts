// ============================================================
// PT GONDAM — Edge Function: telegram-notify
// Dipanggil otomatis lewat Database Webhook Supabase setiap kali
// baris `transactions` di-UPDATE. Fungsi ini akan mengirim pesan
// ke Telegram admin HANYA saat payment_status baru saja berubah
// menjadi 'PROOF_SUBMITTED' (user baru mengirim bukti pembayaran).
//
// ENV yang wajib di-set (Supabase Dashboard → Edge Functions →
// telegram-notify → Secrets):
//   TELEGRAM_BOT_TOKEN   = token dari @BotFather
//   TELEGRAM_CHAT_ID     = chat id admin/grup yang menerima notif
//   SB_SERVICE_ROLE_KEY  = service_role / secret key project (Project Settings > API)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')!;

// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY yang harusnya disuntik
// otomatis oleh platform TIDAK tersedia di sebagian project (mis.
// project yang sudah pakai sistem API key baru: sb_publishable_/
// sb_secret_). Supaya tidak bergantung pada itu, URL di-hardcode
// langsung (ini bukan rahasia, sudah ada juga di supabase-client.js),
// dan service role/secret key diambil dari secret custom bernama
// SB_SERVICE_ROLE_KEY yang WAJIB kamu buat sendiri (lihat SETUP.md).
const SUPABASE_URL = 'https://rjorraiiexiirhdjiniv.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY')!;

function escapeHtml(str: unknown) {
  return String(str ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatRupiah(n: unknown) {
  const num = Number(n ?? 0);
  return 'Rp' + num.toLocaleString('id-ID');
}

async function sendTelegramMessage(text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data;
}

async function sendTelegramPhoto(photoUrl: string, caption: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      photo: photoUrl,
      caption,
      parse_mode: 'HTML',
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendPhoto error: ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('[telegram-notify] Secret TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum di-set.');
      return new Response(JSON.stringify({ error: 'Missing Telegram secrets' }), { status: 500 });
    }
    if (!SERVICE_ROLE_KEY) {
      console.error('[telegram-notify] Secret SB_SERVICE_ROLE_KEY belum di-set.');
      return new Response(JSON.stringify({ error: 'Missing SB_SERVICE_ROLE_KEY secret' }), { status: 500 });
    }

    const payload = await req.json();
    // Payload standar Database Webhook Supabase:
    // { type: 'UPDATE', table: 'transactions', record: {...}, old_record: {...} }
    const record = payload.record;
    const oldRecord = payload.old_record;

    if (!record || payload.table !== 'transactions') {
      return new Response(JSON.stringify({ skipped: true, reason: 'not a transactions update' }), { status: 200 });
    }

    // Hanya proses transisi ke PROOF_SUBMITTED (hindari notif dobel
    // kalau baris di-update lagi untuk alasan lain saat status sudah sama).
    const isNewProofSubmission =
      record.payment_status === 'PROOF_SUBMITTED' && oldRecord?.payment_status !== 'PROOF_SUBMITTED';

    if (!isNewProofSubmission) {
      return new Response(JSON.stringify({ skipped: true, reason: 'not a new proof submission' }), { status: 200 });
    }

    // Ambil detail akun terkait (nama produk) via service role,
    // supaya pesan Telegram lebih informatif.
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    let accountName = '-';
    try {
      const { data: account } = await supabaseAdmin
        .from('accounts')
        .select('name')
        .eq('id', record.account_id)
        .single();
      if (account?.name) accountName = account.name;
    } catch (_e) {
      // biarkan '-' kalau gagal ambil nama akun, jangan gagalkan seluruh notif
    }

    const message = [
      `🔔 <b>Bukti Pembayaran Baru</b>`,
      ``,
      `📦 Produk: ${escapeHtml(accountName)}`,
      `🧾 Invoice: ${escapeHtml(record.invoice_id)}`,
      `💰 Harga: ${escapeHtml(formatRupiah(record.price))}`,
      `👤 Pengirim: ${escapeHtml(record.sender_name)}`,
      `🏦 No. Rekening/DANA: ${escapeHtml(record.sender_account_number)}`,
      `📱 WhatsApp Pembeli: ${escapeHtml(record.buyer_whatsapp)}`,
      `✉️ Email Pembeli: ${escapeHtml(record.buyer_email)}`,
      ``,
      `Silakan cek & verifikasi di panel admin.`,
    ].join('\n');

    // Ambil URL foto bukti pembayaran (bucket 'payment-proofs' privat,
    // jadi wajib pakai signed URL lewat service role, bukan public URL).
    let photoUrl: string | null = null;
    if (record.payment_proof_path) {
      try {
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from('payment-proofs')
          .createSignedUrl(record.payment_proof_path, 300); // berlaku 5 menit, cukup untuk diambil Telegram
        if (signErr) throw signErr;
        photoUrl = signed?.signedUrl ?? null;
      } catch (e) {
        console.error('[telegram-notify] gagal bikin signed URL foto bukti bayar:', e);
      }
    }

    if (photoUrl) {
      try {
        await sendTelegramPhoto(photoUrl, message);
      } catch (e) {
        // Kalau kirim foto gagal (mis. Telegram tidak berhasil fetch URL-nya),
        // tetap kirim teksnya saja supaya admin tidak kehilangan notifikasi.
        console.error('[telegram-notify] gagal kirim foto, fallback ke teks:', e);
        await sendTelegramMessage(message + '\n\n⚠️ (Gagal mengirim foto bukti bayar, cek panel admin.)');
      }
    } else {
      await sendTelegramMessage(message + '\n\n⚠️ (Tidak ada foto bukti bayar terlampir.)');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[telegram-notify] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
