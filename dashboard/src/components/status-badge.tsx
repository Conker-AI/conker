import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "neutral" | "live" | "warning"
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-normal", {
        "border-success-border bg-success-subtle text-success": tone === "live",
        "border-warning-border bg-warning-subtle text-warning": tone === "warning",
      })}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          tone === "live"
            ? "bg-success"
            : tone === "warning"
              ? "bg-warning"
              : "bg-muted-foreground"
        )}
      />
      {children}
    </Badge>
  )
}
