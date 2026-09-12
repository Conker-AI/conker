import { useState } from "react"
import { Link } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ThemeTab } from "@/components/theme-customizer/theme-tab"
import { LayoutTab } from "@/components/theme-customizer/layout-tab"
import { ImportModal } from "@/components/theme-customizer/import-modal"
import { useCustomizerPreferences } from "@/components/theme-customizer/preferences"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import { ConnectionsFields } from "@/components/connections-form"
import { useConker, useConkerStore } from "@/lib/api/store"

export default function SettingsPage() {
  const preferences = useCustomizerPreferences()
  const { updateConfig } = useSidebarConfig()
  const [importOpen, setImportOpen] = useState(false)
  const currentConnections = useConker(data => data.connections)
  const owner = useConker(data => data.auth.ownerName)
  const [connections, setConnections] = useState(currentConnections)
  const { saveConnections, pending } = useConkerStore()
  const [saved, setSaved] = useState(false)
  return <BaseLayout title="Settings" description="Appearance, layout, and your dashboard connections.">
    <Tabs defaultValue="appearance" className="gap-5">
      <TabsList className="h-auto flex-wrap border">
        <TabsTrigger value="appearance">Appearance</TabsTrigger><TabsTrigger value="layout">Layout</TabsTrigger>
        <TabsTrigger value="connections">Connections</TabsTrigger><TabsTrigger value="account">Account</TabsTrigger>
      </TabsList>
      <TabsContent value="appearance" className="rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-medium">Appearance</h2><p className="mt-1 text-sm text-muted-foreground">Theme presets, accent colors, and corner radius. Changes apply immediately.</p></div><Button variant="outline" size="sm" onClick={() => preferences.reset()}>Reset appearance</Button></div>
        <ThemeTab {...preferences} onImportClick={() => setImportOpen(true)} />
      </TabsContent>
      <TabsContent value="layout" className="rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-medium">Layout</h2><p className="mt-1 text-sm text-muted-foreground">Choose how the sidebar fits your workspace.</p></div><Button size="sm" variant="outline" onClick={() => updateConfig({ variant: "inset", side: "left", collapsible: "offcanvas" })}>Reset layout</Button></div>
        <LayoutTab />
      </TabsContent>
      <TabsContent value="connections" className="rounded-lg border p-4">
        <form className="space-y-5" onSubmit={async event => { event.preventDefault(); setSaved(await saveConnections(connections)) }}>
          <h2 className="font-medium">Connections</h2>
          <ConnectionsFields value={connections} onChange={value => { setConnections(value); setSaved(false) }} />
          <div className="flex flex-wrap items-center gap-3"><Button disabled={pending}>Save connection draft</Button>{saved && <p role="status" className="text-sm text-muted-foreground">Saved for this preview. Connection not tested.</p>}</div>
        </form>
      </TabsContent>
      <TabsContent value="account" className="space-y-4 rounded-lg border p-4">
        <h2 className="font-medium">Account</h2><p className="text-sm">Owner: {owner}</p><p className="text-sm text-muted-foreground">This is an open fixture preview. Authentication and password changes need a backend; no password is stored.</p>
        <div className="flex flex-wrap gap-3"><Button variant="outline" asChild><Link to="/setup">Preview first-run setup</Link></Button><Button variant="outline" asChild><Link to="/login">Preview login</Link></Button></div>
      </TabsContent>
    </Tabs>
    <ImportModal open={importOpen} onOpenChange={setImportOpen} onImport={theme => { preferences.setSelectedTheme(""); preferences.setSelectedTweakcnTheme(""); preferences.setImportedTheme(theme); preferences.setColors({}) }} />
  </BaseLayout>
}
