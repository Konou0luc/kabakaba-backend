# Security patch SEC-40 → SEC-44

## SEC-40 — Atomic refunds
Refunds initiated by vendors and dispute resolutions now run at SERIALIZABLE transaction isolation to prevent concurrent refunds from racing on the vendor balance. The existing order/dispute claim remains atomic.

## SEC-41 — Withdrawal completion
The admin status endpoint no longer permits an administrator to force a withdrawal to COMPLETED. Admins can move withdrawals to PROCESSING or FAILED only. COMPLETED must come from a future provider-confirmation flow.

## SEC-42 — Payout idempotency
Withdrawals now have a unique optional payoutReference plus payoutRequestedAt/payoutCompletedAt. When an admin moves a withdrawal to PROCESSING, the withdrawal id is used as the stable idempotency reference and is recorded once.

## SEC-43/44 — Provider confirmation hardening
No manual endpoint is added to fake a provider success. COMPLETED remains unavailable to the admin status endpoint until an authenticated provider/webhook confirmation flow is implemented. This avoids creating a false sense of payout verification.

## SEC-45 — Payout FedaPay réel et idempotent

- Le passage manuel à `PROCESSING` déclenche désormais le payout FedaPay.
- `merchant_reference` = ID interne du retrait pour rendre les retries idempotents.
- Avant toute création, le backend recherche un payout existant par `merchant_reference`.
- `COMPLETED` et `FAILED` ne sont plus pilotables manuellement : ils proviennent du statut FedaPay.
- `POST /withdrawals/:id/sync` resynchronise le statut réel FedaPay.
- Un payout FedaPay `failed` recrédite le montant exactement débité.
- Un payout FedaPay `sent` clôture le retrait et la transaction miroir.
- L'opérateur et le montant payout sont conservés au moment de la demande de retrait.

### Préproduction obligatoire

- Activer la fonctionnalité Payout sur le compte FedaPay.
- Configurer `FEDAPAY_SECRET_KEY` et `FEDAPAY_BASE_URL`.
- Tester en sandbox avant toute activation live.
- Vérifier les numéros Mobile Money et les méthodes `moov_tg` / `togocel`.
