# Backend Decision Log

## ADR-001 - Node.js and Express are the official backend

Date: 2026-09-11

Status: Accepted

Node.js `>=22.18 <23`, Express 5, TypeScript, and MySQL/MariaDB are the active
backend stack. Any document that presents PHP or Laravel as an active backend is
superseded. Historical documents are retained for provenance. phpMyAdmin is
administration tooling only.

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

Status: Accepted

The owner resolves ADR-004's access-model conflict. Creating a Starter card is
anonymous. An account is required only when the user chooses to maintain or edit
that card; the verified user must claim the specific card through the existing
secure email-management handoff before account-owned editing.

Membership checkout remains paused at the frontend until a later explicit owner
decision confirms Midtrans API readiness. Existing backend payment validation
and gateway integration may remain implemented, but their presence does not
authorize the browser to initiate checkout while the product gate is paused.
