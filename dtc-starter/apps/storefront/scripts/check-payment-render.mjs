import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { MongoClient } from "mongodb"
import { SignJWT } from "jose"
const name = process.env.MONGODB_DB
assert.ok(name?.endsWith("_staging"))
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }), db = client.db(name)
const id = `qa_payment_${randomUUID()}`
try {
  await client.connect()
  const region = await db.collection("regions").findOne({ currency_code: "vnd" }, { projection: { _id: 0 } })
  await db.collection("identities").insertOne({ id, email: `${id}@example.test`, password_hash: "unused", actors: { customer: id }, session_version: 0 })
  await db.collection("customers").insertOne({ id, email: `${id}@example.test`, has_account: true, first_name: "QA", addresses: [] })
  await db.collection("carts").insertOne({ id, customer_id: id, region, region_id: region.id, currency_code: "vnd", email: `${id}@example.test`, completed_at: null,
    metadata: {}, items: [], shipping_methods: [], shipping_address: { first_name: "QA", address_1: "123 Sample Street", phone: "0000000000" }, created_at: new Date(), updated_at: new Date() })
  const token = await new SignJWT({ role: "customer", version: 0 }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(id).setIssuer("yarnly").setAudience("yarnly-api").setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode(process.env.AUTH_SECRET))
  const response = await fetch("http://localhost:8000/vn/checkout?step=payment", { headers: { cookie: `_medusa_jwt=${token}; _medusa_cart_id=${id}` }, redirect: "manual" })
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /Shipping Address/)
  assert.match(html, /Continue to review/)
  assert.match(html, /Kiểm tra địa chỉ và tính lại phí/)
  assert.ok(!html.includes("Chế độ thử với địa chỉ mẫu"))
  assert.ok(!html.includes("Application error: a server-side exception"))
  console.log("Payment render passed: form, payment choices, missing-shipping recovery without sample addresses.")
} finally {
  await db.collection("carts").deleteOne({ id })
  await db.collection("customers").deleteOne({ id })
  await db.collection("identities").deleteOne({ id })
  await client.close()
}
