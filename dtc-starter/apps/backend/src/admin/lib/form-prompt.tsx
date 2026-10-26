import { Input, Label, Prompt, Textarea } from "@medusajs/ui"
import { useCallback, useState } from "react"

type Field = {
  name: string
  label: string
  placeholder?: string
  defaultValue?: string
  multiline?: boolean
  required?: boolean
}

type Options = {
  title: string
  description?: string
  fields: Field[]
  confirmText?: string
  cancelText?: string
  variant?: "danger" | "confirmation"
}

type State = Options & {
  resolve: (values: Record<string, string> | null) => void
}

/**
 * A Medusa-styled dialog with inputs, replacing window.prompt:
 *   const [dialog, ask] = useFormPrompt()
 *   const values = await ask({ title: "Lý do", fields: [{ name: "reason", label: "Lý do", required: true }] })
 *   // values === null when cancelled
 *   return <>{dialog}...</>
 */
export function useFormPrompt(): [
  React.ReactNode,
  (options: Options) => Promise<Record<string, string> | null>
] {
  const [state, setState] = useState<State | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})

  const ask = useCallback(
    (options: Options) =>
      new Promise<Record<string, string> | null>((resolve) => {
        setValues(
          Object.fromEntries(options.fields.map((field) => [field.name, field.defaultValue ?? ""]))
        )
        setState({ ...options, resolve })
      }),
    []
  )

  const finish = (result: Record<string, string> | null) => {
    state?.resolve(result)
    setState(null)
  }

  const complete =
    !!state &&
    state.fields.every((field) => !field.required || (values[field.name] ?? "").trim().length > 0)

  const dialog = (
    <Prompt
      open={!!state}
      variant={state?.variant ?? "confirmation"}
      onOpenChange={(open) => {
        if (!open && state) finish(null)
      }}
    >
      <Prompt.Content>
        <Prompt.Header>
          <Prompt.Title>{state?.title}</Prompt.Title>
          {state?.description && <Prompt.Description>{state.description}</Prompt.Description>}
        </Prompt.Header>
        <div className="flex flex-col gap-y-3 px-6 pb-2">
          {state?.fields.map((field, index) => (
            <div key={field.name} className="flex flex-col gap-y-1">
              <Label size="small">{field.label}</Label>
              {field.multiline ? (
                <Textarea
                  autoFocus={index === 0}
                  value={values[field.name] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [field.name]: event.target.value }))
                  }
                />
              ) : (
                <Input
                  autoFocus={index === 0}
                  value={values[field.name] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [field.name]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && complete) {
                      event.preventDefault()
                      finish(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))
                    }
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <Prompt.Footer>
          <Prompt.Cancel onClick={() => finish(null)}>{state?.cancelText ?? "Cancel"}</Prompt.Cancel>
          <Prompt.Action
            disabled={!complete}
            onClick={() =>
              finish(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))
            }
          >
            {state?.confirmText ?? "Confirm"}
          </Prompt.Action>
        </Prompt.Footer>
      </Prompt.Content>
    </Prompt>
  )

  return [dialog, ask]
}
