import { randomUUID } from "node:crypto"
import type { Db, Document, ClientSession } from "mongodb"
import { database, transaction } from "./mongodb"
import { ApiError, text } from "./http"
import { enqueue } from "./workflows/sub-orders"
import { COMPLETE_WINDOW } from "./domain/order-rules"
import { escapeHtml } from "./format"
import { STOREFRONT_URL } from "./email-context"

const uid = (prefix: string) => `${prefix}_${randomUUID()}`
const clean = (row: Document): Document => {
  const { _id, migration_snapshot, ...result } = row
  return result
}
async function archive(db: Db, table: string, filter: Document = {}) {
  return (
    await db
      .collection("migration_archive")
      .find(
        { table, "data.deleted_at": null, ...filter },
        { projection: { data: 1 } }
      )
      .toArray()
  ).map((row) => row.data as Document)
}
async function entities(db: Db, collection: string, table: string) {
  const current = await db.collection(collection).find({}).toArray()
  return [
    ...current,
    ...(await archive(db, table)).filter(
      (old) => !current.some((row) => row.id === old.id)
    ),
  ]
    .filter((row) => !row.deleted_at)
    .map(clean)
}

// Restore the actual migrated relations expected by Medusa's fulfillment form.
// No warehouse, address, or shipping service is synthesized here.
export async function adminShippingOptions(
  db: Db,
  locationId?: string
): Promise<Document[]> {
  const [options, zones, sets, links, locations] = await Promise.all([
    entities(db, "shipping_options", "shipping_option"),
    archive(db, "service_zone"),
    archive(db, "fulfillment_set"),
    archive(db, "location_fulfillment_set"),
    entities(db, "admin_stock_locations", "stock_location"),
  ])
  return options
    .map((option) => {
      const zone =
        option.service_zone ??
        zones.find((zone) => zone.id === option.service_zone_id)
      const set =
        zone?.fulfillment_set ??
        sets.find((set) => set.id === zone?.fulfillment_set_id)
      const location =
        set?.location ??
        locations.find((location) =>
          links.some(
            (link) =>
              link.fulfillment_set_id === set?.id &&
              link.stock_location_id === location.id
          )
        )
      return {
        ...option,
        ...(zone && set && location
          ? { service_zone: { ...zone, fulfillment_set: { ...set, location } } }
          : {}),
      }
    })
    .filter(
      (option) =>
        !locationId ||
        option.service_zone?.fulfillment_set?.location?.id === locationId
    )
}

function profileFor(
  product: Document | undefined,
  links: Document[],
  profiles: Document[]
) {
  const explicit =
    product?.shipping_profile_id ??
    links.find((link) => link.product_id === product?.id)?.shipping_profile_id
  const defaults = profiles.filter((profile) => profile.type === "default")
  return (
    explicit ?? (product && defaults.length === 1 ? defaults[0].id : undefined)
  )
}

type HistoricalFulfillments = {
  details: Document[]
  links: Document[]
  fulfillments: Document[]
  items: Document[]
}
async function historicalFulfillments(
  db: Db,
  orders: Document[]
): Promise<HistoricalFulfillments> {
  const orderIds = orders.map((order) => order.id)
  const [details, links] = await Promise.all([
    archive(db, "order_item", { "data.order_id": { $in: orderIds } }),
    archive(db, "order_fulfillment", {
      "data.order_id": {
        $in: orders
          .filter((order) => !order.fulfillments)
          .map((order) => order.id),
      },
    }),
  ])
  const fulfillmentIds = links.map((link) => link.fulfillment_id)
  const [fulfillments, items] = await Promise.all([
    archive(db, "fulfillment", { "data.id": { $in: fulfillmentIds } }),
    archive(db, "fulfillment_item", {
      "data.fulfillment_id": { $in: fulfillmentIds },
    }),
  ])
  return { details, links, fulfillments, items }
}
async function orderState(
  db: Db,
  order: Document,
  history?: HistoricalFulfillments
) {
  const loaded = history ?? (await historicalFulfillments(db, [order]))
  const details = loaded.details.filter(
    (detail) => detail.order_id === order.id
  )
  const links = loaded.links.filter((link) => link.order_id === order.id)
  const legacy =
    order.fulfillments ??
    loaded.fulfillments.filter((fulfillment) =>
      links.some((link) => link.fulfillment_id === fulfillment.id)
    )
  const legacyItems = loaded.items
  const fulfillments: Document[] = legacy.map((fulfillment: Document) => ({
    ...fulfillment,
    labels: fulfillment.labels ?? [],
    items:
      fulfillment.items ??
      legacyItems.filter((item) => item.fulfillment_id === fulfillment.id),
  }))
  const baseline: Document =
    order.admin_fulfillment_baseline ??
    Object.fromEntries(
      (order.items ?? []).map((item: Document) => {
        const detail =
          item.detail ??
          details
            .filter((detail) => detail.item_id === item.id)
            .sort((a, b) => Number(b.version) - Number(a.version))[0] ??
          {}
        return [
          item.id,
          {
            ...detail,
            quantity: Number(item.quantity),
            fulfilled_quantity: Number(detail.fulfilled_quantity ?? 0),
            shipped_quantity: Number(detail.shipped_quantity ?? 0),
            delivered_quantity: Number(detail.delivered_quantity ?? 0),
          },
        ]
      })
    )
  const items: Document[] = (order.items ?? []).map((item: Document) => {
    const detail = { ...baseline[item.id] }
    for (const fulfillment of fulfillments.filter(
      (fulfillment) =>
        fulfillment.source === "yarnly_admin" && !fulfillment.canceled_at
    )) {
      const quantity = Number(
        fulfillment.items.find((row: Document) => row.line_item_id === item.id)
          ?.quantity ?? 0
      )
      detail.fulfilled_quantity += quantity
      if (fulfillment.shipped_at) detail.shipped_quantity += quantity
      if (fulfillment.delivered_at) detail.delivered_quantity += quantity
    }
    return {
      ...item,
      requires_shipping: item.requires_shipping ?? true,
      detail,
    }
  })
  const total = items.reduce((sum, item) => sum + Number(item.quantity), 0)
  const count = (field: string) =>
    items.reduce((sum, item) => sum + Number(item.detail[field] ?? 0), 0)
  const fulfillment_status =
    count("delivered_quantity") >= total && total
      ? "delivered"
      : count("shipped_quantity") >= total && total
      ? "shipped"
      : count("shipped_quantity") > 0
      ? "partially_shipped"
      : count("fulfilled_quantity") >= total && total
      ? "fulfilled"
      : count("fulfilled_quantity") > 0
      ? "partially_fulfilled"
      : "not_fulfilled"
  return { baseline, items, fulfillments, fulfillment_status }
}

export async function hydrateAdminOrders(rows: Document[]) {
  if (!rows.length) return []
  const db = await database()
  const productIds = rows
    .flatMap((order) =>
      (order.items ?? []).map((item: Document) => item.product_id)
    )
    .filter(Boolean)
  const [products, profileLinks, profiles, options, history] =
    await Promise.all([
      db
        .collection("products")
        .find({ id: { $in: productIds } })
        .toArray(),
      archive(db, "product_shipping_profile", {
        "data.product_id": { $in: productIds },
      }),
      entities(db, "admin_shipping_profiles", "shipping_profile"),
      adminShippingOptions(db),
      historicalFulfillments(db, rows),
    ])
  return Promise.all(
    rows.map(async (order) => {
      const state = await orderState(db, order, history)
      const paymentStatus =
        order.payment_status ??
        (
          {
            completed: "captured",
            authorized: "authorized",
            partially_authorized: "partially_authorized",
            awaiting: "awaiting",
            canceled: "canceled",
          } as Record<string, string>
        )[order.payment_collection?.status] ??
        "not_paid"
      const collections = (
        order.payment_collections ??
        (order.payment_collection ? [order.payment_collection] : [])
      ).map((collection: Document) => ({
        ...collection,
        amount: Number(collection.amount ?? 0),
        captured_amount: Number(
          collection.captured_amount ??
            (collection.status === "completed" ? collection.amount ?? 0 : 0)
        ),
        refunded_amount: Number(collection.refunded_amount ?? 0),
        payment_sessions: collection.payment_sessions ?? [],
        payments: collection.payments ?? [],
      }))
      return {
        ...clean(order),
        shipping_subtotal: Number(
          order.shipping_subtotal ?? order.shipping_total ?? 0
        ),
        original_tax_total: Number(
          order.original_tax_total ?? order.tax_total ?? 0
        ),
        original_total: Number(
          order.original_total ??
            Number(order.total ?? 0) + Number(order.discount_total ?? 0)
        ),
        shipping_methods: (order.shipping_methods ?? []).map(
          (method: Document) => ({
            ...method,
            subtotal: Number(method.subtotal ?? method.amount ?? 0),
            total: Number(method.total ?? method.amount ?? 0),
            created_at: method.created_at ?? order.created_at,
            tax_lines: method.tax_lines ?? [],
            adjustments: method.adjustments ?? [],
          })
        ),
        payment_status: paymentStatus,
        fulfillment_status: state.fulfillment_status,
        summary: {
          ...order.legacy_totals,
          current_order_total: order.total,
          total_paid: paymentStatus === "captured" ? order.total : 0,
        },
        items: state.items.map((item) => {
          const product = products.find(
            (product) => product.id === item.product_id
          )
          const variant = product?.variants?.find(
            (variant: Document) => variant.id === item.variant_id
          )
          const profileId = profileFor(product, profileLinks, profiles)
          return {
            ...item,
            variant: variant
              ? {
                  ...variant,
                  product: {
                    id: product!.id,
                    title: product!.title,
                    shipping_profile:
                      profiles.find((profile) => profile.id === profileId) ??
                      null,
                  },
                }
              : item.variant ?? null,
          }
        }),
        fulfillments: state.fulfillments.map((fulfillment) => ({
          ...fulfillment,
          shipping_option:
            options.find(
              (option) => option.id === fulfillment.shipping_option_id
            ) ??
            fulfillment.shipping_option ??
            null,
        })),
        payment_collections: collections,
        transactions: order.transactions ?? [],
        credit_lines: order.credit_lines ?? [],
        version: order.version ?? 1,
      }
    })
  )
}

function quantity(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0)
    throw new ApiError(400, "Fulfillment quantities must be positive integers")
  return Number(value)
}

async function consume(
  db: Db,
  session: ClientSession,
  item: Document,
  amount: number,
  madeToOrder: boolean,
  locationId: string
) {
  const product = await db
    .collection("products")
    .findOne({ id: item.product_id }, { session })
  const variant = product?.variants?.find(
    (variant: Document) => variant.id === item.variant_id
  )
  const reservation = await db
    .collection("reservations")
    .findOne({ line_item_id: item.id }, { session })
  if (variant?.manage_inventory === false && !reservation)
    return {
      consumedStock: false,
      managedInventory: false,
      inventoryItemId: item.variant_id,
    }
  const inventory = await db
    .collection("inventory")
    .findOne({ variant_id: item.variant_id, deleted_at: null }, { session })
  if (!inventory)
    throw new ApiError(409, "Inventory is missing for this order item")
  const stockLevels = inventory.inventory_item_id
    ? await archive(db, "inventory_level", {
        "data.inventory_item_id": inventory.inventory_item_id,
      })
    : []
  const stockLocations = [
    ...new Set(stockLevels.map((level) => level.location_id)),
  ]
  const configuredLocations = await entities(
    db,
    "admin_stock_locations",
    "stock_location"
  )
  const ownerLocation =
    reservation?.location_id ??
    inventory.location_id ??
    (stockLocations.length === 1
      ? stockLocations[0]
      : !stockLocations.length && configuredLocations.length === 1
      ? configuredLocations[0].id
      : null)
  if (!ownerLocation || ownerLocation !== locationId)
    throw new ApiError(
      409,
      "This stock requires a matching warehouse assignment before fulfillment"
    )
  if (reservation?.location_id && reservation.location_id !== locationId)
    throw new ApiError(
      409,
      "Select the warehouse holding this item's reservation"
    )
  if (reservation && Number(reservation.quantity) < amount)
    throw new ApiError(
      409,
      "The fulfillment exceeds this item's reserved quantity"
    )
  const reserve = reservation ? amount : 0
  const filter: Document = {
    variant_id: item.variant_id,
    reserved: { $gte: reserve },
  }
  if (!madeToOrder) {
    filter.stock = { $gte: amount }
    if (!reservation)
      filter.$expr = { $gte: [{ $subtract: ["$stock", "$reserved"] }, amount] }
  }
  const result = await db
    .collection("inventory")
    .updateOne(
      filter,
      { $inc: { reserved: -reserve, stock: madeToOrder ? 0 : -amount } },
      { session }
    )
  if (!result.matchedCount)
    throw new ApiError(409, "Insufficient stock or inconsistent reservations")
  if (reservation) {
    if (Number(reservation.quantity) === amount)
      await db
        .collection("reservations")
        .deleteOne({ _id: reservation._id }, { session })
    else
      await db
        .collection("reservations")
        .updateOne(
          { _id: reservation._id },
          { $inc: { quantity: -amount } },
          { session }
        )
  }
  return {
    consumedStock: !madeToOrder,
    managedInventory: true,
    inventoryItemId:
      inventory.inventory_item_id ?? inventory.id ?? item.variant_id,
  }
}

// All quantities, reservations, fulfillment records and marketplace states commit
// together. A retry cannot consume the same remaining quantity twice.
export async function mutateAdminFulfillment(
  orderId: string,
  path: string[],
  input: Record<string, unknown>,
  actorId: string
) {
  return transaction(async (db, session) => {
    const order = await db
      .collection("orders")
      .findOne({ id: orderId, deleted_at: null }, { session })
    if (!order) throw new ApiError(404, "Order not found")
    if (["canceled", "completed", "archived"].includes(order.status))
      throw new ApiError(409, "This order can no longer be fulfilled")
    const state = await orderState(db, order)
    const marketplace = await db
      .collection("marketplace_orders")
      .findOne({ order_id: orderId }, { session })
    const subs = marketplace
      ? await db
          .collection("sub_orders")
          .find({ marketplace_order_id: marketplace.id }, { session })
          .toArray()
      : []
    let fulfillment: Document
    const now = new Date(),
      operation = path[4] ?? "create"
    if (path.length === 3) {
      if (
        marketplace?.payment_method === "bank_transfer" &&
        marketplace.payment_status !== "paid"
      )
        throw new ApiError(
          409,
          "Confirm the customer's bank transfer before fulfillment"
        )
      const locationId = text(input.location_id, "warehouse")
      const shippingOptionId = text(input.shipping_option_id, "shipping option")
      const options = await adminShippingOptions(db, locationId)
      const option = options.find((option) => option.id === shippingOptionId)
      if (!option?.service_zone?.fulfillment_set?.location)
        throw new ApiError(
          400,
          "The shipping option is not available at this warehouse"
        )
      if (
        !Array.isArray(input.items) ||
        !input.items.length ||
        input.items.length > 200
      )
        throw new ApiError(400, "Select at least one order item")
      const seen = new Set<string>(),
        selected: Document[] = []
      const profiles = await entities(
        db,
        "admin_shipping_profiles",
        "shipping_profile"
      )
      const productLinks = await archive(db, "product_shipping_profile", {
        "data.product_id": { $in: state.items.map((item) => item.product_id) },
      })
      for (const raw of input.items) {
        if (!raw || typeof raw !== "object")
          throw new ApiError(400, "Invalid fulfillment item")
        const row = raw as Document,
          item = state.items.find((item) => item.id === row.id),
          amount = quantity(row.quantity)
        if (
          !item ||
          seen.has(row.id) ||
          amount >
            Number(item.quantity) - Number(item.detail.fulfilled_quantity)
        )
          throw new ApiError(
            409,
            "The fulfillment exceeds the remaining order quantity"
          )
        seen.add(row.id)
        const sub = subs.find((sub) =>
          sub.items?.some((part: Document) => part.line_item_id === item.id)
        )
        if (
          sub &&
          ["pending_payment", "canceled", "completed", "delivered"].includes(
            sub.status
          )
        )
          throw new ApiError(
            409,
            "This artisan order cannot be fulfilled in its current state"
          )
        const product = await db
          .collection("products")
          .findOne({ id: item.product_id }, { session })
        const profileId = profileFor(
          product ?? undefined,
          productLinks,
          profiles
        )
        if (
          item.requires_shipping &&
          (!profileId || profileId !== option.shipping_profile_id)
        )
          throw new ApiError(
            400,
            "The shipping profile does not match the order item"
          )
        const part = sub?.items?.find(
          (part: Document) => part.line_item_id === item.id
        )
        const inventoryChange = await consume(
          db,
          session,
          item,
          amount,
          !!part?.made_to_order,
          locationId
        )
        selected.push({
          id: uid("fulit"),
          line_item_id: item.id,
          inventory_item_id: inventoryChange.inventoryItemId,
          variant_id: item.variant_id,
          title: item.title,
          sku: item.variant_sku ?? null,
          quantity: amount,
          consumed_stock: inventoryChange.consumedStock,
          managed_inventory: inventoryChange.managedInventory,
          made_to_order: !!part?.made_to_order,
        })
      }
      fulfillment = {
        id: uid("ful"),
        source: "yarnly_admin",
        order_id: order.id,
        location_id: locationId,
        shipping_option_id: option.id,
        shipping_option_name: option.name,
        provider_id: option.provider_id,
        requires_shipping: selected.some(
          (row) =>
            state.items.find((item) => item.id === row.line_item_id)
              ?.requires_shipping
        ),
        items: selected,
        labels: [],
        data: {},
        metadata: { created_by: actorId },
        created_at: now,
        updated_at: now,
        canceled_at: null,
        shipped_at: null,
        delivered_at: null,
        no_notification: input.no_notification === true,
      }
      state.fulfillments.push(fulfillment)
      if (
        input.no_notification !== true &&
        typeof order.email === "string" &&
        order.email
      ) {
        await enqueue(
          db,
          session,
          `native:${fulfillment.id}:created`,
          "send_mail",
          {
            to: order.email,
            subject: `Your order #${
              order.display_id ?? order.id
            } is being prepared`,
            html: `<h2>Yarnly</h2><p>These items from your order are ready for shipment:</p><ul>${selected
              .map(
                (item) =>
                  `<li>${item.quantity} × ${escapeHtml(item.title)}</li>`
              )
              .join("")}</ul><p><a href="${escapeHtml(
              `${STOREFRONT_URL}/account/orders/details/${encodeURIComponent(
                order.id
              )}`
            )}">View order</a></p>`,
          }
        )
      }
    } else {
      fulfillment = state.fulfillments.find(
        (fulfillment) => fulfillment.id === path[3]
      )!
      if (!fulfillment) throw new ApiError(404, "Fulfillment not found")
      if (fulfillment.source !== "yarnly_admin")
        throw new ApiError(
          409,
          "This historical fulfillment requires stock reconciliation before changes"
        )
      if (operation === "cancel" && fulfillment.canceled_at)
        return { id: order.id }
      if (fulfillment.canceled_at)
        throw new ApiError(409, "This fulfillment was canceled")
      if (operation === "cancel") {
        if (fulfillment.shipped_at || fulfillment.delivered_at)
          throw new ApiError(409, "A shipped fulfillment cannot be canceled")
        for (const item of fulfillment.items) {
          if (!item.managed_inventory) continue
          const result = await db.collection("inventory").updateOne(
            { variant_id: item.variant_id },
            {
              $inc: {
                stock: item.consumed_stock ? item.quantity : 0,
                reserved: item.quantity,
              },
            },
            { session }
          )
          if (!result.matchedCount)
            throw new ApiError(
              409,
              "Inventory is missing; cancellation was rolled back"
            )
          await db.collection("reservations").updateOne(
            { line_item_id: item.line_item_id },
            {
              $inc: { quantity: item.quantity },
              $setOnInsert: {
                id: uid("resitem"),
                line_item_id: item.line_item_id,
                variant_id: item.variant_id,
                inventory_item_id: item.inventory_item_id,
                location_id: fulfillment.location_id,
              },
            },
            { upsert: true, session }
          )
        }
        fulfillment.canceled_at = now
      } else if (operation === "shipments") {
        if (fulfillment.shipped_at || fulfillment.delivered_at)
          throw new ApiError(409, "This fulfillment has already shipped")
        if (
          !Array.isArray(input.items) ||
          input.items.length !== fulfillment.items.length ||
          new Set(input.items.map((row: Document) => row.id)).size !==
            input.items.length ||
          input.items.some(
            (row: Document) =>
              !fulfillment.items.some(
                (item: Document) =>
                  item.line_item_id === row.id &&
                  Number(item.quantity) === quantity(row.quantity)
              )
          )
        )
          throw new ApiError(
            400,
            "Shipment quantities must match this fulfillment"
          )
        if (
          !Array.isArray(input.labels ?? []) ||
          (Array.isArray(input.labels) && input.labels.length > 50)
        )
          throw new ApiError(400, "Invalid shipment labels")
        fulfillment.labels = ((input.labels ?? []) as Document[]).map(
          (label) => {
            if (!label || typeof label !== "object")
              throw new ApiError(400, "Invalid shipment label")
            return {
              tracking_number: text(
                label.tracking_number,
                "tracking number",
                200
              ),
              tracking_url: safeUrl(label.tracking_url),
              label_url: safeUrl(label.label_url),
            }
          }
        )
        fulfillment.shipped_at = now
      } else if (operation === "mark-as-delivered") {
        if (fulfillment.delivered_at) return { id: order.id }
        fulfillment.shipped_at ??= now
        fulfillment.delivered_at = now
      } else throw new ApiError(404, "Unknown fulfillment action")
      fulfillment.updated_at = now
    }
    const next = await orderState(db, {
      ...order,
      admin_fulfillment_baseline: state.baseline,
      fulfillments: state.fulfillments,
    })
    for (const sub of subs) {
      const selected = next.items.filter((item) =>
        sub.items?.some((part: Document) => part.line_item_id === item.id)
      )
      if (
        !selected.length ||
        !fulfillment.items.some((item: Document) =>
          selected.some((line) => line.id === item.line_item_id)
        )
      )
        continue
      const all = (field: string) =>
        selected.every(
          (item) => Number(item.detail[field]) >= Number(item.quantity)
        )
      const hasActive = selected.some(
        (item) => Number(item.detail.fulfilled_quantity) > 0
      )
      const status = all("delivered_quantity")
        ? "delivered"
        : selected.some((item) => Number(item.detail.shipped_quantity) > 0)
        ? "shipping"
        : all("fulfilled_quantity")
        ? "ready_to_ship"
        : "processing"
      if (["canceled", "completed"].includes(sub.status))
        throw new ApiError(
          409,
          "The artisan order status changed; reload before fulfillment"
        )
      await db.collection("sub_orders").updateOne(
        { id: sub.id },
        {
          $set: {
            status,
            accepted_at: sub.accepted_at ?? now,
            updated_at: now,
            ...(status === "delivered"
              ? {
                  delivered_at: sub.delivered_at ?? now,
                  complete_at:
                    sub.complete_at ?? new Date(+now + COMPLETE_WINDOW),
                }
              : {}),
            ...(status === "shipping"
              ? {
                  shipped_at: sub.shipped_at ?? now,
                  carrier:
                    fulfillment.shipping_option_name ??
                    sub.carrier ??
                    "Manual shipment",
                  tracking_number:
                    fulfillment.labels[0]?.tracking_number ?? null,
                }
              : {}),
            admin_fulfillment_active: hasActive,
          },
        },
        { session }
      )
      if (
        input.no_notification !== true &&
        ["shipping", "delivered"].includes(status) &&
        sub.status !== status
      )
        await enqueue(
          db,
          session,
          `native:${fulfillment.id}:${status}`,
          "sub_order_changed",
          {
            sub_order_id: sub.id,
            action: status === "shipping" ? "ship" : "deliver",
          }
        )
    }
    await db.collection("orders").updateOne(
      { id: order.id },
      {
        $set: {
          fulfillments: state.fulfillments,
          admin_fulfillment_baseline: state.baseline,
          fulfillment_status: next.fulfillment_status,
          updated_at: now,
        },
        $inc: { version: 1 },
      },
      { session }
    )
    return { id: order.id }
  })
}
function safeUrl(value: unknown) {
  if (value === undefined || value === null || value === "") return ""
  const url = text(value, "tracking URL", 2000)
  try {
    if (!["https:", "http:"].includes(new URL(url).protocol)) throw new Error()
  } catch {
    throw new ApiError(400, "Tracking URLs must use HTTP or HTTPS")
  }
  return url
}
