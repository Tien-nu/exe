import test from "node:test"
import assert from "node:assert/strict"
import { originalAdminAuth } from "../src/server/original-admin.ts"

test("admin login discovers email/password without a session or database", async () => {
  const response = await originalAdminAuth(
    new Request("http://test/auth/user/providers"),
    ["user", "providers"]
  )
  assert.equal(response.status, 200)
  const { providers } = await response.json()
  assert.deepEqual(providers, [{
    id: "emailpass",
    identifier: "emailpass",
    display_name: "Email and Password",
    flow: "credentials",
  }])
})

test("provider discovery does not bypass session authentication", async () => {
  const response = await originalAdminAuth(
    new Request("http://test/auth/session", { method: "POST" }),
    ["session"]
  )
  assert.equal(response.status, 401)
})
