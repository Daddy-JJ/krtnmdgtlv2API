# Backend Status

Updated: 2026-10-02

## 2026-10-02 - Duitku-only verification (checkout disabled)

ADR-009 removes the previous provider SDK, adapter, types, environment fields,
webhook and Postman/OpenAPI operation. Financial history/schema are preserved.
Retired-provider reconciliation returns 410 PAYMENT_PROVIDER_RETIRED, never calls
Duitku, and hides obsolete redirect URLs. Sandbox merchant code/API key will be
provided by the owner later; disabled startup does not require these credentials.

Verified locally on Node 22.23.2 and isolated MariaDB 10.4.32:

- Focused payment/environment/HTTP/Postman/retirement regressions: 32/32 passed.
- npm run qa: typecheck passed, 232/232 tests passed, 0 failed/skipped;
  npm audit: 0 vulnerabilities after removing unused previous-provider packages.
- Standalone isolated database integration: 3/3 passed.
- npm run qa:integration: passed (preflight 10/10 and isolated DB 3/3).
- npm run qa:crud: passed (47-table generated contracts, typecheck, CRUD contracts
  8/8, preflight 10/10 and isolated DB 3/3). git diff --check is clean.
- Main LOCAL database read-only preflights: all 15 migrations applied,
  integration:preflight 10/10, db:preflight passed; migration 013 had already
  been applied after backup in the preceding owner-approved local transition.
- No previous-provider SDK/Axios dependency remains in npm ls/package-lock.
- Existing three mail-worker files and local/hosting SQL dumps are unchanged.

The first full rerun found a genuine concurrency deadlock: reservation held the
payments PRIMARY lock, then INSERT...SELECT sought its public_id index while
attachInvoice/markCheckoutUncertain held that index and awaited PRIMARY. The
isolated server's InnoDB deadlock report confirmed this lock inversion. Checkout
events now use the already-locked numeric payment ID in INSERT VALUES instead.
Eight additional rounds of eight concurrent requests each assert one invoice,
one payment and a ready persisted invoice. Full QA above passed after the fix.
No automatic retry of an external createInvoice was introduced.

No production readiness claim: actual Duitku sandbox, frontend/browser UAT,
Node 24/shared-hosting runtime, MariaDB 11.4 staging DDL, provider retry/quotas,
unknown-order recovery, and historical production inventory remain unverified.
No frontend edits, production requests/migrations/data, real email, commit/push.
Checkout and Duitku processing remain default disabled.

## Historical 2026-10-01 — transition verification (superseded above)

Implementation: existing payment/subscription modules reused; new Duitku POP adapter,
endpoint-specific HMAC-SHA256, server-to-server callback corroboration, neutral API,
UUID idempotency ledger, durable status cooldown and additive migration 013.
Legacy Midtrans adapter/webhook/reconcile and full/partial refund rules retained.
See docs/DUITKU-PAYMENTS.md for audit, frontend handover, recovery and release gates.

Verified on local Node 22.23.2 / isolated MariaDB 10.4.32 (temporary port 33317):

- Earlier focused payment + generated-contract/admin masking tests: 32/32 pass.
- Final focused payment/email/upload/security regression: 55/55 pass.
- Typecheck: pass in the final QA invocation.
- Final npm run qa: exit 0; typecheck, 233/233 tests with RUN_DB_TESTS=true
  and knd_duitku_test (none skipped), npm audit: 0 vulnerabilities.
- npm ci --ignore-scripts --no-audit --no-fund: pass; full QA repeated after
  clean install: 233/233 pass, none skipped, audit 0 (exit 0).
- Approved dependency remediation: multer 2.4.0, nodemailer 10.0.13 and
  transitive axios 1.20.0 within Midtrans SDK's existing ^1.9.0 range.
  package-lock.json regenerated; no audit fix --force or provider removal.
- Real Nodemailer memory-only rendering, SMTP TLS/options, real Multer limits/
  malformed multipart and real Midtrans SDK with mocked Axios transport pass.
- Isolated integration standalone: 3/3 pass (suite + payment/mail queue subtests).
- Read-only integration:preflight on knd_duitku_test: 10/10 checks pass,
  all 15 migration files applied there. This is not the main local database.
- Eight concurrent checkout requests ->one invoice; callback replay/parallel ->
  one 365-day period. Early callback, uncertain create, ownership, provider/reference/
  amount mismatch, out-of-order evidence and legacy refund entitlement covered.
- Schema/reference generation from isolated test target: 47 application tables;
  root/docs collection copies unchanged in content and synchronized.
- Payment Postman and backend-owned OpenAPI module updated and contract-tested.
- git diff --check: clean.

Remaining deployment gates / not production-ready:

- Earlier audit blockers (axios/nodemailer high, multer moderate) are resolved
  by the owner-approved dependency remediation above. This is a local audit
  snapshot, not proof of future vulnerability absence or live delivery.
- Read-only local migrate:status: migrations 001–012 applied; 013 false.
  npm run qa:integration fails all_migrations_applied, before its DB tests.
  Main local DB was intentionally not migrated/reseeded; isolated tests passed.
- No separate build script exists: execution uses Node native TypeScript support.
  Node 24/shared-hosting runtime and MariaDB 11.4/MySQL 8 were not executed here.
- Sandbox gateway/UAT, live credentials/config/quota/form compatibility, production
  historical Midtrans inventory, unknown-order recovery and frontend deployment pending.

No frontend edits, production requests/migrations/data, real mail, commit or push.
Existing mail-worker files, .env and local/hosting SQL dumps unchanged.
Only dependency manifest/lockfile, regression tests and related documentation
were additionally changed during the final approved remediation.
Release order: approved additive migration + compatible disabled backend →
compatible frontend →sandbox/UAT →explicit owner activation. Never enable by UI alone.

## Historical baseline (2026-09-19; superseded where noted above)

The following earlier verification notes are retained as history. They do not
assert current production state, current audit results, or Duitku readiness.

- Official backend: Node.js 22/24 LTS, Express 5, TypeScript, MySQL/MariaDB.
- API base: `http://127.0.0.1:3000/api/v1`.
- Starter slug: CSPRNG seven ASCII letters, case-sensitive, ten-attempt bounded
  collision handling, unique binary database index.
- QR: Node `qrcode` PNG service, canonical URL payload, file cache, ETag, and
  safe 404/503 handling.
- WhatsApp CTA: available for Starter, Basic, and Pro; backend derives the
  normalized URL and migration 012 reconciles all capability rows.
- Starter cards can be created anonymously; maintenance/editing requires the
  verified account and claim flow.
- Payment routes remain implemented and fail-closed, while frontend checkout is
  product-paused until explicit Midtrans API readiness approval.

## Audit classification

| Classification | Evidence |
|---|---|
| Verified | Local Node 22.23.2 and production Node 24.21.0 satisfy the dual-LTS engine; Express/qrcode are lockfile dependencies; all 14 migrations are applied; database integration and local runtime smoke pass |
| Conflict | Brief path used `krtnmddgtlv2API`; actual canonical Git checkout is `krtnmdgtlv2API` |
| Verified | ADR-006 reconfirms WhatsApp CTA availability for all tiers; migration 012 supersedes the Pro-only capability values without rewriting migration 011 |
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
- A second timestamped logical backup was created before the all-tier
  reconciliation at `storage/backups/krtnmdgtlv2-2026-09-12T04-05-32-106Z.sql`
  (93,826 bytes).
- Migration `012_whatsapp_all_tiers.sql` reconciles the three capability rows
  to enabled and was applied as an append-only corrective migration. Migration
  011 remains historical and unchanged. `npm run migrate:status` and
  `npm run integration:preflight` confirm all 14 migrations and all-tier
  WhatsApp capability values.

## 2026-09-12 owner clarification

ADR-005 resolves the remaining Starter access ambiguity without a code change:
anonymous creation and account-bound management are the intended behavior
already enforced by the current access, Signup, claim, ownership, and CSRF
boundaries. Checkout remains paused at the frontend until an explicit future
owner decision confirms Midtrans API readiness.
