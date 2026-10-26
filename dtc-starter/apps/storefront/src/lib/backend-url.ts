/** Same API namespace for browser requests and server rendering on Vercel. */
export function backendUrl() {
  if (process.env.NEXT_PUBLIC_YARNLY_BACKEND_MODE !== "mongodb") {
    return process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  }
  if (typeof window !== "undefined") return `${window.location.origin}/api/backend`
  const origin = process.env.STOREFRONT_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:8000")
  return `${origin.replace(/\/+$/, "")}/api/backend`
}
