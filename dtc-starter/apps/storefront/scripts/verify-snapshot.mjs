import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"

export async function verifySnapshot(file) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  const hash = createHash("sha256")
  const counts = Object.create(null)
  let header = false
  let footer = false
  for await (const line of lines) {
    if (footer) throw new Error("Data after footer")
    if (!line) throw new Error("Unexpected empty record")
    const record = JSON.parse(line)
    if (!header) {
      if (record.kind !== "header" || record.format !== "yarnly-postgres-snapshot-v1") throw new Error("Invalid snapshot header")
      header = true
    } else if (record.kind === "row") {
      if (typeof record.table !== "string" || !record.table || typeof record.json !== "string") throw new Error("Invalid row")
      const value = JSON.parse(record.json)
      if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Row is not an object")
      counts[record.table] = (counts[record.table] ?? 0) + 1
    } else if (record.kind === "footer") {
      if (!record.counts || record.sha256 !== hash.digest("hex")) throw new Error("Snapshot checksum mismatch")
      for (const [table, count] of Object.entries(record.counts)) {
        if (!Number.isSafeInteger(count) || count < 0 || (counts[table] ?? 0) !== count) throw new Error("Snapshot count mismatch")
      }
      if (Object.keys(counts).some((table) => !(table in record.counts))) throw new Error("Missing table count")
      footer = true
      continue
    } else throw new Error("Unexpected record type")
    hash.update(line + "\n")
  }
  if (!header || !footer) throw new Error("Incomplete snapshot")
  return { ...counts }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("Usage: node scripts/verify-snapshot.mjs /private/snapshot.jsonl")
    const counts = await verifySnapshot(process.argv[2])
    console.log(`Snapshot verified: ${Object.keys(counts).length} non-empty tables.`)
  } catch {
    console.error("Snapshot verification failed; do not import this snapshot.")
    process.exitCode = 1
  }
}
