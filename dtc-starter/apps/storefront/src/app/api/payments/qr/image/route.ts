import QRCode from "qrcode"
import { verifyQrPaymentToken } from "../../../../../server/qr-payment-token"
import { errorResponse } from "../../../../../server/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get("token") ?? ""
    verifyQrPaymentToken(token)
    const target = new URL(
      "/api/payments/qr",
      process.env.QR_PAYMENT_BASE_URL || url.origin
    )
    target.searchParams.set("token", token)
    const svg = await QRCode.toString(target.toString(), {
      type: "svg",
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
    })
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
