import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { RichAnswer } from "@/components/rich-answer"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ArtifactContent } from "@/lib/api/artifact-types"
import type { ConversationCitation } from "@/lib/api/conversation-types"
import { artifactChartModel, fencedArtifactCode } from "./content"
import { ArtifactDiagramPreview } from "./diagram-preview"
import { ArtifactMediaPreview } from "./media-preview"

function ArtifactTable({ columns, rows, caption }: { columns: string[]; rows: string[][]; caption: string }) {
  return <Table tabIndex={0} aria-label={caption}><TableCaption>{caption} · {rows.length} rows</TableCaption><TableHeader><TableRow>{columns.map((column, index) => <TableHead key={index} className="min-w-28 whitespace-normal break-words">{column || `Column ${index + 1}`}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={index}>{row.map((cell, column) => <TableCell key={column} className="max-w-96 whitespace-pre-wrap break-words">{cell}</TableCell>)}</TableRow>)}</TableBody></Table>
}

function ArtifactChart({ content }: { content: Extract<ArtifactContent, { kind: "chart" }> }) {
  const model = artifactChartModel(content)
  if (!model.rows.length) return <p className="text-sm text-muted-foreground">No chart data yet. Add labelled rows and numeric values in Source.</p>
  const common = <><CartesianGrid vertical={false} /><XAxis dataKey="category" tickLine={false} axisLine={false} tickFormatter={value => String(value).slice(0, 32)} /><YAxis tickLine={false} axisLine={false} width={64} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} /></>
  const chart = content.chartType === "bar" ? <BarChart accessibilityLayer data={model.rows}>{common}{model.series.map(series => <Bar key={series.key} dataKey={series.key} fill={`var(--color-${series.key})`} isAnimationActive={false} />)}</BarChart>
    : content.chartType === "line" ? <LineChart accessibilityLayer data={model.rows}>{common}{model.series.map((series, index) => <Line key={series.key} dataKey={series.key} type="linear" stroke={`var(--color-${series.key})`} strokeDasharray={index >= 5 ? "5 3" : undefined} dot={false} isAnimationActive={false} />)}</LineChart>
    : <AreaChart accessibilityLayer data={model.rows}>{common}{model.series.map((series, index) => <Area key={series.key} dataKey={series.key} type="linear" fill={`var(--color-${series.key})`} stroke={`var(--color-${series.key})`} fillOpacity={0.15} strokeDasharray={index >= 5 ? "5 3" : undefined} isAnimationActive={false} />)}</AreaChart>
  return <div className="space-y-5"><ChartContainer config={model.config} className="h-80 w-full" aria-label={`${content.chartType} chart${content.xLabel ? ` by ${content.xLabel}` : ""}`}>{chart}</ChartContainer>{content.xLabel && <p className="text-center text-xs text-muted-foreground">{content.xLabel}</p>}<details><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">View chart data</summary><div className="mt-4"><ArtifactTable columns={[content.xLabel || "Label", ...content.series.map(series => series.label)]} rows={content.rows.map(row => [row.label, ...row.values.map(String)])} caption="Chart values" /></div></details></div>
}

/** Trusted native components render validated content; no user HTML, CSS, or expressions. */
export function ArtifactPreview({ content, citations }: { content: ArtifactContent; citations?: ConversationCitation[] }) {
  if (content.kind === "diagram") return <ArtifactDiagramPreview key={JSON.stringify(content)} content={content} />
  if (content.kind === "media") return <ArtifactMediaPreview content={content} />
  if (content.kind === "markdown") return content.text ? <RichAnswer text={content.text} citations={citations} /> : <p className="text-sm text-muted-foreground">This document is empty. Add text in Source.</p>
  if (content.kind === "code") return content.text ? <RichAnswer text={fencedArtifactCode(content.text, content.language)} /> : <p className="text-sm text-muted-foreground">This code artifact is empty. Add code in Source; it will remain inert text.</p>
  if (content.kind === "table") return <ArtifactTable columns={content.columns} rows={content.rows} caption="Artifact table" />
  return <ArtifactChart content={content} />
}
