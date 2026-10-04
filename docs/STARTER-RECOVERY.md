# Starter recovery by verified email

## Local QA evidence (2026-10-04)

Focused Starter HTTP/service/email/OpenAPI: 17/17 passed. npm run qa: typecheck
passed, 245 tests total, 244 passed, 0 failed, 1 DB suite skipped; npm audit 0
vulnerabilities. npm run test:db separately: 3 tests/subtests passed on explicit
local krtnmdgtlv2_test, including recovery concurrency and OTP/login without auto
ownership. git diff --check clean. No production changes, real mail or deployment.
Payment integration fixtures were updated to respect the pre-existing sandbox
allowlist; runtime payment rules unchanged. Live browser/hosting UAT remains pending.

Local implementation, 2026-10-04. Not deployment evidence. No automatic claim on
registration, OTP, login, listing, or dashboard navigation. Existing management
credential claim remains unchanged and never accepts publicId as authorization.

## Endpoints (base /api/v1)

- GET /starter/claim-candidates?limit=20&offset=0: active session, active account,
  verified email. No request body/email/userId. Limit 1..20, offset 0..1000, strict
  query keys. Rate limit 30/minute per user. Cache-Control: no-store.
- POST /starter/claim-candidates/{publicId}/claim: active session + normal session
  X-CSRF-Token (not starter CSRF), strict JSON {"confirm":true}, UUID path.
  Rate limit 10/minute per user. Cache-Control: no-store. HTTP 200 on first claim
  and same-owner replay. Requires explicit user action; never automatically POST.

Listing data: {items:[{publicId,displayName,slug,createdAt}],limit,offset,hasMore}.
Claim data: {card:{publicId,displayName,slug,createdAt},alreadyOwned:false}.
Same-owner retry returns alreadyOwned:true without another ownership/audit write.
Responses use {success:true,message,data}. Dates are ISO timestamps in HTTP.
No contact email/details, numeric IDs, management credentials/hashes are returned.

Eligibility: contact email matches current verified database user email after trim
and lowercase only. Dots/plus-tags are preserved. Card is Starter, unowned,
non-deleted, status draft/published. User/card rows are rechecked under transaction
locks. Existing one non-deleted card per account rule is preserved. Unique active
owner constraint also guards concurrent card creation. Ownership update, credential
revocation and minimal audit commit or rollback together.

Errors: 401 AUTH_REQUIRED (missing/expired/revoked session or inactive user);
403 EMAIL_VERIFICATION_REQUIRED; 403 CSRF_INVALID;
404 STARTER_NOT_ELIGIBLE (missing card, wrong email/plan or unavailable status);
409 STARTER_ALREADY_OWNED (matching-email card owned by another user);
409 PLAN_LIMIT_REACHED; 422 VALIDATION_ERROR; 429 RATE_LIMITED.
Error responses do not disclose owner identity/email or database details.

## Frontend handover

After verified login, explicitly fetch candidates. Show names, slug and date for
selection and confirmation. Multiple candidates are possible; never auto-select
and claim. Empty list is normal. Follow hasMore/offset, never cache across accounts.
On user confirmation POST confirm:true with credentials:include and session CSRF.
After HTTP 200 reload /cards and dashboard; same-owner replay is success.
On 409 reload cards/candidates and explain ownership/limit; never delete cards
automatically. On 403 email verification required offer verification. No automatic
mutation retry. Management link remains an alternative. Do not weaken existing
/starter/cards/{publicId}/claim to publicId-only.
Clear stale management state on success. Backend clears starter_manage and
starter_csrf_token cookies, preserving normal authentication/CSRF cookies.

No migration required. Email normalization may scan contacts; review query costs
at scale. Collection includes recovery endpoints. OpenAPI: STARTER-RECOVERY.openapi.json.
