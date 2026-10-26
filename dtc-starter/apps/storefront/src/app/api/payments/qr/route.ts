import { randomUUID } from "node:crypto"
import { verifyQrPaymentToken } from "../../../../server/qr-payment-token"
import { completeQrPayment } from "../../../../server/qr-payments"
import { ApiError, body, errorResponse, json } from "../../../../server/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? ""
    verifyQrPaymentToken(token)
    const nonce = randomUUID()
    return new Response(
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Yarnly | Payment</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f7f5f2;color:#292524;font:16px system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:100%;max-width:440px;background:white;border:1px solid #e7e5e4;border-radius:20px;padding:40px 28px;text-align:center;box-shadow:0 12px 40px #2925240a}.brand{font-weight:700;letter-spacing:4px;font-size:14px;color:#78716c}.icon{margin:32px auto 20px;display:grid;place-items:center;width:72px;height:72px;border-radius:50%;background:#ecfdf5;color:#047857;font-size:36px}h1{font-size:26px;margin:0 0 16px}p{line-height:1.6;color:#78716c}</style></head><body><main><div class="brand">YARNLY</div><div class="icon" id="icon" aria-hidden="true">…</div><h1 id="heading">Processing payment</h1><p id="status" role="status" aria-live="polite">Please keep this page open.</p></main><script nonce="${nonce}">
fetch('/api/payments/qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(
        token
      )}})}).then(async response=>{const data=await response.json();document.getElementById('heading').textContent=response.ok?'Payment successful':'Unable to complete payment';document.getElementById('icon').textContent=response.ok?'✓':'!';document.getElementById('status').textContent=response.ok?'Your payment has been confirmed. You can return to your order.':data.message||'Please try again.'}).catch(()=>{document.getElementById('heading').textContent='Connection interrupted';document.getElementById('status').textContent='Reopen the QR link to try again.'})
</script></body></html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
          "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'`,
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin")
    const allowedOrigins = new Set([new URL(request.url).origin])
    // Trust only the operator-configured QR origin, never forwarded host headers.
    if (process.env.QR_PAYMENT_BASE_URL)
      allowedOrigins.add(new URL(process.env.QR_PAYMENT_BASE_URL).origin)
    if (origin && !allowedOrigins.has(origin))
      throw new ApiError(403, "Invalid origin")
    const input = await body(request)
    if (typeof input.token !== "string")
      throw new ApiError(400, "Invalid payment QR")
    return json(await completeQrPayment(input.token))
  } catch (error) {
    return errorResponse(error)
  }
}
