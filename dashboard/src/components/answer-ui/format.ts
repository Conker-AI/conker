/** Plain text made from generated parts: what a table copies as and what a form sends. */

/** A Markdown table for copying, with pipes escaped so a cell cannot add a column. */
export function markdownTable(columns: string[], rows: string[][]): string {
  const cell = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/\r?\n/g, " ")
  return [columns, columns.map(() => "---"), ...rows].map(row => `| ${row.map(cell).join(" | ")} |`).join("\n")
}

export type FieldElement = { typeName?: string; props?: { label?: unknown; min?: unknown; value?: unknown } }

/** A slider starts with a value; every other field starts empty. */
export function startValue(field: FieldElement): string {
  if (field.typeName !== "SliderField") return ""
  const start = typeof field.props?.value === "number" ? field.props.value : field.props?.min
  return typeof start === "number" && Number.isFinite(start) ? String(start) : ""
}

/** The one message a form sends: its title, then each answered field on its own line. */
export function formMessage(title: string, fields: FieldElement[], values: string[]): string {
  const lines = fields.flatMap((field, index) => values[index]?.trim() ? [`- ${String(field.props?.label ?? `Field ${index + 1}`)}: ${values[index].trim()}`] : [])
  return lines.length ? [title.trim(), ...lines].filter(Boolean).join("\n") : ""
}
