import pg from "pg"
import { writeFile } from "node:fs/promises"

if (!process.env.SOURCE_DATABASE_URL) {
  console.error("SOURCE_DATABASE_URL_MISSING: Add it to .env.local; never paste credentials into chat.")
  process.exit(1)
}
let client
try {
  client = new pg.Client({ connectionString: process.env.SOURCE_DATABASE_URL,
    application_name: "yarnly-readonly-schema-check", connectionTimeoutMillis: 10_000,
    statement_timeout: 20_000 })
  await client.connect()
  await client.query("BEGIN READ ONLY")
  const { rows } = await client.query(`SELECT table_name, column_name, data_type
    FROM information_schema.columns WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`)
  await client.query("ROLLBACK")
  if (process.argv.includes("--schema")) {
    await writeFile(new URL("../../../migration/source-schema.json", import.meta.url), JSON.stringify(rows, null, 2) + "\n")
  }
  console.log(`PostgreSQL read-only connection succeeded. Tables: ${new Set(rows.map((row) => row.table_name)).size}.`)
} catch (error) {
  const code = String(error?.code ?? "")
  const category = code === "28P01" ? "AUTH_FAILED" : code === "ENOTFOUND" ? "DNS_FAILED"
    : code === "42501" ? "PERMISSION_DENIED" : /certificate|TLS|SSL/i.test(String(error?.message)) ? "TLS_FAILED" : "CONNECTION_FAILED"
  console.error(`PostgreSQL ${category}. Check the source database connection settings.`)
  process.exitCode = 1
} finally { await client?.end().catch(() => {}) }
