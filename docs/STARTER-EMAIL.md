# Starter creation and email access

Local backend: `C:\xampp\htdocs\krtnmdgtlv2API`, API port 3000.
Frontend: `C:\xampp\htdocs\krtnmddgtlv2FE-SOT`, port 8080.

`POST /api/v1/starter/cards` commits a published card, then attempts SMTP
delivery. HTTP 201 includes `data.emailSent`, always a boolean. True means
the SMTP operation succeeded, not proof of inbox delivery. False means sending
failed or SMTP credentials are missing; the card and management cookies remain
valid. Do not repeat creation automatically after an email failure or timeout.

Set `MAIL_USERNAME` and `MAIL_PASSWORD` in the local `.env` using the hosting
mailbox credentials (not database credentials). Check `MAIL_HOST`, `MAIL_PORT`,
`MAIL_ENCRYPTION`, and `MAIL_FROM_ADDRESS`, then restart the backend.
`npm run mail:verify` verifies SMTP authentication/TLS without sending mail.
Starter email is sent during creation; `npm run mail:work` does not resend it.
Allow sufficient frontend request timeout for SMTP connection and delivery.

Email URL format:
`APP_URL/starter/manage/?publicId=<uuid>#token=<signed-token>`.
The fragment avoids placing the credential in ordinary HTTP URL logs.
The link expires after 24 hours and is bound to its card. It uses a
domain-separated AES-256-GCM key derived from `CSRF_HMAC_KEY`; changing this key
invalidates links. The cookie credential is encrypted inside the email token
so the token holder cannot bypass expiration by extracting a cookie value.

The frontend posts `{ "publicId": "<uuid>", "token": "<signed-token>" }`
to `/api/v1/starter/access` with `credentials: 'include'`. No existing cookie
or CSRF header is needed: the email token authorizes the exchange. The backend
rate limits access, checks the signature/deadline and database revocation state,
then rotates the opaque credential in a transaction. HTTP 200 installs
`starter_manage` (HttpOnly) and `starter_csrf_token`, returns card data only,
and uses `Cache-Control: no-store`. Replays and expired/invalid links return 401
`STARTER_TOKEN_INVALID`; invalid request shape returns 422; throttling returns 429.
Remove the fragment from browser history after successful exchange.

Token rotation also invalidates the original creation browser's management
cookie; continue claiming the card in the browser that opened the email.
Claiming or updating the card revokes/rotates the credential and invalidates its
old email link. Existing cards created before this implementation are not
automatically emailed. A resend/recovery workflow is not provided by this change.

Local public `/{slug}` must serve frontend `public-card/index.html` while
preserving the requested pathname and letter case. A PHP static server can
return the landing page for this path; verify its contents, not only HTTP 200.
The corresponding backend endpoint is `GET /api/v1/public/cards/{slug}`.
Frontend notices must check `emailSent === true` explicitly; an absent field
must never imply successful email delivery.
