import { Combobox } from "@medusajs/dashboard/components"
import { useComboboxData } from "@medusajs/dashboard/hooks"
import {
  Button,
  Checkbox,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  Text,
  Textarea,
  usePrompt,
} from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import type {
  AttributeField,
  AttributeType,
  TemplateInput,
  TemplateRevision,
} from "../../types"
import { attributesApi, sdk } from "../lib/api"
import { restoreFocus } from "../lib/focus"
import { errorMessage } from "./feedback"

const types: { value: AttributeType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" },
  { value: "single_select", label: "Single choice" },
  { value: "multi_select", label: "Multiple choices" },
]

export const emptyField = (): AttributeField => ({
  key: "",
  label: "",
  type: "text",
  scope: "product",
  required: false,
  searchable: false,
  filterable: false,
  comparable: false,
})

export const templateDraft = (
  template?: TemplateRevision,
  duplicate = false
): TemplateInput => ({
  key: duplicate ? "" : template?.key || "",
  name: template ? `${template.name}${duplicate ? " copy" : ""}` : "",
  description: template?.description || "",
  category_ids: [...(template?.category_ids || [])],
  fields: template ? structuredClone(template.fields) : [emptyField()],
  ...(!duplicate && template ? { version: template.version } : {}),
})

export const TemplateEditor = ({
  template,
  duplicate = false,
  onClose,
  onSave,
}: {
  template?: TemplateRevision
  duplicate?: boolean
  onClose: () => void
  onSave: (draft: TemplateInput) => Promise<void>
}) => {
  const [draft, setDraft] = useState(() => templateDraft(template, duplicate))
  const [opener] = useState(() => document.activeElement)
  const nameInput = useRef<HTMLInputElement>(null)
  const reloadButton = useRef<HTMLButtonElement>(null)
  const [focusAfterPending, setFocusAfterPending] = useState<
    "name" | "reload"
  >()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [stale, setStale] = useState(false)
  const prompt = usePrompt()
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!pending && focusAfterPending) {
      restoreFocus(
        focusAfterPending === "name" ? nameInput.current : reloadButton.current,
        focusAfterPending !== "name"
      )
      setFocusAfterPending(undefined)
    }
  }, [pending, focusAfterPending])
  const categories = useComboboxData({
    queryKey: ["product-attributes", "categories"],
    queryFn: (params) => sdk.admin.productCategory.list(params),
    getOptions: (data) =>
      data.product_categories.map((category) => ({
        label: category.name,
        value: category.id,
      })),
    defaultValue: template?.category_ids.length
      ? template.category_ids
      : undefined,
  })
  const change = (next: Partial<TemplateInput>) => {
    setDraft((current) => ({ ...current, ...next }))
    setDirty(true)
  }
  const fieldChange = (index: number, next: Partial<AttributeField>) =>
    change({
      fields: draft.fields.map((field, position) =>
        position === index ? { ...field, ...next } : field
      ),
    })
  const close = async () => {
    if (pending) return
    const previouslyFocused = document.activeElement
    if (
      dirty &&
      !(await prompt({
        title: "Discard changes?",
        description: "Your unsaved template changes will be lost.",
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
      await onSave(draft)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure))
      setStale(
        !!template &&
          !duplicate &&
          (failure as { status?: number }).status === 409
      )
    } finally {
      setPending(false)
    }
  }
  const reload = async () => {
    const previouslyFocused = document.activeElement
    if (
      !(await prompt({
        title: "Reload template?",
        description:
          "This discards unsaved schema changes and loads the latest version.",
        confirmText: "Reload",
        cancelText: "Keep editing",
      }))
    ) {
      restoreFocus(previouslyFocused)
      return
    }
    setPending(true)
    try {
      const latest = await attributesApi.template(template!.id)
      setDraft(templateDraft(latest.template))
      setDirty(false)
      setStale(false)
      setError(undefined)
      setFocusAfterPending("name")
    } catch (failure) {
      setError(errorMessage(failure))
      setFocusAfterPending("reload")
    } finally {
      setPending(false)
    }
  }
  return (
    <FocusModal
      open
      onOpenChange={() => {
        void close()
      }}
    >
      <FocusModal.Content
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus(opener)
        }}
      >
        <FocusModal.Header>
          <FocusModal.Title>
            {template && !duplicate
              ? "Create template version"
              : "Create template"}
          </FocusModal.Title>
          <FocusModal.Description className="sr-only">
            Define reusable product and variant attributes.
          </FocusModal.Description>
        </FocusModal.Header>
        <form
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {error && (
            <div
              role="alert"
              className="mx-4 mt-4 flex shrink-0 flex-col gap-2 rounded-lg border border-ui-border-error bg-ui-bg-base p-3 text-sm text-ui-fg-error sm:mx-8"
            >
              <span>{error}</span>
              {stale && (
                <Button
                  size="small"
                  type="button"
                  variant="secondary"
                  className="w-fit"
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
          <FocusModal.Body className="overflow-y-auto">
            <fieldset
              disabled={pending}
              className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8"
            >
              <div>
                <Heading level="h1">
                  {template && !duplicate
                    ? `Version ${draft.version! + 1}`
                    : "Specification group"}
                </Heading>
                <Text size="small" className="mt-2 text-ui-fg-subtle">
                  Define the fields your products share. Existing assignments
                  keep their current version.
                </Text>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="template-name">Name</Label>
                  <Input
                    id="template-name"
                    ref={nameInput}
                    required
                    value={draft.name}
                    onChange={(event) => change({ name: event.target.value })}
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="template-key">Key</Label>
                  <Input
                    id="template-key"
                    required
                    disabled={!!template && !duplicate}
                    placeholder="network_switch"
                    pattern="[a-z][a-z0-9_]{0,63}"
                    maxLength={64}
                    value={draft.key}
                    onChange={(event) => change({ key: event.target.value })}
                  />
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Lowercase letters, numbers and underscores; start with a
                    letter.
                  </Text>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-description">
                  Description{" "}
                  <span className="text-ui-fg-muted">(optional)</span>
                </Label>
                <Textarea
                  id="template-description"
                  value={draft.description}
                  onChange={(event) =>
                    change({ description: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-categories">
                  Suggested categories
                </Label>
                <Combobox
                  id="template-categories"
                  aria-label="Suggested categories"
                  value={draft.category_ids}
                  options={categories.options}
                  searchValue={categories.searchValue}
                  onSearchValueChange={categories.onSearchValueChange}
                  fetchNextPage={categories.fetchNextPage}
                  isFetchingNextPage={categories.isFetchingNextPage}
                  onChange={(value) =>
                    change({ category_ids: value as string[] })
                  }
                  displayMode="chips"
                  placeholder="Choose categories"
                />
                {categories.isError && (
                  <Text size="small" className="text-ui-fg-error">
                    Categories could not be loaded. Your existing selection is
                    preserved.
                  </Text>
                )}
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Helps find suitable templates. Assignment remains explicit.
                </Text>
              </div>
              <div className="flex items-center justify-between">
                <Heading level="h2">Fields</Heading>
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  onClick={() =>
                    change({ fields: [...draft.fields, emptyField()] })
                  }
                >
                  Add field
                </Button>
              </div>
              {draft.fields.length === 0 && (
                <Text className="text-ui-fg-subtle">
                  Add a field to define this template.
                </Text>
              )}
              {draft.fields.map((field, index) => (
                <fieldset
                  key={index}
                  className="flex flex-col gap-4 rounded-lg border border-ui-border-base bg-ui-bg-base p-4"
                >
                  <legend className="px-1 text-sm font-medium">
                    Field {index + 1}
                    {field.label && ` · ${field.label}`}
                  </legend>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="small"
                      variant="transparent"
                      type="button"
                      disabled={index === 0}
                      aria-label={`Move field ${index + 1} up`}
                      onClick={() => {
                        const fields = [...draft.fields]
                        ;[fields[index - 1], fields[index]] = [
                          fields[index],
                          fields[index - 1],
                        ]
                        change({ fields })
                      }}
                    >
                      Move up
                    </Button>
                    <Button
                      size="small"
                      variant="transparent"
                      type="button"
                      aria-label={`Remove field ${index + 1}`}
                      onClick={() =>
                        change({
                          fields: draft.fields.filter(
                            (_, position) => position !== index
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`field-${index}-label`}>Label</Label>
                      <Input
                        id={`field-${index}-label`}
                        required
                        value={field.label}
                        onChange={(event) =>
                          fieldChange(index, { label: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`field-${index}-key`}>Field key</Label>
                      <Input
                        id={`field-${index}-key`}
                        required
                        value={field.key}
                        placeholder="port_count"
                        pattern="[a-z][a-z0-9_]{0,63}"
                        maxLength={64}
                        onChange={(event) =>
                          fieldChange(index, { key: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`field-${index}-type`}>Type</Label>
                      <Select
                        value={field.type}
                        onValueChange={(value) =>
                          fieldChange(index, {
                            type: value as AttributeType,
                            options: undefined,
                            unit: undefined,
                            min: undefined,
                            max: undefined,
                          })
                        }
                      >
                        <Select.Trigger id={`field-${index}-type`}>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          {types.map((type) => (
                            <Select.Item key={type.value} value={type.value}>
                              {type.label}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`field-${index}-scope`}>Applies to</Label>
                      <Select
                        value={field.scope}
                        onValueChange={(value) =>
                          fieldChange(index, {
                            scope: value as "product" | "variant",
                          })
                        }
                      >
                        <Select.Trigger id={`field-${index}-scope`}>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="product">Product</Select.Item>
                          <Select.Item value="variant">Variant</Select.Item>
                        </Select.Content>
                      </Select>
                    </div>
                  </div>
                  {field.type === "number" && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`field-${index}-unit`}>Unit</Label>
                        <Input
                          id={`field-${index}-unit`}
                          value={field.unit || ""}
                          placeholder="Gbps"
                          onChange={(event) =>
                            fieldChange(index, {
                              unit: event.target.value || undefined,
                            })
                          }
                        />
                      </div>
                      {(["min", "max"] as const).map((bound) => (
                        <div key={bound} className="flex flex-col gap-2">
                          <Label htmlFor={`field-${index}-${bound}`}>
                            {bound === "min" ? "Minimum" : "Maximum"}
                          </Label>
                          <Input
                            id={`field-${index}-${bound}`}
                            type="number"
                            step="any"
                            value={field[bound] ?? ""}
                            onChange={(event) =>
                              fieldChange(index, {
                                [bound]:
                                  event.target.value === ""
                                    ? undefined
                                    : Number(event.target.value),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {(field.type === "single_select" ||
                    field.type === "multi_select") && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <Text size="small" weight="plus">
                          Choices
                        </Text>
                        <Button
                          size="small"
                          variant="secondary"
                          type="button"
                          onClick={() =>
                            fieldChange(index, {
                              options: [
                                ...(field.options || []),
                                { value: "", label: "" },
                              ],
                            })
                          }
                        >
                          Add choice
                        </Button>
                      </div>
                      {(field.options || []).map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                        >
                          <Input
                            aria-label={`Field ${index + 1} choice ${optionIndex + 1} label`}
                            placeholder="Choice label"
                            required
                            value={option.label}
                            onChange={(event) =>
                              fieldChange(index, {
                                options: field.options!.map(
                                  (choice, position) =>
                                    position === optionIndex
                                      ? { ...choice, label: event.target.value }
                                      : choice
                                ),
                              })
                            }
                          />
                          <Input
                            aria-label={`Field ${index + 1} choice ${optionIndex + 1} value`}
                            placeholder="Stable value"
                            required
                            value={option.value}
                            onChange={(event) =>
                              fieldChange(index, {
                                options: field.options!.map(
                                  (choice, position) =>
                                    position === optionIndex
                                      ? { ...choice, value: event.target.value }
                                      : choice
                                ),
                              })
                            }
                          />
                          <Button
                            size="small"
                            variant="transparent"
                            type="button"
                            aria-label={`Remove field ${index + 1} choice ${optionIndex + 1}`}
                            onClick={() =>
                              fieldChange(index, {
                                options: field.options!.filter(
                                  (_, position) => position !== optionIndex
                                ),
                              })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4">
                    {(
                      [
                        "required",
                        "searchable",
                        "filterable",
                        "comparable",
                      ] as const
                    ).map((flag) => (
                      <label
                        key={flag}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={field[flag]}
                          onCheckedChange={(checked) =>
                            fieldChange(index, { [flag]: checked === true })
                          }
                        />
                        {
                          {
                            required: "Required",
                            searchable: "Searchable",
                            filterable: "Filterable",
                            comparable: "Comparable",
                          }[flag]
                        }
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </fieldset>
          </FocusModal.Body>
          <FocusModal.Footer>
            <div className="flex w-full justify-end gap-2">
              <Button
                size="small"
                variant="secondary"
                type="button"
                onClick={() => {
                  void close()
                }}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="small"
                type="submit"
                isLoading={pending}
                disabled={draft.fields.length === 0 || stale}
              >
                {template && !duplicate ? "Create version" : "Create template"}
              </Button>
            </div>
          </FocusModal.Footer>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
