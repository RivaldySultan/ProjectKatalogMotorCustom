# Katalog Motor Custom

## Struktur

- `client/` — React dan Vite untuk Homepage, katalog, detail motor, dan konsultasi build.
- `server/` — Express API, route, autentikasi, dan database SQLite.
- `server/src/db/data.json` — data awal yang digunakan saat database SQLite dibuat.

## Menjalankan aplikasi

Gunakan Node.js 22 atau yang lebih baru.

```sh
npm install
npm run dev
```

Perintah tersebut menjalankan API dan frontend sekaligus dalam satu terminal. Log dari keduanya tampil bergantian dengan penanda `[api]` dan `[web]`.

- Frontend: http://localhost:5173
- API: http://localhost:5000

Jika ingin memisahkan prosesnya, jalankan `npm run dev:server` dan `npm run dev:client` di dua terminal berbeda.

Frontend berjalan di Vite dan meneruskan request `/api` serta `/uploads` ke API lokal di port 5000. Untuk membuat build frontend, jalankan `npm run build`.

## Setup admin development

Autentikasi admin tetap menggunakan tabel `admins` dan middleware khusus admin. Akun pelanggan disimpan terpisah pada tabel `customers` dan tidak mendapat akses admin. Status aktif admin disimpan pada `is_active` dan akun lama otomatis dimigrasikan menjadi aktif.

Salin template environment lalu isi nilai milik Anda sendiri di `server/.env`:

```powershell
Copy-Item server\.env.example server\.env
notepad server\.env
```

Isi `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dengan kredensial pilihan Anda. Password harus unik, minimal 8 byte, dan maksimal 72 byte. Password yang lebih panjang dan unik lebih disarankan; jangan gunakan contoh placeholder sebagai password. Buat nilai `JWT_SECRET` acak dengan perintah:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Salin hasilnya ke `JWT_SECRET` di `server/.env`. File environment tersebut diabaikan Git. Bootstrap akun dengan:

```powershell
npm run setup:admin --workspace server
```

Bootstrap aman dijalankan berulang kali. Ia hanya membuat satu akun, memperbarui kredensial jika email yang dikonfigurasi cocok dengan akun yang ada, dan menolak membuat akun kedua dengan email berbeda. Password hanya disimpan dalam database sebagai hash bcrypt.

Database development yang sudah tersedia memiliki satu akun admin aktif dengan email `rukamotor@gmail.com`. Password lama tidak ditampilkan atau disediakan. Setelah mengisi password milik Anda dan `JWT_SECRET` di `server/.env`, jalankan bootstrap, kemudian `npm run dev`; buka `http://localhost:5173/admin/login` dan masuk menggunakan email serta password dari environment lokal. Login menerbitkan JWT role admin; Dashboard dan endpoint perubahan katalog memverifikasi role, identitas, serta status aktif akun di database.

## Form konsultasi build

Form konsultasi pada halaman detail motor mengirim `POST /api/consultations` sebagai `multipart/form-data`. Permintaan dan referensi build disimpan pada tabel `orders` yang sudah ada. Lampiran menerima JPG/PNG, maksimal 3 foto dengan batas 5 MB per foto, dan disimpan di `server/uploads/consultations/`.

## Manajemen pesanan admin

Halaman admin tersedia di `http://localhost:5173/admin/orders` dan menggunakan data konsultasi pada tabel `orders` yang sama dengan form publik. Daftar mendukung pencarian nama dan WhatsApp, filter produk/build, pengurutan tanggal, serta pagination.

Endpoint daftar, detail, foto, dan perubahan status konsultasi memerlukan JWT admin yang valid:

- `GET /api/consultations` — daftar konsultasi dan metadata filter/pagination.
- `GET /api/consultations/:id` — identitas pelanggan, snapshot referensi build, kebutuhan, tanggal, status, dan URL foto privat.
- `GET /api/consultations/:id/photos/:index` — mengirim foto setelah memverifikasi admin.
- `PATCH /api/consultations/:id/status` — memperbarui status hanya ke nilai yang sudah digunakan pada tabel konsultasi.

Foto konsultasi tidak disajikan dari direktori upload publik. Skema yang sudah ada telah menyediakan `status` dengan nilai default `baru`, sehingga fitur ini tidak menambah tabel atau migrasi. Belum ada daftar status/transisi bisnis lain yang didefinisikan; antarmuka hanya menawarkan nilai status yang sudah tercatat.

## Pembelian langsung dan transfer manual

Pembelian langsung memiliki skema `purchase_orders` yang terpisah dari tabel `orders` untuk konsultasi. Data produk lama otomatis bermigrasi dengan jenis `consultation_only` dan pembelian nonaktif. Admin harus mengisi spesifikasi final, harga, jenis ketersediaan, dan mengaktifkan pembelian melalui form katalog sebelum tombol Pesan Sekarang ditampilkan. Ready stock juga memerlukan jumlah stok yang eksplisit.

Checkout tersedia pada `/checkout/:productId`. Setelah checkout, pelanggan menerima tautan privat `/pesanan/:orderId#<access-token>`; token ada pada fragment URL dan dikirim ke API melalui header, bukan sebagai bagian dari request URL. Harga, spesifikasi dan identitas build diambil dari database dan disimpan sebagai snapshot pesanan. Pesanan menunggu persetujuan admin sebelum instruksi transfer terbuka. Pengiriman tidak menggunakan ongkir rekaan; admin mengonfirmasi ongkir sebelum dapat menyetujui pesanan. Untuk pengambilan langsung, pelanggan memilih GoPay atau SeaBank yang telah dikonfigurasi server. Isi environment lokal `server/.env` dengan nomor serta nama penerima yang benar:

```env
PAYMENT_GOPAY_NUMBER=
PAYMENT_GOPAY_ACCOUNT_NAME=
PAYMENT_SEABANK_ACCOUNT_NUMBER=
PAYMENT_SEABANK_ACCOUNT_NAME=
```

Metode yang tidak memiliki konfigurasi valid tidak ditampilkan dan endpoint tidak membuat pesanan jika metode tersebut belum siap. Jangan mengisi nilai contoh sebagai rekening aktif. Pembayaran masih transfer manual; bukti hanya masuk ke status `waiting_verification`. Pelanggan dapat melihat status, mengunggah bukti, dan memperbarui status melalui tautan akses privat. Pembayaran berstatus `paid` hanya setelah admin memeriksa dana masuk dan mengonfirmasi di halaman `/admin/purchases`. Bukti disimpan di direktori privat dan tidak diakses melalui URL upload publik. Tidak ada payment gateway aktif.

Endpoint pembelian publik:

- `GET /api/purchases/payment-methods` — daftar metode transfer yang konfigurasi server-nya lengkap.
- `POST /api/purchases` — membuat pesanan; harga dan produk divalidasi server-side, dengan kunci idempotensi.
- `GET /api/purchases/:id` — melihat status pesanan menggunakan header `X-Order-Access-Token`.
- `POST /api/purchases/:id/payment-proof` — mengirim bukti JPG/PNG melalui header akses order.

Endpoint admin memerlukan autentikasi admin:

- `GET /api/purchases/admin` dan `GET /api/purchases/admin/:id` — daftar dan detail pembelian.
- `PATCH /api/purchases/admin/:id/approval` — menyetujui pesanan atau menolaknya dengan alasan; hanya pesanan pending yang dapat diputuskan.
- `GET /api/purchases/admin/:id/proof` — bukti pembayaran privat.
- `POST /api/purchases/admin/:id/shipping-quote` — menyimpan ongkir yang telah dikonfirmasi.
- `POST /api/purchases/admin/:id/payment-review` — mengonfirmasi atau menolak bukti.
- `PATCH /api/purchases/admin/:id/status` — memperbarui progres setelah pembayaran dikonfirmasi.

Permintaan konsultasi tetap berada di `/admin/orders` dan tidak menjadi transaksi pembelian. Tidak ada migrasi yang menghapus atau mengubah data konsultasi lama.

## Akun pelanggan

Pelanggan dapat mendaftar di `/register`, login di `/login`, melihat profil di `/akun`, dan membuka daftar serta detail pembelian di `/akun/pesanan`. Checkout tetap dapat dilakukan sebagai tamu; pesanan tamu menggunakan token akses unik seperti sebelumnya.

Autentikasi pelanggan memakai cookie sesi bertanda tangan yang `HttpOnly`, `SameSite=Lax`, dan berlaku 24 jam. Sesi yang dicatat pada `customer_sessions` dapat dicabut saat logout. Cookie dan role pelanggan tidak digunakan oleh middleware admin.

Tabel `customers` menyimpan profil, hash bcrypt, dan persetujuan privasi. `purchase_orders.customer_id` menghubungkan order akun ke pemiliknya; nilai ini selalu ditentukan dari sesi server, bukan dari input checkout. Klaim order tamu memerlukan token akses pesanan serta kecocokan email dan nomor WhatsApp dengan akun.

Endpoint akun pelanggan:

- `POST /api/customers/register` dan `POST /api/customers/login` — validasi data, password hashing, dan pembuatan sesi.
- `POST /api/customers/logout`, `GET /api/customers/me`, dan `PATCH /api/customers/me` — cabut sesi, baca profil, dan ubah profil sendiri.
- `GET /api/customers/orders` dan `GET /api/customers/orders/:id` — daftar, filter, pagination, serta detail pesanan milik sesi aktif.
- `POST /api/customers/claims/:id` — tautkan pesanan tamu setelah token akses dan kontak diverifikasi.
- `GET /api/customers/orders/:id/proofs/:proofId` — lihat bukti setelah verifikasi kepemilikan.

Pengiriman bukti tetap melalui `POST /api/purchases/:id/payment-proof`. Pemilik dapat mengirim atau mengganti bukti saat menunggu pembayaran, menunggu verifikasi, atau setelah bukti ditolak. Setiap versi disimpan privat pada `purchase_payment_proofs`; file lama tidak dihapus saat bukti diganti. Status `paid` hanya dapat ditetapkan oleh admin setelah memeriksa dana masuk.

`purchase_order_events` menyimpan aktivitas yang benar-benar terjadi, bukan langkah timeline yang diperkirakan. Migrasi skema menambah tabel pelanggan, sesi, versi bukti, event pesanan, serta relasi nullable `customer_id` tanpa menghapus pesanan atau konsultasi lama.

Pengaturan rahasia lokal disimpan di `server/.env`. Jangan masukkan file `.env` ke Git.
