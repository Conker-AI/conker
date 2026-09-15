import { ArrowUpRight, Newspaper } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import type { DailyBriefing } from "@/lib/api/client"

export function DailyNews({ news, compact = false }: { news: DailyBriefing["news"]; compact?: boolean }) {
  if (news.status === "unavailable") return <div className="space-y-3">
    <Newspaper className="size-5 text-muted-foreground" aria-hidden="true" />
    <p className="text-sm font-medium">A little more perspective.</p>
    <p className="text-sm leading-6 text-muted-foreground">AI breakthroughs, world news, and the stories worth your time will appear here with their sources.</p>
    <p className="text-xs leading-5 text-muted-foreground">Live news is not connected. No headlines have been fetched.</p>
    <Button variant="outline" size="sm" asChild><Link to="/settings?tab=connections">View connections<ArrowUpRight /></Link></Button>
  </div>
  if (!news.items.length) return <p className="text-sm leading-6 text-muted-foreground">No stories in this briefing. Check back when the next update arrives.</p>
  return <div className="space-y-3">
    <ul className="divide-y divide-border">
      {news.items.slice(0, compact ? 3 : 5).map(item => {
        let url: URL
        try { url = new URL(item.url) } catch { return null }
        if (!["https:", "http:"].includes(url.protocol)) return null
        return <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <p className="mb-1 text-xs text-muted-foreground">{item.topic} · {item.publisher}</p>
          <a href={url.href} target="_blank" rel="noopener noreferrer" className="group inline-flex gap-2 text-sm font-medium leading-6 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">{item.title}<ArrowUpRight className="mt-1 size-4 shrink-0" /><span className="sr-only"> (opens in a new tab)</span></a>
          {!compact && <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.summary}</p>}
          <p className="mt-1 text-xs text-muted-foreground"><time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" })}</time></p>
        </li>
      })}
    </ul>
    {news.updatedAt && <p className="text-xs text-muted-foreground">Updated <time dateTime={news.updatedAt}>{new Date(news.updatedAt).toLocaleString()}</time></p>}
  </div>
}
