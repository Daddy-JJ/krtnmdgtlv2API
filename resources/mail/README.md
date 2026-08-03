# Mail Templates
Server-owned templates only. Escape all values, provide text alternatives, use canonical HTTPS links, and never log rendered OTP messages.

Resume notification keys are `resume.completed` and
`resume.retention-{30|7|1}-days`. The worker builds canonical authenticated
member links from `APP_URL`; document content, storage paths, and internal notes
must never be included in mail payloads.
