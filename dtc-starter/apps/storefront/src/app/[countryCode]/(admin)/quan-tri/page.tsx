import { redirect } from "next/navigation"
export const dynamic = "force-dynamic"
export const metadata = {
  title: "Yarnly Admin",
  robots: { index: false, follow: false },
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  const paths: Record<string, string> = {
    products: "products",
    customers: "customers",
    orders: "orders",
    artisans: "nghe-nhan",
    payouts: "doi-soat",
  }
  redirect(`/app/${paths[view ?? ""] ?? "orders"}`)
}
