import { useConker } from "@/lib/api/store"
import { Terminal, Shield, FolderGit2 } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"

export default function TerminalPage() {
  const terminal = useConker(data => data.terminal)
  return (
    <BaseLayout
      title="Terminal"
      description="Your server, when you need to work directly."
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="terminal-surface gap-0 overflow-hidden py-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 py-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
              <Terminal className="size-4 text-muted-foreground" />
              <span className="break-all">{terminal.prompt}</span>
            </CardTitle>
            <StatusBadge>Offline</StatusBadge>
          </CardHeader>
          <CardContent className="mx-2 mb-2 min-h-64 rounded-lg border bg-surface-inset p-4 font-mono text-xs leading-7 break-words sm:text-sm">
            <p className="text-muted-foreground">Conker · owner shell</p>
            <p className="text-muted-foreground">
              No authenticated terminal session.
            </p>
            <p className="mt-5">Connection: offline</p>
            <p className="text-muted-foreground">
              Waiting for a separate shell transport.
            </p>
            <p className="mt-5 text-muted-foreground" aria-hidden="true">
              {terminal.prompt}:~${" "}
              <span className="terminal-cursor inline-block h-4 w-2 translate-y-0.5 bg-foreground" />
            </p>
          </CardContent>
        </Card>
        <Alert className="bg-surface-chrome">
          <Shield />
          <AlertTitle>A separate owner-authenticated shell</AlertTitle>
          <AlertDescription>
            SystemGate stays read-only. This terminal preview has no shell
            connection and accepts no commands.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-2">
              <FolderGit2 className="size-4" />
              Project context
            </CardTitle>
            <CardDescription>
              Fixture snapshot · not a live repository inspection
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              {terminal.context.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words font-mono text-sm leading-6">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Context only. No commit/push/merge.
            </p>
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  )
}
