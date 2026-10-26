import test from "node:test"
import assert from "node:assert/strict"
import { transformSnapshot } from "../scripts/transform-snapshot.mjs"

test("migration preserves guest/customer email overlap and identity actor links", () => {
  const tables = new Map([
    ["customer", [{ id: "guest", email: "SAME@example.test", has_account: false }, { id: "account", email: "same@example.test", has_account: true }]],
    ["auth_identity", [{ id: "auth", app_metadata: { customer_id: "account" }, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }]],
    ["provider_identity", [{ id: "provider", auth_identity_id: "auth", provider: "emailpass", entity_id: "same@example.test", provider_metadata: { password: "hash-preserved" } }]],
  ])
  const output = transformSnapshot(tables)
  assert.equal(output.customers.length, 2)
  assert.equal(output.identities[0].actors.customer, "account")
  assert.equal(output.identities[0].password_hash, "hash-preserved")
  assert.ok(output.identities[0].created_at instanceof Date)
})
test("migration refuses missing auth actors and unsupported discount math", () => {
  const tables = new Map([
    ["auth_identity", [{ id: "auth", app_metadata: { customer_id: "missing" } }]],
    ["provider_identity", [{ auth_identity_id: "auth", provider: "emailpass", entity_id: "test@example.test", provider_metadata: { password: "hash" } }]],
  ])
  assert.throws(() => transformSnapshot(tables), /missing record/)
  assert.throws(() => transformSnapshot(new Map([["order_line_item_adjustment", [{ amount: 100 }]]])), /reconciliation/)
})
test("migration refuses an orphaned sub-order and subtotal mismatch", () => {
  const tables = new Map([["sub_order", [{ id: "sub", marketplace_order_id: "missing", artisan_id: "artisan", subtotal: 10 }]]])
  assert.throws(() => transformSnapshot(tables), /Missing relation/)
})
