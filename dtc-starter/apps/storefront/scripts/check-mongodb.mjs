import { MongoClient } from "mongodb"
import { diagnoseMongoError } from "./mongodb-diagnostic.mjs"

const uri = process.env.MONGODB_URI
const name = process.env.MONGODB_DB
if (!uri || !name) {
  console.error("Set MONGODB_URI and MONGODB_DB in .env.local first.")
  process.exit(1)
}
let client
try {
  // Parsing can also throw; keep it inside the redacted error boundary.
  client = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 10_000 })
  await client.connect()
  const db = client.db(name)
  await db.command({ ping: 1 })
  console.log("MongoDB connection succeeded.")
  if (process.argv.includes("--create-indexes")) {
    const { createIndexes } = await import("../src/server/indexes.ts")
    await createIndexes(db)
    console.log("Migration indexes created.")
  }
} catch (error) {
  // Connection errors may embed credentials or private hostnames.
  console.error("MongoDB check failed.")
  console.error(diagnoseMongoError(error))
  process.exitCode = 1
} finally {
  await client?.close().catch(() => {})
}
