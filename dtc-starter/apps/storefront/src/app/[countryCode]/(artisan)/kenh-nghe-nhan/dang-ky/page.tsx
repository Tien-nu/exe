import { getArtisanMe } from "@lib/data/artisan-portal"
import AuthShell from "@modules/artisan-portal/components/auth-shell"
import { ArtisanRegisterForm } from "@modules/artisan-portal/components/auth-forms"
import { redirect } from "next/navigation"

export default async function ArtisanRegisterPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params

  if (await getArtisanMe()) {
    redirect(`/${countryCode}/kenh-nghe-nhan`)
  }

  return (
    <AuthShell
      wide
      eyebrow="Mở gian hàng"
      title="Đăng ký làm nghệ nhân"
      description="Mở gian hàng đồ len handmade trên Yarnly. Admin sẽ duyệt đăng ký của bạn."
    >
      <ArtisanRegisterForm />
    </AuthShell>
  )
}
