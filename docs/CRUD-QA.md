# CRUD, Schema, Collection, dan Dummy Seed QA

Dokumen ini menjelaskan kontrak CRUD administratif antara database MySQL,
backend Express, alat uji API, dan frontend. Seluruh perintah dijalankan dari
`C:\xampp\htdocs\krtnmdgtlv2API`.

## Cakupan

Database saat ini memiliki 47 tabel aplikasi. Semua tabel tersebut terdaftar
sebagai resource CRUD. Tabel `schema_migrations` adalah metadata internal milik
migration runner sehingga sengaja tidak diekspos sebagai REST API.

Setiap resource menggunakan pola endpoint yang sama:

```text
GET    /api/v1/admin/data/:resource
GET    /api/v1/admin/data/:resource/:id
POST   /api/v1/admin/data/:resource
PUT    /api/v1/admin/data/:resource/:id
DELETE /api/v1/admin/data/:resource/:id
```

GET memerlukan permission `data.read`. POST, PUT, dan DELETE memerlukan
`data.manage` serta CSRF header/cookie yang valid. Kolom credential, password,
token, OTP, secret, dan hash tidak dikembalikan oleh API.

## Source of truth yang dihasilkan

- `krtnmdgtlv2.sql` dan `database/schema-reference.sql` harus identik.
- `collection.json` dan `docs/collection.json` harus identik.
- Daftar tabel aplikasi pada schema harus sama persis dengan allowlist resource
  backend dan folder request pada collection.

Jangan edit keempat file generated tersebut secara manual. Setelah migration
atau kontrak CRUD berubah, jalankan:

```powershell
npm run contracts:generate
```

Generator berhenti dengan error bila ada tabel aplikasi yang belum memiliki
resource CRUD atau resource yang tidak ada di database.

## QA otomatis

Pastikan `.env.test` menunjuk database khusus yang berbeda dari database utama
dan namanya berakhiran `_test`, lalu jalankan:

```powershell
npm run qa:crud
```

Perintah tersebut:

1. membuat ulang schema reference dan collection;
2. menjalankan TypeScript typecheck;
3. menguji allowlist, metode CRUD, authorization, CSRF, dan sinkronisasi file;
4. menjalankan integration preflight terhadap database lokal;
5. membuat ulang database `_test`, menjalankan migration dan seed dua kali;
6. memastikan seluruh 47 tabel aplikasi berisi data.

`npm run test:db` bersifat destruktif hanya terhadap database `_test`. Guard
runner akan menolak nama database test yang sama dengan database utama atau
yang tidak berakhiran `_test`.

## Dummy seed lokal

Untuk mengisi database development yang dikonfigurasi dalam `.env`:

```powershell
npm run seed:dummy-all
```

Seeder menjalankan canonical seed terlebih dahulu, lalu
`database/development-seeds/902-all-tables-dummy.sql`. Data memakai identifier
tetap dan operasi upsert sehingga command aman dijalankan berulang kali. Script
menolak environment selain `local` atau `testing`, lalu memastikan tidak ada
tabel aplikasi yang kosong.

Seeder ini mengubah database development. Backup dahulu bila database lokal
sudah berisi data manual yang penting.

## Pengujian Postman atau Hoppscotch

1. Jalankan backend dengan `npm run dev`.
2. Import `docs/collection.json`.
3. Pastikan variable `baseUrl` adalah `http://127.0.0.1:3000/api/v1`.
4. Jalankan request login untuk user yang memiliki permission administratif.
5. Simpan cookie session dan CSRF sesuai response login.
6. Jalankan folder resource: List, Get, Create, Update, lalu Delete.

Payload Create/Update di collection dibuat dari metadata kolom aktual. Nilai
foreign key adalah contoh kontrak dan harus menunjuk record parent yang benar
pada database target. Gunakan List pada resource parent atau dummy seed untuk
menentukan nilai yang valid.

## Kriteria lulus integrasi frontend

- Health endpoint mengembalikan HTTP 200 dan database `available`.
- Login mempertahankan cookie dengan `credentials: include` pada frontend.
- GET hanya tersedia untuk role dengan `data.read`.
- Mutasi tanpa CSRF ditolak; mutasi valid tidak melewati allowlist tabel/kolom.
- Response selalu JSON API, bukan HTML dari server frontend port 8080.
- `npm run qa:crud` selesai tanpa kegagalan sebelum perubahan schema atau API
  diberikan kepada frontend.
