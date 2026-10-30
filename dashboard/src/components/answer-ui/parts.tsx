import "./no-devtools"
import { defineComponent } from "@openuidev/react-lang"
import { z } from "zod"
import { CircleCheck, Circle, CircleDot, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress as ProgressBar } from "@/components/ui/progress"
import { markdownTable } from "./format"
import { AnswerTable } from "./table"

const anyParts = z.array(z.any())

export const StackPart = defineComponent({
  name: "Stack",
  description: "The block's root: its parts top to bottom.",
  props: z.object({ children: anyParts }),
  component: ({ props, renderNode }) => <div className="flex min-w-0 flex-col gap-3">{renderNode(props.children)}</div>,
})

export const CardPart = defineComponent({
  name: "Card",
  description: "A titled box grouping parts.",
  props: z.object({ title: z.string(), children: anyParts }),
  component: ({ props, renderNode }) => <section className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground" aria-label={props.title}>
    <h3 className="text-base font-semibold leading-6">{props.title}</h3>
    {renderNode(props.children)}
  </section>,
})

export const TextPart = defineComponent({
  name: "Text",
  description: "A short plain paragraph inside a Card.",
  props: z.object({ text: z.string() }),
  component: ({ props }) => <p dir="auto" className="whitespace-pre-line text-[15px] leading-6">{props.text}</p>,
})

export const StatPart = defineComponent({
  name: "Stat",
  description: "One number with its unit, e.g. Stat(\"Spent\", \"$1,240\", \"of $1,500\").",
  props: z.object({ label: z.string(), value: z.string(), detail: z.string().optional() }),
  component: ({ props }) => <div className="min-w-0 rounded-lg border bg-card p-3 text-card-foreground">
    <p className="text-xs leading-5 text-muted-foreground">{props.label}</p>
    <p className="text-xl font-semibold leading-7 tabular-nums [overflow-wrap:anywhere]">{props.value}</p>
    {props.detail && <p className="text-xs leading-5 text-muted-foreground">{props.detail}</p>}
  </div>,
})

export const StatsPart = defineComponent({
  name: "Stats",
  description: "Up to 6 Stat tiles in a grid.",
  props: z.object({ items: z.array(StatPart.ref) }),
  component: ({ props, renderNode }) => <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{renderNode(props.items)}</div>,
})

const cellText = (value: unknown) => value === null || value === undefined ? "" : String(value)

export const TablePart = defineComponent({
  name: "Table",
  description: "Rows of values under column names; up to 100 rows.",
  props: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))) }),
  component: function GeneratedTable({ props }) {
    const columns = (props.columns ?? []).map(cellText)
    const rows = (props.rows ?? []).map(row => columns.map((_, index) => cellText(Array.isArray(row) ? row[index] : undefined)))
    return <AnswerTable rows={[columns, ...rows]} markdown={markdownTable(columns, rows)}>
      <thead><tr>{columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
    </AnswerTable>
  },
})

const stepLook: Record<string, { icon: LucideIcon; label: string; className: string }> = {
  done: { icon: CircleCheck, label: "Done", className: "text-muted-foreground" },
  current: { icon: CircleDot, label: "Now", className: "text-foreground" },
  todo: { icon: Circle, label: "Next", className: "text-muted-foreground" },
}

export const StepPart = defineComponent({
  name: "Step",
  description: "One step of a plan.",
  props: z.object({ title: z.string(), state: z.enum(["done", "current", "todo"]).optional(), detail: z.string().optional() }),
  component: ({ props }) => {
    const look = stepLook[props.state ?? "todo"] ?? stepLook.todo
    const Icon = look.icon
    return <li className="flex min-w-0 gap-3 py-2">
      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${look.className}`} />
      <div className="min-w-0">
        <p className={`text-[15px] leading-6 ${props.state === "current" ? "font-semibold" : ""}`}><span className="sr-only">{look.label}: </span>{props.title}{props.state === "current" && <span aria-hidden className="ml-2 text-xs font-medium text-muted-foreground">Now</span>}</p>
        {props.detail && <p className="text-sm leading-5 text-muted-foreground">{props.detail}</p>}
      </div>
    </li>
  },
})

export const StepsPart = defineComponent({
  name: "Steps",
  description: "An ordered plan; mark the step underway as current.",
  props: z.object({ items: z.array(StepPart.ref) }),
  component: ({ props, renderNode }) => <ol className="flex flex-col divide-y" aria-label="Steps">{renderNode(props.items)}</ol>,
})

export const ProgressPart = defineComponent({
  name: "Progress",
  description: "How far along something is, e.g. Progress(\"Saved\", 1240, 1500).",
  props: z.object({ label: z.string(), value: z.number(), max: z.number().optional() }),
  component: ({ props }) => {
    const max = props.max && props.max > 0 ? props.max : 100
    const value = Math.min(Math.max(props.value, 0), max)
    const shown = props.max ? `${props.value.toLocaleString()} of ${max.toLocaleString()}` : `${Math.round(value)}%`
    return <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0">{props.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{shown}</span></div>
      <ProgressBar value={value} max={max} aria-label={`${props.label}: ${shown}`} />
    </div>
  },
})

const tones: Record<string, { variant: "info" | "success" | "warning" | "error"; icon: LucideIcon }> = {
  info: { variant: "info", icon: Info },
  success: { variant: "success", icon: CircleCheck },
  warning: { variant: "warning", icon: TriangleAlert },
  danger: { variant: "error", icon: OctagonAlert },
}

export const CalloutPart = defineComponent({
  name: "Callout",
  description: "A note to notice; warning and danger only for real risks.",
  props: z.object({ text: z.string(), tone: z.enum(["info", "success", "warning", "danger"]).optional(), title: z.string().optional() }),
  component: ({ props }) => {
    const tone = tones[props.tone ?? "info"] ?? tones.info
    const Icon = tone.icon
    return <Alert variant={tone.variant} role="note">
      <Icon aria-hidden />
      {props.title && <AlertTitle>{props.title}</AlertTitle>}
      <AlertDescription className="text-[15px] leading-6 text-foreground">{props.text}</AlertDescription>
    </Alert>
  },
})
