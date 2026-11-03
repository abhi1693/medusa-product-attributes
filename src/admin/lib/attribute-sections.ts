import type { AttributeField } from "../../types"

/** Presentation only. Field keys and stored values remain flat and stable. */
export function attributeSections(fields: AttributeField[]) {
  const sections = new Map<string | undefined, AttributeField[]>()
  for (const field of fields) {
    if (!sections.has(field.subsection)) sections.set(field.subsection, [])
    sections.get(field.subsection)!.push(field)
  }
  return [...sections].map(([name, fields]) => ({ name, fields }))
}
