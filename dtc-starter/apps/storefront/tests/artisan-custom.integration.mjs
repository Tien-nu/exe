import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { MongoClient } from "mongodb"

test("artisan approval, products, locking and custom quote/cart flow", { skip: process.env.RUN_MONGO_INTEGRATION !== "true" }, async () => {
  assert.ok(process.env.MONGODB_DB?.endsWith("_staging"))
  const { tokenFor } = await import("../src/server/auth.ts")
  const { artisans } = await import("../src/server/artisans.ts")
  const { artisanProducts } = await import("../src/server/artisan-products.ts")
  const { customRequests } = await import("../src/server/custom-requests.ts")
  const client = new MongoClient(process.env.MONGODB_URI)
  const db = client.db(process.env.MONGODB_DB)
  const prefix = `artisan_test_${randomUUID()}`
  const id = (suffix) => `${prefix}_${suffix}`
  const identities = [
    { id: id("seller_auth"), email: `${prefix}-seller@example.test`, actors: {} },
    { id: id("admin_auth"), email: `${prefix}-admin@example.test`, actors: { admin: id("admin") } },
    { id: id("customer_auth"), email: `${prefix}-customer@example.test`, actors: { customer: id("customer") } },
    { id: id("other_auth"), email: `${prefix}-other@example.test`, actors: { customer: id("other") } },
  ].map((row) => ({ ...row, password_hash: "not-used", session_version: 0, created_at: new Date() }))
  let artisanId, productId, customId
  const request = (token, input, method = "POST") => new Request("https://example.test", { method,
    headers: { authorization: `Bearer ${token}` }, ...(method === "GET" ? {} : { body: JSON.stringify(input ?? {}) }) })
  try {
    await client.connect()
    await db.collection("identities").insertMany(identities)
    await db.collection("customers").insertOne({ id: id("customer"), email: identities[2].email, has_account: true })
    let sellerToken = await tokenFor(identities[0], "artisan")
    const adminToken = await tokenFor(identities[1], "admin")
    const customerToken = await tokenFor(identities[2], "customer")
    const otherToken = await tokenFor(identities[3], "customer")
    const profile = { shop_name: id("shop"), full_name: "Test seller", email: identities[0].email,
      phone: "0000000000", pickup_province_name: "Hà Nội", pickup_address: "Test pickup", bank_name: "Test bank", bank_account_number: "00000000", bank_account_name: "TEST" }
    await assert.rejects(artisans(request(sellerToken, { ...profile, pickup_province_name: undefined }), ["artisan", "register"]), (error) => error.status === 400)
    await assert.rejects(artisans(request(sellerToken, { ...profile, pickup_province_name: "Vietnam" }), ["artisan", "register"]), (error) => error.status === 400)
    assert.equal((await db.collection("identities").findOne({ id: identities[0].id })).actors.artisan, undefined)
    const registered = await artisans(request(sellerToken, profile), ["artisan", "register"])
    artisanId = registered.artisan.id
    assert.equal(registered.artisan.status, "pending")
    identities[0].actors.artisan = artisanId
    sellerToken = await tokenFor(identities[0], "artisan")
    await assert.rejects(artisanProducts(request(sellerToken, undefined, "GET"), ["artisan", "products"]), (error) => error.status === 403)
    await artisans(request(adminToken, { status: "active" }), ["admin", "marketplace", "artisans", artisanId, "status"])
    await assert.rejects(artisans(request(sellerToken, { ...profile, pickup_province_name: undefined }), ["artisan", "me"]), (error) => error.status === 400)
    const created = await artisanProducts(request(sellerToken, { title: "Migration test product", fulfillment_type: "ready", price: 120000, stock: 5 }), ["artisan", "products"])
    productId = created.product.id
    assert.equal(created.product.variants[0].stock, 5)
    await artisans(request(adminToken, { status: "locked", reason: "Integration test" }), ["admin", "marketplace", "artisans", artisanId, "status"])
    assert.equal((await db.collection("products").findOne({ id: productId })).status, "draft")
    await assert.rejects(artisanProducts(request(sellerToken, undefined, "GET"), ["artisan", "products"]), (error) => error.status === 403)
    await artisans(request(adminToken, { status: "active" }), ["admin", "marketplace", "artisans", artisanId, "status"])
    assert.equal((await db.collection("products").findOne({ id: productId })).status, "published")
    const custom = await customRequests(request(customerToken, { product_id: productId, description: "Test custom color", quantity: 2 }), ["store", "marketplace", "custom-requests"])
    customId = custom.custom_request.id
    const responded = await customRequests(request(sellerToken, { accept: true, price: 150000, lead_days: 4 }), ["artisan", "custom-requests", customId, "respond"])
    assert.equal(responded.custom_request.status, "quoted")
    await assert.rejects(customRequests(request(sellerToken, { accept: true, price: 1, lead_days: 1 }), ["artisan", "custom-requests", customId, "respond"]), (error) => error.status === 409)
    await db.collection("carts").insertOne({ id: id("cart"), customer_id: id("customer"), currency_code: "vnd", items: [], shipping_methods: [], completed_at: null })
    await assert.rejects(customRequests(request(otherToken, { accept: true, cart_id: id("cart") }), ["store", "marketplace", "custom-requests", customId, "decide"]), (error) => error.status === 404)
    await customRequests(request(customerToken, { accept: true, cart_id: id("cart") }), ["store", "marketplace", "custom-requests", customId, "decide"])
    await customRequests(request(customerToken, { accept: true, cart_id: id("cart") }), ["store", "marketplace", "custom-requests", customId, "decide"])
    const cart = await db.collection("carts").findOne({ id: id("cart") })
    assert.equal(cart.items.length, 1)
    assert.equal(cart.items[0].unit_price, 150000)
    assert.equal(cart.items[0].quantity, 2)
    assert.equal(cart.items[0].metadata.custom_request_id, customId)
  } finally {
    if (productId) {
      const product = await db.collection("products").findOne({ id: productId })
      await db.collection("inventory").deleteMany({ variant_id: { $in: (product?.variants ?? []).map((variant) => variant.id) } })
      await db.collection("products").deleteMany({ id: productId })
    }
    if (customId) await db.collection("custom_requests").deleteMany({ id: customId })
    await db.collection("outbox").deleteMany({ $or: [{ "data.artisan_id": artisanId ?? "none" }, { "data.custom_request_id": customId ?? "none" }] })
    if (artisanId) await db.collection("artisans").deleteMany({ id: artisanId })
    await db.collection("carts").deleteMany({ id: id("cart") })
    await db.collection("customers").deleteMany({ id: id("customer") })
    await db.collection("identities").deleteMany({ id: { $in: identities.map((row) => row.id) } })
    await client.close()
    await globalThis.yarnlyMongo?.then((pool) => pool.close())
    delete globalThis.yarnlyMongo
  }
})
