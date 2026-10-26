"use client"

import { useEffect, useId, useState } from "react"
import { provinceCode } from "@lib/vietnam-provinces"

type Ward = { code: string; name: string }
const cache = new Map<string, Ward[]>()

export default function WardSelect({
  province,
  value,
  onChange,
  name,
  label = "Ward / Commune",
  required = true,
  labelPlacement = "above",
}: {
  province: string
  value: string
  onChange: (name: string, code: string) => void
  name: string
  label?: string
  required?: boolean
  labelPlacement?: "above" | "inside"
}) {
  const id = useId()
  const code = provinceCode(province) ?? ""
  const [state, setState] = useState<{
    province: string
    wards: Ward[]
    error: boolean
  }>({ province: "", wards: [], error: false })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!code) return
    if (cache.has(code)) {
      setState({ province: code, wards: cache.get(code)!, error: false })
      return
    }
    const controller = new AbortController()
    setState({ province: code, wards: [], error: false })
    fetch(`/api/addresses/wards?province=${encodeURIComponent(code)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load wards")
        const data = await response.json()
        if (
          !Array.isArray(data.wards) ||
          !data.wards.length ||
          data.wards.some(
            (ward: Ward) =>
              typeof ward.code !== "string" || typeof ward.name !== "string"
          )
        )
          throw new Error("Invalid ward data")
        if (controller.signal.aborted) return
        cache.set(code, data.wards)
        setState({ province: code, wards: data.wards, error: false })
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ province: code, wards: [], error: true })
      })
    return () => controller.abort()
  }, [code, attempt])
  const wards = state.province === code ? state.wards : []
  const error = state.province === code && state.error
  const loading = Boolean(code) && !wards.length && !error
  const selected = wards.some((ward) => ward.name === value) ? value : ""
  return (
    <div className={labelPlacement === "inside" ? "relative" : undefined}>
      <label
        htmlFor={id}
        className={
          labelPlacement === "inside"
            ? "pointer-events-none absolute left-4 top-1 z-10 text-[10px] leading-3 text-ui-fg-subtle"
            : "block text-sm"
        }
      >
        {label}
      </label>
      <select
        id={id}
        name={name}
        aria-label={label}
        aria-busy={loading}
        aria-describedby={error ? `${id}-error` : undefined}
        className={
          labelPlacement === "inside"
            ? "block h-11 w-full appearance-none rounded-md border border-ui-border-base bg-ui-bg-field pb-1 pl-4 pr-9 pt-4 txt-compact-medium hover:bg-ui-bg-field-hover focus:outline-none focus:shadow-borders-interactive-with-active disabled:bg-gray-100"
            : "mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-4 py-2 focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
        }
        value={selected}
        required={required}
        disabled={!code}
        onChange={(event) => {
          const ward = wards.find((item) => item.name === event.target.value)
          onChange(ward?.name ?? "", ward?.code ?? "")
        }}
      >
        <option value="">
          {!code
            ? "Select a province / city first"
            : loading
            ? "Loading wards…"
            : error
            ? "Unable to load wards"
            : "Select a ward / commune"}
        </option>
        {wards.map((ward) => (
          <option key={ward.code} value={ward.name}>
            {ward.name}
          </option>
        ))}
      </select>
      {labelPlacement === "inside" && (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-ui-fg-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      )}
      {error && (
        <div
          id={`${id}-error`}
          role="alert"
          className="mt-2 text-sm text-red-700"
        >
          Unable to load wards.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && Boolean(value) && !selected && Boolean(code) && (
        <p className="mt-1 text-sm text-amber-700">
          Please select a ward from the current list for this province.
        </p>
      )}
    </div>
  )
}
