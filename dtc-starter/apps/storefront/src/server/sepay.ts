import { timingSafeEqual } from "node:crypto"
import { ApiError } from "./http"
import { transaction } from "./mongodb"
import { changePaymentInTransaction } from "./workflows/payments"

export function authenticateSepay(
  header: string | null,
  secret = process.env.SEPAY_WEBHOOK_API_KEY
) {
  if (!secret || secret.length < 32)
    throw new ApiError(503, "Bank payment verification is not configured")
  const actual = new TextEncoder().encode(header ?? "")
  const expected = new TextEncoder().encode(`Apikey ${secret}`)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new ApiError(401, "Invalid webhook authentication")
}

export function parseSepay(input: Record<string, unknown>) {
  if (
    !Number.isSafeInteger(input.id) ||
    Number(input.id) <= 0 ||
    !Number.isSafeInteger(input.transferAmount) ||
    Number(input.transferAmount) <= 0 ||
    typeof input.accountNumber !== "string" ||
    !input.accountNumber ||
    input.accountNumber.length > 100 ||
    typeof input.content !== "string" ||
    input.content.length > 4000 ||
    !["in", "out"].includes(String(input.transferType))
  )
    throw new ApiError(400, "Invalid bank transaction")
  const matches = [
    ...input.content.toUpperCase().matchAll(/\bYARNLY\s*(\d+)\b/g),
  ]
  const references = [...new Set(matches.map((match) => Number(match[1])))]
  return {
    id: Number(input.id),
    amount: Number(input.transferAmount),
    account: input.accountNumber,
    incoming: input.transferType === "in",
    displayId:
      references.length === 1 && Number.isSafeInteger(references[0])
        ? references[0]
        : null,
  }
}

export async function receiveSepay(input: Record<string, unknown>) {
  const event = parseSepay(input)
  return transaction(async (db, session) => {
    const key = `bank:sepay:${event.id}`
    const previous = await db
      .collection("outbox")
      .findOne({ deduplication_key: key }, { session })
    if (previous) return { success: true }
    let result = "unmatched"
    const settings = await db
      .collection("marketplace_settings")
      .findOne({}, { session })
    const account = settings?.bank_account_number?.trim()
    if (!account)
      throw new ApiError(503, "Receiving bank account is not configured")
    const order =
      event.displayId === null
        ? null
        : await db
            .collection("marketplace_orders")
            .findOne({ display_id: event.displayId }, { session })
    if (!event.incoming) result = "outgoing"
    else if (event.account !== account) result = "account_mismatch"
    else if (order) {
      const subs = await db
        .collection("sub_orders")
        .find(
          { marketplace_order_id: order.id, status: { $ne: "canceled" } },
          { session }
        )
        .toArray()
      const amount = subs.reduce(
        (sum, sub) =>
          sum + Number(sub.subtotal) + Number(sub.shipping_charged ?? 0),
        0
      )
      if (order.payment_mode === "simulation") result = "simulated_order"
      else if (order.currency_code !== "vnd") result = "unsupported_currency"
      else if (order.payment_method !== "bank_transfer")
        result = "wrong_payment_method"
      else if (order.payment_status === "paid") result = "already_paid"
      else if (
        !["awaiting_transfer", "transfer_submitted"].includes(
          order.payment_status
        ) ||
        !order.payment_deadline ||
        +new Date(order.payment_deadline) <= Date.now()
      )
        result = "late_payment"
      else if (event.amount !== amount || amount <= 0)
        result = "amount_mismatch"
      else {
        await changePaymentInTransaction(db, session, order.id, "confirm", {
          role: "system",
          id: `sepay:${event.id}`,
        })
        await db
          .collection("marketplace_orders")
          .updateOne(
            { id: order.id },
            {
              $set: {
                payment_provider: "sepay",
                bank_transaction_id: event.id,
              },
            },
            { session }
          )
        result = "paid"
      }
    }
    // Use the existing unique outbox key as a durable bank receipt ledger.
    // These rows are terminal and are never picked up by the mail worker.
    await db
      .collection("outbox")
      .insertOne(
        {
          deduplication_key: key,
          type: "bank_receipt",
          status: "completed",
          created_at: new Date(),
          data: {
            provider: "sepay",
            transaction_id: event.id,
            amount: event.amount,
            display_id: event.displayId,
            order_id: order?.order_id ?? null,
            result,
            requires_review: event.incoming && result !== "paid",
          },
        },
        { session }
      )
    return { success: true }
  })
}
