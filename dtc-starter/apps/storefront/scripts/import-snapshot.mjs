import { MongoClient } from "mongodb"
import { createHash } from "node:crypto"
import { readSnapshot, transformSnapshot } from "./transform-snapshot.mjs"
import { createIndexes } from "../src/server/indexes.ts"

const file = process.argv.find((arg) => arg.endsWith(".jsonl"))
if (!file) {
  console.error("Usage: node --experimental-strip-types --env-file=.env.local scripts/import-snapshot.mjs /private/snapshot.jsonl [--apply]")
  process.exit(1)
}
let client
let stage = "validate"
try {
  const snapshot = await readSnapshot(file)
  const collections = transformSnapshot(snapshot.tables)
  const counts = Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, rows.length]))
  console.log(JSON.stringify({ stage: "validated", counts }))
  if (process.argv.includes("--apply")) {
    if (!process.env.MONGODB_URI || !process.env.MONGODB_DB?.endsWith("_staging") || process.env.MONGODB_API_PREVIEW === "true") {
      throw new Error("Import requires staging with preview disabled")
    }
    client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 3, serverSelectionTimeoutMS: 10_000 })
    await client.connect()
    const db = client.db(process.env.MONGODB_DB)
    stage = "preflight"
    for (const name of Object.keys(collections)) {
      if (await db.collection(name).findOne({ migration_snapshot: { $ne: snapshot.checksum } }, { projection: { _id: 1 } })) {
        throw new Error("Destination has data from a different run; automatic overwrite is refused")
      }
    }
    await createIndexes(db)
    stage = "archive"
    let archived = 0
    for (const [table, rows] of snapshot.tables) {
      for (let start = 0; start < rows.length; start += 250) {
        const batch = rows.slice(start, start + 250).map((row, index) => {
          const id = createHash("sha256").update(`${snapshot.checksum}:${table}:${start + index}`).digest("hex")
          return { replaceOne: { filter: { _id: id }, replacement: {
            _id: id, snapshot: snapshot.checksum, table, ordinal: start + index, data: row,
          }, upsert: true } }
        })
        if (batch.length) await db.collection("migration_archive").bulkWrite(batch, { ordered: true })
        archived += batch.length
      }
    }
    stage = "runtime-transaction"
    const session = client.startSession()
    try {
      await session.withTransaction(async () => {
        for (const [name, rows] of Object.entries(collections)) {
          if (rows.length) await db.collection(name).bulkWrite(rows.map((row) => ({ replaceOne: {
            filter: { id: row.id }, replacement: { ...row, migration_snapshot: snapshot.checksum }, upsert: true,
          } })), { session, ordered: true })
        }
        await db.collection("migration_state").updateOne({ _id: "postgres-import" }, { $set: {
          snapshot: snapshot.checksum, status: "imported", counts, archived_rows: archived, imported_at: new Date(),
          production_ready: false,
        } }, { session, upsert: true })
      }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" } })
    } finally { await session.endSession() }
    stage = "verify-counts"
    for (const [name, expected] of Object.entries(counts)) {
      const actual = await db.collection(name).countDocuments({ migration_snapshot: snapshot.checksum })
      if (actual !== expected) throw new Error("Imported record count mismatch")
    }
    console.log(JSON.stringify({ stage: "imported-and-counts-verified", counts, archived_rows: archived,
      snapshot: snapshot.checksum, production_ready: false }))
  } else console.log("Dry run only. No MongoDB data changed.")
} catch (error) {
  // Never print driver errors or row values: they may contain personal data.
  console.error(`Migration failed during ${stage}. No production cutover was performed. Check migration preconditions and source consistency.`)
  if (typeof error?.code === "number") console.error(`Database error code: ${error.code}`)
  if (typeof error?.codeName === "string" && /^[A-Za-z]+$/.test(error.codeName)) console.error(`Database error type: ${error.codeName}`)
  process.exitCode = 1
} finally { await client?.close().catch(() => {}) }
