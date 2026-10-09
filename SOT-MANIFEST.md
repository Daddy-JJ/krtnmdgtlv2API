# Backend SOT Manifest

Gateway diagnostics, 2026-10-09: docs/DUITKU-DIAGNOSTICS.md describes safe
transport logging; no financial behavior change or deployment authorization.

Starter recovery by verified email: ADR-011, 2026-10-04;
docs/STARTER-RECOVERY.md owns the additive confirmed-recovery API contract.

Updated: 2026-10-02
Shared-database sandbox restriction: 2026-10-03, ADR-010.

## Scope and authority

This repository is the only active application backend for
KartuNamaDigital.id. Authority order:

1. `docs/DECISION-LOG.md` for accepted architecture and product decisions.
2. `README.md` and `docs/ARCHITECTURE.md` for runtime boundaries.
3. Domain services, validators, repositories, migrations, and tests for actual
   behavior.
4. `docs/FRONTEND-INTEGRATION.md` and Postman collections for consumer
   integration.
5. `STATUS.md` for current verification evidence and blockers.

Node.js 22/24 LTS + Express 5 + MySQL/MariaDB is the official backend.
PHP/Laravel and Endroid QR references are historical and superseded. phpMyAdmin
is an optional database administration tool, not an application runtime.

## Machine-readable sources

- Runtime contract: `package.json`, `.env.example`, `src/config/`.
- API composition: `src/app.ts`, `src/server.ts`, `src/modules/**/routes/`.
- Schema: append-only `database/migrations/`; generated
  `database/schema-reference.sql` is evidence, not migration authority.
- Tier capabilities: `database/seeders/001_plans_and_features.sql`.
- API requests: `collection.json`, `docs/collection.json`, and
  `qa/postman/`.

Never treat documentation alone as proof of a live database or service. Runtime
claims require successful preflight, health, and integration evidence.

## Payment provider transition

ADR-008 selects Duitku POP redirect for future checkout and supersedes only the
Midtrans provider direction in ADR-005. Checkout remains disabled unless the owner
approves activation after backend/frontend compatibility and sandbox/UAT gates.
ADR-009 retires all Midtrans runtime code, SDK, configuration and webhook.
Historical financial rows and provider labels remain intact and readable; old-provider
reconcile returns 410 PAYMENT_PROVIDER_RETIRED with no Duitku network request.
Refund/subscription domain integrity remains; automated provider refunds are not
implemented. See `docs/DUITKU-PAYMENTS.md` for migration 013, rollback and handover.
