# Backend SOT Manifest

Updated: 2026-09-11

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

Node.js 22 + Express 5 + MySQL/MariaDB is the official backend. PHP/Laravel and
Endroid QR references are historical and superseded. phpMyAdmin is an optional
database administration tool, not an application runtime.

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
