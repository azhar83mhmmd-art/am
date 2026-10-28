# Setup Notifikasi Telegram — Bukti Pembayaran

Fitur ini mengirim pesan otomatis ke Telegram admin setiap kali ada
user yang mengirim bukti pembayaran (status transaksi berubah jadi
`PROOF_SUBMITTED`).

## 1. Buat Bot Telegram (kalau belum punya)

1. Buka Telegram, cari **@BotFather**.
2. Kirim `/newbot`, ikuti instruksinya (kasih nama & username bot).
3. BotFather akan kasih **token**, contoh:
   `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   → simpan, ini `TELEGRAM_BOT_TOKEN`.

## 2. Cari Chat ID kamu

1. Cari bot **@userinfobot** di Telegram, chat apa saja ke dia →
   dia balas termasuk `Id: xxxxxxxxx`. Itu **chat ID pribadi** kamu.
2. Atau kalau mau notif masuk ke **grup**: masukkan bot yang baru
   kamu buat ke grup itu, kirim pesan apa saja di grup, lalu buka
   `https://api.telegram.org/bot<TOKEN>/getUpdates` di browser
   (ganti `<TOKEN>` dengan token bot), cari `"chat":{"id": ...}` —
   angka itu (biasanya negatif untuk grup) adalah chat ID grup.

## 3. Set Secrets

Buka **Edge Functions → Secrets** di dashboard, tambahkan (pakai
"Add another" biar bisa isi sekaligus):

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token dari @BotFather |
| `TELEGRAM_CHAT_ID` | chat id dari @userinfobot (atau ID grup) |
| `SB_SERVICE_ROLE_KEY` | service role / secret key project kamu (lihat cara ambil di bawah) |

**Cara ambil `SB_SERVICE_ROLE_KEY`:** buka Project Settings → API →
cari bagian **service_role** (key lama, format JWT panjang diawali
`eyJ...`) ATAU bagian **secret keys** (format baru, diawali
`sb_secret_...`) — pakai salah satu yang tersedia di project kamu.
**JANGAN PERNAH** taruh key ini di file `public/js/*` atau di mana pun
yang bisa dilihat browser — taruh HANYA di secret ini.

Kolom Name harus PERSIS `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`SB_SERVICE_ROLE_KEY` (huruf besar semua, sesuai yang dipanggil di
kode `index.ts`).

Deploy ulang function-nya (paste ulang index.ts terbaru) setelah
secrets ini ke-set.

## 4. Hubungkan trigger ke Edge Function

Kalau menu **Database → Webhooks** tidak kelihatan di dashboard kamu
(sering berpindah/berbeda antar versi Supabase), pakai cara yang
lebih pasti: jalankan `supabase/migration_v7_telegram_webhook.sql`
di **SQL Editor** (sama caranya seperti menjalankan migration_v6
sebelumnya). File ini membuat trigger SQL langsung (pakai ekstensi
`pg_net`) yang akan memanggil Edge Function `telegram-notify` setiap
kali `payment_status` baru berubah jadi `PROOF_SUBMITTED` — efeknya
sama persis dengan Database Webhook.

(Kalau di dashboard kamu ternyata ADA menu Database → Webhooks,
boleh juga pakai itu: Table `transactions`, Event `Update`, Type
`Supabase Edge Functions`, pilih function `telegram-notify` — tapi
cukup pilih SALAH SATU cara saja, jangan dua-duanya sekaligus supaya
notif tidak terkirim dobel.)

## 5. Tes

1. Coba beli akun & submit bukti pembayaran dari sisi user (public site).
2. Cek chat Telegram — pesan detail pembayaran harus otomatis masuk.
3. Kalau tidak masuk, cek log function:
   ```bash
   supabase functions logs telegram-notify
   ```
   atau lihat di Dashboard → Edge Functions → telegram-notify → Logs.

## Catatan

- Ini terpisah dari fitur "buka WhatsApp admin" yang sudah ada di
  situs (itu cuma link `wa.me` yang dibuka manual oleh pembeli,
  bukan bot otomatis).
- Kalau nanti mau tambah WhatsApp bot otomatis juga (misal pakai
  Fonnte/Wablas), tinggal tambah pemanggilan API sejenis di dalam
  `index.ts` yang sama, setelah bagian Telegram berhasil dikirim.
