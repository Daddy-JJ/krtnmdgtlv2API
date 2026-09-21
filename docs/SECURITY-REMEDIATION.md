# Security remediation — 2026-09-21

Scope: repository backend `C:\xampp\htdocs\krtnmdgtlv2API`. Perubahan lokal
berdasarkan approval audit; bukan perubahan production, frontend, atau sertifikasi
pentest. Tidak ada migration baru, email nyata, commit atau push dalam pekerjaan ini.

## Findings and remediation

Severity is impact-based, not evidence of exploitation. The critical generic-data
finding requires an already privileged `data.manage` actor; it is a workflow and
credential-authority bypass, not anonymous SQL injection.

| Risiko awal | Temuan / akar masalah | Perbaikan / lokasi |
| --- | --- | --- |
| Kritis | Generic table writes bypass account, RBAC, payment and immutable-audit rules | All 47 resources read-only in `src/modules/admin-data/resources/admin-data-resources.ts`; controller AND repository deny writes; no credential filter/sort oracle. Purpose-specific workflows remain. |
| Sedang | JWT remains usable after refresh-family revocation or user suspension | `src/shared/security/session-authority.ts`, `src/shared/http/session-authority-middleware.ts`, `src/app.ts`, `src/server.ts`: database authority on every private route, before uploads; fail closed on DB error. |
| Sedang | IP+email combined rate bucket can be bypassed by varying email; reset hashes unknown tokens | `auth-service.ts`: independent IP and identity limits, cheap reset lookup then locked recheck, post-verify user recheck. `password-hasher.ts`: at most two concurrent scrypt derivations per process, no queue. |
| Sedang | Spoofable forwarded client identity / expensive private uploads | `environment.ts`: bounded `TRUST_PROXY_HOPS` (default 0), exact CORS. Session middleware: per-IP/user mutation limits and CSRF before multipart parsing. |
| Sedang | Verified full refund left subscription/card tier active | `mysql-payment-repository.ts`: user-serialized transaction, payment-period attribution, revoke/refund latest term, preserve earlier paid time/current unrelated subscription, restore eligible fallback tier/theme, reject late settlement regrant. |
| Sedang | Signature-only DOCX check falsely marked files clean | `files/docx-container.ts`: bounded ZIP/CRC/decompressed-part checks; macros, entities, traversal, overlap, encryption and expansion rejected. `resume-malware-scanner.ts`: bounded ClamAV process without shell. Upload and release/download require exact `CLEAN_ANTIVIRUS`. |
| Sedang | Password-reset token in query may enter access/referrer logs | `password-reset-mail-worker.ts`: fragment link only; old-email queued jobs cannot mint reset tokens for the changed account. |
| Sedang | Email change permitted with stolen session alone | Account DTO/controller/service/repository: current password, recent auth, per-account limit, locked hash recheck; revoke refresh sessions, OTP and resets when email changes. |
| Sedang | Unhandled fatal errors / shutdown rejection | `shared/http/process-safety.ts`: sanitized fatal event and nonzero exit; bounded graceful shutdown for signals; never continue serving after uncaught exception. |
| Rendah | Public health leaks topology; local exports can be accidentally committed | Minimal no-store health response; production debug suppressed, oversized JSON gets safe 413; `.gitignore` covers named local/hosting SQL dumps. |

## Contracts

- Missing/invalid/revoked session: 401 `AUTH_REQUIRED`; authenticated invalid
  CSRF: 403 `CSRF_INVALID`. Standard 422 validation envelope unchanged.
- Valid authorized generic admin writes: 405 `RESOURCE_READ_ONLY`. Checks before
  that may produce 401/403. Catalog columns advertise no writable fields.
- Public health retains 200/503 and standard envelope, but data contains only
  `{ status: 'healthy' }` or `{ status: 'unhealthy' }`.
- `PUT /api/v1/me`: `{ email, currentPassword }`. Requires CSRF and login within
  15 minutes. Wrong current password: 401 `INVALID_CREDENTIALS`; absent field:
  422. Email change invalidates all sessions and existing reset/OTP credentials;
  success remains 200 with user DTO (no hash/password). Re-verify and sign in.
- Reset mail URL: `/reset-password/#token=<opaque>`. API reset JSON unchanged.
  Obsolete-recipient jobs terminate with `RECIPIENT_CHANGED`, without SMTP send
  or a false successful-delivery log; existing stale-job recovery is preserved.
- Resume upload: 503 `RESUME_SCANNER_UNAVAILABLE` if no configured scanner,
  503 `RESUME_SCANNER_BUSY` if scan capacity occupied, 422 `RESUME_FILE_UNSAFE`
  for rejected documents. Quarantined temporary files are removed on failure;
  no clean DB record/submission is made until scanning succeeds.
- Auth overload: 503 `AUTH_BUSY`; limits: 429 `RATE_LIMITED`. No automatic
  retry of create, payment, email change, or other non-idempotent mutations.

Collections: root and `docs/collection.json` are generated copies. The historical
`Administrative Data CRUD` folder name remains for compatibility; only GETs are
generated. `qa/postman/KartuNamaDigital-API.postman_collection.json` includes the
new current-password field. Schema references are unchanged.

## Refund policy and limits

Verified full refunds are terminal; duplicate delivery cannot reapply the refund
and late settlement cannot reactivate it. A refundable latest term restores its
previous end date if earlier paid time remains. Other active subscriptions take
precedence over reactivating a superseded one. Card themes are preserved when
eligible; otherwise select an active theme in the effective tier.

Historical payments missing source-period attribution or refunds for a non-latest
term become `refund_pending_review`; the linked subscription is suspended and
card tier follows remaining active subscriptions (otherwise Starter). Operations
must reconcile these manually against gateway evidence; do not fabricate period
history. An orphan payment without a subscription link cannot identify an
entitlement to revoke and must be investigated.

Partial refunds retain the paid term and log `payment.partial-refund-pending-review`.
Automatic partial-period proration is not defined. Existing delivered CV work,
downloaded files and past benefits cannot be undone by changing tier; no files or
historical ledger rows are deleted. Midtrans remains disabled unless separately
configured and approved; tests use fake verified notifications, not the gateway.

## Deployment gates (not executed in production)

1. Coordinate frontend BEFORE deploying mail worker changes: parse reset fragment
   in memory, remove it from history, keep existing query parsing only for old
   already-sent links during their 30-minute lifetime. Never store credentials in
   local/session storage or move fragment to query. Update email-change UI to
   collect current password and handle fresh-login/OTP requirements.
2. Confirm hosting proxy topology before setting `TRUST_PROXY_HOPS`. Default 0
   prevents forged forwarded IPs, but may share an IP bucket behind a proxy.
   A hop count is safe only when the origin cannot be reached through a shorter
   path and the trusted proxy replaces forwarded headers. Do not blindly set 1
   or enable trust-all. Validate both direct and frontend-proxied requests.
3. Provider must supply ClamAV with current signatures and adequate resources.
   Set `RESUME_CLAMSCAN_PATH` to the absolute executable path. No scanner is
   installed by this patch. Shared-hosting process/memory constraints must be
   checked. If unavailable, keep uploads unavailable rather than fake a clean
   result. Existing `CLEAN_SIGNATURE_ONLY` files need controlled re-upload/scan;
   they are no longer downloadable/releasable. No automatic legacy backfill.
4. Verify production runtime and secrets using existing startup/preflight checks;
   do not print `.env` or keys. Production root remains
   `/home/karj9582/repositories/krtnmdgtlv2API-clean` on Sierra. Restart through
   the hosting supervisor after an approved release. No `.cpanel.yml` added.
5. Test cookie/CORS/CSRF in browser from the real frontend origin. API tests alone
   do not prove browser integration. Verify logout/revocation, ownership A/B,
   readonly admin tables, OTP/claim and fake/non-production payment scenarios.
6. Review refund manual-review visibility, proxy rate limits, scanner latency,
   `AUTH_BUSY` frequency and process restart alerts under staging load. Two scrypt
   operations is a per-process cap; multiple Passenger workers multiply memory.

## Local verification

Focused regressions cover auth limit ordering, reset races, password concurrency,
session rejection across all private route families, webhook exemption, safe
errors/body bounds, account step-up, DOCX parsing, scanner failures, worker URL
and fatal-process handling. Existing logout, Starter, ownership and admin-route
tests remain part of the suite.

`npm run test:db` explicitly targets `krtnmdgtlv2_test`, recreates only that test
schema and uses fake mail/gateway adapters. Added real SQL assertions cover
refund/replay/renewal/legacy handling, session revocation/suspension, stale password
hash rejection, account-email updates and sensitive generic-data restrictions.
The suite ends with a clean migrated/canonical-seeded test schema, not production
or the main development database. No production smoke mutations are run.

Commands: `npm run typecheck`, `npm test`, `npm run qa`, `npm run test:db`,
`npm run migrate:status`, `npm run integration:preflight`, `git diff --check`.
There are no separate lint/build scripts.

Verified results on 2026-09-21:

- Full `npm run qa`: exit 0; typecheck passed, **204 passed / 0 failed / 1
  skipped (205 total)**; npm audit **0 vulnerabilities**. The skipped test is the
  explicitly gated database integration case, not a skipped unit regression.
- `npm run qa:integration`: exit 0; **10/10 preflight checks**, database test
  **1/1 passed** separately on `krtnmdgtlv2_test` with real SQL assertions.
- Focused security/auth/logout/worker suite: **23/23 passed**.
- `npm run migrate:status`: all **14 existing migrations applied**, read-only
  check against the local main database. No new migration introduced.
- Collection generator succeeded; both copies and all 47 read-only folders
  pass contract tests. `git diff --check` passes.
- Two sandboxed audit reruns failed contacting the npm registry, not because of
  reported vulnerabilities. The final approved network-enabled complete QA rerun
  above succeeded. No actual ClamAV engine, browser/Vercel/hosting integration,
  production SMTP, external gateway or load test was exercised.

## Frontend coordination prompt

```text
Kerjakan hanya repository frontend C:\xampp\htdocs\krtnmddgtlv2FE-SOT.
Audit ownership existing, pertahankan perubahan, jangan commit/push dahulu.
Sinkronkan backend security contract (tanpa mengubah backend/database):
1. Reset password membaca #token di memory, hapus fragment dari history,
   kirim hanya via body POST existing, tanpa Web Storage. Pertahankan dukungan
   query token untuk link lama selama transisi; jangan ubah fragment ke query.
2. Perubahan email PUT /me memerlukan currentPassword, CSRF, sesi recent-auth.
   Tangani 401/403/429; sesudah email berubah lakukan OTP dan login ulang.
3. Generic /admin/data sekarang read-only; gunakan endpoint domain untuk aksi.
4. Health hanya data.status. Tangani AUTH_BUSY dan RESUME_SCANNER_UNAVAILABLE/
   BUSY tanpa loop retry otomatis; uji timeout upload dengan scanner staging.
5. Jalankan regression tests, cookie/CORS/CSRF browser dan alur Starter/claim.
Jangan mengirim email nyata atau membuat data QA production. Laporkan hasil
dan kebutuhan koordinasi sebelum deploy backend/mail worker.
```

References: [ClamAV scanning and limits](https://docs.clamav.net/manual/Usage/Scanning.html),
[Node fatal-exception handling](https://nodejs.org/api/process.html#warning-using-uncaughtexception-correctly).
