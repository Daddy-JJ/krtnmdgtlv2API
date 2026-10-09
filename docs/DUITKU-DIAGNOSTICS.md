# Duitku safe diagnostics

2026-10-09 local patch only, no live request or deployment. Official API docs
https://docs.duitku.com/api/id/ confirm status endpoint hosts and HMAC-SHA256.
Form specification conflicts with JSON examples; encoding is unchanged, no retry.

Event payment.gateway-request-failed uses JSON logger stderr / Passenger logs.
Only provider, environment, operation, category, http_status, duration_ms logged.
Categories: timeout, dns, tls, connection, transport, http_error,
response_too_large, empty_body, body_read, invalid_json. No raw exceptions,
messages, bodies, headers, secrets, signatures, orders, references, URLs or PII.
Client remains 503 PAYMENT_GATEWAY_UNAVAILABLE. Schema errors remain 502.
No change to ownership, cooldown, historical routing, locking or entitlement.
HTTP 404 is not proof of cancellation. Preserve pending when evidence is absent.

Correlate timestamp/environment/operation with request.failed; no adapter request
ID, so concurrent requests cannot be conclusively linked. Deploy and one owner
reconcile require separate approval. Never delete history or rotate intent keys
to bypass a conflict. Live root cause is not yet verified.

## Dependency remediation

2026-10-09: Sharp pinned 0.35.5 and Express transitive proxy-addr locked to 2.0.8
within its supported dependency range. No audit fix --force was used.
References: https://github.com/advisories/GHSA-wq5f-xc86-pv6w and
https://github.com/advisories/GHSA-jqcg-44mw-7w3h . Regression covers mapped IPv6
spoof rejection, trusted IPv4/mapped addresses, bounded image conversion and
malformed-image rejection. Windows QA is not Linux native-binary verification;
approved deployment must install lockfile dependencies and smoke-test logo/QR.
