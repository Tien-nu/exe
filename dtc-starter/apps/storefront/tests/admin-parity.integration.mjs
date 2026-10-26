import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

test(
  "restored admin: filters, roles, create artisan, catalog and lock lifecycle",
  { skip: process.env.RUN_MONGO_INTEGRATION !== "true" },
  async () => {
    const originalDb = process.env.MONGODB_DB
    assert.ok(originalDb?.endsWith("_staging"))
    const marker = `qa_admin_${randomUUID().replaceAll("-", "").slice(0, 12)}`
    process.env.MONGODB_DB = `${marker}_staging`
    process.env.MONGODB_API_PREVIEW = "true"
    const { database } = await import("../src/server/mongodb.ts")
    const { tokenFor } = await import("../src/server/auth.ts")
    const { GET, POST, DELETE } = await import(
      "../src/app/api/backend/[...path]/route.ts"
    )
    const db = await database()
    let createdArtisan, createdProduct
    const admin = {
      id: `${marker}_identity`,
      email: `${marker}@example.test`,
      password_hash: "unused",
      actors: { admin: `${marker}_admin`, artisan: `${marker}_seller` },
      session_version: 0,
    }
    const request = async (resource, method = "GET", input, token) => {
      const path = `admin/${resource}`
      const response = await { GET, POST, DELETE }[method](
        new Request(`http://test/${path}`, {
          method,
          headers: {
            authorization: `Bearer ${
              token ?? (await tokenFor(admin, "admin"))
            }`,
          },
          ...(method === "POST" ? { body: JSON.stringify(input ?? {}) } : {}),
        }),
        { params: Promise.resolve({ path: path.split("?")[0].split("/") }) }
      )
      return { status: response.status, data: await response.json() }
    }
    try {
      await db.collection("identities").insertOne(admin)
      for (const [i, payment_status] of [
        "awaiting_transfer",
        "transfer_submitted",
        "rejected",
      ].entries())
        await db.collection("marketplace_orders").insertOne({
          id: `${marker}_order_${i}`,
          payment_status,
          created_at: new Date(),
        })
      const transfers = await request(
        "marketplace/orders?payment_status=awaiting_transfer&payment_status=transfer_submitted"
      )
      assert.equal(transfers.status, 200)
      assert.deepEqual(
        new Set(transfers.data.orders.map((row) => row.payment_status)),
        new Set(["awaiting_transfer", "transfer_submitted"])
      )
      assert.equal(
        (
          await request(
            "marketplace/artisans",
            "GET",
            undefined,
            await tokenFor(admin, "artisan")
          )
        ).status,
        401
      )
      const profile = {
        shop_name: "QA shop",
        full_name: "QA Seller",
        email: `${marker}_shop@example.test`,
        password: "QA-password-only-123",
        phone: "0000000000",
        pickup_address: "QA address",
        bank_name: "QA",
        bank_account_number: "0000",
        bank_account_name: "QA",
      }
      assert.equal(
        (await request("marketplace/artisans", "POST", profile)).status,
        400
      )
      const created = await request("marketplace/artisans", "POST", {
        ...profile,
        pickup_province_name: "Hà Nội",
      })
      assert.equal(created.status, 200)
      createdArtisan = created.data.artisan.id
      const active = await request("marketplace/artisans?status=active")
      assert.equal(active.data.artisans.length, 1)
      const product = await request("catalog/products", "POST", {
        artisan_id: createdArtisan,
        title: "QA [len]",
        description: "QA catalog details",
        fulfillment_type: "ready",
        price: 85000,
        stock: 5,
        status: "published",
        images: ["https://example.test/image.jpg"],
        category_ids: [],
      })
      assert.equal(product.status, 200)
      createdProduct = product.data.product.id
      assert.equal(
        (await request("catalog/products?q=%5Blen%5D")).data.count,
        1
      )
      assert.equal(
        (await request("catalog/products?q=%5Bmissing%5D")).data.count,
        0
      )
      const locked = await request(
        `marketplace/artisans/${createdArtisan}/status`,
        "POST",
        { status: "locked", reason: "QA lock" }
      )
      assert.equal(locked.status, 200)
      assert.equal(
        (await db.collection("products").findOne({ id: createdProduct }))
          .status,
        "draft"
      )
      assert.equal(
        (
          await request(
            `marketplace/artisans/${createdArtisan}/status`,
            "POST",
            { status: "active" }
          )
        ).status,
        200
      )
      assert.equal(
        (await db.collection("products").findOne({ id: createdProduct }))
          .status,
        "published"
      )
      await db
        .collection("marketplace_settings")
        .insertOne({ id: `${marker}_settings`, platform_fee_percent: 0 })
      assert.equal(
        (
          await request("marketplace/settings", "POST", {
            platform_fee_percent: 10,
            admin_email: "",
            bank_name: "QA Bank",
          })
        ).status,
        200
      )
      assert.equal(
        (await request("marketplace/settings")).data.settings
          .platform_fee_percent,
        10
      )
      assert.equal(
        (
          await request(
            `marketplace/orders/${marker}_order_0/confirm-payment`,
            "POST"
          )
        ).status,
        200
      )
      assert.equal(
        (
          await request(
            `marketplace/orders/${marker}_order_1/reject-payment`,
            "POST",
            { reason: "QA missing transfer" }
          )
        ).status,
        200
      )
      assert.equal(
        (
          await request(
            `marketplace/orders/${marker}_order_1/reject-payment`,
            "POST",
            { reason: "QA retry" }
          )
        ).status,
        409
      )
      await db
        .collection("marketplace_orders")
        .updateOne(
          { id: `${marker}_order_0` },
          {
            $set: {
              payment_method: "bank_transfer",
              order_id: `${marker}_core_order`,
            },
          }
        )
      await db
        .collection("orders")
        .insertOne({ id: `${marker}_core_order`, status: "pending" })
      await db
        .collection("sub_orders")
        .insertOne({
          id: `${marker}_sub`,
          artisan_id: createdArtisan,
          marketplace_order_id: `${marker}_order_0`,
          code: "QA-1",
          status: "ready_to_ship",
          subtotal: 85000,
          shipping_charged: 18000,
          items: [],
          created_at: new Date(),
        })
      assert.equal(
        (
          await request(`marketplace/sub-orders/${marker}_sub/ship`, "POST", {
            carrier: "QA carrier",
            tracking_number: "QA-NO-REAL-SHIPMENT",
          })
        ).status,
        200
      )
      const shipping = await request("marketplace/sub-orders?status=shipping")
      assert.equal(shipping.data.sub_orders.length, 1)
      assert.equal(shipping.data.sub_orders[0].artisan.id, createdArtisan)
      assert.equal(
        (await request(`marketplace/sub-orders/${marker}_sub/deliver`, "POST"))
          .status,
        200
      )
      assert.equal(
        (
          await request(`marketplace/sub-orders/${marker}_sub/cancel`, "POST", {
            reason: "QA cancellation",
          })
        ).status,
        200
      )
      assert.equal(
        (await request("marketplace/sub-orders?refund_status=pending")).data
          .sub_orders.length,
        1
      )
      assert.equal(
        (await request(`marketplace/sub-orders/${marker}_sub/refunded`, "POST"))
          .status,
        200
      )
      await db
        .collection("sub_orders")
        .insertOne({
          id: `${marker}_completed`,
          artisan_id: createdArtisan,
          status: "completed",
          completed_at: new Date("2026-01-01"),
          subtotal: 100000,
          payout_id: null,
        })
      assert.equal(
        (await request("marketplace/payouts", "POST")).data.created,
        1
      )
      const payouts = await request("marketplace/payouts")
      assert.equal(payouts.data.payouts[0].net_amount, 90000)
      assert.equal(
        (
          await request(
            `marketplace/payouts/${payouts.data.payouts[0].id}/paid`,
            "POST",
            { transaction_ref: "QA-NO-REAL-TRANSFER" }
          )
        ).status,
        200
      )
      assert.equal((await request("catalog/categories")).status, 200)
      assert.equal(
        (await request(`catalog/products/${createdProduct}`, "DELETE")).status,
        200
      )
      assert.ok(
        (await db.collection("products").findOne({ id: createdProduct }))
          .deleted_at
      )
    } finally {
      assert.equal(db.databaseName, `${marker}_staging`)
      assert.notEqual(db.databaseName, originalDb)
      await db.collection("identities").deleteMany({
        email: { $in: [admin.email, `${marker}_shop@example.test`] },
      })
      await db.collection("marketplace_orders").deleteMany({
        id: { $in: [0, 1, 2].map((i) => `${marker}_order_${i}`) },
      })
      if (createdProduct) {
        const product = await db
          .collection("products")
          .findOne({ id: createdProduct })
        await db.collection("inventory").deleteMany({
          variant_id: { $in: product.variants.map((v) => v.id) },
        })
        await db
          .collection("products")
          .deleteOne({ id: createdProduct, artisan_id: createdArtisan })
      }
      await db
        .collection("marketplace_settings")
        .deleteOne({ id: `${marker}_settings` })
      await db.collection("orders").deleteOne({ id: `${marker}_core_order` })
      await db
        .collection("sub_orders")
        .deleteMany({ id: { $in: [`${marker}_sub`, `${marker}_completed`] } })
      await db
        .collection("outbox")
        .deleteMany({
          $or: [
            { "data.sub_order_id": `${marker}_sub` },
            {
              "data.marketplace_order_id": {
                $in: [0, 1].map((i) => `${marker}_order_${i}`),
              },
            },
          ],
        })
      if (createdArtisan) {
        const payouts = await db
          .collection("payouts")
          .find({ artisan_id: createdArtisan })
          .toArray()
        await db
          .collection("outbox")
          .deleteMany({ "data.payout_id": { $in: payouts.map((p) => p.id) } })
        await db
          .collection("payouts")
          .deleteMany({ artisan_id: createdArtisan })
        await db.collection("artisans").deleteOne({
          id: createdArtisan,
          email: `${marker}_shop@example.test`,
        })
        await db
          .collection("outbox")
          .deleteMany({ "data.artisan_id": createdArtisan })
      }
      await globalThis.yarnlyMongo?.then((c) => c.close())
      delete globalThis.yarnlyMongo
      process.env.MONGODB_DB = originalDb
    }
  }
)
