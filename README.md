# krtnmdgtlv2API Backend

REST API untuk KartuNamaDigital.id menggunakan Node.js 22, Express 5, strict
TypeScript, MySQL/MariaDB, dan arsitektur modular monolith.

Node.js + Express adalah satu-satunya backend aplikasi aktif. Referensi historis
PHP/Laravel atau Endroid QR berstatus superseded; phpMyAdmin hanya alat
administrasi database. Keputusan kanonis dicatat di
`docs/DECISION-LOG.md`.

## Source of truth

Folder project yang menjadi acuan tunggal saat ini adalah:

```text
C:\xampp\htdocs\krtnmdgtlv2API
```

Seluruh source backend, migration, seeder, test, script operasional,
dokumentasi, dan collection API harus dibaca serta diubah dari folder ini.
Tidak ada repository induk, folder backend lama, atau salinan kerja lain yang
menjadi sumber kode. Salinan pada hosting hanyalah hasil deployment dan
tidak boleh digunakan sebagai tempat development atau sumber sinkronisasi balik.

Root project dikenali dari `package.json`, `src/`, `database/`, `tests/`, dan
README ini. Jalankan semua perintah dari root tersebut.

## Topologi lokal

| Komponen | Alamat | Fungsi |
| --- | --- | --- |
| Frontend/public app | `http://127.0.0.1:8080` | UI yang berjalan pada proses terpisah |
| Backend API | `http://127.0.0.1:3000/api/v1` | Express REST API |
| MySQL/MariaDB | `127.0.0.1:3306` | Database `krtnmdgtlv2` |

Port frontend dan backend sengaja dipisahkan. Port `8080` digunakan
frontend lokal; mengarahkan Express ke port tersebut dapat membuat request
API masuk ke server yang salah dan menghasilkan HTML 404.

## Menjalankan project

Prasyarat: Node.js `>=22.18 <23`, npm, XAMPP MySQL/MariaDB, dan database lokal
yang dapat diakses oleh user aplikasi.

```powershell
Set-Location -LiteralPath 'C:\xampp\htdocs\krtnmdgtlv2API'
npm ci
npm run keys:generate
npm run migrate
npm run seed
npm run integration:preflight
npm start
```

`npm run keys:generate` hanya dijalankan jika key JWT pada `storage/private/`
belum tersedia. Script sengaja menolak menimpa key yang sudah ada.

Konfigurasi lokal berada di `.env` dan tidak boleh di-commit. Template aman
tersedia di `.env.example`.

## Quality assurance

```powershell
npm run typecheck
npm test
npm audit --audit-level=high
npm run integration:preflight
npm run test:db
```

`npm run test:db` bersifat destruktif terhadap database test. Runner hanya mau
berjalan jika `TEST_DB_DATABASE` berbeda dari database utama dan namanya
berakhiran `_test`.

Ringkasan command:

- `npm run qa`: typecheck, unit/HTTP tests, dan dependency audit.
- `npm run qa:integration`: preflight lokal dan integration test database.
- `npm run qa:crud`: generate kontrak lalu memverifikasi schema, collection,
  seluruh resource CRUD, dan database integration pada database `_test`.
- `npm run migrate:status`: memeriksa migration tanpa mengubah database.
- `npm run contracts:generate`: membuat ulang referensi schema dan kedua
  salinan collection dari database aktual.
- `npm run seed:dummy-all`: mengisi data dummy idempotent untuk seluruh tabel
  aplikasi pada database lokal yang dikonfigurasi.
- `npm run hosting:preflight`: memeriksa baseline runtime hosting.

## API dan collection

Health check:

```text
GET http://127.0.0.1:3000/api/v1/health
```

Collection CRUD administratif berada di [collection.json](./collection.json)
dan salinan dokumentasinya di [docs/collection.json](./docs/collection.json).
Collection tersebut menggunakan cookie authentication dan CSRF, serta dapat
diimpor ke Postman. Hoppscotch dapat menggunakan request dan environment yang
sama selama cookie jar/credentials diaktifkan.

CRUD tabel administratif berada di `/api/v1/admin/data`. Akses baca memerlukan
permission `data.read`; POST, PUT, dan DELETE memerlukan `data.manage` serta
header CSRF. Tabel internal `schema_migrations` tidak diekspos dan nilai kolom
password, token, OTP, credential, atau hash tidak dikembalikan oleh API.

Starter signup prefill tersedia melalui read-only
`GET /api/v1/starter/cards/:publicId/signup-context` setelah pertukaran email
token. Public-card `whatsappUrl` selalu diturunkan backend dari nomor mobile
Indonesia yang valid dan hanya tersedia untuk Pro.

Starter slug dibuat backend dengan CSPRNG sebagai tepat tujuh huruf ASCII
case-sensitive. Unique index `cards.slug`, collision check, dan maksimum
sepuluh percobaan melindungi alokasi. QR PNG dibuat oleh modul Node
`src/modules/rendering/qr/` dari canonical public URL dan memakai cache
content-addressed serta ETag.

## Dokumentasi utama

- [Development guide](./docs/DEVELOPMENT.md)
- [Backend architecture](./docs/ARCHITECTURE.md)
- [Decision log](./docs/DECISION-LOG.md)
- [Frontend integration](./docs/FRONTEND-INTEGRATION.md)
- [CRUD, schema, collection, dan dummy seed QA](./docs/CRUD-QA.md)
- [Role and access reference](./docs/ROLES.md)
- [Starter email and access contract](./docs/STARTER-EMAIL.md)
- [Transactional email template management](./docs/EMAIL-TEMPLATES.md)
- [Startup dan bootloop recovery](./docs/STARTUP-RECOVERY.md)
- [Dependency policy](./dependency-requirements.md)
- [Mail template guide](./resources/mail/README.md)

## Struktur project

```text
database/               migration dan seed data
docs/                   dokumentasi development dan integrasi
qa/postman/             collection kontrak domain yang dipertahankan
resources/              template dan resource runtime
scripts/                migration, seed, preflight, worker, generator
src/config/             parsing dan validasi environment
src/modules/            modul bisnis dan CRUD administratif
src/shared/             database, HTTP, logging, dan security primitives
storage/                key/file/cache lokal yang tidak di-commit
tests/                  unit, HTTP, security, dan integration tests
collection.json         generated administrative CRUD collection
app.js                  adapter startup hosting, bukan source aplikasi
```

## Aturan perubahan

1. Jangan mengedit kode langsung di hosting lalu menyalinnya kembali sebagai SoT.
2. Jangan mengubah migration yang sudah diterapkan; tambahkan migration baru.
3. Setiap endpoint baru wajib memiliki validasi, authorization, dan test.
4. Setelah schema atau CRUD berubah, generate ulang `collection.json`.
5. Jalankan QA dan preflight sebelum frontend integration atau deployment.
6. Jangan commit `.env`, key JWT, password, token, dump database, atau upload user.

`app.js` dan `passenger.cjs` tetap tersedia sebagai adapter LiteSpeed/Passenger.
Keduanya hanya memuat `src/server.ts`; implementasi aplikasi tetap berada di
folder project canonical ini.
