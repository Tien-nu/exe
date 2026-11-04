import { PayOS, type Webhook, type WebhookData } from "@payos/node"
import { ApiError } from "./http"

export function payOSClient() {
  const clientId = process.env.PAYOS_CLIENT_ID
  const apiKey = process.env.PAYOS_API_KEY
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY
  if (!clientId || !apiKey || !checksumKey) {
    throw new ApiError(503, "PayOS payment is not configured")
  }
  return new PayOS({ clientId, apiKey, checksumKey })
}

export async function verifyPayOSWebhook(input: unknown): Promise<WebhookData> {
  return payOSClient().webhooks.verify(input as Webhook)
}
