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
  return (
    <BaseLayout
      title="Terminal"
      description="Your server, when you need to work directly."
    >
      <div className="flex flex-col gap-4 ">
        <Alert>
          <Shield />
          <AlertTitle>A separate owner-authenticated shell</AlertTitle>
          <AlertDescription>
            SystemGate stays read-only. This terminal preview has no shell
            connection and accepts no commands.
          </AlertDescription>
        </Alert>
        <Card className="terminal-surface gap-0 overflow-hidden bg-background text-foreground py-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Terminal className="size-4" />
              alexey@conker
            </CardTitle>
            <StatusBadge>Offline</StatusBadge>
          </CardHeader>
          <CardContent className="min-h-64 p-5 font-mono text-xs leading-7 sm:text-sm">
            <p className="text-muted-foreground">Conker · owner shell</p>
            <p className="text-muted-foreground">
              No authenticated terminal session.
            </p>
            <p className="mt-5">Connection: offline</p>
            <p className="text-muted-foreground">
              Waiting for a separate shell transport.
            </p>
            <p className="mt-5 text-muted-foreground" aria-hidden="true">
              alexey@conker:~${" "}
              <span className="terminal-cursor inline-block h-4 w-2 translate-y-0.5 bg-foreground" />
            </p>
          </CardContent>
        </Card>
        <Card className="gap-4 py-4 shadow-none">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FolderGit2 className="size-4" />
              Project context
            </CardTitle>
            <CardDescription>
              Fixture snapshot · not a live repository inspection
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Repository", "companion"],
                ["Branch", "feat/dashboard"],
                ["Working tree", "Unknown · no filesystem probe"],
                ["Last commit", "Dashboard shell scaffold · fixture"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-mono text-sm">{value}</dd>
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
