"use client"

import { respondCustomRequest } from "@lib/data/artisan-portal"
import { useFeedback } from "@modules/common/components/feedback"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Button, Field, fieldClass } from "../ui"

/** One answer only: a price per item and the making time, or a refusal. */
export default function RespondCustomRequest({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { confirm, toast } = useFeedback()

  const submit = (formData: FormData, accept: boolean) =>
    startTransition(async () => {
      const result = await respondCustomRequest(requestId, {
        accept,
        price: accept ? Number(formData.get("price")) : undefined,
        lead_days: accept ? Number(formData.get("lead_days")) : undefined,
        note: String(formData.get("note") ?? "") || undefined,
      })
      if (result.error) toast.error(result.error)
      else toast.success(accept ? "Đã gửi báo giá cho khách" : "Đã từ chối yêu cầu")
      router.refresh()
    })

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border border-yarnly-line bg-yarnly-paper p-4"
      action={(formData) => submit(formData, true)}
    >
      <div className="grid grid-cols-1 gap-3 small:grid-cols-2">
        <Field label="Giá mỗi cái (₫)">
          <input name="price" type="number" min={1000} step={1000} required className={fieldClass} />
        </Field>
        <Field label="Số ngày làm">
          <input name="lead_days" type="number" min={1} max={120} required className={fieldClass} />
        </Field>
      </div>
      <Field label="Lời nhắn cho khách (tuỳ chọn)">
        <input name="note" className={fieldClass} />
      </Field>
      <p className="txt-small text-yarnly-muted">
        Bạn chỉ trả lời được một lần. Khách đồng ý thì đơn vào thẳng trạng thái “Đang làm” sau khi thanh toán.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="small" isLoading={pending}>
          Gửi báo giá
        </Button>
        <Button
          type="button"
          size="small"
          variant="secondary"
          disabled={pending}
          onClick={async (event) => {
            const form = event.currentTarget.form
            const ok = await confirm({
              title: "Từ chối yêu cầu làm riêng này?",
              description: "Bạn chỉ trả lời được một lần; khách sẽ được báo là bạn từ chối.",
              confirmText: "Từ chối",
              tone: "danger",
            })
            if (ok) submit(new FormData(form ?? undefined), false)
          }}
        >
          Từ chối
        </Button>
      </div>
    </form>
  )
}
