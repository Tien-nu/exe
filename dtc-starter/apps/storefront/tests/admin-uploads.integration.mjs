import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { MongoClient } from "mongodb"
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"

test(
  "Admin S3 live: upload, role isolation, finalization and public image",
  { skip: process.env.RUN_STORAGE_INTEGRATION !== "true" },
  async () => {
    assert.ok(process.env.MONGODB_DB?.endsWith("_staging"))
    const { adminCatalog } = await import("../src/server/admin-catalog.ts")
    const { tokenFor } = await import("../src/server/auth.ts")
    const client = new MongoClient(process.env.MONGODB_URI),
      db = client.db(process.env.MONGODB_DB)
    const prefix = `admin_storage_test_${randomUUID()}`,
      id = (suffix) => `${prefix}_${suffix}`
    const identity = {
      id: id("auth"),
      email: `${prefix}@example.test`,
      password_hash: "unused",
      actors: { admin: id("admin"), artisan: id("artisan") },
      session_version: 0,
    }
    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    })
    let key, uploadId
    try {
      await client.connect()
      await db.collection("identities").insertOne(identity)
      await db
        .collection("artisans")
        .insertOne({
          id: id("artisan"),
          email: `${prefix}-shop@example.test`,
          handle: id("shop"),
          status: "active",
        })
      const token = await tokenFor(identity, "admin")
      const request = (input = {}) =>
        new Request("http://test", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify(input),
        })
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2kAAAAASUVORK5CYII=",
        "base64"
      )
      const signed = await adminCatalog(
        request({
          filename: "test.png",
          mime_type: "image/png",
          size: bytes.length,
        }),
        ["admin", "catalog", "uploads", "sign"]
      )
      uploadId = signed.id
      key = (await db.collection("uploads").findOne({ id: uploadId })).key
      const preflight = await fetch(signed.upload_url, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:8000",
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      })
      const allowed = preflight.headers.get("access-control-allow-origin")
      assert.ok(
        preflight.ok && ["*", "http://localhost:8000"].includes(allowed),
        `Browser CORS HTTP ${preflight.status}`
      )
      await assert.rejects(
        adminCatalog(
          new Request("http://test", { method: "POST", body: "{}" }),
          ["admin", "catalog", "uploads", uploadId, "complete"]
        ),
        (error) => error.status === 401
      )
      const sellerToken = await tokenFor(identity, "artisan")
      await assert.rejects(
        adminCatalog(
          new Request("http://test", {
            method: "POST",
            headers: { authorization: `Bearer ${sellerToken}` },
            body: "{}",
          }),
          ["admin", "catalog", "uploads", uploadId, "complete"]
        ),
        (error) => error.status === 401
      )
      const put = await fetch(signed.upload_url, {
        method: "PUT",
        headers: signed.headers,
        body: bytes,
      })
      assert.ok(put.ok, `Storage PUT HTTP ${put.status}`)
      const done = await adminCatalog(request(), [
        "admin",
        "catalog",
        "uploads",
        uploadId,
        "complete",
      ])
      assert.equal(done.file.id, uploadId)
      assert.deepEqual(
        await adminCatalog(request(), [
          "admin",
          "catalog",
          "uploads",
          uploadId,
          "complete",
        ]),
        done
      )
      const image = await fetch(done.file.url)
      assert.ok(image.ok, `Public image HTTP ${image.status}`)
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes)
      await assert.rejects(
        adminCatalog(
          request({ filename: "x.html", mime_type: "text/html", size: 10 }),
          ["admin", "catalog", "uploads", "sign"]
        ),
        (error) => error.status === 400
      )
    } catch (error) {
      // SDK errors can include signed URLs; only retain a safe diagnostic.
      throw new Error(
        `Storage integration failed: ${error.name}; HTTP ${
          error.$metadata?.httpStatusCode ?? "n/a"
        }; ${
          String(error.message).startsWith("Storage PUT HTTP") ||
          String(error.message).startsWith("Public image HTTP") ||
          String(error.message).startsWith("Browser CORS HTTP")
            ? error.message
            : "check storage configuration"
        }`
      )
    } finally {
      if (key)
        await s3
          .send(
            new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })
          )
          .catch(() => console.error("Test object cleanup requires retry"))
      if (uploadId) await db.collection("uploads").deleteMany({ id: uploadId })
      await db.collection("artisans").deleteMany({ id: id("artisan") })
      await db.collection("identities").deleteMany({ id: identity.id })
      s3.destroy()
      await client.close()
      await globalThis.yarnlyMongo?.then((pool) => pool.close())
      delete globalThis.yarnlyMongo
    }
  }
)
