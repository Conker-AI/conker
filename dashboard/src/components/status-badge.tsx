import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function StatusBadge({ children, tone = "neutral" }: {
  children: React.ReactNode
  tone?: "neutral" | "live" | "warning"
}) {
  return <Badge variant="outline" className={cn("gap-1.5 font-normal", {
    "border-primary/25 bg-primary/10 text-primary": tone === "live",
    "border-warning/30 bg-warning/10 text-warning": tone === "warning",
  })}>
    <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone === "live" ? "bg-primary" : tone === "warning" ? "bg-warning" : "bg-muted-foreground")} />
    {children}
  </Badge>
}
