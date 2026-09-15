import { useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { MessageCircle, SlidersHorizontal, SquarePen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import type { getPageNavigation } from "@/config/navigation"
import { cn } from "@/lib/utils"

type Navigation = ReturnType<typeof getPageNavigation>

export function AppbarBreadcrumbs({ crumbs }: Pick<Navigation, "crumbs">) {
  return <Breadcrumb aria-label="Page path" className="min-w-0 flex-1">
    <BreadcrumbList className="flex-nowrap gap-1.5">
      {crumbs.flatMap((crumb, index) => {
        const current = index === crumbs.length - 1
        return [
          ...(index ? [<BreadcrumbSeparator key={`${crumb.to}-separator`} className="shrink-0" />] : []),
          <BreadcrumbItem key={crumb.to} className={current ? "min-w-0" : "shrink-0"}>
            {current ? <BreadcrumbPage className="truncate font-medium" title={crumb.title}>{crumb.title}</BreadcrumbPage>
              : <BreadcrumbLink asChild className="inline-flex min-h-(--control-height) items-center rounded-md px-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <Link to={crumb.to} aria-label={crumb.title} title={crumb.title}>
                  {crumb.title}
                </Link>
              </BreadcrumbLink>}
          </BreadcrumbItem>,
        ]
      })}
    </BreadcrumbList>
  </Breadcrumb>
}

export function AppbarActions({ actions }: Pick<Navigation, "actions">) {
  if (!actions.length) return null
  return <nav aria-label="Related pages" className="flex shrink-0 items-center gap-1">
    {actions.map(action => <Button key={action.to} variant="ghost" size="icon" asChild>
      <Link to={action.to} aria-label={action.label} title={action.label}>
        {action.icon === "message" ? <MessageCircle aria-hidden="true" /> : action.icon === "new-chat" ? <SquarePen aria-hidden="true" /> : <SlidersHorizontal aria-hidden="true" />}
      </Link>
    </Button>)}
  </nav>
}

export function AppbarSections({ sections, activeSection }: Pick<Navigation, "sections" | "activeSection">) {
  const activeLink = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    activeLink.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [activeSection])
  if (!sections.length) return null
  return <nav aria-label="Page sections" className="min-w-0 scroll-px-4 overflow-x-auto px-4 pb-2 sm:scroll-px-6 sm:px-6">
    <div className="flex w-max min-w-full items-center gap-1">
      {sections.map(section => <Link key={section.value} to={section.to}
        ref={activeSection === section.value ? activeLink : undefined}
        aria-current={activeSection === section.value ? "page" : undefined}
        className={cn("inline-flex h-(--control-height) shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring", activeSection === section.value ? "bg-selection text-primary" : "text-muted-foreground")}>
        {section.label}{section.badge !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{section.badge}</span>}
      </Link>)}
    </div>
  </nav>
}
