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
      eyebrow="Open a shop"
      title="Become a Yarnly artisan"
      description="Open a handmade crochet shop on Yarnly. An admin will review your registration."
    >
      <ArtisanRegisterForm />
    </AuthShell>
  )
}
