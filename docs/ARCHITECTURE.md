# Backend Architecture

Updated: 2026-09-19

## Runtime

The active backend is a Node.js process using Express 5 and strict TypeScript.
Supported LTS ranges are `>=22.18 <23 || >=24.21 <25`; production runs
Node.js `24.21.0`. `src/server.ts` assembles adapters and domain services;
`src/app.ts` owns the `/api/v1` prefix, exact credentialed CORS, security
headers, request logging, JSON parsing, 404 handling, and the common safe error
envelope.

MySQL/MariaDB is accessed through repository interfaces and `mysql2`.
Migrations are append-only and tracked by `schema_migrations`. Frontend
`127.0.0.1:8080` and API `127.0.0.1:3000` are separate processes.

No PHP or Laravel application participates in request handling. Passenger
bridges are Node startup adapters only. phpMyAdmin may inspect the database but
is not part of the application architecture.

## QR boundary

`GET /api/v1/public/cards/:slug/qr` resolves a published card through the
existing card service. The public slug is validated before repository lookup.
`QrcodeRenderer` uses the Node `qrcode` package to encode only the backend
canonical public URL into PNG. `QrFileCache` uses a SHA-256 content key;
responses include ETag, immutable cache headers, safe filename, and no internal
path.

Missing, unpublished, inactive-theme, wrong-case, or malformed slugs use the
non-enumerating card-not-found contract. Renderer failures return a safe 503.

## Super Admin boundary

Workspace Super Admin memakai endpoint domain untuk feedback, card recovery,
reports, system, security, mail, template, landing page, dan Resume Service.
Generic `/admin/data` bukan business workflow. `user_feedback` read-only pada
generic data API; status feedback hanya dapat berubah melalui endpoint khusus
yang memerlukan CSRF, recent authentication, alasan, dan immutable audit.

Semua read model operasional disanitasi. Secret, credential, token/hash,
internal storage path, isi file Resume Service, dan stack trace tidak menjadi
bagian kontrak dashboard.

## Slug ownership

Starter allocation is backend-only: exactly `[A-Za-z]{7}`, case-sensitive,
generated with `node:crypto.randomInt`, checked for collisions, protected by
the binary unique `cards.slug` index, and bounded to ten attempts. Starter DTOs
reject slug input and the account slug update query permits only Basic/Pro.
Basic/Pro custom slugs follow their separate lowercase reserved-root policy.
