# AM Premify v4.3

Jalankan: `node server.js` (Node 18+, tanpa npm install), buka http://localhost:8112

Baru di v4.0:
- Layar sambutan: pengguna mengisi nama di awal, sapaan jadi "Halo, (nama)!" (tersimpan di perangkat, bisa diganti lewat chip profil / menu)
- Animasi baru: iris-wipe, typewriter, konfeti, jejak kursor, tilt 3D kartu, parallax hero, ripple tombol, latar melayang
- Fitur: sapaan sesuai waktu + jam live, streak harian, tema warna aksen, toggle efek, tombol Tempel link, validasi email live, progres scroll, tombol ke atas
- Responsif: 320px sampai desktop lebar, safe-area notch, mode landscape

- Popup ajakan ikuti saluran WhatsApp kenzchillz setiap awal masuk (setelah layar sambutan & peringatan), bisa ditutup (tombol X, Esc, atau klik latar)

Baru di v4.1 (tampilan modern & responsif):
- Dock navigasi melayang di HP (Beranda, Premium, Panduan, Menu) menggantikan tab atas, tombol Premium menonjol
- Perintah Cepat: tekan Ctrl/Cmd+K atau "/" (atau tombol "Cari fitur" di desktop, menu di HP) untuk pindah halaman, ganti tema, tempel link, chat admin, dll
- Kartu VIP animasi di hero (desktop), layout melebar di layar besar
- FAQ accordion di halaman Panduan, tombol Bagikan Website (Web Share / salin link)
- Menu bawah bisa di-scroll di layar pendek, fokus keyboard lebih jelas, animasi menghormati "kurangi gerakan"
- Efek gelembung warna-warni: klik/ketuk memunculkan satu gelombang tipis + beberapa gelembung kecil pastel, geser/swipe meninggalkan jejak lembut (ikut toggle Efek Partikel)

Baru di v4.3 (chat, menu admin, blokir perangkat):
- Nama pengguna ikut tampil di feed aktivasi sukses (nama + email tersamar), supaya spam terlihat siapa pelakunya
- Chat di header (ikon pesan): pengguna chat admin, tombol jadi merah + angka saat admin membalas
- Menu admin di /admin (isi ADMIN_PASSWORD di .env): daftar aktivasi, klik nama pengguna -> chat (disiapkan pertanyaan "aktivasi ini untuk apa?"), daftar perangkat
- Admin bisa menonaktifkan fitur premium per perangkat. Dicek di server (bukan hanya tombol): ID perangkat bertanda tangan (cookie HttpOnly + localStorage + IndexedDB), sidik jari perangkat, dan jaringan. Keluar akun / ganti nama / hapus data browser tidak melepas blokir
- Popup konfirmasi profesional menggantikan confirm() bawaan browser (hapus ulasan, hapus riwayat)
- WAJIB: jalankan ulang supabase.sql (bagian v4.3), isi ADMIN_PASSWORD dan APP_SECRET di .env, restart server
- Catatan jujur: tidak ada sistem web yang bisa mengenali perangkat 100%. Pelaku yang berganti HP/browser sekaligus jaringan, atau memakai alat otomatis dengan header palsu, bisa lolos; Turnstile + batas laju membantu menekan itu
