/* ============================================================
   PT GONDAM — wa-templates.js
   Dulu di lib/waTemplate.js (server). Sekarang berjalan di browser
   karena tidak ada lagi backend Express. Dipakai oleh product.js
   dan sell.js untuk membangun pesan WhatsApp dari template di
   site_settings (atau default di bawah jika belum diatur admin).
   ============================================================ */

const WA_TEMPLATES = (function () {
  function formatRupiah(value) {
    const n = Number(value) || 0;
    return n.toLocaleString('id-ID');
  }

  // Pakai template dari database hanya jika admin sudah menyesuaikannya untuk
  // PT GONDAM; sisa template lama (mengandung nama brand lama) diabaikan.
  function pick(dbValue, fallback) {
    if (typeof dbValue === 'string' && dbValue.trim() && !/kenarrz/i.test(dbValue)) return dbValue;
    return fallback;
  }

  function fillTemplate(template, data) {
    if (typeof template !== 'string' || !template) return '';
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `[${key}]`;
      result = result.split(placeholder).join(value !== undefined && value !== null ? String(value) : '');
    }
    return result;
  }

  // Pesan "Beli Sekarang" — dikirim otomatis ke WhatsApp admin PT GONDAM.
  // Placeholder dalam [KURUNG SIKU] diisi oleh product.js dari data akun
  // dan data pembeli. Tidak memuat password/OTP apa pun.
  const DEFAULT_TEMPLATE_BUY = `Halo Admin PT GONDAM 👋

Saya ingin membeli akun berikut:

📦 DETAIL AKUN
━━━━━━━━━━━━━━━━
Kode Akun: [ID AKUN]
Nama Akun: [NAMA AKUN]
Platform: [PLATFORM]
Kategori: [KATEGORI]
Harga: Rp[HARGA]
Link Akun: [LINK AKUN]
━━━━━━━━━━━━━━━━

🧾 NOMOR PESANAN
[INVOICE]
Cek status: [LINK PESANAN]

👤 DATA PEMBELI
Nama: [NAMA PEMBELI]
WhatsApp: [NOMOR PEMBELI]
Catatan: [CATATAN]

Mohon info metode pembayaran dan proses serah terima akunnya. Terima kasih 🙏`;

  const DEFAULT_TEMPLATE_OFFER = `Halo Admin PT GONDAM.

Saya ingin mengajukan tawaran untuk akun berikut:

DETAIL AKUN
━━━━━━━━━━━━━━━━
Nama: [NAMA AKUN]
ID: [ID AKUN]
Platform: [PLATFORM]
Kategori: [KATEGORI]
Harga asli: Rp[HARGA ASLI]
━━━━━━━━━━━━━━━━

PENAWARAN
Harga tawaran:
Rp[HARGA TAWARAN]

DATA PEMBELI
Nama: [NAMA]
WhatsApp: [NOMOR]

Catatan:
[CATATAN]

Saya ingin melakukan negosiasi untuk akun tersebut.

Terima kasih.`;

  const DEFAULT_TEMPLATE_SELL = `Halo Admin PT GONDAM.

Saya ingin mengajukan akun untuk dijual.

DATA PENJUAL
━━━━━━━━━━━━━━━━
Nama: [NAMA]
WhatsApp: [WHATSAPP]
Email: [EMAIL]
━━━━━━━━━━━━━━━━

DATA AKUN
Nama: [NAMA AKUN]
Platform: [PLATFORM]
Kategori: [KATEGORI]
Username: [USERNAME]
Harga yang diinginkan: Rp[HARGA]

Deskripsi:
[DESKRIPSI]

Detail:
[DETAIL]

Saya ingin menjual akun tersebut melalui PT GONDAM.

Mohon dilakukan pengecekan.

Terima kasih.`;

  const DEFAULT_TEMPLATE_PAYMENT = `Halo Admin PT GONDAM.

Saya telah melakukan pembayaran untuk transaksi berikut:

━━━━━━━━━━━━━━━━
DETAIL PESANAN
━━━━━━━━━━━━━━━━
Invoice: [INVOICE]
URL Transaksi: [URL TRANSAKSI]
Nama Akun: [NAMA AKUN]
ID Akun: [ID AKUN]
Platform: [PLATFORM]
Kategori: [KATEGORI]
Harga: Rp[HARGA]

━━━━━━━━━━━━━━━━
DATA PEMBELI
━━━━━━━━━━━━━━━━
Email: [EMAIL]
WhatsApp: [WHATSAPP]
Instagram: [INSTAGRAM]

━━━━━━━━━━━━━━━━
DATA PEMBAYARAN
━━━━━━━━━━━━━━━━
Metode: QRIS DANA Bisnis
Atas Nama: [ATAS NAMA]
Nomor DANA/Rekening: [NOMOR PEMBAYAR]

Bukti pembayaran sudah saya upload melalui website.

Mohon Admin melakukan verifikasi pembayaran dan memproses pesanan saya.

Terima kasih.
PT GONDAM`;

  // Pesan tindak lanjut dari halaman Status Pesanan (tombol "Chat Admin").
  const DEFAULT_TEMPLATE_ORDER_FOLLOWUP = `Halo Admin PT GONDAM 👋

Saya ingin menindaklanjuti pesanan saya:

Nomor Pesanan: [INVOICE]
Akun: [NAMA AKUN] ([ID AKUN])
Harga: Rp[HARGA]
Status saat ini: [STATUS]
Cek status: [LINK PESANAN]

Mohon bantuannya. Terima kasih 🙏`;

  const DEFAULT_TEMPLATE_CALCULATOR = `Halo Admin PT Gondam,

Saya ingin menanyakan estimasi harga akun Free Fire saya.

Hasil kalkulator:
Rp[HASIL KALKULATOR]

Saya ingin mendapatkan informasi/penilaian lebih lanjut mengenai harga akun tersebut.

Terima kasih.`;

  const DEFAULT_PAYMENT_INSTRUCTION = `1. Scan QRIS DANA Bisnis PT GONDAM.
2. Bayar sesuai total transaksi.
3. Pastikan pembayaran berhasil.
4. Simpan screenshot/bukti pembayaran.
5. Kembali ke website.
6. Isi data pembayaran.
7. Upload bukti pembayaran.
8. Klik "Kirim Bukti Pembayaran".
9. Tunggu verifikasi manual dari admin.`;

  return {
    formatRupiah,
    fillTemplate,
    pick,
    DEFAULT_TEMPLATE_BUY,
    DEFAULT_TEMPLATE_ORDER_FOLLOWUP,
    DEFAULT_TEMPLATE_OFFER,
    DEFAULT_TEMPLATE_SELL,
    DEFAULT_TEMPLATE_PAYMENT,
    DEFAULT_TEMPLATE_CALCULATOR,
    DEFAULT_PAYMENT_INSTRUCTION,
  };
})();
