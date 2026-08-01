# KartuNamaDigital REST API

REST API Node.js + Express untuk seluruh tabel pada dump `krtnmdgtlv2.sql`.

## Database

Nama database: **`krtnmdgtlv2`**  
Jumlah tabel: **21**

`activity_logs`, `auth_rate_limits`, `cards`, `card_contacts`, `card_social_links`,
`catalog_items`, `email_otps`, `mail_delivery_logs`, `mail_outbox`,
`password_reset_tokens`, `payments`, `payment_events`, `plans`, `plan_features`,
`plan_theme_access`, `refresh_tokens`, `starter_manage_tokens`, `subscriptions`,
`themes`, `users`, dan `user_feedback`.

## Instalasi

1. Import database:

   ```bash
   mysql -u root -p < krtnmdgtlv2.sql
   ```

2. Instal dependency dan buat konfigurasi:

   ```bash
   npm install
   cp .env.example .env
   ```

3. Sesuaikan kredensial MySQL di `.env`, lalu jalankan:

   ```bash
   npm start
   ```

API tersedia pada `http://localhost:3000/api/v1`.

Pastikan `JWT_SECRET` pada `.env` diganti dengan nilai acak minimal 32 karakter sebelum menjalankan API.

## Login dan register

Kedua endpoint hanya menerima field `email` dan `password`. Password minimal 8 dan maksimal 72 karakter.

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "rahasia123"
}
```

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "rahasia123"
}
```

Respons sukses berisi data user tanpa `password_hash` dan JWT `accessToken` untuk dipakai sebagai `Authorization: Bearer <token>`.

## Endpoint CRUD

Ganti `:table` dengan salah satu nama tabel di atas dan `:id` dengan primary key.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/health` | Status koneksi dan daftar tabel |
| GET | `/api/v1/:table` | Daftar data |
| GET | `/api/v1/:table/:id` | Detail data |
| POST | `/api/v1/:table` | Tambah data |
| PUT/PATCH | `/api/v1/:table/:id` | Ubah data |
| DELETE | `/api/v1/:table/:id` | Hapus permanen data |

List mendukung `page`, `limit` (maksimum 100), `sort`, `order=asc|desc`, dan filter exact-match, misalnya:

```text
GET /api/v1/cards?page=1&limit=10&sort=created_at&order=desc&filter[status]=published
```

Tabel dan kolom divalidasi dari `INFORMATION_SCHEMA`, sehingga identifier dari request tidak dapat dipakai untuk mengakses tabel di luar database. Aturan foreign key, unique, dan required mengikuti skema SQL.

## Postman

Import `collection.json` ke Postman. Collection berisi lima request CRUD untuk masing-masing dari 21 tabel dan satu health check. Body adalah contoh berdasarkan skema dan mungkin perlu disesuaikan dengan foreign key yang tersedia.

Regenerasi collection setelah skema berubah:

```bash
npm run generate:collection
```
