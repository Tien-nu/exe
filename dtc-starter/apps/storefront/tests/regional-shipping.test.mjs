import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import { readFileSync } from "node:fs"
import ts from "typescript"
function load(path, dependencies) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { exports, require(name) { if (!(name in dependencies)) throw Error(name); return dependencies[name] } })
  return exports
}
const provinces = load("../src/lib/vietnam-provinces.ts", {})
const http = { ApiError: class extends Error { constructor(status, message) { super(message); this.status = status } } }
const shipping = load("../src/server/regional-shipping.ts", { "../lib/vietnam-provinces": provinces, "./http": http })
test("regional shipping is 18,000 inside the province and 22,000 outside", () => {
  assert.equal(shipping.regionalFee("Hà Nội", "Thành phố Hà Nội").fee, 18000)
  assert.equal(shipping.regionalFee("Hà Nội", "Hồ Chí Minh").fee, 22000)
  assert.equal(shipping.regionalFee("Bắc Ninh", "Tỉnh Bắc Ninh").fee, 18000)
})
test("historical province names and common abbreviations resolve to current provinces", () => {
  assert.equal(provinces.VIETNAM_PROVINCES.length, 34)
  assert.equal(shipping.regionalFee("Bình Dương", "TP.HCM").fee, 18000)
  assert.equal(shipping.regionalFee("Bắc Giang", "Bắc Ninh").fee, 18000)
  assert.equal(provinces.provinceCode("Thừa Thiên Huế"), provinces.provinceCode("Huế"))
})
test("missing, unknown and sample provinces never silently incur a guessed fee", () => {
  for (const from of [null, "", "Vietnam", "TP. Hồ Chí Minh (mẫu)"]) assert.throws(() => shipping.regionalFee(from, "Hà Nội"), (error) => error.status === 409)
  for (const to of [null, "990202", "DEMO_WARD", "not a province"]) assert.throws(() => shipping.regionalFee("Hà Nội", to), (error) => error.status === 400)
})
