import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import * as jsx from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"

function load(path, dependencies) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, FormData, console, process: { env: {} }, require(name) {
    if (name === "react/jsx-runtime") return jsx
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  } })
  return exports
}
const dependencies = (methods) => ({
  "@lib/data/payment": { listCartPaymentMethods: async () => methods },
  "@modules/checkout/components/addresses": () => React.createElement("section", null, "Address form"),
  "@modules/checkout/components/payment": () => React.createElement("section", null, "Bank transfer"),
  "@modules/checkout/components/review": () => React.createElement("section", null, "Order review"),
})
test("checkout renders address and payment without a shipping quote request", async () => {
  const component = load("../src/modules/checkout/templates/checkout-form/index.tsx", dependencies([{ id: "pp_system_default" }])).default
  const html = renderToStaticMarkup(await component({ cart: { id: "qa_cart", region: { id: "qa_region" }, shipping_methods: [] }, customer: {} }))
  assert.match(html, /Address form/)
  assert.match(html, /Bank transfer/)
})
test("payment provider failure keeps address form and displays recovery instead of a blank column", async () => {
  for (const methods of [null, []]) {
    const component = load("../src/modules/checkout/templates/checkout-form/index.tsx", dependencies(methods)).default
    const html = renderToStaticMarkup(await component({ cart: { id: "qa_cart" }, customer: {} }))
    assert.match(html, /Address form/)
    assert.match(html, /role="alert"/)
    assert.match(html, /Retry payment/)
  }
})
function cartModule(fail) {
  const calls = []
  const fake = load("../src/lib/data/cart.ts", {
    "@lib/config": { sdk: { store: { cart: {
      update: async () => ({ cart: { id: "qa_cart" } }),
      addShippingMethod: async () => { calls.push("shipping_saved"); return {} },
    } } } },
    "@lib/util/medusa-error": (error) => { throw error },
    "next/cache": { revalidateTag() {} },
    "next/navigation": { redirect: (url) => { calls.push(url); throw new Error("TEST_REDIRECT") } },
    "./cookies": { getCartId: async () => "qa_cart", getAuthHeaders: async () => ({}), getCacheTag: async () => "qa" },
    "./regions": {}, "./locale-actions": {},
    "./fulfillment": { listCartShippingMethods: async (id, strict) => {
      assert.equal(id, "qa_cart"); assert.equal(strict, true)
      if (fail === "throw") throw new Error("GHN test unavailable")
      return fail === "empty" ? [] : [{ id: "qa_shipping" }]
    } },
  })
  return { ...fake, calls }
}
function form() { const data = new FormData(); data.set("shipping_address.country_code", "vn"); return data }
test("failed shipping quote stays on address and returns a visible error", async () => {
  for (const fail of ["throw", "empty"]) {
    const module = cartModule(fail)
    const result = await module.setAddresses(null, form())
    assert.ok(typeof result === "string" && result.length > 0)
    assert.deepEqual(module.calls, [])
  }
})
test("address advances to payment only after shipping was saved", async () => {
  const module = cartModule(false)
  await assert.rejects(module.setAddresses(null, form()), /TEST_REDIRECT/)
  assert.deepEqual(module.calls, ["shipping_saved", "/vn/checkout?step=payment"])
})

test("payment UI replaces a stale COD choice with bank transfer and offers no other methods", () => {
  const wrap = ({ children }) => React.createElement("div", null, children)
  const icon = () => null
  const Payment = load("../src/modules/checkout/components/payment/index.tsx", {
    react: React,
    "@headlessui/react": { RadioGroup: wrap },
    "@lib/constants": { isStripeLike: (id) => id?.startsWith("pp_stripe"), paymentInfoMap: { manual_bank: { title: "Bank transfer" }, manual_cod: { title: "Cash on delivery" } } },
    "@lib/data/cart": { initiatePaymentSession() {}, updateCart() {} },
    "@medusajs/icons": { CheckCircleSolid: icon, CreditCard: icon },
    "@modules/checkout/components/error-message": () => null,
    "@modules/checkout/components/payment-container": { __esModule: true, default: ({ paymentProviderId, paymentInfoMap }) => React.createElement("label", null, paymentInfoMap[paymentProviderId]?.title ?? paymentProviderId), StripePaymentContainer: () => React.createElement("div", null, "Card payment") },
    "@modules/common/components/divider": () => null,
    "@modules/common/components/ui": { Button: ({ children, disabled }) => React.createElement("button", { disabled }, children), Container: wrap, Heading: wrap, Text: wrap, clx: (...values) => values.filter(Boolean).join(" ") },
    "next/navigation": { useSearchParams: () => new URLSearchParams("step=payment"), useRouter: () => ({ push() {} }), usePathname: () => "/vn/checkout" },
  }).default
  const html = renderToStaticMarkup(React.createElement(Payment, {
    cart: { id: "qa_cart", metadata: { payment_method: "manual_cod" }, items: [], shipping_methods: [{ id: "qa_ship" }], payment_collection: { payment_sessions: [{ provider_id: "pp_system_default", status: "pending" }] } },
    availablePaymentMethods: [{ id: "pp_system_default" }, { id: "pp_stripe_stripe" }, { id: "manual_cod" }],
  }))
  assert.match(html, /Bank transfer/)
  assert.match(html, /All orders require bank transfer/)
  assert.doesNotMatch(html, /Cash on delivery|Card payment|manual_cod|pp_stripe/)
})
