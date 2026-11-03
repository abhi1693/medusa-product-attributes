import { Combobox } from "@medusajs/dashboard/components"
import { Button, Input, Label, Select } from "@medusajs/ui"
import type { AttributeField, AttributeValue } from "../../types"

export const formatAttributeValue = (
  field: AttributeField,
  value: AttributeValue | undefined
): string => {
  if (value === null || value === undefined || value === "") return "Not set"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  const label = (item: string) =>
    field.options?.find((option) => option.value === item)?.label || item
  if (Array.isArray(value)) return value.map(label).join(", ") || "Not set"
  const rendered = typeof value === "string" ? label(value) : String(value)
  return field.unit ? `${rendered} ${field.unit}` : rendered
}

export const AttributeInput = ({
  field,
  value,
  onChange,
}: {
  field: AttributeField
  value: AttributeValue | undefined
  onChange: (value: AttributeValue) => void
}) => {
  const id = `attribute-${field.scope}-${field.key}`
  const common = { id, "aria-label": field.label }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-ui-fg-error"> *</span>}
      </Label>
      {field.help && <p className="text-sm text-ui-fg-subtle">{field.help}</p>}
      {field.type === "boolean" ? (
        <Select
          value={
            value === null || value === undefined ? "unset" : String(value)
          }
          onValueChange={(next) =>
            onChange(next === "unset" ? null : next === "true")
          }
        >
          <Select.Trigger {...common}>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="unset">Not set</Select.Item>
            <Select.Item value="true">Yes</Select.Item>
            <Select.Item value="false">No</Select.Item>
          </Select.Content>
        </Select>
      ) : field.type === "single_select" || field.type === "multi_select" ? (
        <>
          <Combobox
            {...common}
            options={field.options || []}
            value={
              field.type === "multi_select"
                ? Array.isArray(value)
                  ? value
                  : []
                : value === null || value === undefined
                  ? undefined
                  : (value as string | string[])
            }
            onChange={(next) => onChange(next ?? null)}
            placeholder="Select a value"
            displayMode="chips"
          />
          <Button
            type="button"
            size="small"
            variant="transparent"
            className="w-fit"
            aria-label={`Clear ${field.label}`}
            onClick={() => onChange(null)}
          >
            Clear selection
          </Button>
        </>
      ) : (
        <div className="relative">
          <Input
            {...common}
            type={field.type === "number" ? "number" : "text"}
            step="any"
            min={field.min}
            max={field.max}
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(event) =>
              onChange(
                event.target.value === ""
                  ? null
                  : field.type === "number"
                    ? Number(event.target.value)
                    : event.target.value
              )
            }
            className={field.unit ? "pr-16" : undefined}
          />
          {field.unit && (
            <span className="pointer-events-none absolute right-3 top-2 text-sm text-ui-fg-muted">
              {field.unit}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
