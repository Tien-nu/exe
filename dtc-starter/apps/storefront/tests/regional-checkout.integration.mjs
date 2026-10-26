import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

test("regional address -> quote -> payment -> order uses real rates without carrier calls", { skip: process.env.RUN_MONGO_INTEGRATION !== "true" }, async () => {
  const originalDb = process.env.MONGODB_DB, originalFetch = globalThis.fetch
  assert.ok(originalDb?.endsWith("_staging"))
  if (process.env.QA_DATABASE_NAME) assert.match(process.env.QA_DATABASE_NAME, /^qa_region_[a-f0-9]{8}_staging$/)
  process.env.MONGODB_DB = process.env.QA_DATABASE_NAME || `qa_region_${randomUUID().slice(0, 8)}_staging`
  process.env.MONGODB_API_PREVIEW = "true"
  const { database } = await import("../src/server/mongodb.ts")
  const { createIndexes } = await import("../src/server/indexes.ts")
  const { tokenFor } = await import("../src/server/auth.ts")
  const { carts } = await import("../src/server/carts.ts")
  const { shipping } = await import("../src/server/shipping.ts")
  const { checkout } = await import("../src/server/checkout.ts")
  const db = await database()
  globalThis.fetch = () => { throw Error("Regional checkout must not call a carrier") }
  try {
    if (!process.env.QA_DATABASE_NAME) await createIndexes(db)
    else {
      for (const name of ["identities", "artisans", "products", "inventory", "carts", "orders", "marketplace_orders", "sub_orders"])
        assert.equal(await db.collection(name).countDocuments(), 0, `Reusable QA collection must be empty: ${name}`)
    }
    const identity = { id: "qa_identity", email: "qa@example.test", password_hash: "unused", actors: { customer: "qa_customer" }, session_version: 0 }
    await db.collection("identities").insertOne(identity)
    await db.collection("artisans").insertOne({ id: "qa_artisan", status: "active", handle: "qa", email: "qa-shop@example.test", pickup_province_name: "Hà Nội" })
    await db.collection("products").insertOne({ id: "qa_product", handle: "qa-product", status: "published", deleted_at: null, artisan_id: "qa_artisan", title: "QA Len", metadata: {}, variants: [{ id: "qa_variant", manage_inventory: true, prices: [{ currency_code: "vnd", amount: 85000 }] }] })
    await db.collection("inventory").insertOne({ variant_id: "qa_variant", stock: 3, reserved: 0 })
    await db.collection("shipping_options").insertOne({ id: "qa_shipping", name: "Shipping", deleted_at: null })
    const token = await tokenFor(identity, "customer")
    const request = (input = {}) => new Request("http://test", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) })
    for (const [province, expectedFee] of [["Hà Nội", 18000], ["Hồ Chí Minh", 22000]]) {
      const cartId = `qa_cart_${expectedFee}`
      await db.collection("carts").insertOne({ id: cartId, customer_id: "qa_customer", email: identity.email, currency_code: "vnd", completed_at: null,
        updated_at: new Date(), metadata: {}, shipping_address: { address_1: "Test street", phone: "0000000000", province },
        items: [{ id: `qa_line_${expectedFee}`, product_id: "qa_product", variant_id: "qa_variant", quantity: 1, unit_price: 85000, metadata: {} }], shipping_methods: [] })
      const method = await shipping(request({ option_id: "qa_shipping" }), ["carts", cartId, "shipping-methods"])
      assert.equal(method.cart.shipping_total, expectedFee)
      const collection = await checkout(request({ cart_id: cartId }), ["payment-collections"])
      await checkout(request({ provider_id: "pp_system_default" }), ["payment-collections", collection.payment_collection.id, "payment-sessions"])
      await assert.rejects(carts(request({ metadata: { payment_method: "manual_cod" } }), ["carts", cartId]), (error) => error.status === 400 && /Bank transfer is required/.test(error.message))
      // An old cart or a direct API request cannot bypass the new payment policy.
      await db.collection("carts").updateOne({ id: cartId }, { $set: { "metadata.payment_method": "manual_cod" } })
      await assert.rejects(checkout(request(), ["carts", cartId, "complete"]), (error) => error.status === 400 && /Bank transfer is required/.test(error.message))
      assert.equal(await db.collection("orders").countDocuments({ cart_id: cartId }), 0)
      assert.equal(await db.collection("reservations").countDocuments({ line_item_id: `qa_line_${expectedFee}` }), 0)
      await carts(request({ metadata: { payment_method: "manual_bank" } }), ["carts", cartId])
      const completed = await checkout(request(), ["carts", cartId, "complete"])
      assert.equal(completed.order.total, 85000 + expectedFee)
      const marketplace = await db.collection("marketplace_orders").findOne({ order_id: completed.order.id })
      assert.equal(marketplace.payment_method, "bank_transfer")
      assert.equal(marketplace.payment_status, "awaiting_transfer")
      const mode = process.env.PAYMENT_MODE === "simulation" ? "simulation" : "bank"
      assert.equal(marketplace.payment_mode, mode)
      assert.equal(completed.order.metadata.payment_mode, mode)
      assert.equal(completed.order.metadata.is_simulated, mode === "simulation")
      assert.equal((await db.collection("sub_orders").findOne({ marketplace_order_id: marketplace.id })).payment_mode, mode)
      assert.ok(marketplace.payment_deadline)
      assert.equal((await db.collection("sub_orders").findOne({ marketplace_order_id: marketplace.id })).status, "pending_payment")
      assert.equal(completed.order.shipping_methods[0].name, "Regional shipping")
      assert.equal((await checkout(request(), ["carts", cartId, "complete"])).order.id, completed.order.id)
    }
    await db.collection("artisans").insertOne({ id: "qa_artisan_other", status: "active", handle: "qa-other", email: "qa-other@example.test", pickup_province_name: "Hồ Chí Minh" })
    await db.collection("products").insertOne({ id: "qa_product_other", handle: "qa-product-other", status: "published", deleted_at: null, artisan_id: "qa_artisan_other", title: "QA Other", metadata: {}, variants: [{ id: "qa_variant_other", manage_inventory: true, prices: [{ currency_code: "vnd", amount: 85000 }] }] })
    await db.collection("inventory").insertOne({ variant_id: "qa_variant_other", stock: 3, reserved: 0 })
    await db.collection("carts").insertOne({ id: "qa_mixed", customer_id: "qa_customer", email: identity.email, currency_code: "vnd", completed_at: null, updated_at: new Date(), metadata: {},
      shipping_address: { address_1: "Test street", phone: "0000000000", province: "Hà Nội" },
      items: [{ id: "qa_line_mixed_1", product_id: "qa_product", variant_id: "qa_variant", quantity: 1, unit_price: 85000, metadata: {} }, { id: "qa_line_mixed_2", product_id: "qa_product_other", variant_id: "qa_variant_other", quantity: 1, unit_price: 85000, metadata: {} }], shipping_methods: [] })
    const mixed = await shipping(request({ option_id: "qa_shipping" }), ["carts", "qa_mixed", "shipping-methods"])
    assert.equal(mixed.cart.shipping_total, 40000)
    assert.equal(mixed.cart.shipping_methods[0].data.parcels.length, 2)
    const mixedCollection = await checkout(request({ cart_id: "qa_mixed" }), ["payment-collections"])
    await checkout(request({ provider_id: "pp_system_default" }), ["payment-collections", mixedCollection.payment_collection.id, "payment-sessions"])
    await carts(request({ metadata: { payment_method: "manual_bank" } }), ["carts", "qa_mixed"])
    await db.collection("artisans").updateOne({ id: "qa_artisan_other" }, { $set: { pickup_province_name: "Hà Nội" } })
    await assert.rejects(checkout(request(), ["carts", "qa_mixed", "complete"]), (error) => error.status === 409 && error.message.includes("pickup province"))
    await db.collection("artisans").updateOne({ id: "qa_artisan_other" }, { $unset: { pickup_province_name: "" } })
    await assert.rejects(shipping(request({ option_id: "qa_shipping" }), ["carts", "qa_mixed", "shipping-methods"]), (error) => error.status === 409)
  } finally {
    globalThis.fetch = originalFetch
    try {
      assert.match(db.databaseName, /^qa_region_[a-f0-9]{8}_staging$/)
      assert.notEqual(db.databaseName, originalDb)
      for (const collection of await db.listCollections().toArray()) await db.collection(collection.name).deleteMany({ $or: [{ id: /^qa_/ }, { customer_id: "qa_customer" }, { cart_id: /^qa_/ }, { variant_id: /^qa_/ }, { artisan_id: /^qa_/ }] })
    }
    finally { await globalThis.yarnlyMongo?.then((pool) => pool.close()); delete globalThis.yarnlyMongo; process.env.MONGODB_DB = originalDb }
  }
})
