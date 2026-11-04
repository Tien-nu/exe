import { yarnlySerif } from "@lib/fonts"
import { listArtisans } from "@lib/data/marketplace"
import { ArrowRightMini } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PixelIcon from "@modules/landing/components/pixel-icon"
import ArtisanCard from "@modules/marketplace/components/artisan-card"
import { Metadata } from "next"
import Image from "next/image"

export const metadata: Metadata = {
  title: "Nghệ nhân | Yarnly",
  description: "Các gian hàng đồ len handmade trên Yarnly.",
}

export default async function ArtisansPage() {
  const artisans = await listArtisans()

  return (
    <div className={`${yarnlySerif.variable} bg-yarnly-paper text-yarnly-ink`}>
      <section className="content-container grid grid-cols-1 gap-10 pb-12 pt-12 small:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] small:items-center small:gap-16 small:pb-20 small:pt-20">
        <div className="flex flex-col gap-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-yarnly-moss">
            Gặp gỡ nghệ nhân
          </p>
          <h1 className="font-yarnly text-[40px] leading-[1.05] tracking-[-0.04em] small:text-[64px]">
            Những đôi tay đứng sau mỗi món len.
          </h1>
          <p className="max-w-xl txt-large leading-relaxed text-yarnly-muted">
            Mỗi món đồ len trên Yarnly được làm bởi một nghệ nhân thật. Chọn một gian hàng để xem
            sản phẩm của họ, hoặc gửi yêu cầu làm riêng theo ý bạn.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
            <a
              href="#gian-hang"
              className="inline-flex h-12 items-center gap-3 rounded-lg border border-yarnly-ink bg-yarnly-ink px-6 text-sm font-medium text-yarnly-paper transition-colors hover:bg-yarnly-paper hover:text-yarnly-ink"
            >
              Xem các gian hàng
              <ArrowRightMini />
            </a>
            <span className="flex items-center gap-2 txt-small text-yarnly-muted">
              <PixelIcon kind="yarn" className="h-5 w-5" />
              {artisans.length} gian hàng đang mở
            </span>
          </div>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl small:aspect-[5/4]">
          <Image
            src="/images/yarnly-studio-yarn.webp"
            alt="Ba cuộn len lông mềm màu trắng, xanh xám và nâu nhạt đặt trên khay gỗ"
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover"
          />
          <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-4 py-2 txt-small text-yarnly-ink backdrop-blur">
            Làm bằng đôi tay, gửi bằng yêu thương
          </span>
        </div>
      </section>

      <section id="gian-hang" className="scroll-mt-24 border-t border-yarnly-line">
        <div className="content-container py-12 small:py-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-yarnly text-[30px] leading-tight tracking-[-0.03em] small:text-[40px]">
              Các gian hàng
            </h2>
            <p className="txt-small text-yarnly-muted">{artisans.length} nghệ nhân</p>
          </div>
          {artisans.length ? (
            <ul className="grid grid-cols-1 gap-5 xsmall:grid-cols-2 medium:grid-cols-3">
              {artisans.map((artisan, index) => (
                <li key={artisan.id}>
                  <ArtisanCard artisan={artisan} index={index} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#cfd3c6] bg-yarnly-cream px-6 py-14 text-center">
              <PixelIcon kind="yarn" className="h-10 w-10" />
              <p className="font-yarnly text-xl">Chưa có gian hàng nào</p>
              <p className="max-w-sm txt-small text-yarnly-muted">
                Các nghệ nhân đầu tiên sẽ sớm có mặt ở đây.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="content-container pb-16 small:pb-24">
        <div className="relative isolate overflow-hidden rounded-3xl px-6 py-12 text-white small:px-14 small:py-16">
          <Image
            src="/images/yarnly-pixel-garden.webp"
            alt=""
            fill
            sizes="100vw"
            className="-z-10 object-cover object-[80%_70%]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[#1d2a1b]/90 via-[#1d2a1b]/80 to-[#1d2a1b]/60 small:bg-gradient-to-r small:from-[#1d2a1b]/90 small:via-[#1d2a1b]/65 small:to-[#1d2a1b]/10"
          />
          <div className="flex max-w-xl flex-col gap-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/80">
              Kênh nghệ nhân Yarnly
            </p>
            <h2 className="font-yarnly text-[30px] leading-tight tracking-[-0.03em] small:text-[42px]">
              Bạn là người làm đồ len handmade?
            </h2>
            <p className="txt-medium leading-relaxed text-white/85">
              Mở gian hàng miễn phí trên Yarnly, nhận đơn và nhận tiền mỗi thứ Hai.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
              <LocalizedClientLink
                href="/kenh-nghe-nhan/dang-ky"
                className="inline-flex h-12 items-center gap-3 rounded-lg bg-yarnly-paper px-6 text-sm font-medium text-yarnly-ink transition-colors hover:bg-white"
              >
                Đăng ký làm nghệ nhân
                <ArrowRightMini />
              </LocalizedClientLink>
              <LocalizedClientLink
                href="/kenh-nghe-nhan/dang-nhap"
                className="txt-small text-white/85 underline decoration-white/40 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
              >
                Đã có gian hàng? Đăng nhập
              </LocalizedClientLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
