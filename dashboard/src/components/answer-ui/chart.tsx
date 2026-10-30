import "./no-devtools"
import { defineComponent } from "@openuidev/react-lang"
import { z } from "zod"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

/** The theme's five chart colors; more series than this would repeat a color and mislead. */
const COLORS = 5
const color = (index: number) => `var(--chart-${(index % COLORS) + 1})`

export const SeriesPart = defineComponent({
  name: "Series",
  description: "One named row of numbers, one per label.",
  props: z.object({ name: z.string(), values: z.array(z.number()) }),
  component: () => null,
})

type SeriesProps = { name: string; values: number[] }

export const ChartPart = defineComponent({
  name: "Chart",
  description: "A bar, line or pie chart. Up to 5 series and 50 labels; pie takes one series and up to 5 labels.",
  props: z.object({
    type: z.enum(["bar", "line", "pie"]),
    labels: z.array(z.string()),
    series: z.array(SeriesPart.ref),
    title: z.string().optional(),
  }),
  component: function GeneratedChart({ props }) {
    // Parts can arrive half-written while the answer streams; missing values draw as gaps.
    const labels = (props.labels ?? []).map(String)
    const series = (props.series ?? []).slice(0, COLORS).map(item => item?.props as Partial<SeriesProps> | undefined).map(item => ({ name: String(item?.name ?? ""), values: Array.isArray(item?.values) ? item.values : [] }))
    const keys = series.map((_, index) => `s${index}`)
    const config: ChartConfig = Object.fromEntries(series.map((item, index) => [keys[index], { label: item.name, color: color(index) }]))
    const rows = labels.map((label, row) => ({ label, ...Object.fromEntries(series.map((item, index) => [keys[index], item.values[row] ?? null])) }))
    // A pie of many slices or several series cannot be read; the same numbers show as bars instead.
    const type = props.type === "pie" && (series.length !== 1 || rows.length > COLORS) ? "bar" : props.type
    const name = props.title || `${type} chart`
    const axes = <><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={value => String(value).slice(0, 16)} /><YAxis tickLine={false} axisLine={false} width={48} /><ChartTooltip content={<ChartTooltipContent />} />{series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}</>
    const chart = type === "pie"
      ? <PieChart accessibilityLayer><ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} /><Pie data={rows} dataKey={keys[0]} nameKey="label" innerRadius="45%" isAnimationActive={false}>{rows.map((row, index) => <Cell key={row.label} fill={color(index)} />)}</Pie></PieChart>
      : type === "line"
        ? <LineChart accessibilityLayer data={rows}>{axes}{keys.map(key => <Line key={key} dataKey={key} type="linear" stroke={`var(--color-${key})`} strokeWidth={2} dot={rows.length <= 12} isAnimationActive={false} />)}</LineChart>
        : <BarChart accessibilityLayer data={rows}>{axes}{keys.map(key => <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={3} isAnimationActive={false} />)}</BarChart>
    return <figure className="answer-block m-0 p-3" aria-label={name}>
      {props.title && <figcaption className="mb-2 text-sm font-medium">{props.title}</figcaption>}
      <ChartContainer config={config} className="aspect-auto h-60 w-full sm:h-72">{chart}</ChartContainer>
      {type === "pie" && <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>{rows.map((row, index) => <li key={row.label} className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-xs" style={{ background: color(index) }} />{row.label}</li>)}</ul>}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer rounded-sm text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Chart data</summary>
        <div className="answer-table-scroll mt-2" tabIndex={0} aria-label="Chart data"><table>
          <thead><tr><th scope="col">Label</th>{series.map((item, index) => <th key={index} scope="col">{item.name}</th>)}</tr></thead>
          <tbody>{labels.map((label, row) => <tr key={row}><th scope="row" className="font-normal">{label}</th>{series.map((item, index) => <td key={index} className="tabular-nums">{item.values[row] ?? "–"}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
    </figure>
  },
})
