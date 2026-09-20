import { ModelsProviders } from "./models-providers"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import {
  RouteSection, FormActions,
} from "@/components/design-system"
import { ThemeTab } from "@/components/theme-customizer/theme-tab"
import { LayoutTab } from "@/components/theme-customizer/layout-tab"
import { ImportModal } from "@/components/theme-customizer/import-modal"
import { useCustomizerPreferences } from "@/components/theme-customizer/preferences"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import { useSidebar } from "@/components/ui/sidebar"
import { ConnectionsFields } from "@/components/connections-form"
import { useConker, useConkerStore } from "@/lib/api/store"
import type { Connections } from "@/lib/api/config"

// Keep unfinished configuration in memory across routes; never persist keys to storage.
let retainedConnections: Connections | null = null

function ResetLayoutButton() {
  const { updateConfig } = useSidebarConfig()
  const { setOpen } = useSidebar()
  return <Button size="sm" variant="outline" onClick={() => {
    updateConfig({ variant: "inset", side: "left", collapsible: "offcanvas" })
    setOpen(true)
  }}>Reset layout</Button>
}

export default function SettingsPage() {
  const preferences = useCustomizerPreferences()
  const [importOpen, setImportOpen] = useState(false)
  const currentConnections = useConker(data => data.connections)
  const owner = useConker(data => data.auth.ownerName)
  const [connections, setConnections] = useState(() => retainedConnections || structuredClone(currentConnections))
  const modelsConfiguration = useConker(data => data.modelsConfiguration)
  const { saveConnections, saveModelsConfiguration, pending } = useConkerStore()
  const [saved, setSaved] = useState(false)
  const connectionsDirty = JSON.stringify(connections) !== JSON.stringify(currentConnections)

  useEffect(() => { retainedConnections = connectionsDirty ? connections : null }, [connections, connectionsDirty])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (connectionsDirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [connectionsDirty])

  return <BaseLayout title="Settings" description="Appearance, layout, and your dashboard connections.">
      <RouteSection value="appearance">
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row">
            <div className="min-w-0 space-y-1.5">
              <CardTitle><h2>Appearance</h2></CardTitle>
              <CardDescription>Theme presets, accent colors, and corner radius. Changes apply immediately.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => preferences.reset()}>Reset appearance</Button>
          </CardHeader>
          <CardContent>
            <ThemeTab {...preferences} className="p-0" onImportClick={() => setImportOpen(true)} />
          </CardContent>
        </Card>
      </RouteSection>
      <RouteSection value="layout">
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row">
            <div className="min-w-0 space-y-1.5">
              <CardTitle><h2>Layout</h2></CardTitle>
              <CardDescription>Choose how the sidebar fits your workspace.</CardDescription>
            </div>
            <ResetLayoutButton />
          </CardHeader>
          <CardContent><LayoutTab className="p-0" /></CardContent>
        </Card>
      </RouteSection>
      <RouteSection value="models"><ModelsProviders configuration={modelsConfiguration} pending={pending} onSave={saveModelsConfiguration} /></RouteSection>
      <RouteSection value="connections">
        <Card>
          <CardHeader><CardTitle><h2>Connections</h2></CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={async event => {
              event.preventDefault()
              setSaved(await saveConnections(connections))
            }}>
              <fieldset disabled={pending} className="min-w-0"><legend className="sr-only">Service connections</legend><ConnectionsFields value={connections} onChange={value => { setConnections(value); setSaved(false) }} /></fieldset>
              <FormActions description={<span role="status">{saved ? "Saved for this preview. Connection not tested." : connectionsDirty ? "Unsaved changes · draft kept when navigating away" : "Connection draft is up to date"}</span>}>
                <Button type="button" variant="outline" disabled={pending || !connectionsDirty} onClick={() => { setConnections(currentConnections); setSaved(false) }}>Discard changes</Button>
                <Button disabled={pending || !connectionsDirty}>{pending ? "Saving…" : "Save connection draft"}</Button>
              </FormActions>
            </form>
          </CardContent>
        </Card>
      </RouteSection>
      <RouteSection value="account">
        <Card>
          <CardHeader><CardTitle><h2>Account</h2></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6">Owner: {owner}</p>
            <p className="text-sm leading-6 text-muted-foreground">This is an open fixture preview. Authentication and password changes need a backend; no password is stored.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" asChild><Link to="/setup">Preview first-run setup</Link></Button>
              <Button variant="outline" asChild><Link to="/login">Preview login</Link></Button>
            </div>
          </CardContent>
        </Card>
      </RouteSection>
    <ImportModal open={importOpen} onOpenChange={setImportOpen} onImport={theme => {
      preferences.setSelectedTheme("")
      preferences.setSelectedTweakcnTheme("")
      preferences.setImportedTheme(theme)
      preferences.setColors({})
    }} />
  </BaseLayout>
}
