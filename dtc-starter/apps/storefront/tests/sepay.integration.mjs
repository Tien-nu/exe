import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

test(
  "verified bank receipt is atomic, deduplicated and rejects incorrect or late transfers",
  { skip: process.env.RUN_MONGO_INTEGRATION !== "true" },
  async () => {
    assert.ok(process.env.MONGODB_DB?.endsWith("_staging"))
    const { database } = await import("../src/server/mongodb.ts")
    const { receiveSepay } = await import("../src/server/sepay.ts")
    const db = await database()
    const settings = await db.collection("marketplace_settings").findOne({})
    assert.ok(
      settings?.bank_account_number,
      "Existing receiving account required; do not modify it"
    )
    const prefix = `qa_sepay_${randomUUID()}`
    const display = Date.now()
    const keys = []
    const nativeId = `${prefix}_order`,
      marketId = `${prefix}_market`,
      subId = `${prefix}_sub`
    const receipt = (patch = {}) => {
      const id = display + keys.length + 1
      keys.push(`bank:sepay:${id}`)
      return {
        id,
        accountNumber: settings.bank_account_number,
        transferAmount: 103000,
        transferType: "in",
        content: `YARNLY ${display}`,
        ...patch,
      }
    }
    try {
      await db
        .collection("orders")
        .insertOne({
          id: nativeId,
          total: 103000,
          payment_status: "awaiting",
          payment_collection: { id: `${prefix}_pay`, amount: 103000 },
        })
      await db
        .collection("marketplace_orders")
        .insertOne({
          id: marketId,
          order_id: nativeId,
          display_id: display,
          currency_code: "vnd",
          payment_method: "bank_transfer",
          payment_status: "awaiting_transfer",
          payment_deadline: new Date(Date.now() + 600000),
        })
      await db
        .collection("sub_orders")
        .insertOne({
          id: subId,
          marketplace_order_id: marketId,
          code: "QA",
          status: "pending_payment",
          subtotal: 85000,
          shipping_charged: 18000,
          is_custom: false,
        })
      for (const [patch, result] of [
        [{ transferAmount: 85000 }, "amount_mismatch"],
        [{ accountNumber: "wrong" }, "account_mismatch"],
        [{ transferType: "out" }, "outgoing"],
        [{ content: "unrelated" }, "unmatched"],
      ]) {
        const event = receipt(patch)
        assert.deepEqual(await receiveSepay(event), { success: true })
        assert.equal(
          (
            await db
              .collection("outbox")
              .findOne({ deduplication_key: `bank:sepay:${event.id}` })
          ).data.result,
          result
        )
        assert.equal(
          (await db.collection("marketplace_orders").findOne({ id: marketId }))
            .payment_status,
          "awaiting_transfer"
        )
      }
      const good = receipt()
      await Promise.all([receiveSepay(good), receiveSepay(good)])
      assert.equal(
        await db
          .collection("outbox")
          .countDocuments({ deduplication_key: `bank:sepay:${good.id}` }),
        1
      )
      assert.equal(
        (await db.collection("marketplace_orders").findOne({ id: marketId }))
          .payment_status,
        "paid"
      )
      const native = await db.collection("orders").findOne({ id: nativeId })
      assert.equal(native.payment_status, "captured")
      assert.equal(native.payment_collection.captured_amount, 103000)
      assert.notEqual(
        (await db.collection("sub_orders").findOne({ id: subId })).status,
        "pending_payment"
      )
      await db
        .collection("marketplace_orders")
        .updateOne(
          { id: marketId },
          {
            $set: {
              payment_status: "awaiting_transfer",
              payment_deadline: new Date(Date.now() - 1000),
            },
          }
        )
      const late = receipt()
      await receiveSepay(late)
      assert.equal(
        (
          await db
            .collection("outbox")
            .findOne({ deduplication_key: `bank:sepay:${late.id}` })
        ).data.result,
        "late_payment"
      )
      assert.equal(
        (await db.collection("marketplace_orders").findOne({ id: marketId }))
          .payment_status,
        "awaiting_transfer"
      )
    } finally {
      await db.collection("orders").deleteOne({ id: nativeId })
      await db.collection("marketplace_orders").deleteOne({ id: marketId })
      await db.collection("sub_orders").deleteOne({ id: subId })
      await db
        .collection("outbox")
        .deleteMany({
          deduplication_key: {
            $in: [...keys, `sub:${subId}:paid`, `payment:${marketId}:paid`],
          },
        })
      await globalThis.yarnlyMongo?.then((pool) => pool.close())
      delete globalThis.yarnlyMongo
    }
  }
)
