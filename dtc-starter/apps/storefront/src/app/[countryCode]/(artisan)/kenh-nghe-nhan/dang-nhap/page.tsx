import { getArtisanMe } from "@lib/data/artisan-portal"
import AuthShell from "@modules/artisan-portal/components/auth-shell"
import { ArtisanLoginForm } from "@modules/artisan-portal/components/auth-forms"
import { redirect } from "next/navigation"

export default async function ArtisanLoginPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params

  if (await getArtisanMe()) {
    redirect(`/${countryCode}/kenh-nghe-nhan`)
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to the Artisan Portal"
      description="Manage your products, accept orders and track your earnings."
    >
      <ArtisanLoginForm />
    </AuthShell>
  )
}
