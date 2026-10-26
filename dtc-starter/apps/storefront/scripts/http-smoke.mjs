import assert from "node:assert/strict"
import { createInstantSearchAdapter } from "@medusajs/instantsearch-adapter"

const origin = process.env.TEST_BASE_URL || "http://localhost:8000"
const results = []
async function check(path, expected = 200) {
  const response = await fetch(`${origin}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, expected, `${path}: HTTP ${response.status}`)
  results.push({ path, status: response.status })
  return response
}
try {
  for (const path of ["/vn", "/vn/home", "/vn/store", "/vn/cart", "/vn/account", "/vn/kenh-nghe-nhan/dang-nhap", "/vn/kenh-nghe-nhan/dang-ky", "/vn/nghe-nhan"]) {
    const html = await (await check(path)).text()
    assert.ok(!html.includes("Application error: a server-side exception"), `${path}: server render failure`)
  }
  const adminRedirect = await check("/vn/quan-tri", 307)
  assert.equal(adminRedirect.headers.get("location"), "/app/orders")
  const originalAdmin = await (await check("/app/products")).text()
  assert.ok(originalAdmin.includes('id="medusa"'))
  assert.match(originalAdmin, /src="\/app\/assets\/index-[^"\s]+\.js"/)
  await check("/admin/users/me", 401)
  const listing = await (await check("/api/backend/store/products?limit=100")).json()
  assert.ok(listing.products.length > 0)
  await check(`/vn/products/${encodeURIComponent(listing.products[0].handle)}`)
  const regions = await (await check("/api/backend/store/regions")).json()
  assert.ok(regions.regions.some((region) => region.currency_code === "vnd"))
  await check("/api/backend/admin/catalog/products", 401)
  await check("/api/jobs/timers", 401)
  const sdk = { client: { fetch: async (path, init) => {
    const response = await fetch(`${origin}/api/backend${path}`, { method: init.method, headers: { "content-type": "application/json" }, body: JSON.stringify(init.body), signal: AbortSignal.timeout(20000) })
    assert.ok(response.ok, `Search API HTTP ${response.status}`)
    return response.json()
  } } }
  const { searchClient } = createInstantSearchAdapter({ sdk, path: "/store/search", numericAttributes: ["min_price_vnd"] })
  const searched = await searchClient.search([{ indexName: "product", params: { query: "len", hitsPerPage: 5, facets: ["category"], highlightPreTag: "<mark>", highlightPostTag: "</mark>" } }])
  assert.ok(searched.results[0].nbHits > 0)
  assert.ok(searched.results[0].hits.every((hit) => hit.objectID && hit.title))
  const sorted = await searchClient.search([{ indexName: "product/sort/min_price_vnd:ASC", params: { hitsPerPage: 100 } }])
  const prices = sorted.results[0].hits.map((hit) => hit.min_price_vnd)
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b))
  console.log(JSON.stringify({ passed: true, http_checks: results, search_hits: searched.results[0].nbHits, search_sort: "passed" }, null, 2))
} catch (error) {
  console.error(`HTTP smoke failed: ${error.message}`)
  process.exitCode = 1
}
