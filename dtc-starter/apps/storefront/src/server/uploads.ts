import { randomUUID } from "node:crypto"
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { artisanFor } from "./artisans"
import { database } from "./mongodb"
import { ApiError, body, text } from "./http"
import { rateLimit } from "./rate-limit"

const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }
function storage() {
  const { S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FILE_URL } = process.env
  if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_FILE_URL) throw new ApiError(503, "Image storage is not configured")
  const base = new URL(S3_FILE_URL)
  if (base.protocol !== "https:") throw new ApiError(503, "Storage URL must use HTTPS")
  return { bucket: S3_BUCKET, publicUrl: S3_FILE_URL.replace(/\/$/, ""), client: new S3Client({ region: S3_REGION || "auto",
    endpoint: S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } }) }
}

export function imageSignature(bytes: Uint8Array, mime: string) {
  const data = Buffer.from(bytes)
  if (mime === "image/jpeg") return [255, 216, 255].every((value, index) => data[index] === value)
  if (mime === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value)
  if (mime === "image/webp") return data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP"
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6))
  return false
}

export async function uploads(request: Request, path: string[], authorizedAdmin?: { id: string }) {
  if (path[0] !== "artisan" || path[1] !== "uploads") return undefined
  const owner = authorizedAdmin ?? await artisanFor(request)
  const ownership = authorizedAdmin ? { admin_id: owner.id } : { artisan_id: owner.id }
  if (request.method !== "POST") throw new ApiError(405, "Method not allowed")
  const db = await database()
  const store = storage()
  try {
    if (path.length === 3 && path[2] === "sign") {
      await rateLimit(`uploads:${authorizedAdmin ? "admin" : "artisan"}:${owner.id}`, 60, 60 * 60_000)
      const input = await body(request)
      const mime = text(input.mime_type, "mime_type", 100)
      const filename = text(input.filename, "filename", 200)
      const size = input.size
      if (!(mime in extensions) || typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024) throw new ApiError(400, "Only JPEG, PNG, WebP, or GIF images up to 20 MB are supported")
      const id = `upload_${randomUUID()}`
      const key = `${authorizedAdmin ? "admins" : "artisans"}/${owner.id}/${id}.${extensions[mime]}`
      const signed = await getSignedUrl(store.client, new PutObjectCommand({ Bucket: store.bucket, Key: key, ContentType: mime, ContentLength: size }), { expiresIn: 300 })
      await db.collection("uploads").insertOne({ id, ...ownership, key, filename, mime_type: mime, size,
        url: `${store.publicUrl}/${key}`, status: "pending", expires_at: new Date(Date.now() + 5 * 60_000), created_at: new Date() })
      return { id, upload_url: signed, headers: { "Content-Type": mime } }
    }
    if (path.length === 4 && path[3] === "complete") {
      const upload = await db.collection("uploads").findOne({ id: path[2], ...ownership })
      if (!upload || upload.status !== "complete" && +new Date(upload.expires_at) < Date.now()) throw new ApiError(404, "Upload session does not exist or has expired", "not_found")
      if (upload.status === "complete") return { file: { id: upload.id, url: upload.url } }
      const head = await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: upload.key }))
      if (head.ContentLength !== upload.size || head.ContentType !== upload.mime_type) throw new ApiError(400, "The uploaded image does not match the registered details")
      const object = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: upload.key, Range: "bytes=0-31" }))
      const bytes = await object.Body?.transformToByteArray()
      if (!bytes || !imageSignature(bytes, upload.mime_type)) throw new ApiError(400, "The content is not a valid image")
      await db.collection("uploads").updateOne({ id: upload.id, status: "pending" }, { $set: { status: "complete", completed_at: new Date() }, $unset: { expires_at: "" } })
      return { file: { id: upload.id, url: upload.url } }
    }
    throw new ApiError(404, "Not found", "not_found")
  } finally { store.client.destroy() }
}
