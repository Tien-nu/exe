"use client"

import {
  acceptSubOrder,
  declineSubOrder,
  markSubOrderReady,
} from "@lib/data/artisan-portal"
import type { ArtisanSubOrder } from "@lib/marketplace-types"
import { useFeedback } from "@modules/common/components/feedback"
import { Button } from "@modules/common/components/ui"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

/** The only buttons an artisan has: accept / decline within 12h, then "done". */
export default function SubOrderActions({ subOrder }: { subOrder: ArtisanSubOrder }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { ask, confirm, toast } = useFeedback()

  const run = (action: () => Promise<{ error: string | null }>, success: string) =>
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
      router.refresh()
    })

  if (subOrder.status === "pending_acceptance") {
    return (
      <div className="flex gap-2">
        <Button
          isLoading={pending}
          onClick={() => run(() => acceptSubOrder(subOrder.id), `Accepted order ${subOrder.code}`)}
        >
          Accepted
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={async () => {
            const reason = await ask({
              title: `Decline order ${subOrder.code}?`,
              description: "The customer will see this reason. If they have paid by bank transfer, Yarnly will arrange a refund.",
              label: "Reason for declining",
              placeholder: "e.g. The requested yarn color is out of stock",
              multiline: true,
              required: true,
              confirmText: "Decline order",
              tone: "danger",
            })
            if (reason) {
              run(() => declineSubOrder(subOrder.id, reason), `Declined order ${subOrder.code}`)
            }
          }}
        >
          Decline
        </Button>
      </div>
    )
  }

  if (subOrder.status === "processing") {
    return (
      <Button
        isLoading={pending}
        onClick={async () => {
          const ok = await confirm({
            title: "Is the order finished and packed?",
            description: "Yarnly will arrange shipment and the carrier will collect it from your pickup address.",
            confirmText: "Mark as ready",
            cancelText: "Not yet",
          })
          if (ok) {
            run(
              () => markSubOrderReady(subOrder.id),
              "Yarnly notified — awaiting collection"
            )
          }
        }}
      >
        Ready — awaiting shipment
      </Button>
    )
  }

  return null
}
