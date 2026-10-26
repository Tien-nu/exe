import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import scrypt from "scrypt-kdf"

test(
  "original Medusa Admin adapter: cookie auth, products, prices and original artisan form",
  { skip: process.env.RUN_MONGO_INTEGRATION !== "true" },
  async () => {
    const originalDb = process.env.MONGODB_DB
    assert.ok(originalDb?.endsWith("_staging"))
    const prefix = `qa_native_${randomUUID().replaceAll("-", "").slice(0, 12)}`
    process.env.MONGODB_DB = `${prefix}_staging`
    process.env.MONGODB_API_PREVIEW = "true"
    const { database } = await import("../src/server/mongodb.ts")
    const { tokenFor } = await import("../src/server/auth.ts")
    const { originalAdmin, originalAdminAuth } = await import(
      "../src/server/original-admin.ts"
    )
    const { catalog } = await import("../src/server/catalog.ts")
    const db = await database()
    const identity = {
      id: `${prefix}_identity`,
      email: `${prefix}@example.test`,
      password_hash: (
        await scrypt.kdf("QA-password-123", { logN: 15, r: 8, p: 1 })
      ).toString("base64"),
      actors: { admin: `${prefix}_admin`, artisan: `${prefix}_house` },
      session_version: 0,
    }
    let productId, shopId
    const inventoryIds = []
    const request = async (path, method = "GET", input, headers = {}) => {
      const response = await originalAdmin(
        new Request(`http://test/admin/${path}`, {
          method,
          headers,
          ...(method === "POST" ? { body: JSON.stringify(input ?? {}) } : {}),
        }),
        path.split("?")[0].split("/")
      )
      return { status: response.status, data: await response.json() }
    }
    try {
      await db.collection("identities").insertOne(identity)
      await db.collection("artisans").insertOne({
        id: `${prefix}_house`,
        handle: "yarnly",
        email: `${prefix}_house@example.test`,
        shop_name: "QA Yarnly",
        status: "active",
        pickup_province_name: "Hà Nội",
      })
      assert.equal((await request("products")).status, 401)
      const seller = {
        authorization: `Bearer ${await tokenFor(identity, "artisan")}`,
      }
      assert.equal(
        (await request("products", "GET", undefined, seller)).status,
        401
      )
      const login = await originalAdminAuth(
        new Request("http://test/auth/user/emailpass", {
          method: "POST",
          body: JSON.stringify({
            email: identity.email,
            password: "QA-password-123",
          }),
        }),
        ["user", "emailpass"]
      )
      assert.equal(login.status, 200)
      const cookie = login.headers.get("set-cookie").split(";")[0]
      assert.ok(login.headers.get("set-cookie").includes("HttpOnly"))
      const headers = { cookie }
      assert.equal(
        (await request("users/me", "GET", undefined, headers)).data.user.id,
        identity.actors.admin
      )
      const sidebar = await request(
        "layouts/sidebar/configuration",
        "GET",
        undefined,
        headers
      )
      assert.equal(sidebar.status, 200)
      for (const route of ["/don-san", "/promotions", "/price-lists"])
        assert.equal(
          sidebar.data.default_configuration.configuration.widgets[
            `core:nav:${route}`
          ].hidden,
          true
        )
      assert.equal(
        sidebar.data.default_configuration.configuration.widgets[
          "core:nav:/products"
        ],
        undefined
      )
      const customLayout = {
        configuration: {
          widgets: {
            "core:nav:/inventory": { order: 2 },
            "core:nav:/orders": { hidden: true },
            "core:nav:/don-san": { hidden: false },
          },
        },
      }
      assert.equal(
        (
          await request(
            "layouts/sidebar/configuration",
            "POST",
            customLayout,
            headers
          )
        ).status,
        200
      )
      const personalLayout = await request(
        "layouts/sidebar/configuration",
        "GET",
        undefined,
        headers
      )
      assert.equal(personalLayout.data.active_scope, "personal")
      assert.equal(
        sidebar.data.default_configuration.configuration.widgets[
          "core:nav:/orders"
        ].hidden,
        false
      )
      assert.equal(
        personalLayout.data.personal_configuration.configuration.widgets[
          "core:nav:/orders"
        ].hidden,
        false
      )
      assert.equal(
        personalLayout.data.personal_configuration.configuration.widgets[
          "core:nav:/don-san"
        ].hidden,
        true
      )
      assert.equal(
        personalLayout.data.personal_configuration.configuration.widgets[
          "core:nav:/inventory"
        ].order,
        2
      )
      assert.equal(
        (
          await request(
            "layouts/sidebar/configuration",
            "DELETE",
            undefined,
            headers
          )
        ).status,
        200
      )
      assert.equal(
        (
          await request(
            "layouts/sidebar/configuration",
            "GET",
            undefined,
            headers
          )
        ).data.active_scope,
        "default"
      )
      const archiveIds = [
        `${prefix}_channel`,
        `${prefix}_tag`,
        `${prefix}_type`,
      ]
      await db.collection("migration_archive").insertMany([
        {
          table: "sales_channel",
          data: {
            id: archiveIds[0],
            name: "Original channel",
            deleted_at: null,
          },
        },
        {
          table: "product_tag",
          data: { id: archiveIds[1], value: "Original tag", deleted_at: null },
        },
        {
          table: "product_type",
          data: { id: archiveIds[2], value: "Original type", deleted_at: null },
        },
      ])
      const created = await request(
        "products",
        "POST",
        {
          title: "QA native product",
          sales_channels: [{ id: `${prefix}_channel` }],
          tags: [{ id: `${prefix}_tag` }],
          type_id: `${prefix}_type`,
          status: "published",
          options: [{ title: "Màu", values: ["Hồng"] }],
          variants: [
            {
              title: "Hồng",
              options: { Màu: "Hồng" },
              manage_inventory: true,
              prices: [{ currency_code: "vnd", amount: 85000 }],
            },
          ],
        },
        headers
      )
      assert.equal(created.status, 200)
      productId = created.data.product.id
      assert.equal(
        created.data.product.sales_channels[0].name,
        "Original channel"
      )
      assert.equal(created.data.product.tags[0].value, "Original tag")
      assert.equal(created.data.product.type.value, "Original type")
      assert.equal(
        (
          await request(
            "products?status%5B0%5D=draft",
            "GET",
            undefined,
            headers
          )
        ).data.count,
        0
      )
      assert.equal(
        (
          await request(
            "products?status%5B0%5D=published",
            "GET",
            undefined,
            headers
          )
        ).data.count,
        1
      )
      assert.equal(
        created.data.product.variants[0].calculated_price.calculated_amount,
        85000
      )
      const variantId = created.data.product.variants[0].id
      inventoryIds.push(variantId)
      const updated = await request(
        `products/${productId}/variants/${variantId}`,
        "POST",
        {
          prices: [{ currency_code: "vnd", amount: 90000 }],
          options: { Màu: "Hồng" },
        },
        headers
      )
      assert.equal(updated.status, 200)
      assert.equal(
        updated.data.product.variants[0].calculated_price.calculated_amount,
        90000
      )
      const visible = await catalog(
        ["products", productId],
        new URL("http://test")
      )
      assert.equal(
        visible.product.variants[0].calculated_price.calculated_amount,
        90000
      )
      const optionId = updated.data.product.options[0].id
      assert.equal(updated.data.variant.options[0].value, "Hồng")
      const optionUpdate = await request(
        `products/${productId}/options/${optionId}`,
        "POST",
        { title: "Color", values: ["Hồng", "Blue"] },
        headers
      )
      assert.equal(optionUpdate.status, 200)
      assert.equal(
        optionUpdate.data.product.variants[0].options[0].option.title,
        "Color"
      )
      assert.equal(
        (
          await request(
            `products/${productId}/options/${optionId}`,
            "DELETE",
            undefined,
            headers
          )
        ).status,
        409
      )
      const variantCreate = await request(
        `products/${productId}/variants`,
        "POST",
        {
          title: "Blue",
          options: { Color: "Blue" },
          prices: [{ currency_code: "vnd", amount: 92000 }],
        },
        headers
      )
      assert.equal(variantCreate.status, 200)
      const secondVariantId = variantCreate.data.variant.id
      inventoryIds.push(secondVariantId)
      await db
        .collection("inventory")
        .updateOne(
          { variant_id: secondVariantId },
          { $set: { stock: 2, reserved: 1 } }
        )
      assert.equal(
        (
          await request(
            `products/${productId}/variants/${secondVariantId}`,
            "DELETE",
            undefined,
            headers
          )
        ).status,
        409
      )
      await db
        .collection("inventory")
        .updateOne({ variant_id: secondVariantId }, { $set: { reserved: 0 } })
      const deletedVariant = await request(
        `products/${productId}/variants/${secondVariantId}`,
        "DELETE",
        undefined,
        headers
      )
      assert.equal(deletedVariant.status, 200)
      assert.equal(deletedVariant.data.parent.variants.length, 1)
      assert.equal(
        (
          await request(
            `inventory-items/${secondVariantId}`,
            "GET",
            undefined,
            headers
          )
        ).data.inventory_item,
        undefined
      )
      const profile = {
        shop_name: "QA Native Seller",
        full_name: "QA",
        email: `${prefix}_shop@example.test`,
        password: "QA-password-123",
        phone: "0000000000",
        pickup_address: "QA address, Hà Nội",
        bank_name: "QA",
        bank_account_number: "0000",
        bank_account_name: "QA",
      }
      const shop = await request(
        "marketplace/artisans",
        "POST",
        profile,
        headers
      )
      assert.equal(shop.status, 200)
      shopId = shop.data.artisan.id
      assert.equal(shop.data.artisan.pickup_province_name, "Hà Nội")
      assert.equal(
        (
          await request(
            "marketplace/artisans?status=active",
            "GET",
            undefined,
            headers
          )
        ).data.artisans.length,
        2
      )
      await db.collection("orders").insertOne({
        id: `${prefix}_order`,
        status: "pending",
        currency_code: "vnd",
        total: 90000,
        payment_collection: { status: "completed" },
        items: [],
        created_at: new Date(),
      })
      const orders = await request("orders", "GET", undefined, headers)
      assert.equal(orders.status, 200)
      assert.equal(orders.data.orders[0].payment_status, "captured")
      assert.equal(orders.data.orders[0].fulfillment_status, "not_fulfilled")
      assert.equal(
        (
          await request(
            "orders?payment_status%5B0%5D=captured",
            "GET",
            undefined,
            headers
          )
        ).data.count,
        1
      )
      assert.equal(
        (await request("not-implemented", "GET", undefined, headers)).status,
        501
      )
      const logout = await originalAdminAuth(
        new Request("http://test/auth/session", { method: "DELETE", headers }),
        ["session"]
      )
      assert.equal(logout.status, 200)
      assert.equal(
        (await request("products", "GET", undefined, headers)).status,
        401
      )
    } finally {
      assert.equal(db.databaseName, `${prefix}_staging`)
      assert.notEqual(db.databaseName, originalDb)
      await db.collection("orders").deleteOne({ id: `${prefix}_order` })
      if (productId) {
        const p = await db.collection("products").findOne({ id: productId })
        await db.collection("inventory").deleteMany({
          variant_id: {
            $in: [...inventoryIds, ...p.variants.map((v) => v.id)],
          },
        })
        await db
          .collection("products")
          .deleteOne({ id: productId, artisan_id: `${prefix}_house` })
      }
      if (shopId) {
        await db
          .collection("artisans")
          .deleteOne({ id: shopId, email: `${prefix}_shop@example.test` })
        await db.collection("outbox").deleteMany({ "data.artisan_id": shopId })
      }
      await db
        .collection("admin_layout_configurations")
        .deleteMany({ user_id: identity.actors.admin })
      await db.collection("artisans").deleteOne({ id: `${prefix}_house` })
      await db.collection("identities").deleteMany({
        email: { $in: [identity.email, `${prefix}_shop@example.test`] },
      })
      await db.collection("migration_archive").deleteMany({
        "data.id": {
          $in: [`${prefix}_channel`, `${prefix}_tag`, `${prefix}_type`],
        },
      })
      await db.collection("rate_limits").deleteMany({ key: { $regex: prefix } })
      await globalThis.yarnlyMongo?.then((c) => c.close())
      delete globalThis.yarnlyMongo
      process.env.MONGODB_DB = originalDb
    }
  }
)
