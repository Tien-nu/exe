import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { verifyPayOSWebhook } from "../src/server/payos.ts"

test("PayOS accepts a signed receipt and rejects an altered amount", async () => {
  const names = ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY"]
  const previous = names.map((name) => process.env[name])
  try {
    for (const name of names) process.env[name] = "test-only-not-a-real-key"
    const data = {
      orderCode: 123456,
      amount: 3000,
      description: "YARNLY",
      accountNumber: "12345678",
      reference: "test-reference",
      transactionDateTime: "2026-11-04 16:00:00",
      currency: "VND",
      paymentLinkId: "test-link-id",
      code: "00",
      desc: "Success",
    }
    const canonical = Object.keys(data).sort().map((key) => `${key}=${data[key]}`).join("&")
    const signature = createHmac("sha256", process.env.PAYOS_CHECKSUM_KEY).update(canonical).digest("hex")
    const webhook = { code: "00", desc: "success", success: true, data, signature }
    assert.deepEqual(await verifyPayOSWebhook(webhook), data)
    await assert.rejects(verifyPayOSWebhook({ ...webhook, data: { ...data, amount: 1 } }))
    delete process.env.PAYOS_CHECKSUM_KEY
    await assert.rejects(verifyPayOSWebhook(webhook), (error) => error.status === 503)
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name]
      else process.env[name] = previous[index]
    })
  }
})
