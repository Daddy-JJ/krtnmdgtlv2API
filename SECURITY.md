# Backend Security Policy

Updated: 2026-09-21

Pre-release hardening and coordinated rollout requirements are documented in
[Security remediation](docs/SECURITY-REMEDIATION.md). This is not a production
penetration-test certification.

- Never commit or print `.env`, credentials, JWT keys, cookies, OTPs, payment
  tokens, Starter management tokens, database dumps, or user files.
- Authentication secrets stay in Secure HttpOnly cookies; unsafe
  cookie-authenticated requests require session-bound CSRF.
- CORS is an exact origin allowlist with credentials; wildcard origins are
  forbidden.
- Browser plan, role, payment state, slug ownership, file path, and WhatsApp URL
  are never authoritative.
- Starter slugs contain only seven random ASCII letters and no personal data.
- QR contains only the canonical public URL and errors expose no internal path,
  stack, SQL, or private record.
- Database tests may target only a separately guarded `*_test` database.
- Private API requests validate the active database session, not only the JWT.
- Generic table administration is read-only; sensitive columns cannot be
  returned, searched, filtered, sorted or mutated through that surface.
- Email change requires current password and recent authentication; changing it
  revokes sessions, reset tokens and OTPs. Reset email links use fragments.
- Document signature checks are not malware scans. Resume files require a
  completed antivirus scan before use; unavailable scanners fail closed.
- Migration requires verified target identity and a successful local backup;
  destructive migration or seed is prohibited without explicit approval.
