import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import * as jsx from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"

function component() {
  const code = ts.transpileModule(
    readFileSync(
      new URL(
        "../src/modules/marketplace/components/bank-transfer-box.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  ).outputText
  const exports = {}
  const deps = {
    "react/jsx-runtime": jsx,
    react: { useState: () => [Date.now(), () => {}], useEffect: () => {} },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@lib/util/vn-format": {
      formatDateTime: () => "12:00",
      formatVnd: (value) => `${value} VND`,
    },
  }
  vm.runInNewContext(code, {
    exports,
    Date,
    require(name) {
      if (!(name in deps)) throw Error(name)
      return deps[name]
    },
  })
  return exports.default
}
const order = {
  payment_mode: "simulation",
  payment_method: "bank_transfer",
  payment_status: "awaiting_transfer",
  payment_deadline: new Date(Date.now() + 600000).toISOString(),
  qr_payment_token: "qa_signed_token",
  amount_to_transfer: 103000,
  transfer_content: "YARNLY 1",
  bank: { code: "mb", account_number: "123", name: "Bank" },
  sub_orders: [{ artisan: { shop_name: "Shop" } }],
}
test("QR payment uses camera instructions, local QR image and ordinary payment wording", () => {
  const html = renderToStaticMarkup(React.createElement(component(), { order }))
  assert.match(html, /Scan to complete payment/)
  assert.match(html, /phone camera/)
  assert.match(html, /\/api\/payments\/qr\/image/)
  assert.doesNotMatch(html, /img.vietqr|demo|simulation|Account number/i)
})
test("completed QR payment displays success without claiming a verified bank receipt", () => {
  const html = renderToStaticMarkup(
    React.createElement(component(), {
      order: { ...order, payment_status: "paid" },
    })
  )
  assert.match(html, /Payment successful/)
  assert.doesNotMatch(html, /received your transfer|demo|simulation/i)
})
