# Backend Decision Log

## ADR-010: Restricted shared-database sandbox (2026-10-03)

Owner accepts shared database. Restrict new sandbox checkout to configured dummy
user UUIDs, personalize capabilities, separate production paid gross revenue from
sandbox/unknown/history totals. Sandbox still changes dummy subscriptions/cards;
no isolation claim. Existing callbacks/reconcile continue after membership changes.
No cleanup/migration, checkout activation, production transaction or deployment.

## ADR-001 - Node.js and Express are the official backend

Date: 2026-09-11

Updated: 2026-09-19

Status: Accepted

Node.js `>=22.18 <23 || >=24.21 <25`, Express 5, TypeScript, and MySQL/MariaDB
are the active backend stack. Any document that presents PHP or Laravel as an
active backend is superseded. Historical documents are retained for provenance.
phpMyAdmin is administration tooling only.

## ADR-002 - QR rendering is native to the Node backend

Date: 2026-09-11

Status: Accepted

The existing `qrcode` dependency and `src/modules/rendering/qr/` are
authoritative. PNG payload is the canonical public card URL, never raw contact,
credential, token, or storage path. Rendering is testable, content-addressed,
ETag-aware, and has safe validation/error behavior. Endroid QR is superseded.

## ADR-003 - Starter public slugs are seven ASCII letters

Date: 2026-09-11

Status: Accepted

Starter slugs are exactly `[A-Za-z]{7}`, case-sensitive, cryptographically
random, unique, collision-checked, and immutable by the Starter user. Ten failed
allocation attempts return a controlled service-unavailable error. Basic and
Pro retain custom-slug rules.

## ADR-004 - Locked tier baseline

Date: 2026-09-11

Status: Accepted with one documented conflict

The tier limits are 1/3/10 themes, 0/2/5 social links, 0/2/10 catalog items,
Maps for Basic/Pro, logo and WhatsApp CTA for Pro only, and QR/vCard for all
tiers. The supplied baseline says Starter has no login/member area while also
allowing editing. Existing secure implementation supports anonymous creation,
email management access, Signup/claim, then member editing. That access-model
conflict is marked `[Need More Information]`; the secure existing flow remains
until the owner resolves it.

## ADR-005 - Starter account boundary and Midtrans activation gate

Date: 2026-09-12

Status: Accepted for the account boundary; payment-provider direction superseded
by ADR-008. Production checkout activation remains owner-gated.

The owner resolves ADR-004's access-model conflict. Creating a Starter card is
anonymous. An account is required only when the user chooses to maintain or edit
that card; the verified user must claim the specific card through the existing
secure email-management handoff before account-owned editing.

Membership checkout remains paused at the frontend until a later explicit owner
decision confirms Midtrans API readiness. Existing backend payment validation
and gateway integration may remain implemented, but their presence does not
authorize the browser to initiate checkout while the product gate is paused.

## ADR-006 - WhatsApp CTA is available for all tiers

Date: 2026-09-12

Status: Accepted

The owner reconfirms that click-to-WhatsApp is available for Starter, Basic,
and Pro. This decision supersedes the Pro-only WhatsApp entitlement wording in
ADR-004 and the prior implementation baseline. The backend remains the
authority: it derives a validated wa.me URL from the saved mobile number for
every tier; the browser never submits a WhatsApp URL.

## ADR-007 - Pre-release security authority boundaries

Date: 2026-09-21

Status: Approved for backend implementation; production rollout gated

Generic table CRUD is now read-only for every resource. Operational mutations
remain in domain endpoints with their validation, permission and audit rules.
Private APIs require active database sessions in addition to signed JWTs.
Email change requires current-password confirmation and recent authentication;
reset credentials use URL fragments. Resume files require real antivirus scan
approval, not signature-only classification. Verified full refunds must revoke
the affected entitlement, with historical ambiguous cases held for manual review.

No schema migration or production changes are part of this decision. Frontend
and hosting coordination gates are in `SECURITY-REMEDIATION.md`. ADR-005's
Midtrans activation restriction remains in force.

## ADR-008 - Duitku POP redirect and provider-preserving transition

Date: 2026-10-01

Status: Approved for backend implementation; production checkout NOT approved

Future checkout uses Duitku POP createInvoice and redirects to the provider page.
This supersedes ADR-005's Midtrans readiness dependency, not its activation gate
or the Starter account/claim boundary. Midtrans history and callback/reconcile
processing remain provider-bound until an operator establishes a transition end.

Current official documentation specifies endpoint-specific HMAC-SHA256 for Duitku.
Browser return and unsigned callback fields cannot grant entitlement: independent
server status, amount/order/reference matching and locked database activation are
required. Backend prices, IDR, 365-day periods and refund rules are unchanged.

Migration 013 is additive. Its down retains financial evidence; rollback disables
new checkout while the compatible backend continues processing existing orders.
No production migration, purchase, email or checkout activation is authorized.
Audit findings, contracts and release blockers are in `DUITKU-PAYMENTS.md`.

Implementation completion approval includes a targeted security dependency refresh:
Multer 2.4.0, Nodemailer 10.0.13 and in-range transitive Axios 1.20.0, with lockfile
and mail/upload/legacy-payment regressions. This does not approve production DDL,
real purchases/email, frontend changes, checkout activation, commit or push.

Follow-up owner instruction completes the LOCAL database transition after backup
and makes Duitku the only selectable provider for new checkout. Midtrans adapters
remain historical-processing only. Production migration/activation and actual
sandbox validation still require deployment access and configured merchant secrets.

## ADR-009 - Complete retirement of the previous payment runtime

Date: 2026-10-02

Status: Owner-approved implementation; checkout activation NOT approved

This supersedes ADR-008's temporary retention of the Midtrans adapter/webhook.
Remove its SDK/types/configuration, callback and SDK tests completely. Duitku is
the only active gateway. Do not delete or relabel historic financial records,
subscription periods, events, or existing schema columns. Old-provider records
remain readable with redirectUrl null; reconcile fails safely with HTTP 410
PAYMENT_PROVIDER_RETIRED and never calls Duitku. Operators must inventory and
resolve any historic pending/refundable orders manually before release.

Keep checkout and Duitku processing disabled until merchant credentials arrive
and sandbox/UAT verifies the integration. Owner will supply sandbox merchant code
and API key later through server configuration, not chat or the repository.
No production migration, transaction, real email, frontend edit, commit or push.
Rollback closes new checkout without disabling existing Duitku status/callback
processing. Automatic provider refunds are not implemented; domain refund and
entitlement invariants remain covered by isolated database tests.
