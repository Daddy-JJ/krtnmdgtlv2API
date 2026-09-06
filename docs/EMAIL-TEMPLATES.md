# Transactional Email Templates

Status: backend implementation complete. Migration 010 is applied and
`EMAIL_TEMPLATES_ENABLED=true` in the local runtime. API restart and guarded
route verification are complete; mail worker/mailbox UAT was not run.

## Activation order

1. Deploy code with `EMAIL_TEMPLATES_ENABLED=false` (default). Existing email
   triggers use validated built-in Indonesian templates and need no new tables.
2. Back up the database, run `npm run migrate`, and verify migration 010.
3. Set `EMAIL_TEMPLATES_ENABLED=true`, restart API and mail worker, then verify
   the catalog as a Super Admin. Do not enable the flag before migration.
4. Publish a reviewed draft. Only later events use it; queued outbox jobs retain
   the version pinned when they were created.

Rollback the feature by setting the flag to false. Rolling database migration
010 down removes template drafts, versions, tests, and audit actions, so do that
only from a confirmed backup and never as an ordinary feature rollback.

## Catalog

Keys are fixed: `starter.management`, `auth.registration-otp`,
`auth.password-reset`, `resume.completed`, and retention reminders
`resume.retention-{30|7|1}-days`. Arbitrary template creation/deletion and trigger
editing are not supported. The legacy one-day key remains `resume.retention-1-days`.

All rendering passes through one structured renderer. Raw HTML/CSS/scripts,
arbitrary URL targets, unknown variables, duplicate/missing system blocks, header
line breaks, and payloads over 64 KiB are rejected. Action URLs are event-owned,
same-origin HTTP(S) values. HTML values are escaped and a plain-text alternative
is always generated. Security/expiry notices cannot be removed on publication.

Drafts can be incomplete while saved. Preview, test-send, and publication require
a complete valid draft. Preview and test use dummy data and inert links. Test
email goes only to the authenticated Super Admin's verified account and is
prefixed `[UJI]`; status `sent` means SMTP accepted it, not inbox delivery.

## API contract

All paths are relative to `/api/v1`. Every operation requires a cookie-authenticated
`super_admin`. Unsafe operations require access CSRF. Test, publish, and restore
also require a recent session, `confirm: true`, and a UUID `Idempotency-Key`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/mail/templates` | Fixed catalog |
| GET | `/admin/mail/templates/{key}` | Draft, capabilities, assets, limits |
| PUT | `/admin/mail/templates/{key}/draft` | Save `{ expectedRevision, content }` |
| POST | `/admin/mail/templates/{key}/preview` | Preview `{ draftRevision }` |
| POST | `/admin/mail/templates/{key}/test-send` | Queue `{ draftRevision, confirm }` |
| GET | `/admin/mail/templates/{key}/test-sends/{testId}` | Poll actor-owned test |
| POST | `/admin/mail/templates/{key}/publish` | Publish with revision/version/reason/confirm |
| GET | `/admin/mail/templates/{key}/versions` | Cursor history, maximum 100 |
| GET | `/admin/mail/templates/{key}/versions/{version}` | Immutable version |
| POST | `/admin/mail/templates/{key}/restore` | Copy old version to a new draft |

The response uses `{ success, message, data }`. Expected errors include
`SUPER_ADMIN_REQUIRED`, `CSRF_INVALID`, `RECENT_AUTH_REQUIRED`,
`VALIDATION_ERROR`, `EMAIL_TEMPLATE_NOT_FOUND`, `EMAIL_TEMPLATE_CONFLICT`,
`IDEMPOTENCY_CONFLICT`, `TEST_RECIPIENT_UNAVAILABLE`, and `RATE_LIMITED`.
Conflicts never overwrite another editor's draft.

## Operations and privacy

Run `npm run mail:work` to process password-reset, Resume, and template-test jobs.
Starter and OTP remain synchronous. Test jobs can remain queued until the worker
runs. SMTP configuration stays in `.env` and is never returned by the API.

Version/audit records contain structured template content, actor public ID,
reason, request ID, and timestamps. They never contain rendered OTP codes,
password reset links, Starter access tokens, recipients, or SMTP credentials.
Do not add the four template tables to generic `/admin/data` CRUD.

No real email was sent during source implementation. Mailbox rendering across
Gmail/Outlook/mobile remains a separate UAT gate.
