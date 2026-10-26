import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { verifySnapshot } from "../scripts/verify-snapshot.mjs"

function snapshot(records) {
  const lines = records.map((row) => JSON.stringify(row) + "\n").join("")
  const counts = {}
  for (const row of records.filter((record) => record.kind === "row")) counts[row.table] = (counts[row.table] ?? 0) + 1
  return lines + JSON.stringify({ kind: "footer", sha256: createHash("sha256").update(lines).digest("hex"), counts }) + "\n"
}
const header = { kind: "header", format: "yarnly-postgres-snapshot-v1" }
test("snapshot validation rejects corruption and incomplete exports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yarnly-snapshot-test-"))
  const file = join(directory, "snapshot.jsonl")
  try {
    const valid = snapshot([header, { kind: "row", table: "order", json: '{"id":"order_1","amount":9007199254740993}' }])
    await writeFile(file, valid)
    assert.deepEqual(await verifySnapshot(file), { order: 1 })
    for (const invalid of [valid.replace("order_1", "order_2"), valid.split("\n").slice(0, -2).join("\n"), valid + JSON.stringify(header), snapshot([header, { kind: "row", table: "order", json: "[]" }])]) {
      await writeFile(file, invalid)
      await assert.rejects(verifySnapshot(file))
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
