import { randomUUID } from "node:crypto"
import type { Document } from "mongodb"
import { authenticate, type Actor, type Identity } from "./auth"
import { ApiError, body, text } from "./http"
import { database, transaction } from "./mongodb"

const profileFields = ["first_name", "last_name", "phone", "company_name"] as const
const addressFields = ["first_name", "last_name", "company", "address_1", "address_2", "city", "province", "postal_code", "country_code", "phone", "address_name"] as const

function pickStrings(input: Record<string, unknown>, fields: readonly string[]) {
  const result: Record<string, string | null> = {}
  for (const key of fields) {
    if (!(key in input)) continue
    if (input[key] === null) result[key] = null
    else if (typeof input[key] === "string" && input[key].length <= 500) result[key] = input[key].trim()
    else throw new ApiError(400, `Invalid ${key}`)
  }
  return result
}

function publicCustomer(customer: Document) {
  return Object.fromEntries(["id", "email", "has_account", ...profileFields, "addresses", "created_at", "updated_at"]
    .map((key) => [key, customer[key] ?? (key === "addresses" ? [] : null)]))
}

async function createCustomer(actor: Actor, input: Record<string, unknown>) {
  if (actor.id) throw new ApiError(409, "Account already exists")
  if (input.email && input.email !== actor.email) throw new ApiError(400, "Email does not match identity")
  const customer = {
    id: `cus_${randomUUID()}`, email: actor.email, has_account: true, ...pickStrings(input, profileFields),
    addresses: [], created_at: new Date(), updated_at: new Date(),
  }
  await transaction(async (db, session) => {
    const linked = await db.collection<Identity>("identities").updateOne({
      id: actor.identity_id, "actors.customer": { $exists: false },
    }, { $set: { "actors.customer": customer.id } }, { session })
    if (!linked.modifiedCount) throw new ApiError(409, "Account already exists")
    await db.collection("customers").insertOne(customer, { session })
  })
  return { customer: publicCustomer(customer) }
}

export async function customers(request: Request, path: string[]) {
  const method = request.method
  if (path.length === 1 && method === "POST") {
    return createCustomer(await authenticate(request, "customer", true), await body(request))
  }
  if (path[1] !== "me") throw new ApiError(404, "Not found", "not_found")
  const actor = await authenticate(request, "customer")
  const db = await database()
  const collection = db.collection("customers")
  const customer = await collection.findOne({ id: actor.id })
  if (!customer) throw new ApiError(404, "Customer not found", "not_found")
  if (path.length === 2) {
    if (method === "GET") return { customer: publicCustomer(customer) }
    if (method === "POST") {
      const changes = pickStrings(await body(request), profileFields)
      const updated = await collection.findOneAndUpdate({ id: actor.id }, { $set: { ...changes, updated_at: new Date() } }, { returnDocument: "after" })
      return { customer: publicCustomer(updated!) }
    }
  }
  if (path[2] === "addresses") {
    const input = method === "POST" ? await body(request) : {}
    // Transaction serializes default-address changes and prevents lost updates.
    return transaction(async (db, session) => {
      const collection = db.collection("customers")
      const customer = await collection.findOne({ id: actor.id }, { session })
      if (!customer) throw new ApiError(404, "Customer not found", "not_found")
      let addresses: Document[] = customer.addresses ?? []
      const id = path[3]
      if (method === "GET" && !id) return { addresses, count: addresses.length, offset: 0, limit: 100 }
      if (id && !addresses.some((address) => address.id === id)) throw new ApiError(404, "Address not found", "not_found")
      if (method === "DELETE" && id) {
        addresses = addresses.filter((address) => address.id !== id)
      } else if (method === "POST") {
        const changes: Document = pickStrings(input, addressFields)
        for (const flag of ["is_default_billing", "is_default_shipping"]) {
          if (input[flag] !== undefined && typeof input[flag] !== "boolean") throw new ApiError(400, `Invalid ${flag}`)
          if (input[flag] !== undefined) changes[flag] = input[flag]
          if (input[flag] === true) addresses = addresses.map((address) => ({ ...address, [flag]: false }))
        }
        if (changes.country_code && !/^[a-z]{2}$/.test(changes.country_code)) throw new ApiError(400, "Invalid country_code")
        if (id) addresses = addresses.map((address) => address.id === id ? { ...address, ...changes } : address)
        else {
          if (addresses.length >= 100) throw new ApiError(400, "Address limit reached")
          text(changes.address_1, "address_1", 500)
          addresses.push({ id: `caaddr_${randomUUID()}`, ...changes })
        }
      } else throw new ApiError(405, "Method not allowed")
      await collection.updateOne({ id: actor.id }, { $set: { addresses, updated_at: new Date() } }, { session })
      return { customer: publicCustomer({ ...customer, addresses }) }
    })
  }
  throw new ApiError(404, "Not found", "not_found")
}
