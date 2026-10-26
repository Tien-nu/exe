import test from "node:test"
import assert from "node:assert/strict"

test("checkout leaves shipping request body available for its handler", async () => {
  const { checkout } = await import("../src/server/checkout.ts")
  const request = new Request("http://test/store/carts/cart/shipping-methods", { method: "POST", body: JSON.stringify({ option_id: "shipping" }) })
  assert.equal(await checkout(request, ["carts", "cart", "shipping-methods"]), undefined)
  assert.equal(request.bodyUsed, false)
  assert.deepEqual(await request.json(), { option_id: "shipping" })
})
