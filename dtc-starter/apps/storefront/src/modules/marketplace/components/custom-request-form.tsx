"use client"

import { createCustomRequest } from "@lib/data/marketplace"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button } from "@modules/common/components/ui"
import { useState, useTransition } from "react"

const fieldClass =
  "w-full rounded-md border border-gray-200 px-3 py-2 txt-medium focus:border-gray-400 focus:outline-none"

/** "Yêu cầu làm riêng": the artisan answers once with a price and making time. */
export default function CustomRequestForm({
  productId,
  shopName,
  isLoggedIn,
}: {
  productId: string
  shopName: string
  isLoggedIn: boolean
}) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!isLoggedIn) {
    return (
      <p className="txt-small text-ui-fg-subtle">
        Want a custom piece (color, size, embroidered text…)?{" "}
        <LocalizedClientLink href="/account" className="text-violet-700 underline">
          Sign in
        </LocalizedClientLink>{" "}
        to send a request to {shopName}.
      </p>
    )
  }

  if (sent) {
    return (
      <p className="rounded-md bg-emerald-50 p-3 txt-small text-emerald-800">
        Request sent. {shopName} will quote a price and production time. View it in{" "}
        <LocalizedClientLink href="/account/yeu-cau-lam-rieng" className="underline">
          Account → Custom requests
        </LocalizedClientLink>
        .
      </p>
    )
  }

  if (!open) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        Custom requests
      </Button>
    )
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-gray-200 p-3"
      action={(formData) =>
        startTransition(async () => {
          const result = await createCustomRequest({
            product_id: productId,
            description: String(formData.get("description") ?? ""),
            color: String(formData.get("color") ?? "") || undefined,
            size: String(formData.get("size") ?? "") || undefined,
            quantity: Number(formData.get("quantity") ?? 1),
          })
          setError(result.error)
          if (!result.error) setSent(true)
        })
      }
    >
      <p className="txt-medium-plus">Custom requests</p>
      <textarea
        name="description"
        required
        rows={3}
        placeholder="Describe what you want (shape, embroidered text, occasion…)"
        className={fieldClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <input name="color" placeholder="Color" className={fieldClass} />
        <input name="size" placeholder="Size" className={fieldClass} />
      </div>
      <label className="flex items-center gap-2 txt-small">
        Quantity
        <input
          name="quantity"
          type="number"
          min={1}
          max={50}
          defaultValue={1}
          className={`${fieldClass} w-20`}
        />
      </label>
      {error && <p className="txt-small text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="small" isLoading={pending}>
          Send request
        </Button>
        <Button type="button" variant="secondary" size="small" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
