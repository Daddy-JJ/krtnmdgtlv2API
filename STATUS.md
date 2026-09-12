# Backend Status

Updated: 2026-09-12

## Current implementation

- Official backend: Node.js 22, Express 5, TypeScript, MySQL/MariaDB.
- API base: `http://127.0.0.1:3000/api/v1`.
- Starter slug: CSPRNG seven ASCII letters, case-sensitive, ten-attempt bounded
  collision handling, unique binary database index.
- QR: Node `qrcode` PNG service, canonical URL payload, file cache, ETag, and
  safe 404/503 handling.
- WhatsApp CTA: Pro-only in service, seed, applied migration 011, tests, and
  Postman assertions.
- Starter cards can be created anonymously; maintenance/editing requires the
  verified account and claim flow.
- Payment routes remain implemented and fail-closed, while frontend checkout is
  product-paused until explicit Midtrans API readiness approval.

## Audit classification

| Classification | Evidence |
|---|---|
| Verified | Node 22.23.2 satisfies engine; Express/qrcode are lockfile dependencies; all 13 migrations are applied; database integration and local runtime smoke pass |
| Conflict | Brief path used `krtnmddgtlv2API`; actual canonical Git checkout is `krtnmdgtlv2API` |
| Conflict | Prior WhatsApp-all-tier rule was superseded by the 2026-09-11 Pro-only baseline |
| Verified | Newman 6.2.1 runs the read-only System folder successfully through `npx`; the full mutation collection still requires explicit QA credentials and isolated test data |
| Superseded | PHP/Laravel active backend and Endroid QR |

## QA evidence after implementation

- `npm ci`: completed from the lockfile.
- `npm run qa`: typecheck passed; 156 tests passed, 1 database test skipped by
  the non-DB runner; `npm run test:db` separately passed 1/1 MariaDB
  integration test; `npm audit --audit-level=high` found 0 vulnerabilities.
- Security dependency pins updated to `multer@2.3.0`, `mysql2@3.24.4`,
  `nodemailer@9.1.1`, and `sharp@0.35.4`; transitive `qs` was updated in-range.
- Backend startup succeeded on port 3000 and health returned HTTP 200 with the
  database available. CORS preflight from `127.0.0.1:8080` returned HTTP 204
  with the exact origin and credentials enabled.
- Newman 6.2.1 executed the read-only Postman `System` folder: 1 request,
  0 failures. The full mutation collection was not run against the main
  database because it needs designated QA identities and would create data.
- Testing-runtime E2E created one temporary Starter in the `_test` database:
  HTTP 201, seven-letter slug, case mismatch HTTP 404, QR HTTP 200 then 304,
  VCF HTTP 200, unauthenticated slug edit HTTP 401, and client-supplied Starter
  slug HTTP 422. Re-running `npm run test:db` rebuilt the test baseline and
  removed the temporary record.

## Database preflight and migration

- Initial preflight correctly stopped on `ECONNREFUSED 127.0.0.1:3306`.
  After XAMPP MariaDB was started, `npm run db:preflight` verified the exact
  `krtnmdgtlv2` target, MariaDB 10.4.32, and a binary unique slug index.
- A timestamped logical backup was created at
  `storage/backups/krtnmdgtlv2-2026-09-11T14-20-02-107Z.sql` (91,532 bytes)
  before schema changes.
- Migration `011_whatsapp_pro_entitlement.sql` was the only pending migration
  and was applied successfully. `npm run migrate:status` and
  `npm run integration:preflight` confirm all 13 migrations and Pro-only
  WhatsApp capability values.

## 2026-09-12 owner clarification

ADR-005 resolves the remaining Starter access ambiguity without a code change:
anonymous creation and account-bound management are the intended behavior
already enforced by the current access, Signup, claim, ownership, and CSRF
boundaries. Checkout remains paused at the frontend until an explicit future
owner decision confirms Midtrans API readiness.
