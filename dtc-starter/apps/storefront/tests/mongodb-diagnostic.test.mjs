import test from "node:test"
import assert from "node:assert/strict"
import { diagnoseMongoError } from "../scripts/mongodb-diagnostic.mjs"

test("diagnostics distinguish failures without exposing driver messages", () => {
  const secret = "mongodb://private-user:private-password@private-host"
  const cases = [
    [{ code: 18, message: secret }, "AUTH_FAILED"],
    [{ code: 13, message: secret }, "PERMISSION_DENIED"],
    [{ code: 11000, message: secret }, "DUPLICATE_DATA"],
    [{ name: "MongoParseError", message: secret }, "URI_INVALID"],
    [{ cause: { code: "ENOTFOUND", message: secret } }, "DNS_FAILED"],
    [{ reason: { servers: new Map([["private-host", { error: { cause: { message: "TLS alert " + secret } } }]]) } }, "TLS_FAILED"],
    [{ name: "MongoServerSelectionError", message: secret }, "NETWORK_FAILED"],
    [{ message: secret }, "UNKNOWN_FAILURE"],
  ]
  for (const [error, expected] of cases) {
    const output = diagnoseMongoError(error)
    assert.ok(output.startsWith(expected))
    assert.equal(output.includes("private-"), false)
  }
})
