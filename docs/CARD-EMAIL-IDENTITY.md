# One email, one card; instant anonymous publication

Decision ADR-012, 2026-10-17. Backend only, aligns with frontend FE-D-046.

## Authority and behavior

POST /api/v1/starter/cards stays anonymous and immediately published. No Login,
OTP or verification gate is added before publication. Existing registered users
without a card can use this same first-Starter path. POST /cards remains the
existing verified Basic/Pro entitlement path, not another slot after an upgrade.
Paid upgrades operate on the existing card. Authentication/OTP never auto-claim.

Registration identity is cards.registration_email, normalized with trim/lowercase
only. Dots and plus tags are preserved. Contact email is editable display data,
not proof of ownership. Authenticated create derives identity from the verified
database user, never request contact.email. The private card_email_identities PK
serializes email reservations across both create paths. The unique registration
index additionally protects registration identity; nullable legacy rows are not
assumed to have a proven identity. Internal reservation table is not generic CRUD.
Migration 015 adds private card_email_legacy_holds: normalized snapshot emails from
legacy contacts and their existing account owners, all statuses. Each email is an
exclusion only, with no card_id and no selected winner. New create checks this
indexed hold after acquiring the transactional unique reservation. NULL identities
on unrelated legacy cards no longer disable first creation for a fresh email.

Reservation, card, contact and management-token writes commit atomically. The
management token is issued only after successful email reservation. Duplicate
requests never mail, issue credentials, change an existing token, set management
cookies, disclose existing identifiers, or retry as slug collisions. Slug collisions
roll back the reservation and retry only slug allocation. InnoDB deadlock victims
may retry their fully rolled-back DB transaction (max five attempts), never email
or HTTP POST. No new client idempotency or automatic POST retry is introduced.

## API changes and frontend handover

Anonymous duplicate: HTTP 409 exactly

```json
{"success":false,"message":"A card already exists for this email.","code":"STARTER_EMAIL_ALREADY_EXISTS","data":null}
```

No ID, slug, URL, email, owner or management credential is returned. This code is
NOT registration EMAIL_ALREADY_EXISTS. Login/recovery CTAs stay explicit. Do not
auto-resend email, auto-claim or auto-retry create after timeout/ambiguous success.

Legacy claim still needs management cookie, starter CSRF, active session and now
a verified account whose email equals immutable registration identity. Wrong email
returns 403 STARTER_EMAIL_MISMATCH; unreviewed legacy identity returns 409
CARD_EMAIL_IDENTITY_REVIEW_REQUIRED. The endpoint never accepts publicId alone.
Valid legacy management signup context also returns this safe 409 instead of
mistaking unknown registration identity for an invalid credential. An invalid
management credential remains generic 401. No contact-email fallback is allowed.
Recovery GET /starter/claim-candidates and explicit confirmed POST remain, using
registration identity, not current contact. Wrong-email/noneligible remains 404
STARTER_NOT_ELIGIBLE; already owned by another account is never stolen. Discovery
remains private/no-store/bounded/rate-limited. Duplicate confirm is idempotent.

PUT /starter/cards/{publicId} is no longer an anonymous mutation path. It is private
and returns 403 STARTER_CLAIM_REQUIRED after authenticated guard/controller checks;
missing session/CSRF retain their existing safe errors. Use PUT /cards/{publicId}
after verified claim. Management access and signup context remain available.
Owned card writes require a currently active, verified owner. An account email
change revokes sessions as before, reserves the new identity as an alias for its
existing card, retains old reservations and requires new verification to edit.
This also works for owned legacy cards without inferring their registration email;
existing cards.user_id is authority for those normal owner operations. A conflicting
legacy hold is not automatically released, even if it resembles the current contact.
Only the locked, active verified CURRENT owner's database email can be retained as
an alias despite a hold. A fresh requested alias to a held email still fails closed.
An already-bound same-card alias is idempotent, allowing verified A -> B -> A changes.
An existing reservation for a different card is never overwritten. Accounts with
multiple historical cards need review rather than silently choosing an alias target.
Conflicting alias returns STARTER_EMAIL_ALREADY_EXISTS. Preemption is still possible
before email proof, but an anonymous creator cannot edit/claim as a different
verified email; the legitimate email holder can explicitly recover an unowned card.
That recovery requires a proven stored identity; unknown legacy creation identity
continues through controlled support review, not an automatic contact-email match.
Never auto-transfer an owned card. Support review remains necessary for disputes.

## Conservative deletion and change policy

Soft-delete, suspension, contact edits, account deletion/change and Basic/Pro upgrade
do not release registration/alias slots. One account cannot create another card
after soft-delete; restore/review is separate. This intentionally tightens the old
replacement-after-delete behavior. No existing card is deleted/merged/unpublished
or moved by this patch. Contact-email duplication is not registration identity
duplication; inventories report it as evidence, not an automatic cleanup decision.

## Owner-supplied hosting evidence (2026-10-17)

phpMyAdmin SELECT screenshots: 7 normalized contact-email duplicate groups, 21 extra
cards (28 cards in those groups), 24 unowned and 4 owned; all 28 published, none
soft-deleted/suspended. Two groups have owned cards: 13=11+2 and 3=1+2. No account
has multiple cards in the separate all-status inventory. These are owner-provided
hosting observations, NOT direct agent access, immutable registration proof, a
complete email history, or a statement about all other cards in the database.
Follow-up owner screenshots (2026-10-18): hosting HEAD 2b4274d; listed migrations
through 013 true; cPanel app Node 22.23.3; MariaDB 11.4.13; phpMyAdmin timezone
SYSTEM. These are not CLI/Passenger target parity or migration 014/015 execution
proof. Node app version is within package engines; that is not full hosted UAT.
Owner approved backend main commit/push on 2026-10-18, Git publication only.

## Migration and hosting cutover - NOT APPLIED to existing databases

014 is unchanged additive MariaDB DDL: nullable VARBINARY registration identity,
unique index, private reservation table with RESTRICT FK. No identity backfill.
015 creates the private legacy hold table and inserts a distinct exclusion snapshot
from legacy contact/account emails. It writes ONLY the new table; it does NOT update
cards, contacts, users, tokens, payments or ownership. Both down sections retain
identity evidence. MySQL portability and actual hosting DDL remain unverified.
015 uses one UNION-based snapshot and an explicit ECMAScript whitespace catalogue
(hex-encoded public PCRE pattern, explicit utf8mb4 collation), preserving dots/plus.
The cutover preflight independently checks JavaScript normalization coverage; a
normalization anomaly must keep writers closed. Out-of-range/blank legacy values
are count-reported and cannot be submitted as valid new registration addresses.
The runtime requires the completed 015 ledger entry; incomplete cutover returns
503 CARD_EMAIL_GUARD_UNAVAILABLE before any token/email or new card is created.
Reapplying 015 after rollback can ADD holds from then-current legacy data. This is
not a frozen historical reconstruction and is permitted only in an approved closed
writer window. Existing holds are never released; do not rerun it casually.

This is compatible containment, NOT cleanup: existing duplicate cards stay published.
One-email protection applies to new registration identities and snapshot-held legacy
emails. Unknown historic email values absent from current data cannot be reconstructed
or guaranteed by this patch. No global NULL-identity gate is used.

1. Obtain separate approval for production backup, migrations 014/015 including the
   exclusion snapshot, deployment/restart and any real-email UAT. Finalizing local
   source is NOT authorization for these operations. Do not use seed or test:db on
   hosting. Refresh the read-only inventory and actual Node/MariaDB versions first.
2. Take and verify a recoverable backup of schema and affected data under restricted
   access. Do not commit dumps or credentials. Keep 014/015 and schema_migrations
   checksums unchanged once applied. If 014 is already present, do not rewrite it.
3. In an approved short maintenance window stop ALL old writers (anonymous and
   authenticated create, claim, account/contact edits, admin mutations and workers
   that can write these records). A rolling old/new writer overlap is NOT safe.
4. Apply approved migrations with npm run migrate from the exact backend app root
   and correct CLI environment. MariaDB DDL auto-commits; this is not an atomic whole
   migration. On partial failure KEEP writers closed, inspect safe error category,
   and resume the idempotent migration only after correction. Never drop the holds.
5. Before opening writers run npm run cards:email:preflight -- --cutover. It performs
   SELECT only, verifies required schema/unique indexes, migration checksums, new
   InnoDB engines, private binary keys/RESTRICT FK, registration bindings, no orphan
   or dangling reservations, and snapshot coverage for current
   legacy contact/account emails. NULL legacy identities are reported, NOT a failure.
   Do not run the cutover coverage mode after normal contact edits to infer history.
6. Deploy the compatible backend and restart Passenger under separate approval.
   CLI preflight is NOT proof of Passenger's environment/database target. Check app
   root/startup file, served backend revision, health, login and authenticated owner
   behavior separately. Check the currently deployed FE-D-046 consumer contract.
7. Run approved UAT: existing published URLs/QR/vCard, old owners' list/edit, first
   fresh Starter instantly published, duplicate safe 409 without cookies/email,
   registered account without a card, matching verified recovery for proven identity,
   unknown legacy review, wrong-email claim rejection, OTP/CSRF and upgrade using
   the existing card. Avoid repeated POST or new invoices to resolve conflicts.
8. Rollback must stop writers, preserve schema/holds/reservations and use a compatible
   version. Do NOT reopen older unguarded writers or run migrate:rollback on production
   as a shortcut. Published data and ownership must remain unchanged.

## Controlled legacy resolution (separate approval per case)

- Existing owned cards continue to use their existing relationship; a matching
  mutable contact email must never transfer or revoke that ownership.
- An unowned legacy card lacking original identity requires support review. A valid
  management credential alone and an arbitrary verified account are insufficient.
  Candidate discovery returns proven registration identities only; an empty list
  does not establish absence of legacy cards. The frontend must retain support CTA.
- Privately collect the selected card, original creation/email delivery evidence,
  verified email control, explicit claimant confirmation, reason/ticket, approved
  operator and expected pre-state. Do not ask for raw tokens/signatures in tickets.
  Ambiguous evidence or competing owned cards means leave the case blocked.
- Before any mapping write obtain owner approval for the exact card/email mapping
  and an auditable transaction. Lock the card, relevant account and email keys;
  recheck no conflicting registration/alias/owner; write the approved immutable
  identity and registry binding with a minimal activity/admin audit record atomically.
  Do not claim or change ownership as part of mapping. Keep all legacy holds.
- After approved mapping, the existing explicit confirmed verified-email recovery
  endpoint performs claim, token revocation and audit. No login/OTP auto-claim.
  No generic mapping endpoint/automatic backfill writer is included in this patch.
  Disputed/duplicate cards need a separate owner decision; never auto-select the
  oldest/newest card or silently delete, merge, unpublish or transfer another card.

## Verification boundary

Final local evidence (2026-10-18): Node 22.23.2, MariaDB 10.4.32; npm run qa:
typecheck PASS, 262 total / 261 pass / 0 fail / 1 DB suite skipped; npm audit 0
vulnerabilities. Separate isolated database suite 22/22 pass, including 17 legacy
cases shaped like the owner hosting inventory. Read-only cutover preflight 15/15
pass; missing hold/FK negative probes reject; missing ledger fails closed before
reservation. SQL/JS normalization matches for 116 whitespace/default flag/sql_mode
cases, including all 25 ECMAScript whitespace points and four excluded points.
The pattern disables MULTILINE/UNGREEDY inline independently of server defaults.
These are local proofs, NOT actual hosting MariaDB/MySQL 8 or Node 24 verification.
Final focused Starter/identity/HTTP/recovery/slug/generated-contract suite: 35/35.
Disposable QA server was stopped after exact-datadir verification; generated
temporary data removed and reproducible from synthetic fixtures. Diff check clean.
Initial isolated-run credential setup and collation failures were corrected; final
reruns above pass. No production failure/success is inferred from those test runs.

Changed areas: Starter service/repository/interface and disabled preclaim PUT guard;
owned-card create/edit repository; account email alias reservation; admin recovery
identity matching; shared identity/DB-transaction helpers; additive migrations 014/015;
read-only inventory/preflight; current ownership recheck on final theme mutation;
collections/schema generators and internal-table classification;
root/docs collections and schema references; SOT/ADR/OpenAPI/handover; unit and
isolated database regression fixtures. No existing migration was edited.

Local main DB inventory was attempted but connection refused. Hosting counts above
come from owner screenshots, not agent DB access. Tests use disposable loopback and
explicit _test database, with mock email/gateway only. No main/hosting migration,
cleanup, real email, production data change or deploy is authorized. Git publication
is separately owner-approved; it does not establish production compatibility/UAT.
