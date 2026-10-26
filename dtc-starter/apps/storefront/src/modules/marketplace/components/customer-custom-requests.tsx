"use client"

import { decideCustomRequest } from "@lib/data/marketplace"
import {
  CUSTOM_REQUEST_LABELS,
  type CustomRequest,
} from "@lib/marketplace-types"
import { formatDateTime, formatVnd } from "@lib/util/vn-format"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useFeedback } from "@modules/common/components/feedback"
import { useTransition } from "react"

const RequestCard = ({ request }: { request: CustomRequest }) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [pending, startTransition] = useTransition()
  const { confirm, toast } = useFeedback()
  const shop = request.artisan?.shop_name ?? "shop"
  // Statuses that name the shop answering this request.
  const label =
    request.status === "pending"
      ? `Waiting for ${shop} to reply`
      : request.status === "quoted"
        ? `${shop} has sent a quote`
        : request.status === "artisan_declined"
          ? `${shop} declined`
          : CUSTOM_REQUEST_LABELS[request.status]

  const decide = (accept: boolean) =>
    startTransition(async () => {
      const result = await decideCustomRequest(request.id, accept, countryCode)

      if (result.error) {
        toast.error(result.error)
      } else if (accept) {
        toast.success(`Added "${request.product_title}" to your cart for ${shop} quoted`)
        router.push(`/${countryCode}/cart`)
        return
      } else {
        toast.info("You declined the quote")
      }

      router.refresh()
    })

  const decline = async () => {
    const ok = await confirm({
      title: "Decline this quote?",
      description: "You can only decide once. Declining will close this request.",
      confirmText: "Decline",
      cancelText: "Keep considering",
      tone: "danger",
    })
    if (ok) decide(false)
  }

  return (
    <div className="rounded-md border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="txt-medium-plus">{request.product_title}</p>
          <p className="txt-small text-ui-fg-subtle">
            {request.artisan?.shop_name} · sent at {formatDateTime(request.created_at)}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 txt-small-plus">
          {label}
        </span>
      </div>
      <p className="mt-2 txt-medium">
        {request.quantity} items · {request.description}
        {request.color && ` · Color: ${request.color}`}
        {request.size && ` · Size: ${request.size}`}
      </p>
      {request.quoted_price !== null && (
        <div className="mt-3 rounded-md bg-violet-50 p-3 txt-medium">
          Quote: <strong>{formatVnd(request.quoted_price * request.quantity)}</strong> (
          {formatVnd(request.quoted_price)}/item) · production time{" "}
          <strong>{request.quoted_lead_days} days</strong>
          {request.artisan_note && (
            <p className="txt-small text-ui-fg-subtle">Message: {request.artisan_note}</p>
          )}
        </div>
      )}
      {request.status === "artisan_declined" && request.artisan_note && (
        <p className="mt-2 txt-small text-ui-fg-subtle">Message: {request.artisan_note}</p>
      )}
      {request.status === "quoted" && (
        <div className="mt-3 flex gap-2">
          <Button size="small" isLoading={pending} onClick={() => decide(true)}>
            Accept & add to cart
          </Button>
          <Button
            size="small"
            variant="secondary"
            disabled={pending}
            onClick={decline}
          >
            Decline
          </Button>
        </div>
      )}
      {request.status === "accepted" && (
        <div className="mt-3 flex items-center gap-3">
          <LocalizedClientLink href="/cart" className="txt-small text-violet-700 underline">
            Go to cart to pay
          </LocalizedClientLink>
          <Button size="small" variant="secondary" isLoading={pending} onClick={() => decide(true)}>
            Add to cart again
          </Button>
        </div>
      )}
      {request.status === "ordered" && request.order_id && (
        <LocalizedClientLink
          href={`/account/orders/details/${request.order_id}`}
          className="mt-3 inline-block txt-small text-violet-700 underline"
        >
          View order
        </LocalizedClientLink>
      )}
    </div>
  )
}

export default function CustomerCustomRequests({ requests }: { requests: CustomRequest[] }) {
  if (!requests.length) {
    return (
      <p className="txt-medium text-ui-fg-subtle">
        You haven't sent any custom requests. Open a product and select &quot;Request a custom piece&quot;.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </div>
  )
}
