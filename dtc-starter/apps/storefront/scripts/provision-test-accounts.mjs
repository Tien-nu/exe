import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import scrypt from "scrypt-kdf"
import { database } from "../src/server/mongodb.ts"
import { login, authenticate } from "../src/server/auth.ts"
assert.ok(process.env.MONGODB_DB?.endsWith("_staging"), "Test accounts are staging only")
const db = await database()
try {
 const shop = await db.collection("artisans").findOne({ id: "art_yarnly_order_test", handle: "len-nha-may" })
 assert.ok(shop, "Len Nha May shop missing")
 const results = []
 for (const [role, email, actorId] of [["artisan", "seller.lenmay@example.test", shop.id], ["admin", "admin.yarnly@example.test", "user_yarnly_test_admin"]]) {
  assert.equal(await db.collection("identities").countDocuments({ email }), 0, "Account already exists; do not overwrite credentials")
  const password = `Yarnly!${randomBytes(9).toString("base64url")}`
  const hash = await scrypt.kdf(password, { logN: 15, r: 8, p: 1 })
  await db.collection("identities").insertOne({ id: `auth_${randomUUID()}`, email, password_hash: hash.toString("base64"), actors: { [role]: actorId }, session_version: 0, created_at: new Date(), test_fixture: true })
  if (role === "artisan") await db.collection("artisans").updateOne({ id: shop.id }, { $set: { email, updated_at: new Date() } })
  else await db.collection("users").updateOne({ id: actorId }, { $setOnInsert: { id: actorId, email, first_name: "Yarnly", last_name: "Admin", created_at: new Date(), test_fixture: true } }, { upsert: true })
  const { token } = await login(email, password, role)
  const actor = await authenticate(new Request("http://test", { headers: { authorization: `Bearer ${token}` } }), role)
  assert.equal(actor.id, actorId)
  results.push({ role, email, password, login_verified: true })
 }
 console.log(JSON.stringify(results, null, 2))
} finally { await globalThis.yarnlyMongo?.then(c=>c.close()) }
