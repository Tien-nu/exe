import { randomUUID } from "node:crypto"
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FILE_URL"]
if (required.some((key) => !process.env[key])) { console.error("Storage configuration incomplete (values hidden)."); process.exit(1) }
const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true, maxAttempts: 1,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } })
const key = `migration-tests/${randomUUID()}.png`
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2kAAAAASUVORK5CYII=", "base64")
let uploaded = false
try {
  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: bytes, ContentType: "image/png" }))
  uploaded = true
  const head = await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }))
  if (head.ContentLength !== bytes.length) throw new Error("SizeMismatch")
  const get = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }))
  if (!Buffer.from(await get.Body.transformToByteArray()).equals(bytes)) throw new Error("ContentMismatch")
  const response = await fetch(`${process.env.S3_FILE_URL.replace(/\/$/, "")}/${key}`, { signal: AbortSignal.timeout(10000) })
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(bytes)) throw new Error("PublicImageUnavailable")
  console.log("Storage check passed: upload, head, download and public image.")
} catch (error) {
  console.error(`Storage check failed: ${error.name}; HTTP ${error.$metadata?.httpStatusCode ?? "n/a"}. Credentials and signed URLs hidden.`)
  process.exitCode = 1
} finally {
  if (uploaded) {
    try { await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); console.log("Temporary test image removed.") }
    catch { console.error("Temporary test image cleanup failed; check migration-tests folder."); process.exitCode = 1 }
  }
  client.destroy()
}
