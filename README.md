# AM Premify v4.5

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

v4.4 - Nama "kenz" = developer terverifikasi (centang biru), hanya 1 perangkat:
- Cara memakai: login dulu di /admin (kata sandi admin) pada perangkatmu, lalu isi nama "kenz" di layar sambutan. Perangkat itu jadi developer permanen (tidak perlu login admin lagi)
- Orang lain yang mengetik kenz (K3nz, k e n z, kenz.dev, dll) ditolak server; nama kenz yang tersimpan di perangkat lain otomatis dilepas
- Database menolak ulasan bernama kenz dari identitas selain developer (trigger SQL). Jalankan ulang supabase.sql (bagian v4.4)
- Memindahkan ke HP lain: login /admin di HP baru lalu isi nama kenz, HP lama otomatis kehilangan status developer

v4.5 - Balasan ulasan, like, room publik, kontrol admin per pengguna, perbaikan nama kenz:
- Ulasan: tombol suka (hati) dan "N balasan". Ketuk untuk membuka balasan, bisa membalas, membalas balasan orang lain (@nama), menyukai balasan, dan menghapus balasanmu sendiri. Diperbarui otomatis
- Room publik (/room, ikon Room di dock): semua pengguna ngobrol, ada jumlah online, balas pesan tertentu, hapus pesan sendiri
- Centang biru developer ikut tampil di balasan & room. Ditentukan SERVER dari status perangkat developer, tidak bisa dipalsukan dengan mengganti nama
- Admin > tab Pengguna: tiap pengguna tampil "nama + N× create". Ketuk untuk melihat email apa saja yang dibuatnya (lengkap, bisa disalin), plus tombol Chat / Nonaktifkan premium / Bisukan
- Admin > tab Komunitas: hapus pesan room dan balasan ulasan, bisukan pelaku (durasi menit). Pengguna yang dibisukan tidak bisa kirim pesan di room/balasan
- Email lengkap kini disimpan di tabel privat am_act_owner (hanya server/admin). Aktivasi lama hanya punya email tersamar, jadi tampil bertanda "tersamar (data lama)"
- Nama "kenz": tidak perlu login /admin dulu. Ketik kenz di layar nama, kolom KATA SANDI DEVELOPER muncul, isi sama dengan ADMIN_PASSWORD. Perangkat itu jadi developer permanen (hanya 1 perangkat)
- WAJIB: jalankan ulang supabase.sql (bagian v4.5) lalu restart server

## v4.6
- Perbaikan responsif: topbar tablet/laptop satu baris (public/responsive.css), aman di HP kecil, landscape, dan layar lebar.
- Popup donasi Sociabuzz (muncul setelah popup saluran WhatsApp ditutup; juga bisa dibuka dari Ctrl+K "Dukung developer").

## v4.7
- Popup donasi muncul setiap masuk dan muncul lagi tiap 4 menit setelah ditutup (atur di app.js: donatePop.EVERY).

## v4.8 - Kunci premium lewat iklan
- 1 iklan ditonton = 1 kunci. 1 kunci dipakai tiap "Verifikasi & Aktifkan VIP" berhasil. Tanpa kunci: tidak bisa kirim magic link maupun aktivasi (dicek di SERVER, bukan hanya tombol).
- Kartu "Kunci Premium" di halaman Premium menampilkan saldo + tombol "Tonton Iklan". Saat menekan Kirim Magic Link / Verifikasi dengan saldo 0, popup iklan terbuka otomatis lalu proses lanjut setelah kunci didapat.
- Popup iklan: timer AD_SECONDS detik (default 15), hanya berjalan saat tab terlihat. Server menerbitkan token bertanda tangan saat iklan mulai dan hanya mau memberi kunci jika waktu benar-benar sudah lewat. Satu sesi iklan hanya bisa diklaim sekali, ada jeda antar klaim, batas simpan KEY_MAX, dan batas harian KEY_DAILY per perangkat.
- Kunci dipotong sebelum menghubungi upstream, dan DIKEMBALIKAN otomatis kalau aktivasi gagal.
- Developer (perangkat "kenz") JUGA wajib menonton iklan (v4.8.1). Hanya KEYS_REQUIRED=false yang mematikan sistem kunci.
- Iklan kosong di popup? Buka /ads langsung. Kalau di sana muncul tapi di popup kosong, sandbox membatasi kode iklan: isi AD_SAME_ORIGIN=true (kurang aman) atau taruh ads.html di domain terpisah lalu isi AD_FRAME_URL.
- PASANG IKLAN: buka `public/ads.html`, tempel kode dari jaringan iklan (Adsterra, Monetag, PropellerAds, dll.) menggantikan blok "SLOT IKLAN". Halaman ini tampil di iframe ber-sandbox. Atau isi AD_FRAME_URL dengan URL penuh halaman iklan di domain lain.
- WAJIB: jalankan ulang supabase.sql (bagian v4.8), lalu restart server. Tanpa Supabase, saldo kunci hanya di memori (cukup untuk uji lokal).
- Catatan jujur: tanpa postback server-ke-server dari jaringan iklan, sistem tidak bisa memastikan iklan benar-benar dilihat, hanya bahwa pengguna menunggu penuh durasi di halaman. Untuk bukti tayang yang kuat, pakai jaringan iklan "rewarded" yang punya callback server.

## v4.8.2 - Gerbang pemblokir iklan
- Pengguna yang memakai DNS pemblokir iklan (AdGuard DNS, NextDNS, Private DNS pemblokir, Blokada) atau ekstensi AdBlock/uBlock tidak bisa memakai website: muncul popup yang tidak bisa ditutup berisi cara mematikan DNS/pemblokirnya. Popup hilang otomatis begitu iklan bisa dimuat (dicek tiap 4 detik, atau tombol "cek lagi").
- Cara kerja: browser mencoba menjangkau server iklan (alamatnya diambil otomatis dari skrip pertama di public/ads.html, atau isi AD_PROBE_URL). Jika gagal padahal website kita sendiri terjangkau, berarti diblokir. Pengguna offline tidak terkena gerbang.
- Matikan dengan AD_BLOCK_GATE=false, atau otomatis nonaktif jika KEYS_REQUIRED=false / ads.html belum berisi kode iklan.
- Catatan jujur: ini pemeriksaan di browser, bukan pengaman mutlak. Orang yang paham teknis bisa melewatinya. Pemblokir yang hanya memblokir sebagian domain iklan (bukan domain skrip utama) juga bisa lolos. Gerbang ini bisa salah menahan pengguna jika server iklan sedang gangguan atau diblokir provider.

## v4.9 - Mode Maintenance
- Admin: buka /admin > tab **Maintenance**. Nyalakan saklar, atur label, judul, pesan, estimasi selesai (opsional, tampil sebagai hitung mundur), dan tombol kontak (opsional), lalu **Simpan**. Pratinjau di sebelah kanan ikut berubah saat mengetik.
- Saat aktif, semua pengunjung melihat halaman maintenance dan website tidak bisa dipakai: halaman diganti (HTTP 503), semua API publik ditolak di SERVER (bukan hanya tampilan), dan halaman yang sudah terbuka otomatis tertutup dalam hitungan detik (dicek tiap 15 dtk).
- Admin yang sedang login di /admin tetap bisa membuka website untuk uji coba (muncul pita kecil "MAINTENANCE AKTIF" di atas). Buka dari jendela lain / mode samaran untuk melihat tampilan pengunjung, atau buka /maintenance?preview=1.
- Opsi "Buka otomatis saat estimasi lewat": website terbuka sendiri begitu waktu estimasi selesai, tanpa perlu menekan tombol lagi.
- Tidak perlu variabel .env baru.
- WAJIB: jalankan ulang supabase.sql (bagian v4.9, membuat tabel am_settings), lalu restart server.
- Catatan jujur: halaman & API dijaga di server. Pemeriksaan di browser hanya untuk menutup halaman yang sudah terbuka. Pengunjung yang memakai Supabase anon key langsung (di luar website ini) tidak ikut dihentikan, karena itu di luar kendali server.
