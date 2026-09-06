# Mail Templates
Server-owned templates only. Escape all values, provide text alternatives, use canonical HTTPS links, and never log rendered OTP messages.

Versioned structured templates are implemented under
`src/modules/email/templates/`; see `docs/EMAIL-TEMPLATES.md`. Keep
`EMAIL_TEMPLATES_ENABLED=false` until migration 010 is applied. Built-in defaults
remain the safe fallback. Do not create a parallel mail renderer here.

Resume notification keys are `resume.completed` and
`resume.retention-{30|7|1}-days`. The worker builds canonical authenticated
member links from `APP_URL`; document content, storage paths, and internal notes
must never be included in mail payloads.
