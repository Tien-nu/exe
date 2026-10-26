"use client"

import {
  deleteArtisanProduct,
  saveArtisanProduct,
  uploadArtisanImages,
  requestArtisanImageUpload,
  completeArtisanImageUpload,
} from "@lib/data/artisan-portal"
import type { ArtisanProduct } from "@lib/marketplace-types"
import { shrinkImage } from "@lib/util/shrink-image"
import { useFeedback } from "@modules/common/components/feedback"
import { Button } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Field, fieldClass } from "../ui"

type Props = {
  product?: ArtisanProduct
  categories: { id: string; name: string }[]
}

/** Create (one variant: price + stock) or edit (price + stock per variant). */
export default function ProductForm({ product, categories }: Props) {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const { confirm, toast } = useFeedback()

  const [title, setTitle] = useState(product?.title ?? "")
  const [description, setDescription] = useState(product?.description ?? "")
  const [type, setType] = useState<"ready" | "made_to_order">(product?.fulfillment_type ?? "ready")
  const [leadDays, setLeadDays] = useState(String(product?.lead_days ?? ""))
  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const [categoryIds, setCategoryIds] = useState<string[]>(
    product?.categories.map((category) => category.id) ?? []
  )
  const [visible, setVisible] = useState(product ? product.status === "published" : true)
  const [price, setPrice] = useState("")
  const [stock, setStock] = useState("")
  const [variants, setVariants] = useState(
    product?.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: String(variant.price),
      stock: String(variant.stock),
      reserved: variant.reserved,
    })) ?? []
  )

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    // One photo per request keeps each request under the host's body limit.
    const urls: string[] = []
    let error: string | null = null
    for (const file of Array.from(files)) {
      const image = await shrinkImage(file)
      if (process.env.NEXT_PUBLIC_YARNLY_BACKEND_MODE === "mongodb") {
        try {
          const signed = await requestArtisanImageUpload({ filename: image.name, mime_type: image.type, size: image.size })
          if (!signed.upload) throw new Error(signed.error ?? "Unable to create an image upload session")
          const response = await fetch(signed.upload.upload_url, { method: "PUT", headers: signed.upload.headers,
            body: image, signal: AbortSignal.timeout(120_000) })
          if (!response.ok) throw new Error("Upload failed. Please try again.")
          const completed = await completeArtisanImageUpload(signed.upload.id)
          if (!completed.url) throw new Error(completed.error ?? "Unable to verify the uploaded image")
          urls.push(completed.url)
        } catch (failure) {
          error = failure instanceof Error ? failure.message : "Unable to upload the image. Please try again."
          break
        }
        continue
      }
      const formData = new FormData()
      formData.append("files", image)
      const result = await uploadArtisanImages(formData)
      if (result.error) {
        error = result.error
        break
      }
      urls.push(...result.urls)
    }
    setUploading(false)
    if (error) toast.error(error)
    else toast.success(`Uploaded ${urls.length} images — remember to save`)
    setImages((previous) => [...previous, ...urls])
  }

  const save = () =>
    startTransition(async () => {
      const result = await saveArtisanProduct(product?.id ?? null, {
        title,
        description,
        fulfillment_type: type,
        lead_days: type === "made_to_order" ? Number(leadDays) : null,
        images,
        category_ids: categoryIds,
        status: visible ? "published" : "draft",
        ...(product
          ? {
              variants: variants.map((variant) => ({
                id: variant.id,
                price: Number(variant.price),
                stock: type === "ready" ? Number(variant.stock) : null,
              })),
            }
          : {
              price: Number(price),
              stock: type === "ready" ? Number(stock || 0) : null,
            }),
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(product ? "Changes saved" : "Product published")
        if (!product && result.id) {
          router.push(`/${countryCode}/kenh-nghe-nhan/san-pham/${result.id}`)
        } else {
          router.refresh()
        }
      }
    })

  return (
    <div className="flex flex-col gap-4">
      {product?.hidden_by_lock && (
        <p className="rounded-md bg-amber-50 p-3 txt-small">
          This product is hidden because the shop is suspended.
        </p>
      )}
      <Field label="Product name">
        <input value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
      </Field>
      <Field label="Description">
        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={fieldClass}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="txt-small-plus">Fulfillment type</span>
        <div className="flex flex-wrap gap-4 txt-medium">
          <label className="flex items-center gap-2">
            <input type="radio" checked={type === "ready"} onChange={() => setType("ready")} />
            Ready-made (sold from stock)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={type === "made_to_order"}
              onChange={() => setType("made_to_order")}
            />
            Made to order
          </label>
        </div>
        {type === "made_to_order" && (
          <Field label="Production time (days)" hint="From the time you accept the order" className="max-w-xs">
            <input
              type="number"
              min={1}
              value={leadDays}
              onChange={(event) => setLeadDays(event.target.value)}
              className={fieldClass}
            />
          </Field>
        )}
      </div>

      {product ? (
        <div className="flex flex-col gap-2">
          <span className="txt-small-plus">Price{type === "ready" ? " and stock" : ""} by variant</span>
          <table className="w-full txt-medium">
            <thead className="text-left txt-small text-ui-fg-subtle">
              <tr>
                <th className="pb-1 font-normal">Variant</th>
                <th className="pb-1 font-normal">Price (VND)</th>
                {type === "ready" && <th className="pb-1 font-normal">Stock</th>}
              </tr>
            </thead>
            <tbody>
              {variants.map((variant, index) => (
                <tr key={variant.id} className="border-t border-gray-100">
                  <td className="py-2 pr-2">{variant.title}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={variant.price}
                      onChange={(event) =>
                        setVariants((previous) =>
                          previous.map((row, i) => (i === index ? { ...row, price: event.target.value } : row))
                        )
                      }
                      className={fieldClass}
                      aria-label="Price"
                    />
                  </td>
                  {type === "ready" && (
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        value={variant.stock}
                        onChange={(event) =>
                          setVariants((previous) =>
                            previous.map((row, i) => (i === index ? { ...row, stock: event.target.value } : row))
                          )
                        }
                        className={fieldClass}
                        aria-label="Stock"
                      />
                      {variant.reserved > 0 && (
                        <span className="txt-small text-ui-fg-subtle">Reserved for orders: {variant.reserved}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
          <Field label="Price (VND)">
            <input
              type="number"
              min={1000}
              step={1000}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={fieldClass}
            />
          </Field>
          {type === "ready" && (
            <Field label="Stock">
              <input
                type="number"
                min={0}
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                className={fieldClass}
              />
            </Field>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="txt-small-plus">Product images</span>
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-24 w-24 rounded-md object-cover" />
              <button
                type="button"
                onClick={() => setImages((previous) => previous.filter((image) => image !== url))}
                className="absolute right-1 top-1 rounded-full bg-white/90 px-2 txt-small"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(event) => upload(event.target.files)}
          className="txt-small"
        />
        {uploading && <span className="txt-small text-ui-fg-subtle">Uploading images…</span>}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="txt-small-plus">Categories</span>
          <div className="flex flex-wrap gap-3 txt-medium">
            {categories.map((category) => (
              <label key={category.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={categoryIds.includes(category.id)}
                  onChange={(event) =>
                    setCategoryIds((previous) =>
                      event.target.checked
                        ? [...previous, category.id]
                        : previous.filter((id) => id !== category.id)
                    )
                  }
                />
                {category.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 txt-medium">
        <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
        Publish on marketplace
      </label>

      <div className="flex gap-2">
        <Button onClick={save} isLoading={pending} disabled={uploading}>
          {product ? "Save changes" : "Publish product"}
        </Button>
        {product && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Delete this product?",
                description: `"${product.title}" will be removed from your shop and cannot be restored here. To hide it temporarily, turn off "Publish on marketplace".`,
                confirmText: "Delete product",
                tone: "danger",
              })
              if (!ok) return
              startTransition(async () => {
                const result = await deleteArtisanProduct(product.id)
                if (result.error) {
                  toast.error(result.error)
                  return
                }
                toast.success("Product deleted")
                router.push(`/${countryCode}/kenh-nghe-nhan/san-pham`)
              })
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}
