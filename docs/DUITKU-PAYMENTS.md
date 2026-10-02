# Duitku POP payment transition — backend audit and frontend handover

Updated: 2026-10-02. Authority: ADR-008 and its retirement follow-up ADR-009.
Scope: this backend repository only. Production checkout is NOT authorized.

## Audit: facts, assumptions and unknowns

Verified source findings before implementation:

- Existing gateway port/service/repository and subscription activation were reused.
- Old checkout returned Snap token; create persisted provider midtrans and Snap URL.
- Create exceptions marked failed, despite ambiguous provider outcomes.
- Existing Midtrans webhook, history, reconcile, annual periods and refund attribution exist.
- Checkout and reconcile use session/CSRF; ownership comes from authenticated user.
- Prices are fixed business upgrade fees: Starter→Basic 55,000, Starter→Pro 97,000,
  Basic→Pro 55,000 IDR. Term 365 days. No same-tier checkout; no change to these rules.
- Generic admin data is read-only; payment redirect/reference are now masked there.
- Read-only local schema inventory matched canonical payment/subscription tables.
  Local inventory contained one dummy paid payment. This is NOT production evidence.

Not verified: production payment counts/providers/environments, historical Midtrans
pending/refundable orders, provider credentials/account version, live Duitku redirect
shape, network latency/callback retry spacing, live frontend compatibility.
Frontend checkout disabled is a handover report, not independently audited here.
No production DB access, migration, transaction, real email, commit or push occurred.

The migration selects a provider, not a new billing or subscription system.
PAYMENT_PROVIDER accepts only duitku. All old-provider adapter/SDK/types/config
and webhook code have been removed following the owner's explicit instruction.
Checkout uses reserveCheckout/attachInvoice only. Historical financial rows and
provider labels are preserved; reconcile for a retired provider returns HTTP 410
PAYMENT_PROVIDER_RETIRED with no external request or automatic replacement order.

## Official reference and security interpretation

Read on 2026-10-01:
[Overview](https://docs.duitku.com/payment-gateway/overview/),
[API browser](https://docs.duitku.com/payment-gateway/api-browser/),
[POP](https://docs.duitku.com/pop/id/),
[API](https://docs.duitku.com/api/id/).

Current documentation specifies HMAC-SHA256, lowercase hex, key=merchant API key:

| Endpoint | Signed input | Encoding / endpoint-specific codes |
| --- | --- | --- |
| POP createInvoice | merchantCode + timestamp (epoch milliseconds) | JSON; headers x-duitku-merchantcode/timestamp/signature; 00 invoice created, NOT paid |
| Callback | merchantCode + original amount string + merchantOrderId | form; resultCode 00 success / 01 failure; reference/resultCode unsigned |
| transactionStatus | merchantCode + merchantOrderId | form; statusCode 00 paid / 01 pending / 02 canceled |
| Browser return | No trusted signature | resultCode 00/01/02 never activates a plan |

MD5 or plain SHA256 examples are obsolete. Status docs contain contradictory JSON examples versus
the stated form encoding; implementation follows the stated form contract.
Sandbox/UAT must confirm this against the merchant account.

TLS verification is required (NODE_TLS_REJECT_UNAUTHORIZED=0 is refused when enabled),
endpoint redirects are refused, provider
responses are bounded to 32 KiB, request timeout defaults to 10 seconds.
Keys/signatures/provider PII messages are never returned or logged by the adapter.

## Endpoint/response contract (base /api/v1)

| Method + path | Auth / CSRF | Body / result |
| --- | --- | --- |
| GET /payments/capabilities | Session | checkoutEnabled, provider, environment, idempotencyKeyRequired, reconcileCooldownSeconds |
| POST /payments/checkout | Session + CSRF + Idempotency-Key UUID | strict JSON {planCode: basic or pro}; 201 ready/owned replay, 202 awaiting verification |
| GET /payments | Session | Owned payment array |
| GET /payments/{publicId} | Session | Owned payment; inaccessible/unknown ->404 PAYMENT_NOT_FOUND |
| POST /payments/{publicId}/reconcile | Session + CSRF | No authoritative browser payment fields; verified outcome |
| GET /subscriptions/current | Session | Existing current-subscription contract, or null |
| POST /payments/duitku/callback | Provider signature only | form body ≤16 KiB, ≤40 fields; successful commit/replay ->200 text/plain OK |

Checkout/list/detail share the following neutral payment fields (ISO dates in JSON):

```json
{
  "success": true,
  "message": "Payment checkout retrieved.",
  "data": {
    "publicId": "8c7e9857-7fbb-4c1f-8e6c-42bdcf9fe60a",
    "merchantOrderId": "KND_backendGeneratedStableOrder",
    "provider": "duitku",
    "environment": "sandbox",
    "status": "pending",
    "invoiceState": "ready",
    "targetPlanCode": "basic",
    "planName": "Basic",
    "durationDays": 365,
    "amount": 55000,
    "currency": "IDR",
    "redirectUrl": "https://app-sandbox.duitku.com/redirect_checkout?reference=EXAMPLE",
    "expiresAt": "2026-10-01T12:00:00.000Z",
    "gatewayStatus": null,
    "paidAt": null,
    "createdAt": "2026-10-01T11:00:00.000Z"
  }
}
```

No snapToken, API key, signature or standalone provider reference/merchant secret
appears in the consumer result. redirectUrl necessarily contains the checkout
reference and is private/no-store. Never log it or put it in analytics.
redirectUrl is null unless provider is duitku and status is pending. expiresAt is an advisory deadline;
local time alone does not prove provider cancellation. Legacy expiresAt/environment
may be null, invoiceState legacy, provider remains midtrans.

Invoice states: creating (reserved, create not persisted), ready (URL stored),
unknown (create outcome uncertain), verified (S2S evidence obtained without URL),
legacy. Payment status is separate: pending/paid/failed/expired/canceled/refunded/
refund_pending_review, with existing partial-refund review preserving paid state.

Compatibility changes: snapToken removed, UUID Idempotency-Key now mandatory,
202 possible, backend feature gate enforced. Keep amount/currency/planName/
targetPlanCode/durationDays. Frontend must deploy the new contract before enabling.

## Idempotency, concurrency and status authority

Before network I/O, lock the user and persist one payment attempt with stable
merchantOrderId and provider/environment/merchant snapshot. The existing unique
payment_events ledger binds a SHA256(user + UUID key) to the plan request hash.
Same key + different plan ->409. New keys/multi-tab same pending intent are aliases
of one attempt; other plan/provider/context pending ->409 with owned publicId.
A key is scoped to the user and retained with financial evidence, not a short
browser cache. Replaying a terminal request still returns that original payment.

Do not retry createInvoice automatically. Timeout/HTTP error/invalid provider result
does not prove failure; attempt remains pending/unknown with no new invoice.
A process crash between reservation and persistence has the same recovery rule.
Independent S2S status/callback can resolve payment, but cannot recover a missing URL
from the documented status response. An unknown/not-found order requires operator
verification with Duitku support/dashboard; do not cancel locally or invent a new
order. This conservative recovery is a release/UAT operational prerequisite.

Callback validates merchant/order/amount, timing-safe HMAC, saved provider/context
and reference, then independently reads status before mutation. Unsigned callback
resultCode never grants rights. Reference is first adopted only from independent
status evidence if create response has not yet been stored. Callback-before-create
and late attach preserve paid state and reject a different reference.

Subscription activation locks user/payment and uses the existing unique event ledger.
Duplicate/parallel events cannot add another period or downgrade paid to pending.
Verified canceled/failed orders can later become paid only on independent payment
evidence; financial status cannot be inferred from arrival order or browser return.
Refunded/manual-review orders cannot regrant entitlement on late settlement.

Durable per-payment status cooldown: 30 seconds. Shared DB buckets per provider/
environment/merchant: 20 status checks per 60 seconds, 20 creates per 60 seconds.
Checkout also limits each user to 10 requests/minute. These are conservative local
ceilings, not a claimed Duitku quota/SLA. Confirm adequacy with sandbox/merchant support.
No automatic status cron/poll loop has been added.

No callback queue exists: acknowledge only after committed application or verified
terminal replay. External timeout/temporary throttle ->503; no plan activation.
Provider retries are finite (docs state up to five attempts); after exhaustion,
recover via dashboard resend or authenticated owner reconcile after cooldown.
There is no automated retry worker/durable retry scheduler in this phase.

## Configuration and migration

```ini
PAYMENT_PROVIDER=duitku
PAYMENT_CHECKOUT_ENABLED=false
DUITKU_ENABLED=false
DUITKU_ENV=sandbox
DUITKU_SANDBOX_MERCHANT_CODE=
DUITKU_SANDBOX_API_KEY=
DUITKU_SANDBOX_CALLBACK_URL=https://backend-staging.example.test/api/v1/payments/duitku/callback
DUITKU_SANDBOX_RETURN_URL=https://staging.kartunamadigital.id/app/billing/result/
DUITKU_PRODUCTION_MERCHANT_CODE=
DUITKU_PRODUCTION_API_KEY=
DUITKU_PRODUCTION_CALLBACK_URL=https://api.kartunamadigital.id/api/v1/payments/duitku/callback
DUITKU_PRODUCTION_RETURN_URL=https://kartunamadigital.id/app/billing/result/
DUITKU_HTTP_TIMEOUT_SECONDS=10
DUITKU_EXPIRY_MINUTES=60
```

Use actual owner-selected staging URLs before enabling sandbox; placeholders are
not live endpoints. Production keys remain empty/disabled in versioned examples.
DUITKU_ENABLED allows processing; PAYMENT_CHECKOUT_ENABLED controls NEW orders.
Both environment credential sets may coexist for historical processing; active
checkout uses DUITKU_ENV. Startup rejects missing enabled credentials, unsafe URLs,
mixed identical merchant codes, bad callback path and unreasonable limits.
Production callback/return URLs require HTTPS; no secrets in URLs.

Migration 013 adds provider environment, merchant snapshot, neutral reference/URL,
invoice state and cooldown; a unique provider/environment/reference index.
Existing gateway/Snap columns and financial rows are untouched; no assumed backfill.
SQL uses MariaDB IF NOT EXISTS DDL, verified on isolated MariaDB 10.4.32 and now
applied to the main LOCAL krtnmdgtlv2 database after an ignored storage/backups
backup. Only migration 013 was applied; user/card/payment/subscription/period
row counts were unchanged. Local integration preflight now passes 10/10 checks.
Merchant sandbox code, API key, callback URL and return URL are absent from the
actual local environment; no real sandbox request is possible until configured.
Hosting MariaDB 11.4 and MySQL 8 have NOT been executed here; native MySQL syntax
portability is not asserted. Run backup/DDL privilege/schema/duplicate review and
staging migration before authorizing production. No production migration is run here.

Before deployment, run read-only `npm run payments:audit` on the intended target
with appropriate environment; share only counts/schema, never secrets/dump payloads.
Inventory any unresolved/refundable historical orders before deployment. Legacy
financial rows are not reclassified or processed by Duitku. Their adapter/callback
is retired; resolve them through operator/provider support review outside this
integration. Do not assume production history is empty from frontend flags.

Rollback: PAYMENT_CHECKOUT_ENABLED=false (never select Midtrans for new checkout).
Retain compatible backend, migration
columns and enabled Duitku callback/reconcile credentials. Never drop payment evidence
or revert to an old binary that cannot process already-created Duitku orders.
Migration down deliberately retains columns/index; it is not a financial reset.
Duitku refund API was not established by the selected docs; no automatic refund
implementation is claimed. Use manual payment-provider review. Full/partial refund
and entitlement domain rules are preserved/tested through normalized repository
fixtures; that does NOT prove an automatic Duitku refund API integration.

## Frontend handover — implementation instructions

1. New checkout provider is always Duitku; no Midtrans/Snap checkout fallback.
   Keep fetch credentials/include, session refresh-once and existing CSRF handling.
   POST checkout body ONLY {planCode}; add UUID Idempotency-Key.
2. Read GET /payments/capabilities after login. checkoutEnabled=false closes UI;
   backend gate remains authoritative. Capabilities is not per-user eligibility.
3. Store publicId + UUID per user/purchase intent in session storage. Reuse key on
   retries, refresh and same intent; coordinate multi-tab. Never rotate after timeout.
4. Redirect only if pending and redirectUrl exists and URL matches the environment
   allowlist below. Do not use a Snap SDK or call Duitku directly from browser.
5. For 202 or null URL show “Pembayaran sedang diverifikasi; jangan membuat
   pembayaran baru.” Retain identifier/key, read owned payment; offer reconcile
   once per ≥30 seconds, no blind create/reconcile loop.
6. Configured return path is /app/billing/result/. It may receive merchantOrderId/
   reference/resultCode. Treat all as untrusted, clear sensitive query from history/
   analytics, never show paid based on those values.
7. On return use stored publicId with GET /payments/{publicId}; if storage lost,
   GET /payments and match merchantOrderId only WITHIN that owned array. A user
   cannot reconcile arbitrary provider order IDs. No dedicated return mutation exists.
8. Read payment after return or explicit check. After backend status paid, refetch
   /subscriptions/current and /cards; UI derives rights from server contracts.
9. Handle 401 refresh once; 403 CSRF refresh/bootstrap only for CSRF_INVALID;
   CHECKOUT_NOT_ALLOWED requires verified account + claimed active card.
   409 IDEMPOTENCY_CONFLICT never retry changed payload with same key;
   CHECKOUT_PENDING_EXISTS use data.publicId to inspect prior attempt.
   429 RATE_LIMITED wait ≥30s; 503 disabled/unavailable show no new checkout.
   410 PAYMENT_PROVIDER_RETIRED requires manual review of historical records.
   400 mismatch, 502 invalid response/redirect require safe support review,
   not a new order. No provider messages/key/signature in UX/logging.
10. Deploy backend-compatible/disabled (after approved additive migration), then
    frontend-compatible, then sandbox browser/UAT and only then owner activation.
    Frontend repository was not touched. Keep current checkout off.

| Environment | Allowed checkout hostname/path |
| --- | --- |
| sandbox | HTTPS app-sandbox.duitku.com /redirect_checkout |
| production | HTTPS app-prod.duitku.com /redirect_checkout |

Strict URL check: no userinfo/nondefault port/hash; exactly one reference query;
other query keys rejected. Actual sandbox URLs must pass this check before activation.
No previous-provider SDK, adapter, webhook, configuration or checkout fallback remains.
Frontend APIs remain own API origin, not these payment hosts.

## QA, operational gaps and release gates

Mock gateway tests and isolated MariaDB tests cover signatures/invalid/missing fields,
merchant/order/amount/reference/provider mismatch, bounded form callbacks, ownership,
CSRF, disabled gate, replay/parallel/out-of-order/callback-before-create, key conflict,
ambiguous create without duplicate, exactly-one annual period, legacy refund/entitlement.
No live sandbox credentials were consumed, no production request or email was made.

Current QA evidence is recorded in STATUS.md. Multer is pinned to 2.4.0 and
Nodemailer to 10.0.13. Retiring the previous-provider SDK also removes its unused
Axios transport dependency. Additional regressions exercise real mail rendering
in memory, TLS options and bounded multipart upload without external delivery.
No blind audit fix --force, mail-worker source changes or real SMTP delivery.
The first full rerun exposed an InnoDB PRIMARY/public_id lock inversion in checkout
event INSERT...SELECT. Events now use the already-locked payment ID with VALUES;
parallel integration stress verifies one invoice per intent. No external-create
retry was added. Post-fix full QA: typecheck, 232/232 tests, audit 0; see STATUS.md.
Release remains blocked by staging DDL validation,
unknown-order recovery runbook, merchant sandbox/signature/form/redirect compatibility,
callback retry/rate quota behavior, legacy production inventory and frontend UAT.

OpenAPI module contract: PAYMENTS.openapi.yaml (backend-owned).
External/parent OpenAPI files are outside this repository and were NOT edited.
Postman payment folder defaults to skip checkout/reconcile until allowSandboxCheckout
=true and capabilities environment=sandbox. Keep production purchase tests disabled.
The rest of the collection still contains normal auth/CRUD mutations: do not run the
whole collection against production. Provider credentials belong only in server env.

## Changed-file inventory

- Payments: gateway port, removed legacy adapter, new duitku-gateway.ts and
  payment-gateways.ts; payment-service.ts, new payment-policy.ts; both repositories;
  payment-controller.ts and payment-router.ts.
- Composition/security: src/config/environment.ts, src/app.ts, src/server.ts,
  src/shared/http/error-handler.ts, admin-data resource sensitive-column classification.
- Database/contracts: new database/migrations/013_payment_provider_transition.sql;
  generated database/schema-reference.sql and krtnmdgtlv2.sql.
- Scripts: new scripts/payment-audit.ts and contract-database.js; schema/collection
  generators accept explicit isolated --test-database mode; package.json adds payments:audit.
  package.json/package-lock.json contain the approved dependency remediation.
  Root/docs admin collections were regenerated but have no content diff.
- Configuration examples: .env.example, .env.production.example, .env.staging.example.
- Documentation: README.md, SOT-MANIFEST.md, STATUS.md, docs/DECISION-LOG.md,
  ARCHITECTURE.md, FRONTEND-INTEGRATION.md, new DUITKU-PAYMENTS.md/PAYMENTS.openapi.yaml.
- QA: tests/Integration/database.test.ts and new duitku-payments.ts; new
  tests/Unit/duitku-gateway.test.ts, payment-service/payment-http/provider-retirement,
  admin-data-resource/postman-coverage tests; new dependency-regression.test.ts;
  qa/postman API collection and both environments.
