import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as jose from "jose"
import scrypt from "scrypt-kdf"
import * as crypto from "node:crypto"

function load(path, dependencies, env = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, Buffer, TextEncoder, Date, URL, Response, console: { error() {} },
    process: { env }, require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
      return dependencies[name]
    },
  })
  return exports
}

const http = load("../src/server/http.ts", {})
const catalog = load("../src/server/catalog.ts", { "./http": http, "./mongodb": {} })

test("catalog cannot expose draft products through query operators", () => {
  const filter = catalog.productFilter(new URL("https://example.test/store/products?status=draft&id[$ne]=a&q=(a%2B)%2B%24"))
  assert.equal(filter.status, "published")
  assert.equal(filter.deleted_at, null)
  assert.equal(filter.id, undefined)
  const regex = new RegExp(filter.title.$regex, "i")
  assert.equal(regex.test("(a+)+$"), true)
  assert.equal(regex.test("aaaaaaaa"), false)
})
test("catalog only exposes public product fields", () => {
  const product = catalog.publicProduct({ id: "prod_1", status: "published", title: "Len", handle: "len",
    password_hash: "private", cost_price: 100, metadata: { private_notes: "secret", fulfillment_type: "ready" },
    variants: [{ id: "var_1", stock: 5, reserved: 2, supplier_cost: 50 }],
  })
  assert.equal(product.password_hash, undefined)
  assert.equal(product.cost_price, undefined)
  assert.equal(product.metadata.private_notes, undefined)
  assert.equal(product.variants[0].supplier_cost, undefined)
  assert.equal(product.variants[0].inventory_quantity, 3)
})
test("invalid pagination and oversized bodies are rejected", async () => {
  for (const query of ["limit=-1", "limit=101", "offset=1.2", "limit=NaN", "offset=100001"]) {
    assert.throws(() => http.pagination(new URL(`https://example.test/?${query}`)))
  }
  assert.deepEqual(Object.keys(await http.body(new Request("https://example.test", { method: "POST" }))), [])
  for (const raw of ["[]", "null", '"string"', "bad json"]) {
    await assert.rejects(http.body(new Request("https://example.test", { method: "POST", body: raw })))
  }
  await assert.rejects(http.body(new Request("https://example.test", { method: "POST", body: "a".repeat(256001) })), (error) => error.status === 413)
})
test("unexpected errors never reveal connection strings", async () => {
  const response = http.errorResponse(new Error("mongodb://private:password@host"))
  assert.equal(response.status, 503)
  assert.equal((await response.text()).includes("password"), false)
})

test("Medusa password hashes work with the new auth verifier", async () => {
  const password = " existing password "
  const hash = await scrypt.kdf(password, { logN: 15, r: 8, p: 1 })
  const identity = { id: "auth_1", email: "test@example.test", password_hash: hash.toString("base64"),
    actors: { customer: "cus_1" }, session_version: 0 }
  const env = { AUTH_SECRET: "test-secret-with-at-least-32-bytes-long" }
  const auth = load("../src/server/auth.ts", {
    "node:crypto": crypto, jose, "scrypt-kdf": scrypt, "./http": http,
    "./mongodb": { database: async () => ({ collection: () => ({ findOne: async () => identity }) }) },
  }, env)
  const result = await auth.login("TEST@example.test", password, "customer")
  const request = new Request("https://example.test", { headers: { authorization: `Bearer ${result.token}` } })
  assert.equal((await auth.authenticate(request, "customer")).id, "cus_1")
  await assert.rejects(auth.authenticate(request, "artisan"), (error) => error.status === 401)
  await assert.rejects(auth.login("test@example.test", "wrong password", "customer"), (error) => error.status === 401)
  await assert.rejects(auth.login("test@example.test", password, "admin"), (error) => error.status === 401)
  identity.session_version++
  await assert.rejects(auth.authenticate(request, "customer"), (error) => error.status === 401)
})
test("registration cannot create an admin or persist without JWT configuration", async () => {
  let persisted = false
  const auth = load("../src/server/auth.ts", {
    "node:crypto": crypto, jose, "scrypt-kdf": scrypt, "./http": http,
    "./mongodb": { database: async () => { persisted = true; throw new Error("must not connect") } },
  })
  await assert.rejects(auth.register("admin@example.test", "password123", "admin"), (error) => error.status === 403)
  await assert.rejects(auth.register("test@example.test", "password123", "customer"), /AUTH_SECRET/)
  assert.equal(persisted, false)
})

test("preview API is disabled by default without touching database services", async () => {
  const route = load("../src/app/api/backend/[...path]/route.ts", {
    "../../../../server/auth": {}, "../../../../server/catalog": {},
    "../../../../server/customers": {}, "../../../../server/http": http,
    "../../../../server/rate-limit": {},
    "../../../../server/marketplace": {},
    "../../../../server/carts": {},
    "../../../../server/checkout": {}, "../../../../server/shipping": {},
    "../../../../server/artisans": {}, "../../../../server/artisan-products": {}, "../../../../server/custom-requests": {},
    "../../../../server/orders": {}, "../../../../server/ghn-addresses": {},
    "../../../../server/uploads": {},
    "../../../../server/verification": {},
    "../../../../server/admin-catalog": { adminCatalog: async () => undefined },
    "../../../../server/ghn-shipping": { ghnShipping: async () => undefined },
    "../../../../server/search": {},
  })
  const response = await route.GET(new Request("https://example.test/api/backend/store/products"), {
    params: Promise.resolve({ path: ["store", "products"] }),
  })
  assert.equal(response.status, 404)
  assert.equal(response.headers.get("cache-control"), "no-store")
})

const searchModule = load("../src/server/search.ts", {
  "./http": http, "./mongodb": {}, "./format": { escapeHtml: (value) => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;") },
})
test("search preserves Vietnamese matching, price filters and facet counts", () => {
  const documents = [
    searchModule.searchDocument({ id: "p1", title: "Túi len đỏ", created_at: "2026-01-01", categories: [{ name: "Túi" }], variants: [{ prices: [{ currency_code: "vnd", amount: 100000 }] }] }),
    searchModule.searchDocument({ id: "p2", title: "Túi len xanh", created_at: "2026-01-02", categories: [{ name: "Túi" }], variants: [{ prices: [{ currency_code: "vnd", amount: 200000 }] }] }),
  ]
  const result = searchModule.runSearch(documents, { entity: "product", filters: { q: "tui len", $and: [{ min_price_vnd: { $lte: 150000 } }] }, search_options: { facets: [{ field: "category", type: "value" }] } })
  assert.deepEqual(Array.from(result.hits, (hit) => hit.id), ["p1"])
  assert.equal(result.metadata.count, 1)
  assert.equal(result.facets.category.values[0].count, 1)
  for (const query of [null, { entity: "product", filters: null, search_options: [] }, { entity: "product", filters: { title: { $regex: ".*" } } }, { entity: "product", pagination: { take: 101 } }]) {
    assert.throws(() => searchModule.runSearch(documents, query))
  }
})

const ghnShipping = load("../src/server/ghn-shipping.ts", {
  "node:crypto": crypto, "./auth": {}, "./mongodb": {}, "./http": http, "./ghn": {}, "./workflows/sub-orders": {},
})
test("GHN COD includes charged shipping and uses a stable retry code", () => {
  const sub = { id: "s", code: "123", status: "ready_to_ship", subtotal: 100000, shipping_charged: 20000,
    items: [{ title: "Len", product_id: "p", quantity: 2, unit_price: 50000 }] }
  const artisan = { shop_name: "Shop", phone: "0000000000", pickup_address: "Test", pickup_ward_name: "Ward", pickup_district_name: "District", pickup_province_name: "Province" }
  const order = { shipping_address: { first_name: "Test", phone: "0000000000", address_1: "Test" }, metadata: { district_id: 123, ward_code: "001" } }
  const input = ghnShipping.shipmentInput(sub, { payment_method: "cod" }, order, artisan, [])
  assert.equal(input.cod_amount, 120000)
  assert.equal(input.receiver_pays_shipping, false)
  assert.equal(input.client_order_code, ghnShipping.shipmentInput(sub, { payment_method: "cod" }, order, artisan, []).client_order_code)
  assert.equal(ghnShipping.shipmentInput({ ...sub, ghn_attempt: 1, shipping_charged: null }, { payment_method: "bank_transfer" }, order, artisan, []).cod_amount, 0)
  assert.throws(() => ghnShipping.shipmentInput({ ...sub, status: "processing" }, {}, order, artisan, []))
  assert.throws(() => ghnShipping.shipmentInput(sub, {}, { ...order, metadata: {} }, artisan, []))
})
