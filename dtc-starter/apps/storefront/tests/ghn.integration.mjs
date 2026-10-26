import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { MongoClient } from "mongodb"

test("GHN booking retries and callbacks never consume stock twice", { skip: process.env.RUN_MONGO_INTEGRATION !== "true" }, async () => {
  assert.ok(process.env.MONGODB_DB?.endsWith("_staging"))
  process.env.GHN_API_TOKEN = "test-token"
  process.env.GHN_SHOP_ID = "123"
  process.env.GHN_WEBHOOK_TOKEN = randomUUID()
  const { ghnShipping } = await import("../src/server/ghn-shipping.ts")
  const { tokenFor } = await import("../src/server/auth.ts")
  const { changeSubOrder } = await import("../src/server/workflows/sub-orders.ts")
  const client = new MongoClient(process.env.MONGODB_URI)
  const db = client.db(process.env.MONGODB_DB), prefix = `ghn_test_${randomUUID()}`, id = (suffix) => `${prefix}_${suffix}`
  const originalFetch = globalThis.fetch, codes = []
  const identity = { id: id("auth"), email: `${prefix}@example.test`, password_hash: "unused", actors: { admin: id("admin") }, session_version: 0 }
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).includes("/shiip/public-api/"), "Only GHN calls may use the mock")
    const payload = JSON.parse(init.body)
    if (String(url).endsWith("/create")) { codes.push(payload.client_order_code); return Response.json({ code: 200, data: { order_code: id(`tracking_${payload.client_order_code}`), total_fee: 20000 } }) }
    assert.ok(String(url).endsWith("/cancel"))
    return Response.json({ code: 200, data: [] })
  }
  try {
    await client.connect()
    await db.collection("identities").insertOne(identity)
    await db.collection("artisans").insertOne({ id: id("artisan"), handle: id("shop"), email: `${prefix}-shop@example.test`, shop_name: "Test", phone: "0000000000", pickup_address: "Test", pickup_ward_name: "Ward", pickup_district_name: "District", pickup_province_name: "Province" })
    await db.collection("orders").insertOne({ id: id("order"), shipping_address: { phone: "0000000000", address_1: "Test" }, metadata: { district_id: 123, ward_code: "1" } })
    await db.collection("marketplace_orders").insertOne({ id: id("marketplace"), order_id: id("order"), customer_id: id("customer"), payment_method: "cod" })
    await db.collection("sub_orders").insertOne({ id: id("sub"), code: prefix.slice(-12), artisan_id: id("artisan"), marketplace_order_id: id("marketplace"), status: "ready_to_ship", subtotal: 100000, shipping_charged: 20000, items: [{ line_item_id: id("line"), variant_id: id("variant"), title: "Test", quantity: 1, unit_price: 100000 }] })
    await db.collection("inventory").insertOne({ variant_id: id("variant"), stock: 5, reserved: 1 })
    await db.collection("reservations").insertOne({ id: id("reservation"), line_item_id: id("line"), variant_id: id("variant"), quantity: 1 })
    const token = await tokenFor(identity, "admin")
    const call = (action) => ghnShipping(new Request("http://test", { method: "POST", headers: { authorization: `Bearer ${token}` } }), ["admin", "marketplace", "sub-orders", id("sub"), action])
    const first = await call("ghn")
    const retry = await call("ghn")
    assert.equal(first.order_code, retry.order_code)
    assert.equal(codes.length, 1)
    let inventory = await db.collection("inventory").findOne({ variant_id: id("variant") })
    assert.equal(inventory.stock, 4); assert.equal(inventory.reserved, 0)
    await call("ghn-cancel")
    assert.equal((await db.collection("sub_orders").findOne({ id: id("sub") })).status, "ready_to_ship")
    const second = await call("ghn")
    assert.notEqual(second.order_code, first.order_code)
    inventory = await db.collection("inventory").findOne({ variant_id: id("variant") })
    assert.equal(inventory.stock, 4)
    const webhook = (token) => ghnShipping(new Request(`http://test?token=${token}`, { method: "POST", body: JSON.stringify({ OrderCode: second.order_code, Status: "delivered" }) }), ["ghn", "webhook"])
    await assert.rejects(webhook("wrong"), (error) => error.status === 401)
    await webhook(process.env.GHN_WEBHOOK_TOKEN); await webhook(process.env.GHN_WEBHOOK_TOKEN)
    const sub = await db.collection("sub_orders").findOne({ id: id("sub") })
    assert.equal(sub.status, "delivered")
    assert.ok(sub.complete_at instanceof Date)
    await db.collection("sub_orders").updateOne({ id: sub.id }, { $set: { shipping_operation: "create" } })
    await assert.rejects(changeSubOrder(sub.id, "cancel", { role: "admin", id: id("admin") }, { reason: "Test" }), (error) => error.status === 409)
  } finally {
    globalThis.fetch = originalFetch
    for (const [collection, filter] of [["identities", { id: identity.id }], ["artisans", { id: id("artisan") }], ["orders", { id: id("order") }], ["marketplace_orders", { id: id("marketplace") }], ["sub_orders", { id: id("sub") }], ["inventory", { variant_id: id("variant") }], ["reservations", { line_item_id: id("line") }], ["outbox", { "data.sub_order_id": id("sub") }]]) await db.collection(collection).deleteMany(filter)
    await client.close(); await globalThis.yarnlyMongo?.then((pool) => pool.close()); delete globalThis.yarnlyMongo
  }
})
