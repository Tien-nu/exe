import test from "node:test"
import assert from "node:assert/strict"
import { authenticateSepay, parseSepay } from "../src/server/sepay.ts"
import { changePayment } from "../src/server/workflows/payments.ts"

const secret = "a".repeat(40)
const payload = {
  id: 123,
  accountNumber: "00123",
  transferAmount: 103000,
  transferType: "in",
  content: "YARNLY 92",
}
test("bank webhook requires configured secret and exact authenticated header", () => {
  assert.throws(
    () => authenticateSepay(null, ""),
    (e) => e.status === 503
  )
  for (const header of [
    null,
    "Apikey wrong",
    `Bearer ${secret}`,
    `Apikey ${"b".repeat(40)}`,
  ])
    assert.throws(
      () => authenticateSepay(header, secret),
      (e) => e.status === 401
    )
  assert.doesNotThrow(() => authenticateSepay(`Apikey ${secret}`, secret))
})
test("bank transaction validates amount, direction, account and unambiguous order reference", () => {
  assert.deepEqual(parseSepay(payload), {
    id: 123,
    account: "00123",
    amount: 103000,
    incoming: true,
    displayId: 92,
  })
  assert.equal(
    parseSepay({ ...payload, content: "YARNLY92 transfer" }).displayId,
    92
  )
  for (const content of ["YARNLY 92 YARNLY 93", "YARNLY 92abc", "unrelated"])
    assert.equal(parseSepay({ ...payload, content }).displayId, null)
  for (const patch of [
    { id: 0 },
    { id: "123" },
    { transferAmount: -1 },
    { transferAmount: 1.5 },
    { transferAmount: "103000" },
    { transferType: "credit" },
    { accountNumber: 123 },
  ])
    assert.throws(
      () => parseSepay({ ...payload, ...patch }),
      (e) => e.status === 400
    )
})
test("customer cannot confirm a bank payment even through the workflow", async () => {
  await assert.rejects(
    changePayment("any", "confirm", { role: "customer", id: "customer" }),
    (e) => e.status === 403
  )
})
