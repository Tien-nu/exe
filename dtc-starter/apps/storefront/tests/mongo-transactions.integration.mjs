import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { MongoClient } from "mongodb"

const enabled = process.env.RUN_MONGO_INTEGRATION === "true"

test("MongoDB: concurrent payment/acceptance and cancellation are atomic", { skip: !enabled }, async () => {
  assert.ok(process.env.MONGODB_URI, "MONGODB_URI is required")
  assert.ok(process.env.MONGODB_DB?.endsWith("_staging"), "Tests require a staging database")
  const { changePayment } = await import("../src/server/workflows/payments.ts")
  const { changeSubOrder } = await import("../src/server/workflows/sub-orders.ts")
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 })
  const prefix = `migration_test_${randomUUID()}`
  const id = (suffix) => `${prefix}_${suffix}`
  const now = new Date()
  const db = client.db(process.env.MONGODB_DB)
  try {
    await client.connect()
    await db.collection("orders").insertOne({ id: id("order"), cart_id: id("cart"), status: "pending" })
    await db.collection("marketplace_orders").insertOne({ id: id("mpo"), order_id: id("order"), customer_id: id("customer"), payment_method: "bank_transfer", payment_status: "awaiting_transfer", payment_deadline: new Date(+now + 60_000) })
    await db.collection("sub_orders").insertOne({ id: id("sub"), marketplace_order_id: id("mpo"), artisan_id: id("artisan"),
      status: "pending_payment", is_custom: false, lead_days: 3,
      items: [{ line_item_id: id("line"), variant_id: id("variant"), made_to_order: false }],
    })
    await db.collection("inventory").insertOne({ variant_id: id("variant"), stock: 10, reserved: 2 })
    await db.collection("reservations").insertOne({ line_item_id: id("line"), variant_id: id("variant"), quantity: 2 })
    const payments = await Promise.allSettled([
      changePayment(id("mpo"), "confirm", { role: "admin", id: id("admin") }),
      changePayment(id("mpo"), "confirm", { role: "admin", id: id("admin") }),
    ])
    assert.equal(payments.filter((result) => result.status === "fulfilled").length, 1)
    assert.equal((await db.collection("marketplace_orders").findOne({ id: id("mpo") })).payment_status, "paid")
    assert.equal((await db.collection("sub_orders").findOne({ id: id("sub") })).status, "pending_acceptance")
    assert.equal(await db.collection("outbox").countDocuments({ deduplication_key: `payment:${id("mpo")}:paid` }), 1)
    await assert.rejects(changeSubOrder(id("sub"), "accept", { role: "artisan", id: id("other") }), (error) => error.status === 404)
    const cancellations = await Promise.allSettled([
      changeSubOrder(id("sub"), "cancel", { role: "customer", id: id("customer") }),
      changeSubOrder(id("sub"), "cancel", { role: "customer", id: id("customer") }),
    ])
    assert.equal(cancellations.filter((result) => result.status === "fulfilled").length, 1)
    const sub = await db.collection("sub_orders").findOne({ id: id("sub") })
    assert.equal(sub.status, "canceled")
    assert.equal(sub.refund_status, "pending")
    const inventory = await db.collection("inventory").findOne({ variant_id: id("variant") })
    assert.equal(inventory.stock, 10)
    assert.equal(inventory.reserved, 0)
    assert.equal(await db.collection("reservations").countDocuments({ line_item_id: id("line") }), 0)
    assert.equal((await db.collection("orders").findOne({ id: id("order") })).status, "canceled")
  } finally {
    // Delete only records created by this test. Never clear a collection.
    for (const collection of ["orders", "marketplace_orders", "sub_orders"]) await db.collection(collection).deleteMany({ id: { $in: [id("order"), id("mpo"), id("sub")] } }).catch(() => {})
    await db.collection("inventory").deleteMany({ variant_id: id("variant") }).catch(() => {})
    await db.collection("reservations").deleteMany({ line_item_id: id("line") }).catch(() => {})
    await db.collection("outbox").deleteMany({ deduplication_key: { $in: [`payment:${id("mpo")}:paid`, `sub:${id("sub")}:paid`, `sub:${id("sub")}:cancel`] } }).catch(() => {})
    await client.close()
    // Close the application's separate pool so the test process can finish.
    await globalThis.yarnlyMongo?.then((pool) => pool.close())
    delete globalThis.yarnlyMongo
  }
})
