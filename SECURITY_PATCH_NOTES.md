# Security patch SEC-40 → SEC-44

## SEC-40 — Atomic refunds
Refunds initiated by vendors and dispute resolutions now run at SERIALIZABLE transaction isolation to prevent concurrent refunds from racing on the vendor balance. The existing order/dispute claim remains atomic.

## SEC-41 — Withdrawal completion
The admin status endpoint no longer permits an administrator to force a withdrawal to COMPLETED. Admins can move withdrawals to PROCESSING or FAILED only. COMPLETED must come from a future provider-confirmation flow.

## SEC-42 — Payout idempotency
Withdrawals now have a unique optional payoutReference plus payoutRequestedAt/payoutCompletedAt. When an admin moves a withdrawal to PROCESSING, the withdrawal id is used as the stable idempotency reference and is recorded once.

## SEC-43/44 — Provider confirmation hardening
No manual endpoint is added to fake a provider success. COMPLETED remains unavailable to the admin status endpoint until an authenticated provider/webhook confirmation flow is implemented. This avoids creating a false sense of payout verification.
