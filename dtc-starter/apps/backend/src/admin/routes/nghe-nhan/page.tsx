import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import {
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Tabs,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useFormPrompt } from "../../lib/form-prompt"
import { ARTISAN_STATUS, api, formatDate } from "../../lib/marketplace"

type Artisan = {
  id: string
  handle: string
  shop_name: string
  full_name: string
  email: string
  phone: string
  pickup_address: string
  bank_name: string
  bank_account_number: string
  bank_account_name: string
  status: string
  status_reason: string | null
  created_at: string
}

const FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "shop_name", label: "Shop name" },
  { key: "full_name", label: "Artisan full name" },
  { key: "email", label: "Sign-in email", type: "email" },
  { key: "password", label: "Password (at least 8 characters)", type: "password" },
  { key: "phone", label: "Phone number" },
  { key: "pickup_address", label: "Pickup address" },
  { key: "pickup_province_name", label: "Pickup province / city (required)" },
  { key: "bank_name", label: "Bank" },
  { key: "bank_account_number", label: "Account number" },
  { key: "bank_account_name", label: "Account holder" },
  { key: "description", label: "Introduction (optional)" },
]

const CreateArtisanDrawer = () => {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: () => api("/artisans", { method: "POST", body: form }),
    onSuccess: () => {
      toast.success("Shop created")
      setForm({})
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["mp-artisans"] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <Button size="small">Create artisan</Button>
      </Drawer.Trigger>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Create an artisan shop</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <Text size="small" className="text-ui-fg-subtle">
            The shop will be activated immediately. Share the email and password with the artisan.
          </Text>
          {FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-y-1">
              <Label size="small">{field.label}</Label>
              <Input
                type={field.type ?? "text"}
                value={form[field.key] ?? ""}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, [field.key]: event.target.value }))
                }
              />
            </div>
          ))}
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary" size="small">
              Cancel
            </Button>
          </Drawer.Close>
          <Button size="small" isLoading={create.isPending} onClick={() => create.mutate()}>
            Create
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const ArtisanActions = ({ artisan }: { artisan: Artisan }) => {
  const queryClient = useQueryClient()
  const setStatus = useMutation({
    mutationFn: (body: { status: string; reason?: string | null }) =>
      api(`/artisans/${artisan.id}/status`, { method: "POST", body }),
    onSuccess: () => {
      toast.success("Updated")
      queryClient.invalidateQueries({ queryKey: ["mp-artisans"] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const [dialog, ask] = useFormPrompt()

  const withReason = async (status: "rejected" | "locked") => {
    const values = await ask(
      status === "rejected"
        ? {
            title: `Reject shop "${artisan.shop_name}"?`,
            description: "The artisan will receive an email explaining why.",
            fields: [{ name: "reason", label: "Reason for declining", multiline: true, required: true }],
            confirmText: "Decline",
            variant: "danger",
          }
        : {
            title: `Lock shop "${artisan.shop_name}"?`,
            description: "All products from this shop will be hidden until the shop is unlocked.",
            fields: [{ name: "reason", label: "Reason for locking", multiline: true, required: true }],
            confirmText: "Lock shop",
            variant: "danger",
          }
    )

    if (values) {
      setStatus.mutate({ status, reason: values.reason })
    }
  }

  return (
    <div className="flex gap-x-2">
      {dialog}
      {artisan.status === "pending" && (
        <>
          <Button size="small" onClick={() => setStatus.mutate({ status: "active" })}>
            Approve
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => withReason("rejected")}
          >
            Decline
          </Button>
        </>
      )}
      {artisan.status === "active" && artisan.handle !== "yarnly" && (
        <Button
          size="small"
          variant="danger"
          onClick={() => withReason("locked")}
        >
          Lock
        </Button>
      )}
      {(artisan.status === "locked" || artisan.status === "rejected") && (
        <Button
          size="small"
          variant="secondary"
          onClick={() => setStatus.mutate({ status: "active" })}
        >
          {artisan.status === "locked" ? "Unlock" : "Review again"}
        </Button>
      )}
    </div>
  )
}

const ArtisanTable = ({ status }: { status?: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["mp-artisans", status ?? "all"],
    queryFn: () =>
      api<{ artisans: Artisan[] }>(`/artisans${status ? `?status=${status}` : ""}`),
  })

  if (isLoading) {
    return <Text className="p-6">Loading…</Text>
  }

  if (!data?.artisans.length) {
    return <Text className="p-6 text-ui-fg-subtle">No artisans found.</Text>
  }

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Shop</Table.HeaderCell>
          <Table.HeaderCell>Contact</Table.HeaderCell>
          <Table.HeaderCell>Receiving bank</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Created at</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {data.artisans.map((artisan) => {
          const status = ARTISAN_STATUS[artisan.status]

          return (
            <Table.Row key={artisan.id}>
              <Table.Cell>
                <div className="flex flex-col py-2">
                  <Text weight="plus">{artisan.shop_name}</Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {artisan.full_name}
                  </Text>
                </div>
              </Table.Cell>
              <Table.Cell>
                <div className="flex flex-col">
                  <Text size="small">{artisan.email}</Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {artisan.phone}
                  </Text>
                </div>
              </Table.Cell>
              <Table.Cell>
                <Text size="small">
                  {artisan.bank_name} – {artisan.bank_account_number}
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {artisan.bank_account_name}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <StatusBadge color={status?.color ?? "grey"}>
                  {status?.label ?? artisan.status}
                </StatusBadge>
                {artisan.status_reason && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {artisan.status_reason}
                  </Text>
                )}
              </Table.Cell>
              <Table.Cell>{formatDate(artisan.created_at)}</Table.Cell>
              <Table.Cell>
                <ArtisanActions artisan={artisan} />
              </Table.Cell>
            </Table.Row>
          )
        })}
      </Table.Body>
    </Table>
  )
}

const ArtisansPage = () => {
  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>Artisans</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Review registrations, create shops, and lock shops.
          </Text>
        </div>
        <CreateArtisanDrawer />
      </div>
      <Tabs defaultValue="pending">
        <Tabs.List className="px-6">
          <Tabs.Trigger value="pending">Pending approval</Tabs.Trigger>
          <Tabs.Trigger value="active">Active</Tabs.Trigger>
          <Tabs.Trigger value="locked">Locked</Tabs.Trigger>
          <Tabs.Trigger value="rejected">Decline</Tabs.Trigger>
        </Tabs.List>
        {["pending", "active", "locked", "rejected"].map((status) => (
          <Tabs.Content key={status} value={status} className="pt-2">
            <ArtisanTable status={status} />
          </Tabs.Content>
        ))}
      </Tabs>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Artisans",
  icon: Users,
})

export default ArtisansPage
