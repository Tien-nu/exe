import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

test(
  "scan page requires no confirmation, GET is read-only, POST confirms only a signed simulation order once",
  { skip: process.env.RUN_MONGO_INTEGRATION !== "true" },
  async () => {
    assert.ok(process.env.MONGODB_DB?.endsWith("_staging"))
    const previousMode = process.env.PAYMENT_MODE
    const previousBaseUrl = process.env.QR_PAYMENT_BASE_URL
    process.env.PAYMENT_MODE = "simulation"
    const { database } = await import("../src/server/mongodb.ts")
    const { createQrPaymentToken } = await import(
      "../src/server/qr-payment-token.ts"
    )
    const { completeQrPayment } = await import("../src/server/qr-payments.ts")
    const page = await import("../src/app/api/payments/qr/route.ts")
    const image = await import("../src/app/api/payments/qr/image/route.ts")
    const db = await database()
    const prefix = `qa_qr_${randomUUID()}`,
      nativeId = `${prefix}_order`,
      marketId = `${prefix}_market`,
      subId = `${prefix}_sub`
    const deadline = new Date(Date.now() + 600000)
    const token = createQrPaymentToken({
      id: marketId,
      payment_deadline: deadline,
    })
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
          payment_mode: "bank",
          payment_status: "awaiting_transfer",
          payment_deadline: deadline,
        })
      await db
        .collection("sub_orders")
        .insertOne({
          id: subId,
          marketplace_order_id: marketId,
          status: "pending_payment",
          is_custom: false,
          payment_mode: "simulation",
          subtotal: 85000,
          shipping_charged: 18000,
        })
      await assert.rejects(completeQrPayment(token), (e) => e.status === 404)
      await db
        .collection("marketplace_orders")
        .updateOne({ id: marketId }, { $set: { payment_mode: "simulation" } })
      const request = new Request(
        `http://test/api/payments/qr?token=${encodeURIComponent(token)}`
      )
      const landing = await page.GET(request)
      assert.equal(landing.status, 200)
      const html = await landing.text()
      assert.match(html, /Processing payment/)
      assert.match(html, /method:'POST'/)
      assert.doesNotMatch(html, /<button|<form/i)
      assert.doesNotMatch(html, /demo|simulation/i)
      assert.equal(
        (await db.collection("marketplace_orders").findOne({ id: marketId }))
          .payment_status,
        "awaiting_transfer"
      )
      const svg = await image.GET(
        new Request(
          `http://test/api/payments/qr/image?token=${encodeURIComponent(token)}`
        )
      )
      assert.equal(svg.status, 200)
      assert.match(svg.headers.get("content-type"), /svg/)
      assert.match(await svg.text(), /<svg/)
      const blocked = await page.POST(
        new Request("http://test/api/payments/qr", {
          method: "POST",
          headers: {
            origin: "https://other.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({ token }),
        })
      )
      assert.equal(blocked.status, 403)
      const results = await Promise.all([
        completeQrPayment(token),
        completeQrPayment(token),
      ])
      assert.deepEqual(results, [{ success: true }, { success: true }])
      process.env.QR_PAYMENT_BASE_URL = "http://192.168.1.10:8000"
      const lanRetry = await page.POST(new Request("http://localhost:8000/api/payments/qr", {
        method: "POST", headers: { origin: "http://192.168.1.10:8000", "content-type": "application/json" }, body: JSON.stringify({ token }),
      }))
      assert.equal(lanRetry.status, 200)
      const paid = await db
        .collection("marketplace_orders")
        .findOne({ id: marketId })
      assert.equal(paid.payment_status, "paid")
      assert.equal(paid.payment_provider, "simulation")
      assert.equal(paid.is_simulated, true)
      const native = await db.collection("orders").findOne({ id: nativeId })
      assert.equal(native.payment_status, "captured")
      assert.equal(native.metadata.is_simulated, true)
      assert.equal(native.payment_collection.captured_amount, 103000)
      assert.equal(
        (await db.collection("sub_orders").findOne({ id: subId })).status,
        "pending_acceptance"
      )
      assert.equal(
        await db
          .collection("outbox")
          .countDocuments({
            deduplication_key: {
              $in: [`sub:${subId}:paid`, `payment:${marketId}:paid`],
            },
          }),
        0
      )
      process.env.PAYMENT_MODE = "bank"
      await assert.rejects(completeQrPayment(token), (e) => e.status === 404)
    } finally {
      await db.collection("orders").deleteOne({ id: nativeId })
      await db.collection("marketplace_orders").deleteOne({ id: marketId })
      await db.collection("sub_orders").deleteOne({ id: subId })
      await db
        .collection("outbox")
        .deleteMany({
          deduplication_key: {
            $in: [`sub:${subId}:paid`, `payment:${marketId}:paid`],
          },
        })
      await globalThis.yarnlyMongo?.then((pool) => pool.close())
      delete globalThis.yarnlyMongo
      if (previousBaseUrl === undefined) delete process.env.QR_PAYMENT_BASE_URL
      else process.env.QR_PAYMENT_BASE_URL = previousBaseUrl
      if (previousMode === undefined) delete process.env.PAYMENT_MODE
      else process.env.PAYMENT_MODE = previousMode
    }
  }
)
