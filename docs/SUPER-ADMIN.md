# Super Admin Operations

Dokumen ini adalah source of truth kontrak backend untuk workspace Super Admin.
Super Admin berfungsi sebagai filter operasional pertama: memantau kondisi
aplikasi, melakukan triage, dan menjalankan intervensi terbatas yang selalu
terotorisasi dan tercatat. Dashboard bukan editor database umum.

## Ownership menu

| Menu | Tanggung jawab backend |
| --- | --- |
| Dashboard | Statistik operasional, alert feedback, mail, subscription, user, dan Resume Service |
| Feedback | Inbox terfilter dan perubahan status terkontrol |
| Users | List, detail agregat, role/status/subscription/resume, dan intervensi user |
| Kartu | Search, detail kontak/pemilik, audit, serta recovery relasi akun |
| Subscriptions | Daftar subscription; perubahan masa berlaku melalui intervensi user |
| Usage | Riwayat usage adjustment |
| Interventions | Audit tindakan admin yang immutable |
| Settings | Konfigurasi tersanitasi dan read-only; nilai SECRET selalu `null` |
| Landing page | Endpoint typed khusus; bukan generic CRUD |
| Mail outbox | Monitoring tersanitasi dan retry terkonfirmasi |
| Template email | Draft, preview, test, publish, version, dan restore |
| Reports | Agregat operasional berbasis rentang 1-365 hari |
| System | Status database dan antrean tanpa environment secret |
| Security | Ringkasan session, OTP/reset, rate-limit, dan security event tersanitasi |
| Resume Services | Workflow operasional, SLA, quality review, release, dan retention |
| CV Specialists | Beban kerja, turnaround, dan SLA specialist |

## Feedback workflow

User mengirim feedback melalui `POST /api/v1/feedback`. Super Admin memakai:

```text
GET   /api/v1/admin/feedback
PATCH /api/v1/admin/feedback/{publicId}/status
```

Filter GET:

- `page`: default `1`;
- `limit`: default `25`, maksimum `100`;
- `status`: `new`, `in_review`, `planned`, `resolved`, atau `dismissed`;
- `search`: pesan atau email, maksimum 200 karakter;
- `from` dan `to`: tanggal/waktu yang dapat diparse dan `from <= to`.

List hanya mengembalikan public ID, public ID user, email, pesan, status, dan
timestamp. Internal numeric ID tidak dikembalikan. Response memakai
`Cache-Control: no-store`.

Mutation status membutuhkan permission `data.manage`, cookie session, CSRF,
recent authentication, `confirm: true`, dan alasan 10-1000 karakter. Setiap
perubahan ditulis ke `admin_interventions`. Status yang sama menghasilkan
HTTP 409 `FEEDBACK_STATUS_UNCHANGED`.

`user_feedback` tetap dapat dibaca melalui generic admin data untuk
kompatibilitas. Generic POST, PUT, dan DELETE ditolak dengan HTTP 405
`RESOURCE_READ_ONLY`; admin tidak dapat membuat atau menghapus feedback user.

## Kartu

```text
GET  /api/v1/admin/cards?q={search}
GET  /api/v1/admin/cards/{publicId}
POST /api/v1/admin/cards/{publicId}/interventions
```

`q` mencari public ID, slug, nama kontak, email kontak, atau email pemilik.
Detail memakai `Cache-Control: no-store` dan memuat data kartu, pemilik, serta
audit tersanitasi.

Aksi intervensi yang tersedia:

- `CONNECT_MATCHING_VERIFIED_ACCOUNT`: hanya menghubungkan kartu yang belum
  mempunyai pemilik ke akun aktif dan terverifikasi dengan email yang sama;
- `RELEASE_CARD`: melepaskan pemilik saat ini untuk recovery relasi yang salah.

Kedua aksi membutuhkan `users.manage`, CSRF, recent authentication,
`confirm: true`, alasan, transaction, dan audit. Connect ditolak jika akun
target sudah memiliki kartu aktif. Token Starter direvoke ketika kartu berhasil
dihubungkan.

## Dashboard, Reports, System, dan Security

```text
GET /api/v1/admin/statistics
GET /api/v1/admin/reports?days=30
GET /api/v1/admin/system
GET /api/v1/admin/security
```

Statistics sekarang mencakup `newFeedback`, `feedbackInReview`, dan
`oldestNewFeedbackHours`. Reports memisahkan tren registrasi serta agregat
feedback, subscription, mail, dan Resume Service. System dan Security memiliki
kontrak terpisah dan seluruh response memakai `no-store`.

System tidak mengembalikan environment variable, credential, database password,
JWT key, internal path, atau stack trace. Security tidak mengembalikan token,
hash rate-limit, OTP, password reset token, atau session token.

## Deployment dan kompatibilitas

Backend endpoint baru bersifat additive sehingga backend boleh dideploy lebih
dahulu. Setelah health dan endpoint read-only berhasil, frontend dapat
mengaktifkan menu Feedback serta mengganti Reports/System/Security yang
sebelumnya memakai endpoint bersama.

Perubahan ini tidak memerlukan migration: tabel `user_feedback`, kolom `status`,
permission `data.read`/`data.manage`, dan audit table sudah tersedia. Collection
Postman generated memuat endpoint operasional dan tidak lagi menawarkan generic
mutation untuk `user_feedback`.
