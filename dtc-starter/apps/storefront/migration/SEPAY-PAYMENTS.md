# Real bank transfer payments

The receiving account remains the account saved in Admin > Payouts. No new bank account is required. The VietQR image and webhook verification use those existing settings. SePay must be linked to that same account; verify that your bank supports the connection before activating it.

## Activation

1. Create a SePay account and link the existing receiving bank account. Do not replace the website's bank details with sample details.
2. Set `PAYMENT_MODE=bank` in local and Vercel environments before creating real orders. This disables the educational QR confirmation flow. Orders already created with `payment_mode: simulation` remain simulations; use a new order for real verification.
3. Generate a random secret of at least 32 characters. Set `SEPAY_WEBHOOK_API_KEY` in the storefront's ignored `.env.local` and in Vercel's server environment. Never prefix it with `NEXT_PUBLIC_` or commit it.
4. Deploy the Next.js application to your HTTPS domain with MongoDB configured and `MONGODB_API_PREVIEW=true`. Redeploy after changing environment variables.
5. In SePay > Webhooks, add the event "Có tiền vào", choose the existing receiving account, and use `https://YOUR_DOMAIN/api/payments/sepay` as the URL.
6. Select API Key authentication and enter the same secret. Do not select unauthenticated webhooks. SePay sends `Authorization: Apikey YOUR_SECRET`.
7. Create a new website order. Transfer exactly the displayed amount including shipping, with the exact `YARNLY <order number>` reference before the ten-minute deadline. The account holder performs this real transfer. Check SePay's webhook log for HTTP 200 and `{"success":true}`, then verify the website and Admin Orders both show payment received.

SePay cannot call a localhost URL directly. A public HTTPS deployment is required for activation. A provider test payload validates connectivity only; it is not evidence that actual money was received. The code rejects mock transaction ID 0.

Official setup and authentication: https://docs.sepay.vn/tich-hop-webhooks.html

## Behavior and reconciliation

- Removed the former 15-second simulated confirmation. The browser now only refreshes server state; customers cannot confirm payment through the old transfer-submitted endpoint.
- A verified incoming webhook must match the configured bank account, one unambiguous order reference, VND currency, the exact outstanding amount and a pending order within its payment window.
- Confirmation, native Admin payment state, seller sub-orders, notification events and the bank receipt commit in one MongoDB transaction.
- Deduplication uses SePay's transaction ID and the existing unique `outbox.deduplication_key` index. Confirm this index exists with `scripts/check-mongodb.mjs` before activation.
- Unknown, wrong-amount, wrong-account, extra or late transfers never automatically release an order. They are recorded as terminal `bank_receipt` rows in the existing outbox with `data.requires_review=true`. An operator must reconcile them with actual bank statements. No automatic refund is implemented.
- Admin manual confirmation remains available for statement-based reconciliation. The native order records `payment_verified_by` to distinguish admin from SePay confirmation. Do not confirm solely because a customer reports payment.
- If the receiving account is changed while orders are pending, reconcile transfers to the previous account manually. Webhooks always validate against the current saved account.
- Previously simulated paid orders are not retroactively verified by this change. Reconcile old payments against bank statements before treating them as received.
- Email delivery remains controlled separately by `EMAIL_DELIVERY_ENABLED`.

Review receipts in Atlas Data Explorer, collection `outbox`, filter:

```json
{"type":"bank_receipt","data.requires_review":true}
```

A webhook HTTP 200 acknowledges that a receipt was processed or recorded for review; it does not mean every received transfer paid an order. Inspect `data.result` for the outcome. Receipt records do not enter the notification worker.

## Verification

```sh
node --import tsx --test tests/sepay.test.mjs
RUN_MONGO_INTEGRATION=true node --env-file=.env.local --import tsx --test tests/sepay.integration.mjs
```

The integration test requires a database name ending `_staging`. It creates scoped QA orders in existing collections, reads the receiving account without changing it, and removes only its own fixture records. It checks incorrect amount/account, outgoing/unmatched transfers, concurrent duplicate delivery, native/seller state changes and late payments. It never calls a bank or moves money.
