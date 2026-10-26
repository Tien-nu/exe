import type { Db } from "mongodb"

// Run explicitly before serving traffic, never on every Vercel request.
export async function createIndexes(db: Db) {
  const definitions = [
    ["identities", { id: 1 }, { unique: true }],
    ["identities", { email: 1 }, { unique: true }],
    ["email_verifications", { identity_id: 1 }, { unique: true }],
    ["email_verifications", { token_hash: 1 }, { unique: true }],
    ["email_verifications", { expires_at: 1 }, { expireAfterSeconds: 0 }],
    ["customers", { id: 1 }, { unique: true }],
    ["customers", { email: 1 }, { unique: true, name: "customers_account_email_unique", partialFilterExpression: { has_account: true } }],
    ["artisans", { id: 1 }, { unique: true }],
    ["artisans", { handle: 1 }, { unique: true }],
    ["artisans", { email: 1 }, { unique: true }],
    ["products", { id: 1 }, { unique: true }],
    ["products", { handle: 1 }, { unique: true }],
    ["products", { status: 1, created_at: -1 }, {}],
    ["products", { artisan_id: 1, status: 1 }, {}],
    ["carts", { id: 1 }, { unique: true }],
    ["inventory", { variant_id: 1 }, { unique: true }],
    ["admin_layout_configurations", { id: 1 }, { unique: true }],
    ["reservations", { line_item_id: 1 }, {}],
    ["counters", { id: 1 }, { unique: true }],
    ["shipping_quotes", { id: 1 }, { unique: true }],
    ["shipping_quotes", { expires_at: 1 }, { expireAfterSeconds: 0 }],
    ["uploads", { id: 1 }, { unique: true }],
    ["uploads", { expires_at: 1 }, { expireAfterSeconds: 0 }],
    ["orders", { id: 1 }, { unique: true }],
    ["orders", { cart_id: 1 }, { unique: true, partialFilterExpression: { cart_id: { $type: "string" } } }],
    ["orders", { customer_id: 1, created_at: -1 }, {}],
    ["order_transfers", { order_id: 1 }, { unique: true }],
    ["order_transfers", { expires_at: 1 }, { expireAfterSeconds: 0 }],
    ["marketplace_orders", { order_id: 1 }, { unique: true }],
    ["marketplace_orders", { payment_status: 1, payment_deadline: 1 }, {}],
    ["sub_orders", { id: 1 }, { unique: true }],
    ["sub_orders", { artisan_id: 1, status: 1 }, {}],
    ["sub_orders", { marketplace_order_id: 1 }, {}],
    ["sub_orders", { status: 1, accept_deadline: 1 }, {}],
    ["sub_orders", { status: 1, complete_at: 1 }, {}],
    ["custom_requests", { id: 1 }, { unique: true }],
    ["custom_requests", { customer_id: 1, created_at: -1 }, {}],
    ["payouts", { id: 1 }, { unique: true }],
    ["outbox", { deduplication_key: 1 }, { unique: true }],
    ["outbox", { status: 1, next_attempt_at: 1 }, {}],
    ["rate_limits", { expires_at: 1 }, { expireAfterSeconds: 0 }],
  ] as const
  for (const [collection, keys, options] of definitions) {
    await db.collection(collection).createIndex(keys, options)
  }
  // Medusa permits a guest and a registered customer with the same email.
  // Upgrade the initial staging-only index after creating its replacement.
  const previous = (await db.collection("customers").listIndexes().toArray()).find((index) => index.name === "email_1")
  if (previous?.unique && !previous.partialFilterExpression && previous.key.email === 1 && Object.keys(previous.key).length === 1) {
    if (!db.databaseName.endsWith("_staging")) throw new Error("Legacy customer index needs a reviewed migration")
    await db.collection("customers").dropIndex("email_1")
  }
}
