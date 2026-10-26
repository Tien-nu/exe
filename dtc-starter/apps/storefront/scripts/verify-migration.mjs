import { MongoClient } from "mongodb"
import { readSnapshot, transformSnapshot } from "./transform-snapshot.mjs"

const file = process.argv.find((arg) => arg.endsWith(".jsonl"))
let client
try {
  if (!file || !process.env.MONGODB_URI || !process.env.MONGODB_DB?.endsWith("_staging")) throw new Error()
  const snapshot = await readSnapshot(file)
  const expected = transformSnapshot(snapshot.tables)
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 2 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB)
  const results = []
  for (const [collection, rows] of Object.entries(expected)) {
    const actual = await db.collection(collection).find({ migration_snapshot: snapshot.checksum }).toArray()
    if (actual.length !== rows.length) throw new Error()
    const ids = new Set(actual.map((row) => row.id))
    if (rows.some((row) => !ids.has(row.id))) throw new Error()
    const fields = collection === "orders" || collection === "carts" ? ["item_total", "shipping_total", "total"]
      : collection === "sub_orders" ? ["subtotal", "shipping_charged"]
      : collection === "payouts" ? ["gross_amount", "fee_amount", "net_amount"]
      : collection === "inventory" ? ["stock", "reserved"] : []
    const byId = new Map(actual.map((row) => [row.id, row]))
    for (const row of rows) for (const field of fields) {
      if (Number(row[field] ?? 0) !== Number(byId.get(row.id)[field] ?? 0)) throw new Error()
    }
    if (collection === "identities") for (const row of rows) {
      const saved = byId.get(row.id)
      if (row.password_hash !== saved.password_hash || row.email !== saved.email ||
          JSON.stringify(row.actors) !== JSON.stringify(saved.actors)) throw new Error()
    }
    results.push({ collection, count: rows.length, monetary_fields_verified: fields })
  }
  const archiveCount = await db.collection("migration_archive").countDocuments({ snapshot: snapshot.checksum })
  const sourceCount = [...snapshot.tables.values()].reduce((sum, rows) => sum + rows.length, 0)
  if (archiveCount !== sourceCount) throw new Error()
  console.log(JSON.stringify({ verified: true, source_rows: sourceCount, archive_rows: archiveCount, collections: results, production_ready: false }))
} catch {
  console.error("Migration reconciliation failed. No production cutover was performed.")
  process.exitCode = 1
} finally { await client?.close().catch(() => {}) }
