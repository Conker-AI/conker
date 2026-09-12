import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ModeToggle } from "@/components/mode-toggle"
import { Badge } from "@/components/ui/badge"
import { PageContainer } from "./page-container"

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-background text-foreground">
    <header className="border-b"><PageContainer className="flex h-16 items-center gap-3"><Link to="/" className="font-semibold">Conker</Link><Badge variant="outline">UI preview</Badge><div className="ml-auto"><ModeToggle /></div></PageContainer></header>
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
  </div>
}
