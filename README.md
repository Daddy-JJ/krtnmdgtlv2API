# Backend

The backend uses Node.js 22.18+, Express 5, strict TypeScript, and MySQL2. Source files run directly on Node 22 with erasable TypeScript syntax; `tsc --noEmit` remains the required static type gate.

## Local setup

1. Copy root `.env.example` to root `.env` and set database values.
2. Run `npm install` inside `backend/`.
3. Run `npm run keys:generate` once, then configure untracked `CSRF_HMAC_KEY`, `OTP_HMAC_KEY`, and SMTP credentials.
4. Run `npm run migrate` and `npm run seed`.
5. Run `npm start`; the REST base path is `/api/v1`.
6. Run `npm run qa`. Set `RUN_DB_TESTS=true` for the database integration suite.

For cPanel LiteSpeed Passenger, register the default `app.js` entrypoint with a Node.js runtime in the locked `>=22.18 <23` range. The root package is intentionally CommonJS so a launcher that hardcodes `require("app.js")` can load it; nested `src/`, `scripts/`, and `tests/` package boundaries remain ESM. The physical `app.js` bridge dynamically imports the ESM/TypeScript server.

## Deployment mirror

This repository is a deployment mirror. Authoritative backend development
lives in `KartuNamaDigital-v2/backend`; do not implement business changes here
independently. The root Passenger bridge and root-relative `.env` loader are
deployment adapters that must be preserved during synchronization. Database
dumps and retired CommonJS API implementations are prohibited.

Phase 1M was accepted on 2026-07-18. Auth/Starter, Card, sharing, payment, minimal admin APIs, and `/me` account contract have been implemented through accepted gates. The former PHP/Composer runtime files have been removed; historical implementation evidence remains only in the Phase 1 report and changelog.
