"use client"

import { respondCustomRequest } from "@lib/data/artisan-portal"
import { useFeedback } from "@modules/common/components/feedback"
import { Button } from "@modules/common/components/ui"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Field, fieldClass } from "../ui"

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
      else toast.success(accept ? "Quote sent to the customer" : "Request declined")
      router.refresh()
    })

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-md bg-gray-50 p-3"
      action={(formData) => submit(formData, true)}
    >
      <div className="grid grid-cols-1 gap-3 small:grid-cols-2">
        <Field label="Price per item (VND)">
          <input name="price" type="number" min={1000} step={1000} required className={fieldClass} />
        </Field>
        <Field label="Production time (days)">
          <input name="lead_days" type="number" min={1} max={120} required className={fieldClass} />
        </Field>
      </div>
      <Field label="Message to customer (optional)">
        <input name="note" className={fieldClass} />
      </Field>
      <p className="txt-small text-ui-fg-subtle">
        You can reply only once. If the customer accepts and pays, the order moves directly to In progress.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="small" isLoading={pending}>
          Send quote
        </Button>
        <Button
          type="button"
          size="small"
          variant="secondary"
          disabled={pending}
          onClick={async (event) => {
            const form = event.currentTarget.form
            const ok = await confirm({
              title: "Decline this custom request?",
              description: "You can reply only once. The customer will be notified that you declined.",
              confirmText: "Decline",
              tone: "danger",
            })
            if (ok) submit(new FormData(form ?? undefined), false)
          }}
        >
          Decline
        </Button>
      </div>
    </form>
  )
}
