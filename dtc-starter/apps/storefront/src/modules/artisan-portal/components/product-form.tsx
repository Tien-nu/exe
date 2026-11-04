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
import { clx } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button, Field, Notice, fieldClass } from "../ui"

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
    <div className="flex flex-col gap-7">
      {product?.hidden_by_lock && (
        <Notice tone="warning">This product is hidden because the shop is suspended.</Notice>
      )}

      <FormSection title="Details">
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
      </FormSection>

      <FormSection title="Fulfillment type">
        <div role="radiogroup" aria-label="Fulfillment type" className="grid grid-cols-1 gap-3 xsmall:grid-cols-2">
          {TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={clx(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                type === option.value
                  ? "border-yarnly-moss bg-yarnly-sage/50"
                  : "border-yarnly-line bg-white hover:border-yarnly-ink"
              )}
            >
              <input
                type="radio"
                name="fulfillment_type"
                checked={type === option.value}
                onChange={() => setType(option.value)}
                className="mt-1 accent-yarnly-moss"
              />
              <span className="flex flex-col gap-0.5">
                <span className="txt-medium-plus">{option.label}</span>
                <span className="txt-small text-yarnly-muted">{option.hint}</span>
              </span>
            </label>
          ))}
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
      </FormSection>

      <FormSection title={`Price${type === "ready" ? " and stock" : ""}${product ? " by variant" : ""}`}>
        {product ? (
          <div className="overflow-x-auto rounded-xl border border-yarnly-line">
            <table className="w-full min-w-[420px] txt-medium">
              <thead className="bg-yarnly-paper text-left txt-small text-yarnly-muted">
                <tr>
                  <th className="px-4 py-2.5 font-normal">Variant</th>
                  <th className="px-4 py-2.5 font-normal">Price (VND)</th>
                  {type === "ready" && <th className="px-4 py-2.5 font-normal">Stock</th>}
                </tr>
              </thead>
              <tbody>
                {variants.map((variant, index) => (
                  <tr key={variant.id} className="border-t border-yarnly-line align-top">
                    <td className="px-4 py-3">{variant.title}</td>
                    <td className="px-4 py-3">
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
                      <td className="px-4 py-3">
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
                          <span className="mt-1 block txt-small text-yarnly-muted">
                            Reserved for orders: {variant.reserved}
                          </span>
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
      </FormSection>

      <FormSection title="Product images" hint="The first image is the cover shown on Yarnly.">
        <div className="grid grid-cols-3 gap-3 xsmall:grid-cols-4 medium:grid-cols-6">
          {images.map((url, index) => (
            <div key={url} className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full rounded-xl border border-yarnly-line object-cover"
              />
              {index === 0 && (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-yarnly-ink/80 px-2 py-0.5 text-[10px] text-white">
                  Cover
                </span>
              )}
              <button
                type="button"
                onClick={() => setImages((previous) => previous.filter((image) => image !== url))}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-yarnly-ink shadow-sm transition-colors hover:bg-yarnly-ink hover:text-white"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
          <label
            className={clx(
              "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#c9cdbf] bg-yarnly-paper p-2 text-center txt-small text-yarnly-muted transition-colors hover:border-yarnly-moss hover:text-yarnly-moss focus-within:border-yarnly-moss",
              uploading && "pointer-events-none opacity-60"
            )}
          >
            <span aria-hidden="true" className="text-2xl leading-none">+</span>
            {uploading ? "Uploading images…" : "Add images"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={(event) => upload(event.target.files)}
              className="sr-only"
            />
          </label>
        </div>
      </FormSection>

      {categories.length > 0 && (
        <FormSection title="Categories">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const checked = categoryIds.includes(category.id)

              return (
                <label
                  key={category.id}
                  className={clx(
                    "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 txt-small transition-colors focus-within:ring-2 focus-within:ring-yarnly-moss/30",
                    checked
                      ? "border-yarnly-moss bg-yarnly-sage text-yarnly-moss-dark"
                      : "border-yarnly-line bg-white hover:border-yarnly-ink"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setCategoryIds((previous) =>
                        event.target.checked
                          ? [...previous, category.id]
                          : previous.filter((id) => id !== category.id)
                      )
                    }
                    className="sr-only"
                  />
                  {checked && <span aria-hidden="true">✓</span>}
                  {category.name}
                </label>
              )
            })}
          </div>
        </FormSection>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-yarnly-line bg-yarnly-paper p-4">
        <span className="flex flex-col gap-0.5">
          <span className="txt-medium-plus">Publish on marketplace</span>
          <span className="txt-small text-yarnly-muted">
            Turn off to hide the product temporarily without deleting it.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-6 w-11 shrink-0 rounded-full bg-[#c9cdbf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-yarnly-moss peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-yarnly-moss/40 peer-focus-visible:ring-offset-2"
        />
      </label>

      <div className="flex flex-wrap gap-3 border-t border-yarnly-line pt-6">
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

const TYPE_OPTIONS = [
  { value: "ready", label: "Ready-made", hint: "Sold from stock and shipped once you accept the order" },
  { value: "made_to_order", label: "Made to order", hint: "You start making it after accepting the order" },
] as const

const FormSection = ({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) => (
  <fieldset className="flex flex-col gap-4">
    <legend className="mb-4 flex flex-col gap-0.5">
      <span className="font-yarnly text-lg tracking-[-0.01em] text-yarnly-ink">{title}</span>
      {hint && <span className="txt-small text-yarnly-muted">{hint}</span>}
    </legend>
    {children}
  </fieldset>
)
