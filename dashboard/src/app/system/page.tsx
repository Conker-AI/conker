import { Link } from "react-router-dom"
import { TriangleAlert, Server, Database, Cpu, HardDrive } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { vitals, services } from "./data"
import { columns } from "./columns"

const icons = [Database, Cpu, HardDrive]
export default function SystemPage() {
  return <BaseLayout title="System" description="A clear picture of the machine. Configuration is not a health check.">
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <Alert variant="warning"><TriangleAlert /><AlertTitle>Degraded · meaning search is paused</AlertTitle><AlertDescription>MemoryGate cannot reach the vector index. Source records remain available. These are fixture health samples, not a connection to your host. <Link className="underline underline-offset-4" to="/memory">Browse source memories</Link></AlertDescription></Alert>
      <section className="flex flex-col gap-3" aria-labelledby="box-heading">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="box-heading" className="flex items-center gap-2 font-medium"><Server className="size-4 text-muted-foreground" />The box</h2><StatusBadge>Stale · 7 min old</StatusBadge></div>
        <div className="grid gap-3 md:grid-cols-3">{vitals.map((vital, index) => { const Icon = icons[index]; return <Card key={vital.name} className="gap-4 py-4 shadow-none"><CardHeader className="px-4"><CardTitle className="flex items-center justify-between text-sm">{vital.name}<Icon className="size-4 text-muted-foreground" /></CardTitle></CardHeader><CardContent className="flex flex-col gap-3 px-4"><p className="text-2xl font-semibold tabular-nums">{vital.value} <span className="text-sm font-normal text-muted-foreground">{vital.unit}</span></p><Progress value={vital.used} aria-label={`${vital.name} usage at last sample`} /><p className="text-xs text-muted-foreground">{vital.detail}</p></CardContent></Card> })}</div>
        <p className="text-xs text-muted-foreground">Stale host sample · SystemGate · 12 Sep 2026, 16:36. Current host load is unknown.</p>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="services-heading"><h2 id="services-heading" className="font-medium">Services</h2><DataTable columns={columns} data={services} paginate={false} /></section>
      <Card className="gap-3 py-4 shadow-none"><CardHeader className="px-4"><CardTitle className="text-sm">Recovery snapshot</CardTitle><CardDescription>Today, 03:00 · 4.2 GB · manifest checked</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4 px-4"><p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Postgres, Pi database, ToolGate vault and recovery material are included. This snapshot’s restore drill has not run. A snapshot existing does not prove recoverability.</p><Button variant="outline" size="sm" asChild><Link to="/jobs">View jobs</Link></Button></CardContent></Card>
    </div>
  </BaseLayout>
}

