import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { MongoClient } from "mongodb"

test("checkout reprices, prevents overselling and deduplicates retries", { skip: process.env.RUN_MONGO_INTEGRATION !== "true" }, async () => {
  assert.ok(process.env.MONGODB_DB?.endsWith("_staging"))
  const { checkout } = await import("../src/server/checkout.ts")
  const { tokenFor } = await import("../src/server/auth.ts")
  const { createIndexes } = await import("../src/server/indexes.ts")
  const client = new MongoClient(process.env.MONGODB_URI)
  const db = client.db(process.env.MONGODB_DB)
  const prefix = `checkout_test_${randomUUID()}`
  const id = (name) => `${prefix}_${name}`
  const now = new Date()
  const identity = { id: id("identity"), email: `${prefix}@example.test`, password_hash: "not-used-for-token-test",
    actors: { customer: id("customer") }, session_version: 0, created_at: now }
  try {
    await client.connect()
    if (!process.env.QA_DATABASE_NAME) await createIndexes(db)
    else {
      assert.match(db.databaseName, /^qa_region_[a-f0-9]{8}_staging$/)
      assert.equal(db.databaseName, process.env.QA_DATABASE_NAME)
    }
    await db.collection("shipping_options").insertOne({ id: id("shipping"), name: "QA shipping", deleted_at: null })
    await db.collection("identities").insertOne(identity)
    await db.collection("artisans").insertOne({ id: id("artisan"), email: `${prefix}-artisan@example.test`, handle: id("shop"), status: "active", pickup_province_name: "Hà Nội" })
    await db.collection("products").insertOne({ id: id("product"), handle: id("product"), title: "Migration test product", status: "published", deleted_at: null,
      artisan_id: id("artisan"), metadata: { fulfillment_type: "ready" }, variants: [{ id: id("variant"), title: "Default", manage_inventory: true, allow_backorder: false,
        prices: [{ id: id("price"), currency_code: "vnd", amount: 100000 }] }] })
    await db.collection("inventory").insertOne({ variant_id: id("variant"), stock: 2, reserved: 0 })
    for (const suffix of ["one", "two", "tampered"]) {
      await db.collection("carts").insertOne({ id: id(suffix), customer_id: id("customer"), email: identity.email, currency_code: "vnd",
        items: [{ id: id(`line_${suffix}`), product_id: id("product"), variant_id: id("variant"), unit_price: suffix === "tampered" ? 1 : 100000, quantity: 2, metadata: {} }],
        metadata: { payment_method: "manual_bank" }, completed_at: null, updated_at: now,
        shipping_address: { address_1: "Test address", phone: "0000000000", province: "Hà Nội" },
        shipping_methods: [{ data: { policy: "regional-v1-18000-22000" }, amount: 18000, quote_id: id(`quote_${suffix}`) }],
        payment_collection: { payment_sessions: [{ provider_id: "pp_system_default", status: "pending" }] },
      })
      await db.collection("shipping_quotes").insertOne({ id: id(`quote_${suffix}`), cart_id: id(suffix), cart_updated_at: now, policy: "regional-v1-18000-22000",
        expires_at: new Date(+now + 600000), amount: 18000, parcels: [{ artisan_id: id("artisan"), fee: 18000, region: "same_province",
          custom_request_id: null, line_item_ids: [id(`line_${suffix}`)] }] })
    }
    const token = await tokenFor(identity, "customer")
    const { shipping } = await import("../src/server/shipping.ts")
    await db.collection("carts").updateOne({ id: id("one") }, { $unset: { "shipping_address.province": "" } })
    const preview = await shipping(new Request(`https://example.test/store/shipping-options?cart_id=${id("one")}`, { headers: { authorization: `Bearer ${token}` } }), ["shipping-options"])
    assert.deepEqual(preview, { shipping_options: [] })
    await db.collection("carts").updateOne({ id: id("one") }, { $set: { "shipping_address.province": "Hà Nội" } })
    const request = () => new Request("https://example.test", { method: "POST", body: "{}", headers: { authorization: `Bearer ${token}` } })
    await assert.rejects(checkout(request(), ["carts", id("tampered"), "complete"]), (error) => error.status === 409)
    assert.equal(await db.collection("orders").countDocuments({ cart_id: id("tampered") }), 0)
    const result = await Promise.allSettled([checkout(request(), ["carts", id("one"), "complete"]), checkout(request(), ["carts", id("two"), "complete"])])
    assert.equal(result.filter((result) => result.status === "fulfilled").length, 1)
    const successful = result.find((result) => result.status === "fulfilled").value
    const winningCart = successful.order.cart_id
    const retry = await checkout(request(), ["carts", winningCart, "complete"])
    assert.equal(retry.order.id, successful.order.id)
    assert.equal(await db.collection("orders").countDocuments({ cart_id: winningCart }), 1)
    assert.equal(successful.order.total, 218000)
    const inventory = await db.collection("inventory").findOne({ variant_id: id("variant") })
    assert.equal(inventory.stock, 2)
    assert.equal(inventory.reserved, 2)
    const marketplace = await db.collection("marketplace_orders").findOne({ order_id: successful.order.id })
    const sub = await db.collection("sub_orders").findOne({ marketplace_order_id: marketplace.id })
    assert.equal(sub.subtotal, 200000)
    assert.equal(sub.shipping_charged, 18000)
    assert.equal(sub.status, "pending_payment")
    assert.equal(marketplace.payment_method, "bank_transfer")
    assert.equal(marketplace.payment_status, "awaiting_transfer")
    assert.ok(new Date(marketplace.payment_deadline) > now)
    await assert.rejects(checkout(new Request("https://example.test", { method: "POST", body: "{}" }), ["carts", winningCart, "complete"]), (error) => error.status === 404)
  } finally {
    const carts = [id("one"), id("two"), id("tampered")]
    const orders = await db.collection("orders").find({ cart_id: { $in: carts } }).toArray()
    const orderIds = orders.map((order) => order.id)
    const marketplace = await db.collection("marketplace_orders").find({ order_id: { $in: orderIds } }).toArray()
    const marketplaceIds = marketplace.map((order) => order.id)
    const subs = await db.collection("sub_orders").find({ marketplace_order_id: { $in: marketplaceIds } }).toArray()
    await db.collection("outbox").deleteMany({ $or: [{ "data.order_id": { $in: orderIds } }, { "data.sub_order_id": { $in: subs.map((sub) => sub.id) } }] })
    await db.collection("reservations").deleteMany({ variant_id: id("variant") })
    await db.collection("sub_orders").deleteMany({ marketplace_order_id: { $in: marketplaceIds } })
    await db.collection("marketplace_orders").deleteMany({ order_id: { $in: orderIds } })
    await db.collection("orders").deleteMany({ cart_id: { $in: carts } })
    await db.collection("carts").deleteMany({ id: { $in: carts } })
    await db.collection("shipping_quotes").deleteMany({ cart_id: { $in: carts } })
    await db.collection("inventory").deleteMany({ variant_id: id("variant") })
    await db.collection("products").deleteMany({ id: id("product") })
    await db.collection("artisans").deleteMany({ id: id("artisan") })
    await db.collection("identities").deleteMany({ id: id("identity") })
    await db.collection("shipping_options").deleteOne({ id: id("shipping") })
    await client.close()
    await globalThis.yarnlyMongo?.then((pool) => pool.close())
    delete globalThis.yarnlyMongo
  }
})
