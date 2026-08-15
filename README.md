# Backend

The backend uses Node.js `>=22.18 <23`, Express 5, strict TypeScript, and MySQL2. Source files run directly on the locked Node 22 runtime with erasable TypeScript syntax; `tsc --noEmit` remains the required static type gate.

## Local setup

1. Copy `.env.example` to `.env`, then set database values and unique local HMAC keys.
2. Run `npm install` inside `backend/`.
3. Run `npm run keys:generate` once, then configure untracked `CSRF_HMAC_KEY`, `OTP_HMAC_KEY`, and SMTP credentials.
4. Run `npm run migrate` and `npm run seed`.
5. Run `npm start`; the REST base path is `/api/v1`.
6. Run `npm run qa`. Set `RUN_DB_TESTS=true` for the database integration suite.

For cPanel LiteSpeed Passenger, register the default `app.js` entrypoint with a
Node.js runtime in the locked `>=22.18 <23` range. The root package is
intentionally CommonJS so a launcher that hardcodes `require("app.js")` can
load it; nested `src/`, `scripts/`, and `tests/` package boundaries remain ESM.
The physical `app.js` bridge dynamically imports the ESM/TypeScript server. If
the provider cannot run the locked Node 22 baseline, use VPS/reverse proxy
deployment.

## Source of truth

The `KartuNamaDigital-v2/backend/` directory is authoritative for backend source, tests,
migrations, shared scripts, and dependency policy. The standalone
`KartuNamaDigital-API` repository is a deployment mirror, not a second
development source. Its root Passenger bridge and root-relative `.env` loader
are deployment adapters and must be preserved when synchronizing a release.
Database dumps and retired CommonJS implementations must never be copied into
the deployment mirror.

Phase 1M was accepted on 2026-07-18. Auth/Starter, Card, sharing, payment, minimal admin APIs, and `/me` account contract have been implemented through accepted gates. The former PHP/Composer runtime files have been removed; historical implementation evidence remains only in the Phase 1 report and changelog.
