# Node.js Dependency Requirements

## Phase 1M installed

- Express 5 for HTTP routing and middleware.
- Helmet for baseline response security headers.
- MySQL2 Promise API for database access and prepared `execute()` calls.
- Zod for environment and boundary validation.
- Nodemailer for authenticated SMTP inside `CpanelSmtpMailer`.
- TypeScript and project-local Node/Express type definitions for strict typecheck.
- Human passwords use the asynchronous `node:crypto.scrypt` primitive built into supported Node.js 22/24 LTS runtimes. The versioned format and locked parameters are enforced in the security test suite; no native password-hashing package or build step is required.

Versions are exact in `package.json` and integrity-locked in `package-lock.json`. Run `npm ci` in CI/production and `npm audit --audit-level=high` at every release gate.

## Phase 4 installed

- `qrcode` for self-hosted PNG rendering, isolated behind `QrCodeRendererPort`.
- `jsqr`, `pngjs`, and `@types/pngjs` are development-only dependencies used to decode generated PNG output back to the exact canonical URL during tests.
- `multer` provides a memory-only multipart boundary with hard request limits for Phase 4D uploads.
- `sharp` performs actual image decode, dimension checks, and safe re-encoding; client MIME/extension is never authoritative.

## Phase 5 historical (superseded by ADR-009)

- The previous provider SDK, adapter and type shim are removed. Financial history
  is preserved; no previous-provider network processing is available.

Packages remain exact-version and lockfile pinned.

## Duitku transition and approved security refresh (2026-10-01)

- Duitku POP uses the native fetch adapter behind the existing PaymentGatewayPort.
  No additional subscription system or gateway SDK was introduced. Checkout remains
  disabled by default; see docs/DUITKU-PAYMENTS.md and ADR-008 for release gates.
- ADR-009 removes midtrans-client and its unused transitive packages, including
  Axios. Duitku uses native fetch with explicit timeout, TLS and host validation.
- Multer 2.4.0 and Nodemailer 10.0.13 replace vulnerable installed versions.
  Nodemailer 10 requires Node >=20, compatible with this repo's Node 22/24 engine.
  It provides bundled declarations; the existing @types dependency is retained
  for compatibility and strict typecheck passes.
- Upstream references: [Multer 2.4.0](https://github.com/expressjs/multer/releases/tag/v2.4.0),
  [Nodemailer 10.0.13](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.13).
- npm install/update used --ignore-scripts for this scoped refresh. Only the
  dependency tree was updated; existing Sharp processing tests also pass.
  Deploy with npm ci from the reviewed lockfile, not unreviewed npm audit fix --force.
- Current local QA evidence after retirement: see STATUS.md.
  Real SMTP delivery, Node 24 hosting and Duitku sandbox/UAT remain separate gates.
