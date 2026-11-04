"use client"

import {
  acceptSubOrder,
  declineSubOrder,
  markSubOrderReady,
} from "@lib/data/artisan-portal"
import type { ArtisanSubOrder } from "@lib/marketplace-types"
import { useFeedback } from "@modules/common/components/feedback"
import { Button } from "../ui"
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
      <div className="flex flex-wrap gap-2">
        <Button
          isLoading={pending}
          onClick={() => run(() => acceptSubOrder(subOrder.id), `Đã nhận đơn ${subOrder.code}`)}
        >
          Nhận đơn
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={async () => {
            const reason = await ask({
              title: `Từ chối đơn ${subOrder.code}?`,
              description: "Khách sẽ thấy lý do này. Nếu khách đã chuyển khoản, Yarnly sẽ hoàn tiền.",
              label: "Lý do từ chối",
              placeholder: "VD: Hết len màu khách chọn",
              multiline: true,
              required: true,
              confirmText: "Từ chối đơn",
              tone: "danger",
            })
            if (reason) {
              run(() => declineSubOrder(subOrder.id, reason), `Đã từ chối đơn ${subOrder.code}`)
            }
          }}
        >
          Từ chối
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
            title: "Đã làm xong và đóng gói?",
            description: "Yarnly sẽ tạo đơn vận chuyển và shipper sẽ tới địa chỉ lấy hàng của bạn.",
            confirmText: "Đã làm xong",
            cancelText: "Chưa",
          })
          if (ok) {
            run(
              () => markSubOrderReady(subOrder.id),
              "Đã báo Yarnly – shipper sẽ tới lấy hàng"
            )
          }
        }}
      >
        Đã làm xong – chờ giao hàng
      </Button>
    )
  }

  return null
}
