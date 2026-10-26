import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"

test(
  "original admin multipart upload persists a verified image",
  { skip: process.env.RUN_STORAGE_INTEGRATION !== "true" },
  async () => {
    assert.ok(process.env.MONGODB_DB?.endsWith("_staging"))
    const { database } = await import("../src/server/mongodb.ts")
    const { tokenFor } = await import("../src/server/auth.ts")
    const { originalAdmin } = await import("../src/server/original-admin.ts")
    const db = await database(),
      id = `qa_native_upload_${randomUUID()}`
    const identity = {
      id,
      email: `${id}@example.test`,
      password_hash: "unused",
      actors: { admin: id, artisan: `${id}_seller` },
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
    let uploaded
    try {
      await db.collection("identities").insertOne(identity)
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2kAAAAASUVORK5CYII=",
        "base64"
      )
      const form = new FormData()
      form.append(
        "files",
        new File([bytes], "native-qa.png", { type: "image/png" })
      )
      const response = await originalAdmin(
        new Request("http://test/admin/uploads", {
          method: "POST",
          headers: {
            authorization: `Bearer ${await tokenFor(identity, "admin")}`,
          },
          body: form,
        }),
        ["uploads"]
      )
      assert.equal(response.status, 200)
      const result = await response.json()
      uploaded = await db
        .collection("uploads")
        .findOne({ id: result.files[0].id, admin_id: id })
      assert.equal(uploaded.status, "complete")
      const image = await fetch(result.files[0].url)
      assert.ok(image.ok)
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes)
      const denied = await originalAdmin(
        new Request("http://test/admin/uploads", {
          method: "POST",
          headers: {
            authorization: `Bearer ${await tokenFor(identity, "artisan")}`,
          },
          body: new FormData(),
        }),
        ["uploads"]
      )
      assert.equal(denied.status, 401)
    } catch (error) {
      throw new Error(
        `Native upload QA failed: ${error.name}; ${
          error.code ?? "check assertions/configuration"
        }`
      )
    } finally {
      if (uploaded) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: uploaded.key,
          })
        )
        await db
          .collection("uploads")
          .deleteOne({ id: uploaded.id, admin_id: id })
      }
      await db.collection("identities").deleteOne({ id, email: identity.email })
      s3.destroy()
      await globalThis.yarnlyMongo?.then((c) => c.close())
      delete globalThis.yarnlyMongo
    }
  }
)
