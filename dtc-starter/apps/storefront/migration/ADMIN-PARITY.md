
## Real bank transfer verification — 26 October 2026

Removed the 15-second simulated bank confirmation and denied customer payment confirmation. Added authenticated SePay webhook `/api/payments/sepay`, using the existing bank account in marketplace settings. Exact amount/reference/account matching, transactional confirmation and receipt deduplication are implemented. See `SEPAY-PAYMENTS.md` for activation and reconciliation. Live verification still requires the merchant to link that same bank account to SePay, configure the secret and publish the HTTPS webhook; no live bank transfer has been performed by this implementation.

## Coursework QR simulation — 26 October 2026

An opt-in simulation now presents ordinary customer payment screens. New local orders use `PAYMENT_MODE=simulation`. Scanning and opening the signed QR link confirms the simulated order without a confirmation button; the desktop polls for the resulting state. Database flags distinguish it from bank receipt, and payout generation excludes simulated sub-orders. Real bank orders remain unchanged. See `QR-PAYMENT-SIMULATION.md`.
