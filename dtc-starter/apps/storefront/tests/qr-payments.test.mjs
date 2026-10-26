import test from "node:test"
import assert from "node:assert/strict"
import {
  createQrPaymentToken,
  verifyQrPaymentToken,
} from "../src/server/qr-payment-token.ts"

test("QR capability is signed, scoped to an order, expiring and gated by server configuration", () => {
  const previous = {
    mode: process.env.PAYMENT_MODE,
    secret: process.env.AUTH_SECRET,
  }
  process.env.AUTH_SECRET = "qa-qr-signing-key-with-at-least-32-characters"
  process.env.PAYMENT_MODE = "simulation"
  try {
    const order = {
      id: "qa_order",
      payment_deadline: new Date(Date.now() + 600000),
    }
    const token = createQrPaymentToken(order)
    assert.equal(verifyQrPaymentToken(token).id, order.id)
    const [payload, signed] = token.split(".")
    const forged = Buffer.from(
      JSON.stringify({ id: "other", exp: Date.now() + 600000 })
    ).toString("base64url")
    for (const invalid of [
      "",
      `${forged}.${signed}`,
      `${payload}.${signed}x`,
      `${token}.extra`,
    ])
      assert.throws(
        () => verifyQrPaymentToken(invalid),
        (e) => e.status === 401
      )
    assert.throws(
      () =>
        verifyQrPaymentToken(
          createQrPaymentToken({
            ...order,
            payment_deadline: new Date(Date.now() - 1000),
          })
        ),
      (e) => e.status === 410
    )
    process.env.PAYMENT_MODE = "bank"
    assert.throws(
      () => verifyQrPaymentToken(token),
      (e) => e.status === 404
    )
  } finally {
    for (const [key, value] of [
      ["AUTH_SECRET", previous.secret],
      ["PAYMENT_MODE", previous.mode],
    ]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
