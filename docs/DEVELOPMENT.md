# Development Guide

## Canonical workspace

Semua pekerjaan backend dilakukan dari:

```text
C:\xampp\htdocs\krtnmdgtlv2API
```

Path ini adalah source of truth untuk source code, schema, test, script,
dokumentasi, dan artefak API. Hosting bukan workspace development. Jika ada
perbedaan antara hosting dan folder ini, perbaikan dibuat dan diuji di folder
ini terlebih dahulu, kemudian dideploy satu arah.

## Runtime baseline

- Node.js `>=22.18 <23`.
- Express 5.
- TypeScript strict, dijalankan langsung oleh Node 22 dengan erasable syntax.
- MySQL2 ke XAMPP MariaDB/MySQL pada `127.0.0.1:3306`.
- Backend lokal pada port `3000`.
- Frontend lokal pada port `8080`.

Versi Node di luar range package dapat menghasilkan startup atau syntax error
yang berbeda antara laptop dan hosting. Periksa dengan `node --version` sebelum
mendiagnosis masalah lain.

## Setup development baru

```powershell
Set-Location -LiteralPath 'C:\xampp\htdocs\krtnmdgtlv2API'
Copy-Item -LiteralPath '.env.example' -Destination '.env'
npm ci
npm run keys:generate
npm run migrate
npm run seed
npm run integration:preflight
npm start
```

Sesuaikan `.env` sebelum migration. Jangan menjalankan `keys:generate` bila key
JWT sudah ada karena key lama diperlukan untuk memverifikasi session yang masih
berlaku.

## Environment lokal

Kelompok konfigurasi utama:

- `APP_URL`: origin frontend/public app, lokalnya `http://127.0.0.1:8080`.
- `PORT`: port Express, lokalnya `3000`.
- `DB_*`: koneksi database utama.
- `TEST_DB_*`: database integration test yang namanya wajib berakhiran `_test`.
- `CORS_ALLOWED_ORIGINS`: exact origin frontend, tanpa wildcard.
- `JWT_*`, `CSRF_HMAC_KEY`, `OTP_HMAC_KEY`: security secrets lokal.
- `MIDTRANS_*` dan `MAIL_*`: integrasi eksternal yang dapat dinonaktifkan lokal.
- `EMAIL_TEMPLATES_ENABLED`: default `false`; set `true` only after migration
  010 is applied and verified. See `EMAIL-TEMPLATES.md`.

`.env` adalah file lokal dan diabaikan Git. `.env.example` hanya berisi struktur
serta nilai contoh yang tidak rahasia.

## Arsitektur request

```text
HTTP request
  -> Express middleware (Helmet, JSON, CORS, request ID, logging)
  -> router
  -> controller (auth, CSRF, parsing input)
  -> service (aturan bisnis)
  -> repository (query terparameterisasi)
  -> MySQL/MariaDB
```

Modul domain berada di `src/modules/<domain>/`. Pertahankan boundary controller,
service, repository interface, dan adapter MySQL untuk logic bisnis. Utility
lintas modul berada di `src/shared/`.

CRUD administratif generik berada di `src/modules/admin-data/`. Resource harus
masuk allowlist statis; jangan menerima nama tabel atau kolom mentah dari URL.

## Perubahan database

Migration adalah histori append-only:

1. Tambahkan file baru di `database/migrations/`.
2. Gunakan marker `-- +migrate Up` dan `-- +migrate Down`.
3. Jangan mengubah migration yang sudah tercatat pada `schema_migrations`.
4. Jalankan `npm run migrate`.
5. Periksa `npm run migrate:status`.
6. Jika schema memengaruhi CRUD, jalankan `npm run collection:generate`.
7. Jalankan integration test pada database khusus `_test`.

Seeder referensi berada di `database/seeders/` dan harus idempotent. Data lokal
untuk pengujian tidak boleh dimasukkan ke seeder production.

Jangan menjalankan rollback atau test database terhadap `krtnmdgtlv2`. Runner
integration test sengaja menolak database utama dan nama tanpa suffix `_test`.

## Menambahkan atau mengubah endpoint

Checklist minimum:

1. Tentukan public, authenticated, atau permission-protected route.
2. Gunakan DTO/validator ketat dan tolak unknown fields.
3. Gunakan cookie access token untuk auth.
4. Wajibkan CSRF untuk POST, PUT, PATCH, dan DELETE yang memakai session cookie.
5. Terapkan ownership atau RBAC sebelum membaca data sensitif.
6. Gunakan parameter binding pada semua nilai SQL.
7. Pertahankan response envelope dan common error handler.
8. Tambahkan unit/HTTP test serta integration test bila query berubah.
9. Perbarui collection dan dokumentasi frontend.

## Testing dan QA

```powershell
npm run typecheck
npm test
npm run integration:preflight
npm run test:db
npm audit --audit-level=high
```

Lapisan test:

- `tests/Unit`: service, validator, route, collection, dan governance checks.
- `tests/security`: token, cookie, hash, CSRF, dan primitive keamanan.
- `tests/Integration`: migration, seed, repository, serta workflow database.

`npm run integration:preflight` bersifat read-only. Ia memeriksa key JWT,
database terpilih, status migration, tabel CRUD, CORS frontend, pemisahan port,
dan konsistensi base URL pada collection.

## Collection workflow

Root `collection.json` dibuat dari metadata database aktual:

```powershell
npm run migrate
npm run collection:generate
node --test tests/Unit/admin-data-collection.test.ts
```

Jangan mengedit request CRUD generated secara manual karena perubahan akan
hilang saat generator dijalankan ulang. Kontrak domain tambahan yang tidak
generated dipertahankan di `qa/postman/`.

## Scaling guidelines

Modular monolith tetap dipakai selama satu proses dan satu database masih
memenuhi kebutuhan. Saat skala bertambah:

- Pertahankan repository interface agar storage atau service dapat dipisahkan.
- Pindahkan pekerjaan lambat ke worker/outbox, bukan menahan HTTP request.
- Tambahkan pagination dan index sebelum menambah kapasitas server.
- Ukur latency dan error dari structured log serta request ID.
- Gunakan migration backward-compatible untuk deployment bertahap.
- Pisahkan service hanya bila ownership data, beban, atau siklus deploy memang
  membutuhkan batas proses yang berbeda.
- Jangan menjadikan generic admin CRUD sebagai API frontend publik; frontend
  pengguna tetap memakai endpoint domain.

## Definition of done

Perubahan backend dianggap selesai bila typecheck dan test lulus, migration
status bersih, collection sesuai, tidak ada secret ter-track, dokumentasi tetap
benar, dan smoke test health/API berhasil dari origin frontend yang diizinkan.
