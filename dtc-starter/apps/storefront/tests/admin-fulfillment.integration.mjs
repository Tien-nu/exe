import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

test(
  "native fulfillment: real warehouse relations, partial stock, concurrency, cancel, ship and deliver",
  { skip: process.env.RUN_MONGO_INTEGRATION !== "true" },
  async () => {
    const previousDb = process.env.MONGODB_DB
    assert.ok(previousDb?.endsWith("_staging"))
    const prefix = `qa_ful_${randomUUID().replaceAll("-", "").slice(0, 12)}`
    process.env.MONGODB_DB = `${prefix}_staging`
    const { database } = await import("../src/server/mongodb.ts")
    const { adminShippingOptions, hydrateAdminOrders, mutateAdminFulfillment } =
      await import("../src/server/admin-fulfillment.ts")
    const { originalAdmin } = await import("../src/server/original-admin.ts")
    const { tokenFor } = await import("../src/server/auth.ts")
    const { changeSubOrder } = await import(
      "../src/server/workflows/sub-orders.ts"
    )
    const db = await database()
    const id = (suffix) => `${prefix}_${suffix}`
    const orderId = id("order"),
      itemId = id("item"),
      productId = id("product"),
      variantId = id("variant"),
      locationId = id("warehouse"),
      optionId = id("option"),
      profileId = id("profile"),
      subId = id("sub"),
      mpId = id("marketplace")
    const input = (amount) => ({
      location_id: locationId,
      shipping_option_id: optionId,
      items: [{ id: itemId, quantity: amount }],
      no_notification: true,
    })
    const create = (amount) =>
      mutateAdminFulfillment(
        orderId,
        ["orders", orderId, "fulfillments"],
        input(amount),
        id("admin")
      )
    const action = (fulfillmentId, name, data = {}) =>
      mutateAdminFulfillment(
        orderId,
        ["orders", orderId, "fulfillments", fulfillmentId, name],
        data,
        id("admin")
      )
    const view = async () =>
      (
        await hydrateAdminOrders([
          await db.collection("orders").findOne({ id: orderId }),
        ])
      )[0]
    const stock = () =>
      db.collection("inventory").findOne({ variant_id: variantId })
    const archiveRows = [
      ["stock_location", { id: locationId, name: "Existing warehouse" }],
      [
        "shipping_profile",
        { id: profileId, name: "Default shipping", type: "default" },
      ],
      [
        "fulfillment_set",
        { id: id("set"), name: "Existing delivery", type: "shipping" },
      ],
      [
        "location_fulfillment_set",
        {
          id: id("location_link"),
          stock_location_id: locationId,
          fulfillment_set_id: id("set"),
        },
      ],
      [
        "service_zone",
        {
          id: id("zone"),
          fulfillment_set_id: id("set"),
          name: "Existing zone",
        },
      ],
      [
        "product_shipping_profile",
        {
          id: id("profile_link"),
          product_id: productId,
          shipping_profile_id: profileId,
        },
      ],
    ].map(([table, data]) => ({ table, data: { ...data, deleted_at: null } }))
    try {
      await db.collection("migration_archive").insertMany(archiveRows)
      await db.collection("shipping_options").insertOne({
        id: optionId,
        name: "Existing shipping",
        service_zone_id: id("zone"),
        shipping_profile_id: profileId,
        provider_id: "manual_manual",
      })
      await db.collection("products").insertOne({
        id: productId,
        variants: [{ id: variantId, manage_inventory: true }],
        deleted_at: null,
      })
      await db.collection("inventory").insertOne({
        id: id("inventory"),
        variant_id: variantId,
        stock: 10,
        reserved: 4,
        location_id: locationId,
      })
      await db.collection("reservations").insertOne({
        id: id("reservation"),
        line_item_id: itemId,
        variant_id: variantId,
        location_id: locationId,
        quantity: 4,
      })
      await db.collection("orders").insertOne({
        id: orderId,
        status: "pending",
        currency_code: "vnd",
        total: 100000,
        deleted_at: null,
        payment_collection: { status: "completed" },
        items: [
          {
            id: itemId,
            product_id: productId,
            variant_id: variantId,
            title: "QA item",
            quantity: 4,
            requires_shipping: true,
          },
        ],
        shipping_methods: [{ shipping_option_id: optionId }],
      })
      await db.collection("marketplace_orders").insertOne({
        id: mpId,
        order_id: orderId,
        payment_method: "bank_transfer",
        payment_status: "paid",
      })
      await db.collection("sub_orders").insertOne({
        id: subId,
        status: "processing",
        marketplace_order_id: mpId,
        items: [{ line_item_id: itemId, quantity: 4, made_to_order: false }],
      })
      const options = await adminShippingOptions(db, locationId)
      assert.equal(
        options[0].service_zone.fulfillment_set.location.id,
        locationId
      )
      assert.equal(
        (await view()).items[0].variant.product.shipping_profile.id,
        profileId
      )
      const identity = {
        id: id("identity"),
        email: `${prefix}@example.test`,
        actors: { admin: id("admin"), artisan: id("seller") },
        session_version: 0,
      }
      await db.collection("identities").insertOne(identity)
      const call = async (path, method, input, role = "admin") => {
        const response = await originalAdmin(
          new Request(`http://test/admin/${path}`, {
            method,
            headers: {
              authorization: `Bearer ${await tokenFor(identity, role)}`,
            },
            ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
          }),
          path.split("?")[0].split("/")
        )
        return { status: response.status, data: await response.json() }
      }
      assert.equal(
        (
          await call(
            `orders/${orderId}/fulfillments`,
            "POST",
            input(1),
            "artisan"
          )
        ).status,
        401
      )
      assert.equal(
        (await call(`shipping-options/${optionId}`, "GET")).data.shipping_option
          .service_zone.fulfillment_set.location.id,
        locationId
      )
      assert.equal(
        (await call(`reservations?line_item_id%5B0%5D=${itemId}`, "GET")).data
          .reservations.length,
        1
      )
      const variant = (
        await call(`products/${productId}/variants/${variantId}`, "GET")
      ).data.variant
      assert.equal(
        variant.inventory[0].location_levels[0].location_id,
        locationId
      )
      assert.equal(variant.inventory[0].location_levels[0].stocked_quantity, 10)
      assert.equal(
        (await call(`reservations?line_item_id%5B0%5D=${itemId}`, "GET")).data
          .reservations[0].inventory_item_id,
        variant.inventory_items[0].inventory_item_id
      )
      await assert.rejects(create(0), /positive integers/)
      await assert.rejects(create(5), /remaining order quantity/)
      await assert.rejects(
        mutateAdminFulfillment(
          orderId,
          ["orders", orderId, "fulfillments"],
          { ...input(1), location_id: id("wrong") },
          id("admin")
        ),
        /not available/
      )
      await db
        .collection("marketplace_orders")
        .updateOne(
          { id: mpId },
          { $set: { payment_status: "awaiting_transfer" } }
        )
      await assert.rejects(create(1), /Confirm the customer's bank transfer/)
      await db
        .collection("marketplace_orders")
        .updateOne({ id: mpId }, { $set: { payment_status: "paid" } })
      const response = await call(
        `orders/${orderId}/fulfillments`,
        "POST",
        input(2)
      )
      assert.equal(response.status, 200)
      assert.equal(response.data.order.payment_status, "captured")
      assert.equal(response.data.order.original_total, 100000)
      assert.equal(response.data.order.shipping_subtotal, 0)
      assert.equal(response.data.order.original_tax_total, 0)
      assert.ok(
        Number.isFinite(
          response.data.order.payment_collections[0].captured_amount
        )
      )
      assert.ok(
        Number.isFinite(
          response.data.order.payment_collections[0].refunded_amount
        )
      )
      let current = await view()
      assert.equal(current.fulfillment_status, "partially_fulfilled")
      assert.equal(current.items[0].detail.fulfilled_quantity, 2)
      assert.equal((await stock()).stock, 8)
      assert.equal((await stock()).reserved, 2)
      const first = current.fulfillments[0].id
      await assert.rejects(changeSubOrder(subId, "cancel", { role: "customer", id: id("other_customer") }, { reason: "QA" }), (error) => error.status === 404)
      await assert.rejects(
        changeSubOrder(
          subId,
          "cancel",
          { role: "admin", id: id("admin") },
          { reason: "QA" }
        ),
        /active fulfillment/
      )
      await action(first, "cancel")
      await action(first, "cancel")
      assert.equal((await stock()).stock, 10)
      assert.equal((await stock()).reserved, 4)
      assert.equal((await view()).items[0].detail.fulfilled_quantity, 0)
      const attempts = await Promise.allSettled([create(3), create(3)])
      assert.equal(
        attempts.filter((attempt) => attempt.status === "fulfilled").length,
        1
      )
      assert.equal((await stock()).stock, 7)
      assert.equal((await stock()).reserved, 1)
      await create(1)
      current = await view()
      assert.equal(current.fulfillment_status, "fulfilled")
      assert.equal(
        (await db.collection("sub_orders").findOne({ id: subId })).status,
        "ready_to_ship"
      )
      const active = current.fulfillments.filter(
        (fulfillment) => !fulfillment.canceled_at
      )
      for (const fulfillment of active) {
        const payload = {
          items: fulfillment.items.map((item) => ({
            id: item.line_item_id,
            quantity: item.quantity,
          })),
          labels: [
            {
              tracking_number: "QA-TRACKING",
              tracking_url: "https://example.test/track",
              label_url: "",
            },
          ],
          no_notification: true,
        }
        await assert.rejects(
          action(fulfillment.id, "shipments", { ...payload, items: [] }),
          /quantities must match/
        )
        await action(fulfillment.id, "shipments", payload)
        await assert.rejects(
          action(fulfillment.id, "cancel"),
          /shipped fulfillment/
        )
      }
      assert.equal((await stock()).stock, 6)
      assert.equal((await stock()).reserved, 0)
      assert.equal((await view()).fulfillment_status, "shipped")
      assert.equal(
        (await db.collection("sub_orders").findOne({ id: subId })).status,
        "shipping"
      )
      for (const fulfillment of active)
        await action(fulfillment.id, "mark-as-delivered", {
          no_notification: true,
        })
      await action(active[0].id, "mark-as-delivered", { no_notification: true })
      assert.equal((await view()).fulfillment_status, "delivered")
      assert.equal(
        (await db.collection("sub_orders").findOne({ id: subId })).status,
        "delivered"
      )
      assert.equal((await stock()).stock, 6)
      // A historical fulfilled quantity must survive the first new fulfillment.
      const legacyDetail = {
        table: "order_item",
        data: {
          id: id("legacy_detail"),
          order_id: orderId,
          item_id: itemId,
          version: 1,
          fulfilled_quantity: 1,
          shipped_quantity: 0,
          delivered_quantity: 0,
          deleted_at: null,
        },
      }
      archiveRows.push(legacyDetail)
      await db.collection("migration_archive").insertOne(legacyDetail)
      const reset = async (madeToOrder = false) => {
        await db.collection("orders").updateOne(
          { id: orderId },
          {
            $set: { "items.0.quantity": 2 },
            $unset: { fulfillments: "", admin_fulfillment_baseline: "" },
          }
        )
        await db.collection("sub_orders").updateOne(
          { id: subId },
          {
            $set: {
              status: "processing",
              "items.0.quantity": 2,
              "items.0.made_to_order": madeToOrder,
              admin_fulfillment_active: false,
            },
          }
        )
      }
      await reset()
      await db
        .collection("inventory")
        .updateOne(
          { variant_id: variantId },
          { $set: { stock: 6, reserved: 1 } }
        )
      await db.collection("reservations").insertOne({
        id: id("legacy_reservation"),
        line_item_id: itemId,
        variant_id: variantId,
        location_id: locationId,
        quantity: 1,
      })
      await create(1)
      current = await view()
      assert.equal(current.items[0].detail.fulfilled_quantity, 2)
      await action(current.fulfillments[0].id, "cancel")
      assert.equal((await view()).items[0].detail.fulfilled_quantity, 1)
      assert.equal((await stock()).stock, 6)
      // Made-to-order production releases reservations without deducting ready stock.
      await db
        .collection("migration_archive")
        .updateOne(
          { table: "order_item", "data.id": id("legacy_detail") },
          { $set: { "data.fulfilled_quantity": 0 } }
        )
      await reset(true)
      await db
        .collection("inventory")
        .updateOne(
          { variant_id: variantId },
          { $set: { stock: 0, reserved: 2 } }
        )
      await db
        .collection("reservations")
        .updateOne({ line_item_id: itemId }, { $set: { quantity: 2 } })
      await create(2)
      current = await view()
      assert.equal((await stock()).stock, 0)
      assert.equal((await stock()).reserved, 0)
      await action(current.fulfillments[0].id, "cancel")
      assert.equal((await stock()).stock, 0)
      assert.equal((await stock()).reserved, 2)
      // Unmanaged variants must never create or consume stock reservations.
      await reset()
      await db
        .collection("products")
        .updateOne(
          { id: productId },
          { $set: { "variants.0.manage_inventory": false } }
        )
      await db.collection("reservations").deleteOne({ line_item_id: itemId })
      await db
        .collection("inventory")
        .updateOne(
          { variant_id: variantId },
          { $set: { stock: 8, reserved: 0 } }
        )
      await db
        .collection("orders")
        .updateOne(
          { id: orderId },
          { $set: { email: `${prefix}@example.test` } }
        )
      await mutateAdminFulfillment(
        orderId,
        ["orders", orderId, "fulfillments"],
        { ...input(2), no_notification: false },
        id("admin")
      )
      await action((await view()).fulfillments[0].id, "cancel")
      assert.equal((await stock()).stock, 8)
      assert.equal((await stock()).reserved, 0)
      assert.equal(
        await db
          .collection("reservations")
          .countDocuments({ line_item_id: itemId }),
        0
      )
      assert.equal(
        await db.collection("outbox").countDocuments({
          type: "send_mail",
          "data.to": `${prefix}@example.test`,
        }),
        1
      )
    } finally {
      await db.collection("orders").deleteOne({ id: orderId })
      await db.collection("products").deleteOne({ id: productId })
      await db.collection("inventory").deleteOne({ variant_id: variantId })
      await db.collection("reservations").deleteMany({ line_item_id: itemId })
      await db.collection("sub_orders").deleteOne({ id: subId })
      await db.collection("marketplace_orders").deleteOne({ id: mpId })
      await db.collection("identities").deleteOne({ id: id("identity") })
      await db.collection("shipping_options").deleteOne({ id: optionId })
      await db.collection("migration_archive").deleteMany({
        "data.id": { $in: archiveRows.map((row) => row.data.id) },
      })
      await db.collection("outbox").deleteMany({
        $or: [
          { "data.sub_order_id": subId },
          { "data.to": `${prefix}@example.test` },
        ],
      })
      await globalThis.yarnlyMongo?.then((client) => client.close())
      delete globalThis.yarnlyMongo
      process.env.MONGODB_DB = previousDb
    }
  }
)
