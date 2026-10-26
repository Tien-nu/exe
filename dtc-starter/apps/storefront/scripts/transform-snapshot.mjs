import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { stat } from "node:fs/promises"
import { verifySnapshot } from "./verify-snapshot.mjs"

export async function readSnapshot(file) {
  if ((await stat(file)).size > 100 * 1024 * 1024) throw new Error("Snapshot exceeds the in-memory transformer limit")
  await verifySnapshot(file)
  const tables = new Map()
  let checksum
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    const record = JSON.parse(line)
    if (record.kind === "footer") checksum = record.sha256
    if (record.kind !== "row") continue
    const row = JSON.parse(record.json, (_key, value) => {
      if (typeof value === "number" && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value))) {
        throw new Error("Unsafe numeric value; manual transformation is required")
      }
      return value
    })
    const rows = tables.get(record.table) ?? []
    rows.push(row)
    tables.set(record.table, rows)
  }
  return { tables, checksum }
}

export function transformSnapshot(tables) {
  const rows = (name) => (tables.get(name) ?? []).filter((row) => !row.deleted_at)
  for (const table of ["order_line_item_adjustment", "cart_line_item_adjustment", "order_shipping_method_adjustment", "cart_shipping_method_adjustment",
    "order_line_item_tax_line", "cart_line_item_tax_line", "order_shipping_method_tax_line", "cart_shipping_method_tax_line"]) {
    if (rows(table).some((row) => Number(row.amount ?? row.rate ?? 0) !== 0)) throw new Error("Tax/discount data requires reconciliation before import")
  }
  const byId = (name, id) => rows(name).find((row) => row.id === id)
  const dates = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value && typeof value === "string" && (key.endsWith("_at") || key.endsWith("_deadline") || key === "due_date")
      ? new Date(value) : value,
  ]))
  const output = {}
  const direct = { artisans: "artisan", marketplace_orders: "marketplace_order", custom_requests: "custom_request",
    payouts: "payout", marketplace_settings: "marketplace_setting", collections: "product_collection", users: "user",
    shipping_options: "shipping_option", promotions: "promotion" }
  for (const [collection, table] of Object.entries(direct)) output[collection] = rows(table).map(dates)
  output.customers = rows("customer").map((row) => ({ ...dates(row), email: row.email?.trim().toLowerCase(),
    addresses: rows("customer_address").filter((address) => address.customer_id === row.id).map(dates),
  }))
  output.identities = rows("provider_identity").filter((row) => row.provider === "emailpass").map((provider) => {
    const auth = byId("auth_identity", provider.auth_identity_id)
    if (!auth || typeof provider.provider_metadata?.password !== "string") throw new Error("Missing password/auth identity")
    const actors = {}
    for (const [role, key, table] of [["customer", "customer_id", "customer"], ["artisan", "artisan_id", "artisan"], ["admin", "user_id", "user"]]) {
      const id = auth.app_metadata?.[key]
      if (id) {
        if (!byId(table, id)) throw new Error("Auth actor references a missing record")
        actors[role] = id
      }
    }
    return { id: auth.id, email: provider.entity_id.trim().toLowerCase(), password_hash: provider.provider_metadata.password,
      actors, session_version: 0, created_at: new Date(auth.created_at), updated_at: new Date(auth.updated_at) }
  })
  if (new Set(output.identities.map((identity) => identity.email)).size !== output.identities.length) throw new Error("Duplicate identity emails require manual reconciliation")
  output.regions = rows("region").map((region) => ({ ...dates(region),
    countries: rows("region_country").filter((country) => country.region_id === region.id).map(dates),
    payment_providers: rows("region_payment_provider").filter((provider) => provider.region_id === region.id).map((provider) => ({ id: provider.payment_provider_id })),
  }))
  const options = rows("product_option").map((option) => ({ ...dates(option), values: rows("product_option_value").filter((value) => value.option_id === option.id).map(dates) }))
  output.inventory = []
  const variants = rows("product_variant").map((variant) => {
    const priceLink = rows("product_variant_price_set").find((link) => link.variant_id === variant.id)
    const prices = rows("price").filter((price) => price.price_set_id === priceLink?.price_set_id && !price.price_list_id && !price.rules_count)
    const price = prices.find((price) => price.currency_code === "vnd") ?? prices[0]
    const inventoryLinks = rows("product_variant_inventory_item").filter((link) => link.variant_id === variant.id)
    // This runtime models one stock unit per variant. Reject bundles/shared
    // inventory rather than silently changing their fulfillment semantics.
    if (inventoryLinks.length > 1 || inventoryLinks.some((link) => Number(link.required_quantity) !== 1)) throw new Error("Multi-item inventory requires a bundle adapter")
    const itemId = inventoryLinks[0]?.inventory_item_id
    const levels = rows("inventory_level").filter((level) => level.inventory_item_id === itemId)
    const stock = levels.reduce((sum, level) => sum + Number(level.stocked_quantity), 0)
    const reserved = levels.reduce((sum, level) => sum + Number(level.reserved_quantity), 0)
    if (variant.manage_inventory && !itemId) throw new Error("Managed variant has no inventory mapping")
    output.inventory.push({ id: variant.id, variant_id: variant.id, inventory_item_id: itemId ?? null, stock, reserved })
    return { ...dates(variant), stock, reserved, prices: prices.map(dates),
      options: rows("product_variant_option").filter((link) => link.variant_id === variant.id).map((link) => {
        const value = byId("product_option_value", link.option_value_id)
        if (!value) throw new Error("Variant option value missing")
        return { ...dates(value), option: options.find((option) => option.id === value.option_id) }
      }),
      calculated_price: price ? { id: price.id, currency_code: price.currency_code,
        calculated_amount: Number(price.amount), original_amount: Number(price.amount),
        calculated_price: { price_list_type: null }, original_price: { price_list_type: null } } : null,
    }
  })
  const mappedInventory = output.inventory.filter((row) => row.inventory_item_id)
  if (new Set(mappedInventory.map((row) => row.inventory_item_id)).size !== mappedInventory.length) throw new Error("Shared inventory requires a shared-stock adapter")
  output.products = rows("product").map((product) => {
    const artisanLink = rows("marketplace_artisan_product_product").find((link) => link.product_id === product.id)
    const categories = rows("product_category_product").filter((link) => link.product_id === product.id).map((link) => byId("product_category", link.product_category_id)).filter(Boolean)
    const tags = rows("product_tags").filter((link) => link.product_id === product.id).map((link) => byId("product_tag", link.product_tag_id)).filter(Boolean)
    return { ...dates(product), artisan_id: artisanLink?.artisan_id ?? null,
      collection: byId("product_collection", product.collection_id) ?? null, type: byId("product_type", product.type_id) ?? null,
      categories: categories.map(dates), tags: tags.map(dates),
      images: rows("image").filter((image) => image.product_id === product.id).map(dates),
      options: options.filter((option) => option.product_id === product.id || rows("product_product_option").some((link) => link.product_id === product.id && link.product_option_id === option.id)),
      variants: variants.filter((variant) => variant.product_id === product.id),
    }
  })
  output.product_categories = rows("product_category").map((category) => ({ ...dates(category),
    category_children: rows("product_category").filter((child) => child.parent_category_id === category.id).map(dates),
    parent_category: byId("product_category", category.parent_category_id) ?? null,
  }))
  output.reservations = rows("reservation_item").map((reservation) => {
    const variant = output.inventory.find((inventory) => inventory.inventory_item_id === reservation.inventory_item_id)
    if (!variant) throw new Error("Reservation has no variant mapping")
    return { ...dates(reservation), variant_id: variant.variant_id }
  })
  output.sub_orders = rows("sub_order").map((sub) => ({ ...dates(sub), items: rows("sub_order_item").filter((item) => item.sub_order_id === sub.id).map(dates) }))
  const line = (item) => ({ ...dates(item), quantity: Number(item.quantity), unit_price: Number(item.unit_price), subtotal: Number(item.unit_price) * Number(item.quantity), total: Number(item.unit_price) * Number(item.quantity) })
  const paymentCollection = (table, field, id) => {
    const link = rows(table).find((link) => link[field] === id)
    const payment = byId("payment_collection", link?.payment_collection_id)
    return payment ? { ...dates(payment), payment_sessions: rows("payment_session").filter((session) => session.payment_collection_id === payment.id).map(dates) } : null
  }
  output.carts = rows("cart").map((cart) => ({ ...dates(cart),
    items: rows("cart_line_item").filter((item) => item.cart_id === cart.id).map(line),
    shipping_methods: rows("cart_shipping_method").filter((method) => method.cart_id === cart.id).map(dates),
    shipping_address: byId("cart_address", cart.shipping_address_id) ?? null,
    billing_address: byId("cart_address", cart.billing_address_id) ?? null,
    payment_collection: paymentCollection("cart_payment_collection", "cart_id", cart.id), region: output.regions.find((region) => region.id === cart.region_id),
  }))
  output.orders = rows("order").map((order) => {
    const items = rows("order_item").filter((item) => item.order_id === order.id && item.version === order.version).map((item) => {
      const raw = byId("order_line_item", item.item_id)
      if (!raw) throw new Error("Order item is missing")
      return line({ ...raw, quantity: item.quantity, unit_price: item.unit_price ?? raw.unit_price })
    })
    const shipping = rows("order_shipping").filter((link) => link.order_id === order.id && link.version === order.version).map((link) => byId("order_shipping_method", link.shipping_method_id)).filter(Boolean).map(dates)
    const summary = rows("order_summary").find((summary) => summary.order_id === order.id && summary.version === order.version)
    return { ...dates(order), cart_id: rows("order_cart").find((link) => link.order_id === order.id)?.cart_id ?? null,
      items, shipping_methods: shipping, shipping_address: byId("order_address", order.shipping_address_id) ?? null,
      billing_address: byId("order_address", order.billing_address_id) ?? null,
      payment_collection: paymentCollection("order_payment_collection", "order_id", order.id),
      legacy_totals: summary?.totals ?? null,
    }
  })
  for (const collection of ["carts", "orders"]) for (const doc of output[collection]) {
    doc.item_total = doc.items.reduce((sum, item) => sum + item.total, 0)
    doc.item_subtotal = doc.item_total
    doc.shipping_total = doc.shipping_methods.reduce((sum, method) => sum + Number(method.amount), 0)
    doc.total = doc.item_total + doc.shipping_total
    doc.subtotal = doc.item_total
    doc.discount_total = 0
    doc.tax_total = 0
    doc.promotions = []
    if (doc.legacy_totals) {
      // Do not manufacture totals when legacy discounts/tax/credits differ.
      const summaryTotal = doc.legacy_totals.current_order_total ?? doc.legacy_totals.order_total
      if (summaryTotal !== undefined && Number(summaryTotal) !== doc.total) throw new Error("Order totals require tax/discount/credit reconciliation")
    }
  }
  const requireRef = (collection, key, target, optional = false) => {
    const ids = new Set(output[target].map((row) => row.id))
    for (const row of output[collection]) if (!(optional && !row[key]) && !ids.has(row[key])) throw new Error(`Missing relation: ${collection}.${key}`)
  }
  requireRef("sub_orders", "marketplace_order_id", "marketplace_orders")
  requireRef("sub_orders", "artisan_id", "artisans")
  requireRef("marketplace_orders", "order_id", "orders")
  requireRef("products", "artisan_id", "artisans", true)
  const totals = new Map(output.sub_orders.map((sub) => [sub.id, sub.items.reduce((sum, item) => sum + Number(item.total), 0)]))
  if (output.sub_orders.some((sub) => Number(sub.subtotal) !== totals.get(sub.id))) throw new Error("Sub-order item totals mismatch")
  return output
}
