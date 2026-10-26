# Native Orders fulfillment repair — 25 October 2026

## Cause and fix

The original Medusa form dereferences `shipping_option.service_zone.fulfillment_set.location.id`. The MongoDB adapter returned a flat shipping option, so opening Fulfill items crashed. It also lacked the native fulfillment write endpoints.

The adapter now restores those relationships from the migrated warehouse, service zone, fulfillment set and shipping profile records. Item variants, inventory locations and reservation IDs use consistent shapes for the native form. Historical fulfilled/shipped/delivered quantities remain part of the baseline.

Supported native endpoints:

- `POST /admin/orders/:id/fulfillments`
- `POST /admin/orders/:id/fulfillments/:fulfillmentId/cancel`
- `POST /admin/orders/:id/fulfillments/:fulfillmentId/shipments`
- `POST /admin/orders/:id/fulfillments/:fulfillmentId/mark-as-delivered`

Order writes, stock deductions, reservation changes, marketplace states and queued notifications commit in one MongoDB transaction. Native shipment/delivery actions do not deduct stock a second time. Canceling an unshipped fulfillment restores stock and reservations once. Shared marketplace actions cannot cancel or consume inventory belonging to an active native fulfillment.

## How to test in the UI

1. Reload Admin → Orders. Open an order that is eligible for fulfillment. For bank transfers, payment must already be confirmed.
2. Open **Fulfill items**. Check the actual warehouse, shipping method, quantities, **Available** and **In stock**. Choose **Create Fulfillment**.
3. Confirm the order shows **Fulfilled** or **Partially fulfilled**, with a fulfillment card showing **Awaiting shipping**.
4. When the parcel is dispatched, choose **Mark as shipped**, enter the actual tracking details and save. Choose **Mark as delivered** only after delivery.
5. To undo packing before shipment, cancel that fulfillment. Its quantities become available for fulfillment again, with stock and reservations restored.

Shipping and warehouse labels are kept from the existing configuration. A legacy option may still be named GHN. These native actions record fulfillment and manually entered tracking; they do not book a GHN pickup or purchase a shipping label. Regional checkout fees remain unchanged. SMTP delivery remains disabled; requested notifications are queued.

## Verification

- Browser: opened the previously failing form on order #92 without changing it.
- Browser: submitted Create Fulfillment for a separate QA order with its own hidden product and inventory; verified one fulfillment, stock 2 → 1 and reservation 1 → 0 in MongoDB. QA records are removed after verification.
- `tests/admin-fulfillment.integration.mjs`: warehouse relationships, role checks, quantities, payment guard, partial fulfillment, concurrent requests, cancellation and idempotent cancellation, shipment, delivery, historical quantities, made-to-order and unmanaged stock, notification queue, native total fields.
- Existing native admin and marketplace integration suites continue to pass.
- TypeScript, unit tests and production build checked.

## Boundaries

No existing order is fulfilled by QA. A historical fulfillment created before this migration is displayed with its real quantities; canceling that historical fulfillment is rejected until its stock has been reconciled. Stock without an unambiguous warehouse assignment is rejected instead of assigning it to an arbitrary warehouse. Returns, exchanges and payment capture are separate flows and are not implemented by this repair.
