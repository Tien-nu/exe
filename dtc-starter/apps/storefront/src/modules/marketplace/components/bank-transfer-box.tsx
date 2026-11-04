"use client"

import type { MarketplaceOrder } from "@lib/marketplace-types"
import { formatDateTime, formatVnd } from "@lib/util/vn-format"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

const useSecondsLeft = (deadline: string | null) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return deadline
    ? Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000))
    : 0
}

const Notice = ({
  tone,
  children,
}: {
  tone: "info" | "success" | "danger"
  children: React.ReactNode
}) => (
  <div
    className={
      tone === "success"
        ? "rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
        : tone === "danger"
        ? "rounded-md border border-red-200 bg-red-50 p-4 text-red-700"
        : "rounded-md border border-violet-200 bg-violet-50 p-4 text-violet-800"
    }
  >
    {children}
  </div>
)

/** Bank transfer instructions and server-verified payment status. */
export default function BankTransferBox({
  order,
  autoOpenPayment = false,
}: {
  order: MarketplaceOrder
  autoOpenPayment?: boolean
}) {
  const router = useRouter()
  const qrPayment = order.payment_mode === "simulation"
  const payOSPayment = order.payment_provider === "payos"
  const [paymentUrl, setPaymentUrl] = useState(order.payment_url ?? null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const linkRequestStarted = useRef(false)
  const redirectStarted = useRef(false)
  const secondsLeft = useSecondsLeft(order.payment_deadline)
  const canCreatePayment = secondsLeft > 0
  const shops = Array.from(
    new Set(
      order.sub_orders.map((sub) => sub.artisan?.shop_name).filter(Boolean)
    )
  ).join(", ")

  // Refresh server state after the phone completes the QR flow.
  useEffect(() => {
    if (
      !["awaiting_transfer", "transfer_submitted"].includes(
        order.payment_status
      )
    )
      return
    const timer = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(timer)
  }, [order.payment_status, router])

  useEffect(() => {
    if (order.payment_url) setPaymentUrl(order.payment_url)
  }, [order.payment_url])

  const createPayOSLink = useCallback(async () => {
    if (linkRequestStarted.current) return
    linkRequestStarted.current = true
    setLinkLoading(true)
    setLinkError(null)
    try {
      const response = await fetch("/api/payments/payos/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.order_id }),
      })
      const result = await response.json()
      if (!response.ok || typeof result.checkout_url !== "string") {
        throw new Error(result.message || "Unable to create a PayOS payment link")
      }
      setPaymentUrl(result.checkout_url)
    } catch (error) {
      linkRequestStarted.current = false
      setLinkError(error instanceof Error ? error.message : "Unable to create a PayOS payment link")
    } finally {
      setLinkLoading(false)
    }
  }, [order.order_id])

  useEffect(() => {
    if (payOSPayment && order.payment_status === "awaiting_transfer" && canCreatePayment && !paymentUrl) {
      void createPayOSLink()
    }
  }, [payOSPayment, order.payment_status, canCreatePayment, paymentUrl, createPayOSLink])

  useEffect(() => {
    if (autoOpenPayment && payOSPayment && paymentUrl && canCreatePayment && order.payment_status === "awaiting_transfer" && !redirectStarted.current) {
      redirectStarted.current = true
      window.location.assign(paymentUrl)
    }
  }, [autoOpenPayment, payOSPayment, paymentUrl, canCreatePayment, order.payment_status])

  if (order.payment_method !== "bank_transfer") {
    return null
  }

  if (order.payment_status === "paid") {
    return (
      <Notice tone="success">
        Payment successful at{" "}
        {formatDateTime(
          order.paid_at ||
            order.transfer_submitted_at ||
            new Date().toISOString()
        )}
        . Your order has been sent to {shops}.
      </Notice>
    )
  }
  if (
    order.payment_status === "expired" ||
    order.payment_status === "rejected"
  ) {
    return (
      <Notice tone="danger">
        {order.payment_status === "expired"
          ? "Your order was canceled because payment was not received within 10 minutes."
          : "Yarnly did not receive your transfer, so the order was canceled."}{" "}
        If you have already transferred payment, contact support for
        reconciliation.
      </Notice>
    )
  }

  if (secondsLeft === 0 && order.payment_status === "awaiting_transfer") {
    return (
      <Notice tone="danger">
        The 10-minute payment window has expired. Your order will be canceled
        shortly.
      </Notice>
    )
  }

  const bank = order.bank
  const amount = order.amount_to_transfer
  const qr = payOSPayment
    ? null
    : qrPayment
    ? order.qr_payment_token
      ? `/api/payments/qr/image?token=${encodeURIComponent(
          order.qr_payment_token
        )}`
      : null
    : bank
    ? `https://img.vietqr.io/image/${bank.code}-${
        bank.account_number
      }-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(
        order.transfer_content
      )}&accountName=${encodeURIComponent(bank.account_name ?? "")}`
    : null
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = String(secondsLeft % 60).padStart(2, "0")

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-6 text-center">
      <p className="txt-medium-plus">
        {payOSPayment
          ? "Pay securely with PayOS"
          : qrPayment
          ? "Scan to complete payment"
          : "Scan to pay by bank transfer"}
      </p>
      {payOSPayment && (
        <p className="txt-medium">
          PayOS opens a secure page with a QR code for your banking app. The order updates automatically after PayOS confirms the transfer.
        </p>
      )}
      {qrPayment && (
        <p className="txt-medium">
          Scan with your phone camera and open the link. Payment will be
          confirmed automatically.
        </p>
      )}

      {order.payment_status === "awaiting_transfer" && (
        <p className="text-3xl font-semibold tabular-nums text-amber-700">
          {minutes}:{seconds}
        </p>
      )}

      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt="Payment QR code"
          className="w-64 rounded-md border border-gray-200 bg-white p-2"
        />
      )}
      {payOSPayment && linkLoading && (
        <p className="txt-medium text-ui-fg-subtle">Preparing secure payment link…</p>
      )}
      {payOSPayment && linkError && (
        <div className="flex flex-col items-center gap-2">
          <p className="txt-small text-red-700">{linkError}</p>
          <button
            type="button"
            onClick={() => void createPayOSLink()}
            className="rounded-md bg-violet-700 px-5 py-3 font-medium text-white hover:bg-violet-800"
          >
            Try again
          </button>
        </div>
      )}
      {payOSPayment && paymentUrl && order.payment_status === "awaiting_transfer" && (
        <a
          href={paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-violet-700 px-5 py-3 font-medium text-white hover:bg-violet-800"
        >
          Open PayOS and scan QR
        </a>
      )}
      {!payOSPayment && !qrPayment && bank && (
        <div className="txt-medium">
          <p>
            Bank: <strong>{bank.name}</strong>
          </p>
          <p>
            Account number: <strong>{bank.account_number}</strong> –{" "}
            {bank.account_name}
          </p>
        </div>
      )}
      <p className="txt-medium">
        Amount: <strong>{formatVnd(amount)}</strong>{!payOSPayment && <> · Reference: <strong>{order.transfer_content}</strong></>}
      </p>

      {order.payment_status === "awaiting_transfer" && (
        <p className="txt-medium text-amber-700 animate-pulse mt-2">
          Waiting for payment confirmation…
        </p>
      )}

      <p className="txt-small text-ui-fg-subtle">The amount includes items and shipping.</p>
    </div>
  )
}
