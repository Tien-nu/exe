import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

test("isolated QA: admin catalog, customer addresses, timers, payouts and notification queue", { skip: process.env.RUN_MONGO_INTEGRATION !== "true" }, async () => {
  assert.ok(process.env.MONGODB_DB?.endsWith("_staging"))
  const originalDb = process.env.MONGODB_DB
  const testId = randomUUID().replaceAll("-", "").slice(0, 12)
  process.env.MONGODB_DB = `yarnly_qa_${testId}_staging`
  process.env.MONGODB_API_PREVIEW = "true"
  process.env.EMAIL_DELIVERY_ENABLED = "false"
  const { database } = await import("../src/server/mongodb.ts")
  const { createIndexes } = await import("../src/server/indexes.ts")
  const { tokenFor } = await import("../src/server/auth.ts")
  const { GET, POST, DELETE } = await import("../src/app/api/backend/[...path]/route.ts")
  const { runTimers } = await import("../src/server/timers.ts")
  const { generatePayouts, markPayoutPaid } = await import("../src/server/workflows/payouts.ts")
  const { processOutbox } = await import("../src/server/outbox.ts")
  const { GET: job } = await import("../src/app/api/jobs/[job]/route.ts")
  const db = await database(), id = (suffix) => `qa_${testId}_${suffix}`
  const admin = { id: id("auth_admin"), email: `${testId}-admin@example.test`, password_hash: "unused", actors: { admin: id("admin") }, session_version: 0 }
  const customer = { id: id("auth_customer"), email: `${testId}-customer@example.test`, password_hash: "unused", actors: { customer: id("customer") }, session_version: 0 }
  const call = async (path, method, token, input) => {
    const request = new Request(`http://test/api/backend/${path}`, { method, headers: { authorization: `Bearer ${token}` }, ...(method === "POST" ? { body: JSON.stringify(input ?? {}) } : {}) })
    const response = await ({ GET, POST, DELETE })[method](request, { params: Promise.resolve({ path: path.split("/") }) })
    return { status: response.status, data: await response.json() }
  }
  try {
    await createIndexes(db)
    await db.collection("identities").insertMany([admin, customer])
    await db.collection("customers").insertOne({ id: id("customer"), email: customer.email, has_account: true, addresses: [] })
    await db.collection("artisans").insertOne({ id: id("artisan"), handle: id("shop"), email: `${testId}-shop@example.test`, status: "active", pickup_province_name: "Hà Nội", shop_name: "QA Shop", bank_name: "Test", bank_account_number: "0000", bank_account_name: "Test" })
    await db.collection("marketplace_settings").insertOne({ id: id("settings"), platform_fee_percent: 10, admin_email: `${testId}-admin@example.test` })
    const a = await tokenFor(admin, "admin"), c = await tokenFor(customer, "customer")
    const pickupPath = `admin/marketplace/artisans/${id("artisan")}/pickup-province`
    assert.equal((await call(pickupPath, "POST", c, { pickup_province_name: "Hà Nội" })).status, 401)
    assert.equal((await call(pickupPath, "POST", a, { pickup_province_name: "Vietnam" })).status, 400)
    const updatedPickup = await call(pickupPath, "POST", a, { pickup_province_name: "TP.HCM" })
    assert.equal(updatedPickup.data.artisan.pickup_province_name, "Hồ Chí Minh")
    for (const path of ["admin/catalog/products", "admin/catalog/customers", "admin/marketplace/artisans", "admin/marketplace/settings", "admin/marketplace/orders", "admin/marketplace/sub-orders", "admin/marketplace/payouts"]) {
      assert.equal((await call(path, "GET", a)).status, 200)
      assert.equal((await call(path, "GET", c)).status, 401)
    }
    await db.collection("carts").insertOne({ id: id("guest_cart"), customer_id: null, completed_at: null, currency_code: "vnd", items: [], shipping_methods: [] })
    const transferred = await POST(new Request("http://test/store/carts/cart/customer", { method: "POST", headers: { authorization: `Bearer ${c}` } }), { params: Promise.resolve({ path: ["store", "carts", id("guest_cart"), "customer"] }) })
    assert.equal(transferred.status, 200)
    assert.equal((await transferred.json()).cart.customer_id, customer.actors.customer)
    const verifyRequested = await call("auth/verification/request", "POST", c, { entity_type: "email", entity_id: customer.email })
    assert.equal(verifyRequested.status, 200)
    const verificationEvent = await db.collection("outbox").findOne({ type: "email_verification", "data.to": customer.email })
    assert.equal((await call("auth/verification/confirm", "POST", c, { code: verificationEvent.data.code })).status, 200)
    assert.equal((await call("auth/verification/confirm", "POST", c, { code: verificationEvent.data.code })).status, 400)
    await db.collection("orders").insertOne({ id: id("guest_order"), email: `${testId}-original@example.test`, customer_id: null, deleted_at: null })
    assert.equal((await call(`store/orders/${id("guest_order")}/transfer/request`, "POST", c)).status, 200)
    const transferEvent = await db.collection("outbox").findOne({ type: "order_transfer_requested", "data.order_id": id("guest_order") })
    assert.equal(transferEvent.data.to, `${testId}-original@example.test`)
    assert.equal((await call(`store/orders/${id("guest_order")}/transfer/accept`, "POST", c, { token: "wrong" })).status, 400)
    assert.equal((await call(`store/orders/${id("guest_order")}/transfer/accept`, "POST", c, { token: transferEvent.data.code })).status, 200)
    assert.equal((await db.collection("orders").findOne({ id: id("guest_order") })).customer_id, customer.actors.customer)
    assert.equal((await call("admin/catalog/products", "GET", c)).status, 401)
    const created = await call("admin/catalog/products", "POST", a, { artisan_id: id("artisan"), title: "QA Product", fulfillment_type: "ready", price: 100000, stock: 5, status: "published" })
    assert.equal(created.status, 200)
    const product = created.data.product, variant = product.variants[0]
    const changed = await call(`admin/catalog/products/${product.id}`, "POST", a, { title: "QA Product edited", fulfillment_type: "ready", status: "draft", variants: [{ id: variant.id, price: 120000, stock: 6 }] })
    assert.equal(changed.status, 200); assert.equal(changed.data.product.variants[0].price, 120000)
    assert.equal((await call(`store/products/${product.id}`, "GET", c)).status, 404)
    await db.collection("inventory").updateOne({ variant_id: variant.id }, { $set: { reserved: 4 } })
    assert.equal((await call(`admin/catalog/products/${product.id}`, "POST", a, { title: "QA Product", fulfillment_type: "ready", variants: [{ id: variant.id, price: 100000, stock: 3 }] })).status, 409)
    assert.equal((await call("store/customers/me", "POST", c, { first_name: "QA", phone: "0000000000" })).data.customer.first_name, "QA")
    const address1 = await call("store/customers/me/addresses", "POST", c, { address_1: "Test one", country_code: "vn", is_default_shipping: true })
    const address2 = await call("store/customers/me/addresses", "POST", c, { address_1: "Test two", country_code: "vn", is_default_shipping: true })
    assert.equal(address2.data.customer.addresses.filter((row) => row.is_default_shipping).length, 1)
    const addressId = address1.data.customer.addresses[0].id
    assert.equal((await call(`store/customers/me/addresses/${addressId}`, "DELETE", c)).data.customer.addresses.length, 1)
    for (const name of ["pay", "accept", "delivered"]) {
      await db.collection("orders").insertOne({ id: id(`order_${name}`), status: "pending" })
      await db.collection("marketplace_orders").insertOne({ id: id(`mp_${name}`), order_id: id(`order_${name}`), customer_id: customer.actors.customer,
        payment_method: name === "pay" ? "bank_transfer" : "cod", payment_status: name === "pay" ? "awaiting_transfer" : "cod", payment_deadline: new Date(Date.now() - 1000) })
      await db.collection("sub_orders").insertOne({ id: id(`sub_${name}`), marketplace_order_id: id(`mp_${name}`), artisan_id: id("artisan"),
        status: name === "pay" ? "pending_payment" : name === "accept" ? "pending_acceptance" : "delivered", subtotal: 100000, items: [],
        accept_deadline: new Date(Date.now() - 1000), complete_at: new Date(Date.now() - 1000), payout_id: null })
    }
    const timers = await runTimers()
    assert.equal(timers.expired_payments, 1); assert.equal(timers.canceled_acceptances, 1); assert.equal(timers.completed_orders, 1)
    assert.deepEqual(await runTimers(), { expired_payments: 0, canceled_acceptances: 0, completed_orders: 0, conflicts: 0 })
    await db.collection("sub_orders").updateOne({ id: id("sub_delivered") }, { $set: { completed_at: new Date("2026-01-01T00:00:00Z") } })
    const payoutResults = await Promise.all([generatePayouts(), generatePayouts()])
    assert.equal(payoutResults.flat().length, 1)
    const payout = await db.collection("payouts").findOne({ artisan_id: id("artisan") })
    assert.equal(payout.net_amount, 90000)
    await markPayoutPaid(payout.id, "QA-NO-REAL-TRANSFER")
    await assert.rejects(markPayoutPaid(payout.id, "QA-RETRY"), (error) => error.status === 409)
    // Keep only a self-contained synthetic notification for worker assertions.
    await db.collection("outbox").deleteMany({ "data.sub_order_id": { $in: [id("sub_pay"), id("sub_accept"), id("sub_delivered")] } })
    await db.collection("outbox").deleteMany({ "data.marketplace_order_id": id("mp_pay") })
    await db.collection("outbox").insertOne({ deduplication_key: id("mail_event"), type: "email_verification", status: "pending", attempts: 0,
      next_attempt_at: new Date(), created_at: new Date(), data: { to: customer.email, code: "qa-no-real-email" } })
    const processed = await processOutbox(10)
    assert.equal(processed.sent, 0); assert.equal(processed.failed, 0); assert.equal(processed.delivery_enabled, false)
    const count = await db.collection("outbox").countDocuments({ type: "send_mail" })
    assert.ok(count >= 1)
    await processOutbox(10)
    assert.equal(await db.collection("outbox").countDocuments({ type: "send_mail" }), count)
    process.env.CRON_SECRET = "qa-secret-with-at-least-32-characters"
    assert.equal((await job(new Request("http://test"), { params: Promise.resolve({ job: "timers" }) })).status, 401)
    assert.equal((await job(new Request("http://test", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }), { params: Promise.resolve({ job: "timers" }) })).status, 200)
  } finally {
    // This unique database is created by this test only. No database is dropped.
    assert.equal(db.databaseName, `yarnly_qa_${testId}_staging`)
    try {
      for (const collection of await db.listCollections().toArray()) await db.collection(collection.name).deleteMany({})
    } finally {
      await globalThis.yarnlyMongo?.then((pool) => pool.close()); delete globalThis.yarnlyMongo
      process.env.MONGODB_DB = originalDb
    }
  }
})
