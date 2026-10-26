import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

// Compile only the pure rules in memory. No database credentials or Next.js
// server are needed, and tests compare against the deployed implementation.
function load(relativePath, dependencies = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8")
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const exports = {}
  vm.runInNewContext(output, { exports, Date, Intl, process: { env: {} },
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  })
  return exports
}
const rules = load("../src/server/domain/order-rules.ts")
const constants = load("../../backend/src/lib/marketplace/constants.ts")
const format = load("../../backend/src/lib/marketplace/format.ts", { "./constants": constants })
const original = load("../../backend/src/lib/marketplace/orders.ts", {
  "@medusajs/framework/utils": {}, "../../modules/marketplace": {},
  "./constants": constants, "./format": format, "./numbers": {}, "./parcels": {},
})
const now = new Date("2026-10-24T08:00:00Z")
const plain = (value) => JSON.parse(JSON.stringify(value))
const sub = (status, extra = {}) => ({ status, customer_id: "cus_1", artisan_id: "art_1", ...extra })
const actor = (role, id = role === "customer" ? "cus_1" : "art_1") => ({ role, id })

test("timing constants match deployed marketplace", () => {
  assert.equal(rules.PAYMENT_WINDOW, constants.PAYMENT_WINDOW_MINUTES * constants.MINUTE)
  assert.equal(rules.ACCEPT_WINDOW, constants.ACCEPT_WINDOW_HOURS * constants.HOUR)
  assert.equal(rules.COMPLETE_WINDOW, constants.AUTO_COMPLETE_DAYS * constants.DAY)
})
for (const input of [{ is_custom: false }, { is_custom: true, lead_days: 3 }, { is_custom: true, lead_days: null }]) {
  test(`initial state matches deployed rules: ${JSON.stringify(input)}`, () => {
    assert.deepEqual(plain(rules.startState(input, now)), plain(original.startState(input, now)))
  })
}
test("customer can cancel before acceptance but not during production", () => {
  for (const status of ["pending_payment", "pending_acceptance"]) {
    assert.equal(rules.transition(sub(status), "cancel", actor("customer"), now).status, "canceled")
  }
  for (const status of ["processing", "ready_to_ship", "shipping", "delivered", "completed", "canceled"]) {
    assert.throws(() => rules.transition(sub(status), "cancel", actor("customer"), now), /not_allowed/)
  }
})
test("cross-account operations are hidden as not found", () => {
  assert.throws(() => rules.transition(sub("pending_acceptance"), "accept", actor("artisan", "other"), now), /not_found/)
  assert.throws(() => rules.transition(sub("pending_payment"), "cancel", actor("customer", "other"), now), /not_found/)
})
test("artisan acceptance enforces the 12-hour deadline", () => {
  assert.throws(() => rules.transition(sub("pending_acceptance", { accept_deadline: new Date(+now - 1) }), "accept", actor("artisan"), now), /deadline_passed/)
  const accepted = rules.transition(sub("pending_acceptance", { accept_deadline: now, lead_days: 3 }), "accept", actor("artisan"), now)
  assert.equal(accepted.status, "processing")
  assert.equal(+accepted.due_date, +now + 3 * rules.DAY)
})
test("artisan cannot ship, deliver or complete orders", () => {
  for (const [status, action] of [["ready_to_ship", "ship"], ["shipping", "deliver"], ["delivered", "complete"]]) {
    assert.throws(() => rules.transition(sub(status), action, actor("artisan"), now), /not_allowed/)
  }
})
test("shipping requires ready state and admin role", () => {
  assert.throws(() => rules.transition(sub("processing"), "ship", actor("admin"), now), /not_allowed/)
  assert.equal(rules.transition(sub("ready_to_ship"), "ship", actor("admin"), now).status, "shipping")
  const delivered = rules.transition(sub("shipping"), "deliver", actor("admin"), now)
  assert.equal(+delivered.complete_at, +now + 2 * rules.DAY)
})
test("auto-completion only happens after the original cutoff", () => {
  assert.throws(() => rules.transition(sub("delivered", { complete_at: now }), "complete", actor("system"), now), /not_allowed/)
  assert.equal(rules.transition(sub("delivered", { complete_at: new Date(+now - 1) }), "complete", actor("system"), now).status, "completed")
})
test("terminal states cannot be canceled again", () => {
  for (const status of ["canceled", "completed"]) {
    assert.throws(() => rules.transition(sub(status), "cancel", actor("admin"), now), /not_allowed/)
  }
})
for (const date of ["2026-10-25T16:59:59Z", "2026-10-25T17:00:00Z", "2026-01-01T00:00:00Z", "2027-01-03T17:00:00Z"]) {
  test(`payout week matches deployed Vietnam calendar: ${date}`, () => {
    assert.equal(+rules.weekStartVietnam(new Date(date)), +format.vnWeekStart(new Date(date)))
  })
}
test("payout keeps original fee rounding and conserves money", () => {
  const result = rules.payoutAmounts([100001, 200002], 2.5)
  assert.equal(result.fee_amount, Math.round(300003 * 2.5 / 100))
  assert.equal(result.gross_amount, result.fee_amount + result.net_amount)
  assert.deepEqual(plain(rules.payoutAmounts([500], 100)), { gross_amount: 500, fee_amount: 500, net_amount: 0 })
})
test("invalid amounts cannot enter payouts", () => {
  for (const [amounts, fee] of [[[-1], 0], [[NaN], 2], [[1.5], 0], [[1], -1], [[1], 101], [[Number.MAX_SAFE_INTEGER, 1], 0]]) {
    assert.throws(() => rules.payoutAmounts(amounts, fee), /invalid_amount/)
  }
})
