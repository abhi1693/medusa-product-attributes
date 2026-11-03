import { Combobox } from "@medusajs/dashboard/components"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import type { AttributeValues, ProductAttributes } from "../../types"
import { attributesApi, attributesKeys } from "../lib/api"
import { restoreFocus } from "../lib/focus"
import { AttributeInput, formatAttributeValue } from "./attribute-input"
import { errorMessage, Feedback } from "./feedback"

const ValuesEditor = ({
  view,
  variantId,
  onClose,
  onSaved,
}: {
  view: ProductAttributes
  variantId?: string
  onClose: () => void
  onSaved: (view: ProductAttributes) => void
}) => {
  const variant = view.variants.find((item) => item.id === variantId)
  const [opener] = useState(() => document.activeElement)
  const reloadButton = useRef<HTMLButtonElement>(null)
  const [focusAfterReload, setFocusAfterReload] = useState(false)
  const [values, setValues] = useState<AttributeValues>(() => ({
    ...(variant ? variant.values : view.values),
  }))
  const [pending, setPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string>()
  const [stale, setStale] = useState(false)
  const prompt = usePrompt()
  useEffect(() => {
    if (!pending && focusAfterReload) {
      restoreFocus(reloadButton.current)
      setFocusAfterReload(false)
    }
  }, [pending, focusAfterReload])
  const fields = view.groups
    .flatMap((group) => group.fields)
    .filter((field) => field.scope === (variantId ? "variant" : "product"))
  const close = async () => {
    if (pending) return
    const previouslyFocused = document.activeElement
    if (
      dirty &&
      !(await prompt({
        title: "Discard changes?",
        description: "Your unsaved specification values will be lost.",
        confirmText: "Discard",
        cancelText: "Keep editing",
      }))
    ) {
      restoreFocus(previouslyFocused)
      return
    }
    onClose()
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(undefined)
    try {
      const result = await attributesApi.saveValues(view.product_id, {
        version: view.version,
        ...(variant
          ? { variants: [{ id: variant.id, version: variant.version, values }] }
          : { values }),
      })
      onSaved(result)
      toast.success("Specifications saved")
      onClose()
    } catch (failure) {
      setError(errorMessage(failure))
      setStale((failure as { status?: number }).status === 409)
    } finally {
      setPending(false)
    }
  }
  const reload = async () => {
    const previouslyFocused = document.activeElement
    const confirmed = await prompt({
      title: "Reload specifications?",
      description:
        "This discards the unsaved values and loads the latest product.",
      confirmText: "Reload",
      cancelText: "Keep editing",
    })
    if (!confirmed) {
      restoreFocus(previouslyFocused)
      return
    }
    setPending(true)
    try {
      onSaved(await attributesApi.product(view.product_id))
      onClose()
    } catch (failure) {
      setError(errorMessage(failure))
      setFocusAfterReload(true)
    } finally {
      setPending(false)
    }
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
          <Drawer.Title>
            {variantId ? "Edit variant specifications" : "Edit specifications"}
          </Drawer.Title>
          <Drawer.Description>
            Edit the applicable groups below. Blank values remain unknown.
          </Drawer.Description>
        </Drawer.Header>
        <form
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {error && (
            <div
              role="alert"
              className="mx-6 mt-4 flex shrink-0 flex-col gap-2 rounded-lg border border-ui-border-error p-3 text-sm text-ui-fg-error"
            >
              <span>{error}</span>
              {stale && (
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  disabled={pending}
                  ref={reloadButton}
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
            {fields.length === 0 && (
              <Text className="text-ui-fg-subtle">
                This template has no {variantId ? "variant" : "product"} fields.
              </Text>
            )}
            <fieldset
              disabled={pending || !view.can_write}
              className="flex flex-col gap-5"
            >
              {view.groups.map((group) => (
                <section key={group.id} className="flex flex-col gap-4">
                  <Heading level="h3">{group.name}</Heading>
                  {group.fields
                    .filter(
                      (field) =>
                        field.scope === (variantId ? "variant" : "product")
                    )
                    .map((field) => (
                      <AttributeInput
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        onChange={(value) => {
                          setValues((current) => ({
                            ...current,
                            [field.key]: value,
                          }))
                          setDirty(true)
                        }}
                      />
                    ))}
                </section>
              ))}
            </fieldset>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Required fields are marked *. Unset values remain distinct from
              zero and No.
            </Text>
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex justify-end gap-2">
              <Button
                size="small"
                variant="secondary"
                type="button"
                disabled={pending}
                onClick={() => {
                  void close()
                }}
              >
                Cancel
              </Button>
              <Button
                size="small"
                type="submit"
                isLoading={pending}
                disabled={stale || !view.can_write}
              >
                Save
              </Button>
            </div>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

export const Specifications = ({
  productId,
  variantId,
}: {
  productId: string
  variantId?: string
}) => {
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const [editing, setEditing] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const query = useQuery({
    queryKey: attributesKeys.product(productId),
    queryFn: () => attributesApi.product(productId),
  })
  const saved = (view: ProductAttributes) => {
    queryClient.setQueryData(attributesKeys.product(productId), view)
  }
  if (query.isPending)
    return (
      <Container className="p-0">
        <Feedback title="Loading specifications…" />
      </Container>
    )
  if (query.isError)
    return (
      <Container className="p-0">
        <Feedback
          title="Specifications could not be loaded"
          retry={() => {
            void query.refetch()
          }}
          error
        >
          {errorMessage(query.error)}
        </Feedback>
      </Container>
    )
  const view = query.data
  const variant = view.variants.find((item) => item.id === variantId)
  if (variantId && !variant)
    return (
      <Container>
        <Feedback title="Variant specifications unavailable" error>
          This variant could not be found on this product.
        </Feedback>
      </Container>
    )
  const fields = view.groups
    .flatMap((group) => group.fields)
    .filter((field) => field.scope === (variantId ? "variant" : "product"))
  const values = variant ? variant.values : view.values
  const assignment = async () => {
    if (
      view.groups.some((group) => !selectedGroups.includes(group.id)) &&
      !(await prompt({
        title: "Remove specification groups?",
        description:
          "Values in removed groups will leave the current specification. Previous revisions remain recorded.",
        confirmText: "Save groups",
        cancelText: "Cancel",
      }))
    )
      return
    setPending(true)
    setError(undefined)
    try {
      saved(
        await attributesApi.assignGroups(productId, {
          version: view.version,
          groups: selectedGroups.map((id) => {
            const existing = view.groups.find((group) => group.id === id)
            const group =
              existing || view.templates.find((group) => group.id === id)!
            return { template_id: group.id, template_version: group.version }
          }),
        })
      )
      setSelecting(false)
      toast.success("Specification groups saved")
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setPending(false)
    }
  }
  return (
    <Container
      className="divide-y p-0"
      role="region"
      aria-label={variantId ? "Variant specifications" : "Specifications"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">
            {variantId ? "Variant specifications" : "Specifications"}
          </Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {view.groups.length} specification groups
          </Text>
        </div>
        {view.groups.length > 0 && (
          <Button
            size="small"
            variant="secondary"
            disabled={!view.can_write || pending}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        )}
      </div>
      {error && (
        <div role="alert" className="px-6 py-3 text-sm text-ui-fg-error">
          {error}
          <Button
            variant="transparent"
            size="small"
            onClick={() => {
              void query.refetch()
            }}
          >
            Reload
          </Button>
        </div>
      )}
      {view.groups.length === 0 ? (
        <Feedback title="No specification groups">
          {variantId
            ? "Add specification groups on the product to define variant fields."
            : "Add reusable groups to enter technical specifications for this product."}
        </Feedback>
      ) : fields.length === 0 ? (
        <Feedback title={`No ${variantId ? "variant" : "product"} fields`}>
          The assigned groups have no fields for this scope.
        </Feedback>
      ) : (
        <div className="divide-y">
          {view.groups.map((group) => (
            <section key={group.id}>
              <Heading level="h3" className="px-6 py-3">
                {group.name}
              </Heading>
              <dl>
                {group.fields
                  .filter(
                    (field) =>
                      field.scope === (variantId ? "variant" : "product")
                  )
                  .map((field) => (
                    <div
                      key={field.key}
                      className="grid gap-1 px-6 py-3 sm:grid-cols-2"
                    >
                      <dt className="text-sm text-ui-fg-subtle">
                        {field.label}
                        {field.required && " *"}
                      </dt>
                      <dd className="break-words text-sm text-ui-fg-base">
                        {formatAttributeValue(field, values[field.key])}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      )}
      {view.validation.length > 0 && (
        <div className="flex flex-col gap-2 px-6 py-4">
          <Badge size="xsmall" color="orange" className="w-fit">
            Needs attention
          </Badge>
          <ul className="list-inside list-disc text-sm text-ui-fg-subtle">
            {view.validation.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      {!view.can_write && (
        <Text size="small" className="px-6 py-3 text-ui-fg-subtle">
          You have read-only access.
        </Text>
      )}
      {!variantId && view.can_write && (
        <fieldset disabled={pending} className="flex flex-col gap-3 px-6 py-4">
          <Button
            size="small"
            variant="transparent"
            className="w-fit"
            onClick={() => {
              setSelectedGroups(view.groups.map((group) => group.id))
              setSelecting(!selecting)
            }}
          >
            Manage specification groups
          </Button>
          {selecting && (
            <div className="flex flex-col gap-3">
              {view.templates.some((template) => template.recommended) && (
                <Text size="small" className="text-ui-fg-subtle">
                  Recommended groups match this product’s categories.
                </Text>
              )}
              <Combobox
                aria-label="Specification groups"
                options={[
                  ...view.templates,
                  ...view.groups.filter(
                    (group) =>
                      !view.templates.some((item) => item.id === group.id)
                  ),
                ].map((template) => ({
                  label: `${template.name} · v${template.version}${template.recommended ? " · Recommended" : ""}`,
                  value: template.id,
                }))}
                value={selectedGroups}
                onChange={(value) => setSelectedGroups(value as string[])}
                placeholder="Choose groups"
              />
              <Button
                size="small"
                className="w-fit"
                disabled={pending}
                isLoading={pending}
                onClick={() => {
                  void assignment()
                }}
              >
                Save groups
              </Button>
              {view.templates.length === 0 && (
                <Text size="small" className="text-ui-fg-subtle">
                  No active groups are available. Create one in Settings →
                  Specification groups.
                </Text>
              )}
            </div>
          )}
        </fieldset>
      )}
      {editing && (
        <ValuesEditor
          view={view}
          variantId={variantId}
          onClose={() => setEditing(false)}
          onSaved={saved}
        />
      )}
    </Container>
  )
}
