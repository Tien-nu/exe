import { transaction } from "./mongodb"
import { ApiError } from "./http"
import { verifyQrPaymentToken } from "./qr-payment-token"
import { changePaymentInTransaction } from "./workflows/payments"

export async function completeQrPayment(token: string) {
  const { id, exp } = verifyQrPaymentToken(token)
  return transaction(async (db, session) => {
    const order = await db
      .collection("marketplace_orders")
      .findOne({ id }, { session })
    if (!order || order.payment_mode !== "simulation")
      throw new ApiError(404, "QR payment order not found")
    if (+new Date(order.payment_deadline) !== exp)
      throw new ApiError(401, "Invalid payment QR")
    if (
      order.payment_status === "paid" &&
      order.payment_provider === "simulation"
    )
      return { success: true }
    if (
      order.payment_status !== "awaiting_transfer" ||
      +new Date(order.payment_deadline) <= Date.now()
    )
      throw new ApiError(409, "This order is no longer awaiting payment")
    await changePaymentInTransaction(db, session, order.id, "confirm", {
      role: "system",
      id: "simulation-qr",
    })
    await db
      .collection("marketplace_orders")
      .updateOne(
        { id },
        { $set: { payment_provider: "simulation", is_simulated: true } },
        { session }
      )
    await db
      .collection("orders")
      .updateOne(
        { id: order.order_id },
        {
          $set: {
            "metadata.payment_mode": "simulation",
            "metadata.is_simulated": true,
            "payment_collection.is_simulated": true,
          },
        },
        { session }
      )
    return { success: true }
  })
}
