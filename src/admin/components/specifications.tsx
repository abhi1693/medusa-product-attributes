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
import { useState } from "react"
import type { AttributeValues, ProductAttributes } from "../../types"
import { attributesApi, attributesKeys } from "../lib/api"
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
  const [values, setValues] = useState<AttributeValues>(() => ({
    ...(variant ? variant.values : view.values),
  }))
  const [pending, setPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string>()
  const [stale, setStale] = useState(false)
  const prompt = usePrompt()
  const fields = view.template!.fields.filter(
    (field) => field.scope === (variantId ? "variant" : "product")
  )
  const close = async () => {
    if (pending) return
    if (
      dirty &&
      !(await prompt({
        title: "Discard changes?",
        description: "Your unsaved specification values will be lost.",
        confirmText: "Discard",
        cancelText: "Keep editing",
      }))
    )
      return
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
    const confirmed = await prompt({
      title: "Reload specifications?",
      description:
        "This discards the unsaved values and loads the latest product.",
      confirmText: "Reload",
      cancelText: "Keep editing",
    })
    if (!confirmed) return
    setPending(true)
    try {
      onSaved(await attributesApi.product(view.product_id))
      onClose()
    } catch (failure) {
      setError(errorMessage(failure))
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
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>
            {variantId ? "Edit variant specifications" : "Edit specifications"}
          </Drawer.Title>
          <Drawer.Description>
            {view.template!.name} · Version {view.template!.version}
          </Drawer.Description>
        </Drawer.Header>
        <form
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <Drawer.Body className="flex flex-1 flex-col gap-5 overflow-y-auto">
            {error && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-lg border border-ui-border-error p-3 text-sm text-ui-fg-error"
              >
                <span>{error}</span>
                {stale && (
                  <Button
                    size="small"
                    variant="secondary"
                    type="button"
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
            {fields.length === 0 && (
              <Text className="text-ui-fg-subtle">
                This template has no {variantId ? "variant" : "product"} fields.
              </Text>
            )}
            <fieldset
              disabled={pending || !view.can_write}
              className="flex flex-col gap-5"
            >
              {fields.map((field) => (
                <AttributeInput
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, [field.key]: value }))
                    setDirty(true)
                  }}
                />
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
  const [templateId, setTemplateId] = useState<string>()
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
  const fields =
    view.template?.fields.filter(
      (field) => field.scope === (variantId ? "variant" : "product")
    ) || []
  const values = variant ? variant.values : view.values
  const latest = view.templates.find(
    (template) => template.id === view.template?.id
  )
  const assignment = async (id: string, version: number) => {
    if (
      view.template &&
      !(await prompt({
        title: "Update specification template?",
        description:
          "The selected version will be applied explicitly. Existing values are revalidated against its fields.",
        confirmText: "Update template",
        cancelText: "Cancel",
      }))
    )
      return
    setPending(true)
    setError(undefined)
    try {
      saved(
        await attributesApi.assignTemplate(productId, {
          version: view.version,
          template_id: id,
          template_version: version,
        })
      )
      setSelecting(false)
      toast.success("Specification template updated")
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
          {view.template && (
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              {view.template.name} · Version {view.template.version}
            </Text>
          )}
        </div>
        {view.template && (
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
      {!view.template ? (
        <Feedback title="No specification template">
          {variantId
            ? "Assign a specification template on the product to define variant fields."
            : "Choose a template to add structured specifications to this product."}
        </Feedback>
      ) : fields.length === 0 ? (
        <Feedback title={`No ${variantId ? "variant" : "product"} fields`}>
          This template defines fields for the other scope.
        </Feedback>
      ) : (
        <dl className="divide-y">
          {fields.map((field) => (
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
          {latest &&
            view.template &&
            latest.version > view.template.version && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text size="small">Version {latest.version} is available.</Text>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={pending}
                  isLoading={pending}
                  onClick={() => {
                    void assignment(latest.id, latest.version)
                  }}
                >
                  Adopt latest version
                </Button>
              </div>
            )}
          <Button
            size="small"
            variant="transparent"
            className="w-fit"
            onClick={() => setSelecting(!selecting)}
          >
            {view.template ? "Change template" : "Assign template"}
          </Button>
          {selecting && (
            <div className="flex flex-col gap-3">
              <Combobox
                aria-label="Specification template"
                options={view.templates.map((template) => ({
                  label: `${template.name} · v${template.version}`,
                  value: template.id,
                }))}
                value={templateId}
                onChange={(value) => setTemplateId(value as string | undefined)}
                placeholder="Select a template"
              />
              <Button
                size="small"
                className="w-fit"
                disabled={!templateId || pending}
                isLoading={pending}
                onClick={() => {
                  const template = view.templates.find(
                    (item) => item.id === templateId
                  )!
                  void assignment(template.id, template.version)
                }}
              >
                Apply template
              </Button>
              {view.templates.length === 0 && (
                <Text size="small" className="text-ui-fg-subtle">
                  No active templates are available. Create one in Settings →
                  Product attributes.
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
