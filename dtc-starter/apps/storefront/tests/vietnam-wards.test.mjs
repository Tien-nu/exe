import test from "node:test"
import assert from "node:assert/strict"
import { wardsForProvince } from "../src/server/vietnam-wards.ts"
import { VIETNAM_PROVINCES } from "../src/lib/vietnam-provinces.ts"
import { GET } from "../src/app/api/addresses/wards/route.ts"

test("all 34 provinces have actual unique ward codes in the bundled snapshot", () => {
  const codes = new Set()
  let count = 0
  assert.equal(VIETNAM_PROVINCES.length, 34)
  for (const province of VIETNAM_PROVINCES) {
    const wards = wardsForProvince(province.code)
    assert.ok(wards?.length, province.name)
    for (const ward of wards) {
      assert.match(ward.code, /^\d{5}$/)
      assert.ok(ward.name)
      assert.equal(codes.has(ward.code), false)
      codes.add(ward.code)
      count++
    }
  }
  assert.equal(count, 3321)
})
test("wards are scoped to the selected province and historical province aliases resolve", () => {
  const hanoi = wardsForProvince("Hà Nội")
  const hcm = wardsForProvince("Hồ Chí Minh")
  assert.ok(hanoi.some((ward) => ward.name === "Phường Ba Đình"))
  assert.ok(hcm.some((ward) => ward.name === "Phường Sài Gòn"))
  assert.ok(!hcm.some((ward) => ward.name === "Phường Ba Đình"))
  assert.deepEqual(wardsForProvince("Thành phố Hồ Chí Minh"), hcm)
  assert.deepEqual(wardsForProvince("Bình Dương"), hcm)
  assert.equal(wardsForProvince("not-a-province"), undefined)
})
test("ward endpoint works without upstream fetch and rejects missing or unknown provinces", async () => {
  const previous = globalThis.fetch
  globalThis.fetch = () => {
    throw new Error("Must not depend on upstream API at checkout")
  }
  try {
    const response = await GET(
      new Request("http://test/api/addresses/wards?province=hanoi")
    )
    assert.equal(response.status, 200)
    const { wards } = await response.json()
    assert.equal(wards.length, 126)
    assert.match(response.headers.get("cache-control"), /public/)
    for (const query of ["", "?province=unknown"]) {
      const invalid = await GET(
        new Request(`http://test/api/addresses/wards${query}`)
      )
      assert.equal(invalid.status, 400)
    }
  } finally {
    globalThis.fetch = previous
  }
})
