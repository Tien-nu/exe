import { randomUUID } from "node:crypto"
import { database, transaction } from "../mongodb"
import { ApiError } from "../http"
import { weekStartVietnam, payoutAmounts } from "../domain/order-rules"
import { enqueue } from "./sub-orders"

export async function generatePayouts(now = new Date()) {
  const db = await database()
  const cutoff = weekStartVietnam(now)
  const artisans = await db.collection("sub_orders").distinct("artisan_id", {
    status: "completed", payment_mode: { $ne: "simulation" }, payout_id: null, completed_at: { $lt: cutoff },
  })
  const created: string[] = []
  for (const artisanId of artisans) {
    const id = await transaction(async (db, session) => {
      const rows = await db.collection("sub_orders").find({ artisan_id: artisanId,
        status: "completed", payment_mode: { $ne: "simulation" }, payout_id: null, completed_at: { $lt: cutoff },
      }, { session }).toArray()
      if (!rows.length) return null
      const artisan = await db.collection("artisans").findOne({ id: artisanId }, { session })
      if (!artisan) throw new ApiError(409, "Missing artisan details")
      const settings = await db.collection("marketplace_settings").findOne({}, { session })
      if (!settings) throw new ApiError(409, "Payout settings have not been migrated")
      const feePercent = Number(settings.platform_fee_percent ?? 0)
      const amounts = payoutAmounts(rows.map((row) => Number(row.subtotal)), feePercent)
      const payoutId = `pay_${randomUUID()}`
      const earliest = new Date(Math.min(...rows.map((row) => +new Date(row.completed_at))))
      await db.collection("payouts").insertOne({ id: payoutId, artisan_id: artisanId,
        period_start: weekStartVietnam(earliest), period_end: cutoff, sub_order_count: rows.length,
        ...amounts, fee_percent: feePercent, bank_name: artisan.bank_name,
        bank_account_number: artisan.bank_account_number, bank_account_name: artisan.bank_account_name,
        status: "pending", created_at: now, updated_at: now,
      }, { session })
      const assigned = await db.collection("sub_orders").updateMany({ id: { $in: rows.map((row) => row.id) }, payout_id: null }, {
        $set: { payout_id: payoutId },
      }, { session })
      if (assigned.modifiedCount !== rows.length) throw new ApiError(409, "A payout is being processed concurrently")
      await enqueue(db, session, `payout:${payoutId}:generated`, "payout_generated", { payout_id: payoutId })
      return payoutId
    })
    if (id) created.push(id)
  }
  return created
}

export async function markPayoutPaid(id: string, transactionRef: string) {
  if (!transactionRef.trim() || transactionRef.length > 500) throw new ApiError(400, "Please enter the transaction reference")
  return transaction(async (db, session) => {
    const payout = await db.collection("payouts").findOneAndUpdate({ id, status: "pending" }, {
      $set: { status: "paid", transaction_ref: transactionRef.trim(), paid_at: new Date() },
    }, { session, returnDocument: "after" })
    if (!payout) throw new ApiError(409, "This payout does not exist or has already been paid")
    await enqueue(db, session, `payout:${id}:paid`, "payout_paid", { payout_id: id })
    const { _id, ...result } = payout
    return { payout: result }
  })
}
