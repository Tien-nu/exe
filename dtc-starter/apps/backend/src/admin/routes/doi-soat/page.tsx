import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useFormPrompt } from "../../lib/form-prompt"
import { api, formatDate, formatVnd } from "../../lib/marketplace"

type Payout = {
  id: string
  period_start: string
  period_end: string
  sub_order_count: number
  gross_amount: number
  fee_percent: number
  fee_amount: number
  net_amount: number
  bank_name: string
  bank_account_number: string
  bank_account_name: string
  status: "pending" | "paid"
  transaction_ref: string | null
  paid_at: string | null
  artisan: { shop_name: string; email: string }
}

const PayoutsSection = () => {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["mp-payouts"],
    queryFn: () => api<{ payouts: Payout[] }>("/payouts"),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["mp-payouts"] })

  const generate = useMutation({
    mutationFn: () => api<{ created: number }>("/payouts", { method: "POST", body: {} }),
    onSuccess: ({ created }) => {
      toast.success(
        created ? `Created ${created} payouts` : "No new completed orders"
      )
      refresh()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const markPaid = useMutation({
    mutationFn: ({ id, transaction_ref }: { id: string; transaction_ref: string }) =>
      api(`/payouts/${id}/paid`, { method: "POST", body: { transaction_ref } }),
    onSuccess: () => {
      toast.success("Marked as paid")
      refresh()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const [dialog, ask] = useFormPrompt()

  return (
    <Container className="p-0">
      {dialog}
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>Artisan payouts</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Every Monday, the system summarizes orders completed in the previous week. Transfer the funds, then select "Mark paid".
          </Text>
        </div>
        <Button
          size="small"
          variant="secondary"
          isLoading={generate.isPending}
          onClick={() => generate.mutate()}
        >
          Summarize previous week
        </Button>
      </div>
      {isLoading ? (
        <Text className="p-6">Loading…</Text>
      ) : !data?.payouts.length ? (
        <Text className="p-6 text-ui-fg-subtle">No payouts yet.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Artisans</Table.HeaderCell>
              <Table.HeaderCell>Period</Table.HeaderCell>
              <Table.HeaderCell>Orders</Table.HeaderCell>
              <Table.HeaderCell>Item total</Table.HeaderCell>
              <Table.HeaderCell>Platform fee</Table.HeaderCell>
              <Table.HeaderCell>To pay</Table.HeaderCell>
              <Table.HeaderCell>Account</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.payouts.map((payout) => (
              <Table.Row key={payout.id}>
                <Table.Cell>{payout.artisan.shop_name}</Table.Cell>
                <Table.Cell>
                  {formatDate(payout.period_start)} – {formatDate(payout.period_end)}
                </Table.Cell>
                <Table.Cell>{payout.sub_order_count}</Table.Cell>
                <Table.Cell>{formatVnd(payout.gross_amount)}</Table.Cell>
                <Table.Cell>
                  {payout.fee_percent}% ({formatVnd(payout.fee_amount)})
                </Table.Cell>
                <Table.Cell>
                  <Text weight="plus">{formatVnd(payout.net_amount)}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">
                    {payout.bank_name} – {payout.bank_account_number}
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {payout.bank_account_name}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {payout.status === "paid" ? (
                    <div>
                      <StatusBadge color="green">Paid</StatusBadge>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {payout.transaction_ref}
                      </Text>
                    </div>
                  ) : (
                    <Button
                      size="small"
                      onClick={async () => {
                        const values = await ask({
                          title: `Transferred ${formatVnd(payout.net_amount)} cho ${payout.artisan.shop_name}?`,
                          description: `Recipient account: ${payout.bank_name} ${payout.bank_account_number} – ${payout.bank_account_name}. The artisan will receive an email with the transaction reference.`,
                          fields: [
                            { name: "ref", label: "Bank transaction reference", placeholder: "VD: FT26271234567", required: true },
                          ],
                          confirmText: "Mark paid",
                        })
                        if (values) {
                          markPaid.mutate({ id: payout.id, transaction_ref: values.ref })
                        }
                      }}
                    >
                      Paid
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

const SETTINGS_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "platform_fee_percent", label: "Marketplace fee (%)", hint: "Currently 0%. Changes apply to payouts generated after saving." },
  { key: "admin_email", label: "Admin notification email", hint: "Receive emails when artisans finish orders, customers report transfers, and more." },
  { key: "bank_name", label: "Yarnly receiving bank" },
  { key: "bank_code", label: "VietQR bank code", hint: "e.g. mb, vcb, tcb, acb, or a BIN code" },
  { key: "bank_account_number", label: "Account number" },
  { key: "bank_account_name", label: "Account holder" },
]

const SettingsSection = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Record<string, string>>({})
  const { data } = useQuery({
    queryKey: ["mp-settings"],
    queryFn: () => api<{ settings: Record<string, unknown> }>("/settings"),
  })

  useEffect(() => {
    if (data?.settings) {
      setForm(
        Object.fromEntries(
          SETTINGS_FIELDS.map(({ key }) => [key, String(data.settings[key] ?? "")])
        )
      )
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => api("/settings", { method: "POST", body: form }),
    onSuccess: () => {
      toast.success("Settings saved")
      queryClient.invalidateQueries({ queryKey: ["mp-settings"] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <Container className="flex flex-col gap-y-4 px-6 py-4">
      <div>
        <Heading>Marketplace settings</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          This bank account is used to generate VietQR codes for customer transfers.
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SETTINGS_FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-y-1">
            <Label size="small">{field.label}</Label>
            <Input
              value={form[field.key] ?? ""}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, [field.key]: event.target.value }))
              }
            />
            {field.hint && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                {field.hint}
              </Text>
            )}
          </div>
        ))}
      </div>
      <div>
        <Button size="small" isLoading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </Container>
  )
}

const PayoutsPage = () => (
  <div className="flex flex-col gap-y-3">
    <PayoutsSection />
    <SettingsSection />
  </div>
)

export const config = defineRouteConfig({
  label: "Payouts",
  icon: CurrencyDollar,
})

export default PayoutsPage
