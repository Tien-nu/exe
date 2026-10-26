import assert from "node:assert/strict"
import { database } from "../src/server/mongodb.ts"
const db = await database(), base = "http://localhost:8000/api/backend/store"
let cartId
async function call(path, input) {
 const response = await fetch(base + path, input ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) } : {})
 const result = await response.json()
 assert.equal(response.status, 200, result.message ?? path)
 return result
}
try {
 const { regions } = await call("/regions")
 const { products } = await call("/products?limit=100")
 const product = products.find(p => p.title === "Thú bông len" && p.handle.startsWith("prod_01f82442"))
 assert.ok(product)
 cartId = (await call("/carts", { region_id: regions[0].id })).cart.id
 await call(`/carts/${cartId}/line-items`, { variant_id: product.variants[0].id, quantity: 1 })
 await call(`/carts/${cartId}`, { email: "qa-shipping@example.test", shipping_address: { first_name: "QA", last_name: "Shipping", address_1: "QA address", phone: "0000000000", country_code: "vn", province: "Hà Nội", city: "" } })
 const { shipping_options } = await call(`/shipping-options?cart_id=${cartId}`)
 const { cart } = await call(`/carts/${cartId}/shipping-methods`, { option_id: shipping_options[0].id })
 assert.equal(cart.shipping_total,18000)
 const { payment_collection } = await call("/payment-collections", { cart_id: cartId })
 await call(`/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" })
 console.log("PASS HTTP: add item -> address -> 18,000 shipping -> payment session; no order placed")
} finally {
 if(cartId) {
 await db.collection("shipping_quotes").deleteMany({ cart_id: cartId })
 await db.collection("carts").deleteOne({ id: cartId, email: "qa-shipping@example.test", completed_at: null })
 }
 await globalThis.yarnlyMongo?.then(c=>c.close())
}
