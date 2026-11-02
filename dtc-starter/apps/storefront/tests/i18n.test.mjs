import test from "node:test"
import assert from "node:assert/strict"
import { translate, translateText } from "../src/lib/i18n/translate.ts"
import dictionary from "../src/lib/i18n/vi.json" with { type: "json" }

test("exact interface copy is translated and surrounding whitespace is kept", () => {
  assert.equal(translate("Sign in"), "Đăng nhập")
  assert.equal(translate("  Add  to\n cart "), "Thêm vào giỏ")
  assert.equal(translateText("  Sign in "), "  Đăng nhập ")
})

test("dynamic copy uses patterns and keeps data values untouched", () => {
  assert.equal(translate("Order S1A2B3"), "Đơn S1A2B3")
  assert.equal(translate("Made to order · 5 days"), "Làm theo đơn · 5 ngày")
  assert.equal(translate("Waiting for Xưởng len to confirm"), "Đang chờ Xưởng len xác nhận")
  // Page titles translate their known part.
  assert.equal(translate("Artisans | Yarnly"), "Nghệ nhân | Yarnly")
})

test("dates switch to day/month order and amounts to dot separators", () => {
  assert.equal(translate("11/02/2026, 09:05 PM"), "02/11/2026 21:05")
  assert.equal(translate("11/02/2026, 12:30 AM"), "02/11/2026 00:30")
  assert.equal(translate("11/2/2026"), "02/11/2026")
  assert.equal(translate("120,000₫"), "120.000₫")
  assert.equal(translate("₫85,000"), "85.000₫")
  assert.equal(translate("Paid 11/02/2026, 09:05 AM"), "Đã chuyển 02/11/2026 09:05")
})

test("unknown text and product data are left alone", () => {
  assert.equal(translate("Xưởng len Yarnly"), null)
  assert.equal(translate("   "), null)
  assert.equal(translate("SKU-1234"), null)
})

test("dictionary entries are clean", () => {
  for (const [english, vietnamese] of Object.entries(dictionary.exact)) {
    assert.equal(english, english.replace(/\s+/g, " ").trim(), `untrimmed key: ${JSON.stringify(english)}`)
    assert.ok(vietnamese.trim(), `empty translation for ${JSON.stringify(english)}`)
  }
  for (const [english, vietnamese] of dictionary.patterns) {
    const slots = (text) => (text.match(/\{\d\}/g) ?? []).sort().join()
    assert.equal(slots(english), slots(vietnamese), `placeholder mismatch: ${english}`)
  }
})
