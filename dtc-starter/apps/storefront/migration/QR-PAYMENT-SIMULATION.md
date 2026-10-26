# QR payment simulation for the coursework presentation

This is an educational simulation. No bank transfer, gateway charge, refund, or seller payout is performed by scanning a QR. The customer-facing interface uses ordinary payment wording, as requested; the database retains explicit simulation flags.

## Configuration

- `PAYMENT_MODE=simulation` enables the scan flow for newly created orders.
- `PAYMENT_MODE=bank` disables this flow. Existing bank orders cannot be confirmed with a simulation QR.
- `QR_PAYMENT_BASE_URL` is the phone-accessible origin, such as the computer's LAN URL on port 8000 when both devices use the same Wi-Fi. Use the public HTTPS origin after deployment. A phone cannot access the computer through `localhost`.
- Existing `AUTH_SECRET` signs order-specific QR capabilities. No new account or payment service registration is required.

## Presentation

1. Create a new order; older bank orders remain bank orders.
2. The order page displays a payment QR and the amount, reference and countdown.
3. Scan the QR using the phone camera and open the detected link. A banking app cannot process this URL QR as a bank transfer.
4. The phone automatically submits the signed order capability and shows “Payment successful”. No confirmation button is needed.
5. The original order page polls every three seconds and displays the successful payment state. Admin Orders and the seller order status also update.

The web cannot detect a camera merely viewing an image. Opening the recognized link is required. There is no timer that automatically pays an order without the QR link being opened.

## Data and controls

- New orders and sub-orders retain `payment_mode: simulation`; native order metadata includes `is_simulated: true`.
- Confirmation adds `payment_provider: simulation`, `is_simulated: true`, `payment_verified_by: simulation-qr` and updates the standard order/sub-order states transactionally.
- Signed capabilities expire with the payment window, cannot target a different order, and are idempotent under concurrent retries. Turning the mode off rejects existing capabilities.
- GET of the QR landing page is read-only, including link previews. The loaded page sends the scoped POST automatically. No customer identity or bank account data is exposed on this page.
- Image generation is local to the application. Tokens are not sent to a third-party QR service. Responses are not cached and do not send referrers.
- Simulated sub-orders are excluded from seller payout generation. Payment-confirmation emails are not sent by the simulation flow.
- SePay callbacks cannot confirm simulated orders. Existing real bank orders are unchanged.
- Never describe this configuration as verification of actual bank receipt. Switch to `bank` and configure the real provider before accepting real payments.

## Tests

```sh
node --import tsx --test tests/*.test.mjs
RUN_MONGO_INTEGRATION=true node --env-file=.env.local --import tsx --test tests/qr-payments.integration.mjs
```

Integration tests create only scoped QA records in an existing staging database and remove those records afterward. No external payment calls are made.
