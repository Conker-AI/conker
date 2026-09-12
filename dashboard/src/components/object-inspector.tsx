import { useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent, Status, Skeleton } from "../ui";
import { Slot } from "../platform/slots";
import { useRegistry } from "../platform/contributions";
import type { StatusEvidence } from "../ui";

export function ObjectInspector({ resource, id, title, description, children }: { resource: string; id: string; title: string; description?: string; children: ReactNode }) {
  const [tab, setTab] = useState("record"); const registry = useRegistry();
  const hasExtras = registry.views.some(view => view.slot === "inspector.tabs");
  return <section className="object-inspector" aria-label={`${title} details`}><header><h2>{title}</h2>{description && <p className="body-copy">{description}</p>}</header><Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="record">Details</TabsTrigger>{hasExtras && <TabsTrigger value="extensions">Context</TabsTrigger>}</TabsList><TabsContent value="record">{children}</TabsContent><TabsContent value="extensions"><Slot name="inspector.tabs" selection={{ kind: "object", resource, id }} /></TabsContent></Tabs></section>;
}
export function DetailFields({ fields }: { fields: { label: string; value: ReactNode }[] }) { return <dl className="metadata-list">{fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>; }
export function QueryState({ error, loading, empty }: { error?: Error | null; loading?: boolean; empty?: string }) {
  if (error) return <Status evidence={{ state: "degraded", detail: `${error.message} Refresh this view to check again.` }} />;
  if (loading) return <div className="stack" aria-label="Loading retained records"><Skeleton className="h-8 w-64" /><Skeleton className="h-24 w-full" /></div>;
  return <Status evidence={{ state: "empty", detail: empty ?? "No records in this view." } as StatusEvidence} />;
}
