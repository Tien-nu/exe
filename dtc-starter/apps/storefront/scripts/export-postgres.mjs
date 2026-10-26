// Read-only source snapshot. This is an archive, not a claim that runtime
// collections have been migrated. The output contains personal data/hashes.
import pg from "pg"
import { open, mkdir, unlink } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { createHash } from "node:crypto"

const output = process.argv[2]
if (!output || !process.env.SOURCE_DATABASE_URL) {
  console.error("Usage: SOURCE_DATABASE_URL=<set securely> node scripts/export-postgres.mjs /absolute/private/snapshot.jsonl")
  process.exit(1)
}
const destination = resolve(output)
if (!destination.endsWith(".jsonl")) throw new Error("Output must be a .jsonl file")
const client = new pg.Client({
  connectionString: process.env.SOURCE_DATABASE_URL,
  application_name: "yarnly-readonly-migration",
  connectionTimeoutMillis: 10_000,
  statement_timeout: 60_000,
})
const quote = (identifier) => '"' + identifier.replaceAll('"', '""') + '"'
let file
let completed = false
try {
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  file = await open(destination, "wx", 0o600)
  await client.connect()
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
  const checksum = createHash("sha256")
  const counts = Object.create(null)
  const write = async (record) => {
    const line = JSON.stringify(record) + "\n"
    checksum.update(line)
    await file.writeFile(line)
  }
  await write({ kind: "header", format: "yarnly-postgres-snapshot-v1", created_at: new Date().toISOString() })
  for (const { tablename } of tables) {
    await client.query(`DECLARE yarnly_export_cursor NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS row FROM public.${quote(tablename)} AS t`)
    counts[tablename] = 0
    while (true) {
      const { rows } = await client.query("FETCH FORWARD 500 FROM yarnly_export_cursor")
      if (!rows.length) break
      for (const record of rows) {
        // Preserve PostgreSQL JSON text: parsing numeric fields into JS here
        // could silently round bigint/numeric values before transformation.
        await write({ kind: "row", table: tablename, json: record.row })
        counts[tablename]++
      }
    }
    await client.query("CLOSE yarnly_export_cursor")
  }
  const digest = checksum.digest("hex")
  await file.writeFile(JSON.stringify({ kind: "footer", sha256: digest, counts }) + "\n")
  await file.sync()
  await client.query("COMMIT")
  completed = true
  console.log(`Exported ${tables.length} tables. Snapshot checksum: ${digest}`)
} catch {
  console.error("Snapshot failed; no complete snapshot was produced. Check source access and output permissions.")
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
  if (file) {
    await file.close()
    if (!completed) await unlink(destination).catch(() => {})
  }
}
