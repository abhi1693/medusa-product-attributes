import {
  Button,
  Checkbox,
  Container,
  Drawer,
  Heading,
  Input,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import type { ProductAttributes } from "../../types"
import { effectiveHighlightKeys } from "../../highlight-selection"
import { attributesApi, attributesKeys } from "../lib/api"
import { errorMessage } from "./feedback"
import { restoreFocus } from "../lib/focus"

export const HighlightsEditor = ({
  view,
  onSaved,
  onClose,
}: {
  view: ProductAttributes
  onSaved: (view: ProductAttributes) => void
  onClose: () => void
}) => {
  const [base] = useState(view)
  const fields = base.groups.flatMap((group) => group.fields)
  const [defaults, setDefaults] = useState(base.highlight_keys == null)
  const [keys, setKeys] = useState<string[]>(
    effectiveHighlightKeys(base.highlight_keys, fields)
  )
  const [search, setSearch] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [stale, setStale] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [opener] = useState(() => document.activeElement)
  const reloadButton = useRef<HTMLButtonElement>(null)
  const prompt = usePrompt()
  const close = async () => {
    if (pending) return
    if (
      dirty &&
      !(await prompt({
        title: "Discard changes?",
        description: "Your unsaved highlight selection will be lost.",
        confirmText: "Discard",
        cancelText: "Keep editing",
      }))
    )
      return
    onClose()
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const result = await attributesApi.saveHighlights(base.product_id, {
        version: base.version,
        highlight_keys: defaults ? null : keys,
      })
      onSaved(result)
      toast.success("Storefront highlights saved")
      onClose()
    } catch (failure) {
      setError(errorMessage(failure))
      setStale((failure as { status?: number }).status === 409)
    } finally {
      setPending(false)
    }
  }
  const reload = async () => {
    if (
      !(await prompt({
        title: "Reload highlights?",
        description: "Discard this selection and load the latest product?",
        confirmText: "Reload",
        cancelText: "Keep editing",
      }))
    )
      return
    setPending(true)
    try {
      onSaved(await attributesApi.product(base.product_id))
      onClose()
    } catch (failure) {
      setError(errorMessage(failure))
      reloadButton.current?.focus()
    } finally {
      setPending(false)
    }
  }
  const move = (index: number, direction: number) => {
    setKeys((current) => {
      const result = [...current]
      ;[result[index], result[index + direction]] = [
        result[index + direction],
        result[index],
      ]
      return result
    })
    setDirty(true)
  }
  return (
    <Drawer
      open
      onOpenChange={() => {
        void close()
      }}
    >
      <Drawer.Content
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus(opener)
        }}
      >
        <Drawer.Header>
          <Drawer.Title>Edit storefront highlights</Drawer.Title>
          <Drawer.Description>
            Choose up to six existing attributes and arrange their storefront
            order. Attribute values and full specifications stay unchanged.
          </Drawer.Description>
        </Drawer.Header>
        <form onSubmit={save} className="flex flex-1 flex-col overflow-hidden">
          {error && (
            <div
              role="alert"
              className="mx-6 mt-4 flex flex-col gap-2 rounded-lg border border-ui-border-error p-3 text-sm text-ui-fg-error"
            >
              <span>{error}</span>
              {stale && (
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  ref={reloadButton}
                  disabled={pending}
                  onClick={() => {
                    void reload()
                  }}
                >
                  Reload latest
                </Button>
              )}
            </div>
          )}
          <Drawer.Body className="flex flex-1 flex-col gap-5 overflow-y-auto">
            <fieldset
              disabled={pending || !view.can_write || stale}
              className="flex flex-col gap-5"
            >
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={defaults}
                  onCheckedChange={(checked) => {
                    setDefaults(checked === true)
                    setDirty(true)
                  }}
                />
                Use default highlights
              </label>
              {defaults ? (
                <Text size="small" className="text-ui-fg-subtle">
                  Uses the first six assigned attributes in their schema order.
                  Switch off to choose your own selection.
                </Text>
              ) : (
                <>
                  <div>
                    <Heading level="h3">
                      Selected highlights ({keys.length}/6)
                    </Heading>
                    {!keys.length && (
                      <Text size="small" className="text-ui-fg-subtle">
                        No highlights selected. Saving this hides the storefront
                        highlights grid.
                      </Text>
                    )}
                    <ol
                      className="mt-3 flex flex-col gap-2"
                      aria-label="Highlight order"
                    >
                      {keys.map((key, index) => {
                        const field = fields.find((field) => field.key === key)!
                        return (
                          <li
                            key={key}
                            className="flex items-center justify-between gap-3 rounded-lg border border-ui-border-base p-3"
                          >
                            <span className="text-sm">
                              {index + 1}. {field.label}
                              <span className="ml-2 text-ui-fg-subtle">
                                {field.scope === "variant"
                                  ? "Variant"
                                  : "Product"}
                              </span>
                            </span>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="secondary"
                                size="small"
                                aria-label={`Move ${field.label} up`}
                                disabled={index === 0}
                                onClick={() => move(index, -1)}
                              >
                                ↑
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="small"
                                aria-label={`Move ${field.label} down`}
                                disabled={index === keys.length - 1}
                                onClick={() => move(index, 1)}
                              >
                                ↓
                              </Button>
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                  <Input
                    aria-label="Find an attribute"
                    placeholder="Find an attribute"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <div className="flex flex-col gap-4">
                    {base.groups.map((group) => {
                      const visible = group.fields.filter((field) =>
                        (group.name + " " + field.label)
                          .toLowerCase()
                          .includes(search.toLowerCase())
                      )
                      return visible.length ? (
                        <section
                          key={group.key}
                          className="flex flex-col gap-3"
                        >
                          <Heading level="h3">{group.name}</Heading>
                          {visible.map((field) => (
                            <label
                              key={field.key}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Checkbox
                                aria-label={`${group.name}: ${field.label}`}
                                checked={keys.includes(field.key)}
                                disabled={
                                  !keys.includes(field.key) && keys.length === 6
                                }
                                onCheckedChange={(checked) => {
                                  setKeys((current) =>
                                    checked === true
                                      ? [...current, field.key]
                                      : current.filter(
                                          (key) => key !== field.key
                                        )
                                  )
                                  setDirty(true)
                                }}
                              />
                              <span>
                                {field.label}
                                {field.unit ? ` (${field.unit})` : ""} ·{" "}
                                {field.scope}
                              </span>
                            </label>
                          ))}
                        </section>
                      ) : null
                    })}
                  </div>
                </>
              )}
            </fieldset>
          </Drawer.Body>
          <Drawer.Footer>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                void close()
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={pending}
              disabled={pending || !view.can_write || stale}
            >
              Save highlights
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

export const StorefrontHighlights = ({ productId }: { productId: string }) => {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: attributesKeys.product(productId),
    queryFn: () => attributesApi.product(productId),
    retry: false,
  })
  const [editing, setEditing] = useState<ProductAttributes | null>(null)
  const view = query.data
  const fields = view?.groups.flatMap((group) => group.fields) ?? []
  const selected = effectiveHighlightKeys(view?.highlight_keys, fields)
  const saved = (result: ProductAttributes) => {
    client.setQueryData(attributesKeys.product(productId), result)
    void client.invalidateQueries({
      queryKey: attributesKeys.product(productId),
    })
  }
  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-3 px-6 py-4">
        <Heading level="h2">Storefront highlights</Heading>
        {view?.can_write && fields.length > 0 && (
          <Button
            variant="secondary"
            size="small"
            onClick={() => setEditing(view)}
          >
            Edit highlights
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-3 px-6 py-4">
        {query.isPending ? (
          <Text role="status">Loading highlights…</Text>
        ) : query.isError ? (
          <div role="alert">
            <Text>{errorMessage(query.error)}</Text>
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                void query.refetch()
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <>
            <Text size="small" className="text-ui-fg-subtle">
              {view?.highlight_keys == null
                ? "Default selection"
                : "Custom selection"}{" "}
              · {selected.length}/6
            </Text>
            {!fields.length ? (
              <Text>
                Assign specification attributes before choosing highlights.
              </Text>
            ) : !selected.length ? (
              <Text>Highlights are hidden for this product.</Text>
            ) : (
              <ol className="flex flex-col gap-2">
                {selected.map((key) => (
                  <li key={key} className="text-sm">
                    {fields.find((field) => field.key === key)!.label}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
      {editing && (
        <HighlightsEditor
          view={editing}
          onSaved={saved}
          onClose={() => setEditing(null)}
        />
      )}
    </Container>
  )
}
