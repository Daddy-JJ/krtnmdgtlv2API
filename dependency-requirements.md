# Node.js Dependency Requirements

## Phase 1M installed

- Express 5 for HTTP routing and middleware.
- Helmet for baseline response security headers.
- MySQL2 Promise API for database access and prepared `execute()` calls.
- Zod for environment and boundary validation.
- Nodemailer for authenticated SMTP inside `CpanelSmtpMailer`.
- TypeScript and project-local Node/Express type definitions for strict typecheck.
- Human passwords use the asynchronous `node:crypto.scrypt` primitive built into Node.js 22. The versioned format and locked parameters are enforced in the security test suite; no native password-hashing package or build step is required.

Versions are exact in `package.json` and integrity-locked in `package-lock.json`. Run `npm ci` in CI/production and `npm audit --audit-level=high` at every release gate.

## Phase 4 installed

- `qrcode` for self-hosted PNG rendering, isolated behind `QrCodeRendererPort`.
- `jsqr`, `pngjs`, and `@types/pngjs` are development-only dependencies used to decode generated PNG output back to the exact canonical URL during tests.
- `multer` provides a memory-only multipart boundary with hard request limits for Phase 4D uploads.
- `sharp` performs actual image decode, dimension checks, and safe re-encoding; client MIME/extension is never authoritative.

## Phase 5 installed

- `midtrans-client` is isolated behind `PaymentGatewayPort`; application services and controllers do not depend on the SDK directly.
- Phase 5A installs the adapter boundary only. No live credential, checkout route, webhook activation, or subscription mutation is enabled yet.

Packages remain exact-version and lockfile pinned.
