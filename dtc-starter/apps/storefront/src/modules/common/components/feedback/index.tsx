"use client"

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react"
import { clx } from "@modules/common/components/ui"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

/**
 * In-page replacements for window.alert / confirm / prompt:
 *   const { confirm, ask, toast } = useFeedback()
 *   if (await confirm({ title: "Huỷ đơn?" })) ...
 *   const reason = await ask({ title: "Lý do", label: "Lý do" })  // null = cancelled
 *   toast.success("Đã lưu")
 */

type Tone = "default" | "danger"

type ConfirmOptions = {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: Tone
}

type AskOptions = ConfirmOptions & {
  label: string
  placeholder?: string
  defaultValue?: string
  multiline?: boolean
  required?: boolean
}

type ToastKind = "success" | "error" | "info"
type ToastItem = { id: number; kind: ToastKind; message: string }

type DialogState =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "ask"; options: AskOptions; resolve: (value: string | null) => void }

type FeedbackApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  ask: (options: AskOptions) => Promise<string | null>
  toast: Record<ToastKind, (message: string) => void>
}

const FeedbackContext = createContext<FeedbackApi | null>(null)

export const useFeedback = () => {
  const api = useContext(FeedbackContext)

  if (!api) {
    throw new Error("useFeedback must be used inside <FeedbackProvider>")
  }

  return api
}

const TOAST_STYLES: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-violet-200 bg-violet-50 text-violet-900",
}

const TOAST_ICONS: Record<ToastKind, string> = { success: "✓", error: "!", info: "i" }

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [value, setValue] = useState("")
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setDialog({ kind: "confirm", options, resolve })),
    []
  )

  const ask = useCallback((options: AskOptions) => {
    setValue(options.defaultValue ?? "")
    return new Promise<string | null>((resolve) => setDialog({ kind: "ask", options, resolve }))
  }, [])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++nextId.current
    setToasts((list) => [...list, { id, kind, message }])
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 4500)
  }, [])

  const toast = useRef({
    success: (message: string) => push("success", message),
    error: (message: string) => push("error", message),
    info: (message: string) => push("info", message),
  }).current

  const close = (result: boolean) => {
    if (!dialog) return
    if (dialog.kind === "confirm") {
      dialog.resolve(result)
    } else {
      dialog.resolve(result ? value.trim() : null)
    }
    setDialog(null)
  }

  const options = dialog?.options
  const askOptions = dialog?.kind === "ask" ? dialog.options : null
  const canSubmit = !askOptions?.required || value.trim().length > 0

  return (
    <FeedbackContext.Provider value={{ confirm, ask, toast }}>
      {children}

      <Dialog open={!!dialog} onClose={() => close(false)} className="relative z-[100]">
        <DialogBackdrop className="fixed inset-0 bg-black/30" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel
            as="form"
            onSubmit={(event: React.FormEvent) => {
              event.preventDefault()
              if (canSubmit) close(true)
            }}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <DialogTitle className="txt-xlarge-plus">{options?.title}</DialogTitle>
            {options?.description && (
              <p className="mt-2 txt-medium text-ui-fg-subtle">{options.description}</p>
            )}
            {askOptions && (
              <label className="mt-4 flex flex-col gap-1">
                <span className="txt-small-plus">{askOptions.label}</span>
                {askOptions.multiline ? (
                  <textarea
                    autoFocus
                    rows={3}
                    value={value}
                    placeholder={askOptions.placeholder}
                    onChange={(event) => setValue(event.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 txt-medium focus:border-violet-400 focus:outline-none"
                  />
                ) : (
                  <input
                    autoFocus
                    value={value}
                    placeholder={askOptions.placeholder}
                    onChange={(event) => setValue(event.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 txt-medium focus:border-violet-400 focus:outline-none"
                  />
                )}
              </label>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="h-10 rounded-md border border-gray-200 bg-white px-4 txt-medium hover:bg-gray-50"
              >
                {options?.cancelText ?? "Cancel"}
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                autoFocus={!askOptions}
                className={clx(
                  "h-10 rounded-md px-4 txt-medium text-white disabled:opacity-50",
                  options?.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-gray-800"
                )}
              >
                {options?.confirmText ?? "Agree"}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} />
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

function ToastView({ toast }: { toast: ToastItem }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={clx(
        "pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-md transition-all duration-200",
        TOAST_STYLES[toast.kind],
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 txt-small-plus">
        {TOAST_ICONS[toast.kind]}
      </span>
      <p className="txt-medium">{toast.message}</p>
    </div>
  )
}
