import { ArrowLeft } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"
import PixelIcon from "@modules/landing/components/pixel-icon"
import { forwardRef } from "react"

/**
 * The artisan channel's building blocks, drawn in the landing's paper and
 * moss palette so the portal reads as part of the same Yarnly.
 */

export const fieldClass =
  "w-full rounded-lg border border-yarnly-line bg-white px-3.5 py-2.5 txt-medium text-yarnly-ink placeholder:text-yarnly-muted/70 transition-colors hover:border-[#c9cdbf] focus:border-yarnly-moss focus:outline-none focus:ring-2 focus:ring-yarnly-moss/15 disabled:bg-yarnly-paper disabled:text-yarnly-muted"

export const linkClass =
  "text-yarnly-moss underline decoration-yarnly-moss/40 underline-offset-4 transition-colors hover:decoration-yarnly-moss"

export const Field = ({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) => (
  <label className={clx("flex flex-col gap-1.5", className)}>
    <span className="txt-small-plus text-yarnly-ink">{label}</span>
    {children}
    {hint && <span className="txt-small text-yarnly-muted">{hint}</span>}
  </label>
)

export const Card = ({
  title,
  actions,
  children,
  className,
}: {
  title?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) => (
  <section
    className={clx(
      "rounded-2xl border border-yarnly-line bg-white p-5 small:p-6",
      className
    )}
  >
    {(title || actions) && (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        {title && (
          <h2 className="font-yarnly text-[22px] leading-tight tracking-[-0.02em] text-yarnly-ink">
            {title}
          </h2>
        )}
        {actions}
      </div>
    )}
    {children}
  </section>
)

export const PageHeader = ({
  eyebrow,
  title,
  description,
  back,
  actions,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  back?: { href: string; label: string }
  actions?: React.ReactNode
}) => (
  <header className="flex flex-col gap-3">
    {back && (
      <LocalizedClientLink
        href={back.href}
        className="inline-flex w-fit items-center gap-1.5 txt-small text-yarnly-muted transition-colors hover:text-yarnly-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {back.label}
      </LocalizedClientLink>
    )}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && (
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-yarnly-moss">
            {eyebrow}
          </p>
        )}
        <h1 className="font-yarnly text-[30px] leading-[1.1] tracking-[-0.03em] text-yarnly-ink small:text-[38px]">
          {title}
        </h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
    {description && (
      <p className="max-w-2xl txt-medium leading-relaxed text-yarnly-muted">{description}</p>
    )}
  </header>
)

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yarnly-moss/40 focus-visible:ring-offset-2 focus-visible:ring-offset-yarnly-paper disabled:pointer-events-none disabled:opacity-50"

const buttonVariants = {
  primary:
    "border border-yarnly-ink bg-yarnly-ink text-yarnly-paper hover:-translate-y-px hover:bg-[#242a21]",
  secondary:
    "border border-yarnly-line bg-white text-yarnly-ink hover:border-yarnly-ink",
  moss: "border border-yarnly-moss bg-yarnly-moss text-white hover:-translate-y-px hover:bg-yarnly-moss-dark",
}

const buttonSizes = {
  small: "h-9 px-3.5 text-[13px]",
  medium: "h-11 px-5 text-sm",
}

export const buttonClass = ({
  variant = "primary",
  size = "medium",
}: {
  variant?: keyof typeof buttonVariants
  size?: keyof typeof buttonSizes
} = {}) => clx(buttonBase, buttonVariants[variant], buttonSizes[size])

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants
  size?: keyof typeof buttonSizes
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, isLoading, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={clx(buttonClass({ variant, size }), className)}
      {...props}
    >
      {isLoading ? "Đang xử lý…" : children}
    </button>
  )
)
Button.displayName = "Button"

/** Pill filters that live in the URL, e.g. order status tabs. */
export const FilterTabs = ({
  label,
  tabs,
}: {
  label: string
  tabs: { href: string; label: string; active: boolean; count?: number }[]
}) => (
  <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
    <ul className="flex w-max gap-2">
      {tabs.map((tab) => (
        <li key={tab.href}>
          <LocalizedClientLink
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={clx(
              "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-4 txt-small transition-colors",
              tab.active
                ? "border-yarnly-ink bg-yarnly-ink text-yarnly-paper"
                : "border-yarnly-line bg-white text-yarnly-ink hover:border-yarnly-ink"
            )}
          >
            {tab.label}
            {!!tab.count && (
              <span
                className={clx(
                  "rounded-full px-1.5 text-[11px] leading-[18px]",
                  tab.active ? "bg-white/20" : "bg-yarnly-sage text-yarnly-moss"
                )}
              >
                {tab.count}
              </span>
            )}
          </LocalizedClientLink>
        </li>
      ))}
    </ul>
  </nav>
)

const STATUS_TONES: Record<string, string> = {
  pending_payment: "bg-[#ecebe5] text-[#55594f]",
  pending_acceptance: "bg-[#f6ead0] text-[#7d5716]",
  processing: "bg-[#e1eaf0] text-[#355a70]",
  ready_to_ship: "bg-[#ebe6f0] text-[#584a69]",
  shipping: "bg-[#ddebe9] text-[#2c5f5a]",
  delivered: "bg-yarnly-sage text-yarnly-moss-dark",
  completed: "bg-yarnly-sage text-yarnly-moss-dark",
  canceled: "bg-[#f3e1dc] text-[#8f4333]",
}

export const StatusBadge = ({ status, label }: { status: string; label: string }) => (
  <span
    className={clx(
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium",
      STATUS_TONES[status] ?? STATUS_TONES.pending_payment
    )}
  >
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    {label}
  </span>
)

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) => (
  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#cfd3c6] bg-yarnly-cream px-6 py-12 text-center">
    <PixelIcon kind="yarn" className="h-10 w-10" />
    <p className="font-yarnly text-xl text-yarnly-ink">{title}</p>
    {description && <p className="max-w-sm txt-small text-yarnly-muted">{description}</p>}
    {action}
  </div>
)

const NOTICE_TONES = {
  info: "border-[#d5ddc6] bg-yarnly-sage/60 text-yarnly-ink",
  warning: "border-[#ecd9a8] bg-[#fbf3df] text-[#5f4512]",
}

export const Notice = ({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof NOTICE_TONES
  children: React.ReactNode
  className?: string
}) => (
  <div
    className={clx(
      "rounded-xl border px-4 py-3 txt-small leading-relaxed",
      NOTICE_TONES[tone],
      className
    )}
  >
    {children}
  </div>
)
