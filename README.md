# Backend

The backend uses Node.js 22.18+, Express 5, strict TypeScript, and MySQL2. Source files run directly on Node 22 with erasable TypeScript syntax; `tsc --noEmit` remains the required static type gate.

## Local setup

1. Copy root `.env.example` to root `.env` and set database values.
2. Run `npm install` inside `backend/`.
3. Run `npm run keys:generate` once, then configure untracked `CSRF_HMAC_KEY`, `OTP_HMAC_KEY`, and SMTP credentials.
4. Run `npm run migrate` and `npm run seed`.
5. Run `npm start`; the REST base path is `/api/v1`.
6. Run `npm run qa`. Set `RUN_DB_TESTS=true` for the database integration suite.

For cPanel Passenger, register `app.js` with a Node.js runtime in the locked `>=22.18 <23` range.

Phase 1M was accepted on 2026-07-18. Auth/Starter, Card, sharing, payment, minimal admin APIs, and `/me` account contract have been implemented through accepted gates. The former PHP/Composer runtime files have been removed; historical implementation evidence remains only in the Phase 1 report and changelog.
