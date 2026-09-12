import { cn } from "@/lib/utils"
export function CompanionPortrait({ className, name = "Conker" }: { className?: string; name?: string }) {
  return <div role="img" aria-label={`${name} static portrait`} className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary", className)}>
    <svg viewBox="0 0 100 100" className="size-4/5" aria-hidden="true">
      <path d="M50 28c-1-13 9-19 19-16-1 11-8 16-19 16Z" fill="currentColor" opacity=".45" />
      <path d="M49 28c0-10-8-14-16-11 1 9 7 13 16 11Z" fill="currentColor" opacity=".25" />
      <path d="M21 49c0-25 58-25 58 0v19c0 22-58 22-58 0Z" fill="currentColor" opacity=".09" stroke="currentColor" strokeWidth="1.5" />
      <path d="M37 54v7m26-7v7m-19 9q6 5 12 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  </div>
}

