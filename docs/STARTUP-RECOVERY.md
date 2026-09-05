# Startup and Bootloop Recovery

Dokumen ini digunakan ketika backend gagal start, restart berulang, atau dapat
start tetapi request frontend tidak mencapai Express.

## Baseline yang benar

```text
Project root  : C:\xampp\htdocs\krtnmdgtlv2API
Frontend      : http://127.0.0.1:8080
Backend       : http://127.0.0.1:3000
API base      : http://127.0.0.1:3000/api/v1
Database      : 127.0.0.1:3306 / krtnmdgtlv2
Node          : >=22.18 <23
```

## Pemeriksaan awal read-only

```powershell
Set-Location -LiteralPath 'C:\xampp\htdocs\krtnmdgtlv2API'
node --version
npm --version
npm run migrate:status
npm run integration:preflight
```

Jangan mulai dengan rollback, menghapus `node_modules`, mengganti key JWT, atau
menghapus database. Kumpulkan error pertama terlebih dahulu karena error setelah
restart sering hanya efek lanjutan.

## Safe recovery sequence

```powershell
Set-Location -LiteralPath 'C:\xampp\htdocs\krtnmdgtlv2API'
npm ci
npm run typecheck
npm run migrate
npm run integration:preflight
npm start
```

Lalu uji:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/v1/health'
```

Health harus berupa JSON, bukan halaman HTML.

## Diagnosis berdasarkan gejala

### `EADDRINUSE`

Port backend sudah digunakan proses lain:

```powershell
netstat -ano | Select-String ':3000\s'
Get-Process -Id <PID>
```

Identifikasi proses sebelum menghentikannya. Jangan mematikan semua proses Node
atau PHP secara massal. Port `8080` adalah frontend dan bukan alternatif backend.

### HTML 404 dari `/api/v1/...`

Jika response berisi halaman HTML XAMPP/PHP, request kemungkinan dikirim ke
`127.0.0.1:8080`. Ubah API base URL frontend ke
`http://127.0.0.1:3000/api/v1`.

### `Invalid environment configuration`

Nama field yang salah akan disebutkan tanpa menampilkan nilainya. Bandingkan
struktur `.env` dengan `.env.example`. Periksa DB, HMAC key minimum 32 karakter,
cookie policy, URL, port, dan konfigurasi Midtrans/SMTP yang diaktifkan.

### JWT key `ENOENT` atau permission error

Pastikan path pada `.env` mengarah ke:

```text
storage/private/jwt-private.pem
storage/private/jwt-public.pem
```

Jika instalasi benar-benar baru dan belum memiliki key, jalankan
`npm run keys:generate`. Jangan mengganti key pada instance aktif tanpa rencana
rotasi karena seluruh access token lama akan menjadi tidak valid.

### Database connection refused

Pastikan MySQL XAMPP aktif dan port sesuai:

```powershell
& 'C:\xampp\mysql\bin\mysql.exe' --protocol=TCP -h 127.0.0.1 -P 3306 -u krtnmdgtlv2user -p -D krtnmdgtlv2
```

Gunakan prompt password; jangan menulis password ke command history atau log.

### Access denied

Periksa `DB_USERNAME`, `DB_PASSWORD`, host account MySQL, dan grant hanya pada
database `krtnmdgtlv2`. Jangan mengganti backend kembali ke user `root` sebagai
solusi permanen.

### Migration checksum changed

File migration yang sudah diterapkan telah berubah. Kembalikan file ke versi
yang diterapkan dan buat migration baru. Jangan mengedit checksum di database.

### CORS gagal di browser

Periksa browser Network tab dan exact `Origin`. Pastikan origin tersebut ada
pada `CORS_ALLOWED_ORIGINS`, request menggunakan `credentials: 'include'`, dan
backend mengembalikan `Access-Control-Allow-Credentials: true`.

### Login berhasil tetapi mutation 403

Ambil token baru dari `GET /auth/csrf`, lalu kirim pada `X-CSRF-Token`. Setelah
refresh session, ganti CSRF lama dengan token baru.

### Server restart terus di hosting

Periksa secara berurutan:

1. Runtime hosting benar-benar Node 22 dalam range package.
2. Startup file adalah `app.js` atau adapter panel yang sesuai.
3. Working directory berisi project lengkap dan `.env` berada di root.
4. Dependency production terpasang.
5. Hosting dapat menjalankan `.ts` dengan Node baseline yang dikunci.
6. JWT key dan storage path dapat dibaca user proses.
7. Database dan DNS eksternal dapat dijangkau.
8. Hanya satu process manager yang bertanggung jawab melakukan restart.

`app.js` dan `passenger.cjs` adalah adapter startup. Jangan menaruh business
logic di dalamnya dan jangan menjadikan copy hosting sebagai source of truth.

## Database test safety

`npm run test:db` melakukan rollback, migration, seed, dan mutation. Runner akan
berhenti jika database test sama dengan `DB_DATABASE` atau namanya tidak
berakhiran `_test`. Jangan menonaktifkan guard ini untuk mempercepat debugging.

## Informasi insiden yang perlu dicatat

Saat meminta repair, sertakan:

- command yang dijalankan;
- error pertama secara lengkap;
- waktu dan timezone;
- Node/npm version;
- output `npm run migrate:status`;
- output aman `npm run integration:preflight`;
- HTTP method, URL, status, dan request ID;
- perubahan terakhir pada env, migration, dependency, atau hosting config.

Jangan menyertakan password, private key, token, cookie, OTP, atau isi `.env`.

Dengan data tersebut, diagnosis dapat dimulai dari bukti tanpa mengulang setup
atau melakukan tindakan destruktif yang tidak perlu.
