import { authenticateSepay, receiveSepay } from "../../../../server/sepay"
import { body, errorResponse, json, ApiError } from "../../../../server/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    if (process.env.MONGODB_API_PREVIEW !== "true")
      throw new ApiError(404, "Not found")
    authenticateSepay(request.headers.get("authorization"))
    return json(await receiveSepay(await body(request)))
  } catch (error) {
    return errorResponse(error)
  }
}
