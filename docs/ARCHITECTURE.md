# Backend Architecture

Updated: 2026-09-11

## Runtime

The active backend is a Node.js `>=22.18 <23` process using Express 5 and
strict TypeScript. `src/server.ts` assembles adapters and domain services;
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

## Slug ownership

Starter allocation is backend-only: exactly `[A-Za-z]{7}`, case-sensitive,
generated with `node:crypto.randomInt`, checked for collisions, protected by
the binary unique `cards.slug` index, and bounded to ten attempts. Starter DTOs
reject slug input and the account slug update query permits only Basic/Pro.
Basic/Pro custom slugs follow their separate lowercase reserved-root policy.
