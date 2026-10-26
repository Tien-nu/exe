import { MongoClient, type Db } from "mongodb"

// A warm Vercel instance reuses its pool. Failed connections are evicted so
// a transient Atlas/network failure doesn't poison the instance permanently.
const connections = globalThis as typeof globalThis & {
  yarnlyMongo?: Promise<MongoClient>
}

export async function database(): Promise<Db> {
  const uri = process.env.MONGODB_URI
  const name = process.env.MONGODB_DB
  if (!uri || !name) throw new Error("MongoDB configuration is missing")
  if (!connections.yarnlyMongo) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5_000,
      waitQueueTimeoutMS: 5_000,
    })
    connections.yarnlyMongo = client.connect().catch(async (error) => {
      connections.yarnlyMongo = undefined
      await client.close().catch(() => {})
      throw error
    })
  }
  return (await connections.yarnlyMongo).db(name)
}

export async function transaction<T>(work: (db: Db, session: import("mongodb").ClientSession) => Promise<T>) {
  const db = await database()
  const client = await connections.yarnlyMongo!
  const session = client.startSession()
  try {
    return await session.withTransaction(() => work(db, session), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 10_000,
    })
  } finally {
    await session.endSession()
  }
}
