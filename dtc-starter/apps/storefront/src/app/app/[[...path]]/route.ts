import { readFile } from "node:fs/promises"
import { join } from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.pathname === "/app" || url.pathname === "/app/")
    return Response.redirect(new URL("/app/orders", url), 307)
  const html = await readFile(
    join(process.cwd(), "public/app/index.html"),
    "utf8"
  )
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
