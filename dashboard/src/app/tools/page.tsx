import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { GitBranch, Plus, Wrench } from "lucide-react";
import { BaseLayout } from "@/components/layouts/base-layout";
import { DataTable } from "@/components/data-table";
import {
  TaskDialogContent,
  OverlayBody,
  FormActions,
  RecordItem,
} from "@/components/design-system";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { conkerClient } from "@/lib/api";
import type { WorkspaceRecord, ToolDefinition } from "@/lib/tool-workspace";
import { ToolEditor } from "./tool-editor";
import { Choice, Field } from "./tool-fields";
import "./tools-workspace.css";

export default function ToolsPage() {
  const [params, setParams] = useSearchParams();
  const [records, setRecords] = useState<WorkspaceRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [kind, setKind] = useState<ToolDefinition["kind"]>("workflow"),
    [busy, setBusy] = useState(false);
  const selectedId = params.get("tool");
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void conkerClient.toolWorkspace
        .list()
        .then((items) => {
          if (active) {
            setRecords(items);
            setLoading(false);
          }
        })
        .catch((e) => {
          if (active) {
            setError(String(e));
            setLoading(false);
          }
        });
    };
    refresh();
    const unsubscribe = conkerClient.toolWorkspace.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const open = (id: string) => setParams({ tool: id });
  const columns = useMemo<ColumnDef<WorkspaceRecord>[]>(
    () => [
      {
        id: "name",
        accessorFn: (r) => `${r.draft.name} ${r.draft.description}`,
        header: "Tool",
        cell: ({ row: { original: r } }) => (
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              {r.draft.kind === "workflow" ? (
                <GitBranch className="size-4" />
              ) : (
                <Wrench className="size-4" />
              )}
            </span>
            <div className="min-w-0">
              <button
                className="text-left text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => setParams({ tool: r.id })}
              >
                {r.draft.name}
              </button>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                {r.draft.description || "No description yet"}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "kind",
        accessorFn: (r) => r.draft.kind,
        header: "Implementation",
        cell: ({ getValue }) => (
          <Badge variant="outline">{String(getValue())}</Badge>
        ),
        filterFn: (row, id, v: string[]) => v.includes(row.getValue(id)),
      },
      { id: "effect", accessorFn: (r) => r.draft.effect, header: "Effect" },
      {
        id: "version",
        header: "Version",
        cell: ({ row: { original: r } }) => (
          <span className="text-sm text-muted-foreground">
            {r.published.length
              ? `v${r.published.at(-1)!.version} · preview`
              : "Draft"}
          </span>
        ),
      },
      {
        id: "test",
        header: "Last test",
        cell: ({ row: { original: r } }) => (
          <span
            className={
              r.runs[0]?.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
            }
          >
            {r.runs[0]?.status ?? "Not tested"}
          </span>
        ),
      },
    ],
    [setParams],
  );
  const record = records.find((r) => r.id === selectedId);
  if (selectedId && record)
    return (
      <BaseLayout variant="canvas">
        <ToolEditor
          key={record.id}
          record={record}
          records={records}
          onBack={() => setParams({})}
        />
      </BaseLayout>
    );
  return (
    <BaseLayout
      variant="collection"
      title="Tools"
      description="Build a capability once. Inspect its logic, test it, and prepare it for reuse."
      status={<Badge variant="outline">Preview</Badge>}
      actions={
        <Button
          onClick={() => {
            setName("");
            setError("");
            setCreating(true);
          }}
        >
          <Plus />
          New tool
        </Button>
      }
    >
      {selectedId && !loading && (
        <p role="alert" className="text-sm text-destructive">
          This tool is unavailable. Preview creations reset on reload.{" "}
          <Button variant="link" onClick={() => setParams({})}>
            Back to library
          </Button>
        </p>
      )}
      {error && !creating && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading tools…
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={records}
          searchColumn="name"
          searchPlaceholder="Search tools…"
          itemLabel="tools"
          filters={[
            {
              column: "kind",
              title: "Implementation",
              options: [
                { label: "Workflow", value: "workflow" },
                { label: "Connector", value: "connector" },
              ],
            },
          ]}
          renderItem={(r) => (
            <RecordItem
              title={r.draft.name}
              description={r.draft.description}
              onOpen={() => open(r.id)}
              leading={
                r.draft.kind === "workflow" ? (
                  <GitBranch className="size-4" />
                ) : (
                  <Wrench className="size-4" />
                )
              }
              meta={
                <>
                  <Badge variant="outline">{r.draft.kind}</Badge>
                  <span>{r.draft.effect}</span>
                  <span>
                    {r.published.length
                      ? `v${r.published.at(-1)!.version} · preview`
                      : "Draft"}
                  </span>
                </>
              }
            />
          )}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Local preview · changes reset on reload. Tests use fixtures; publishing
        creates a preview version, not a live tool.
      </p>
      <Dialog
        open={creating}
        onOpenChange={(v) => {
          if (!busy) setCreating(v);
        }}
      >
        <TaskDialogContent
          title="New tool"
          description="Start with a workflow or a connector action. Both live in this library."
          onInteractOutside={(e) => e.preventDefault()}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              void conkerClient.toolWorkspace
                .create(name, kind)
                .then((r) => {
                  setCreating(false);
                  open(r.id);
                })
                .catch((e) =>
                  setError(
                    e instanceof Error ? e.message : "Could not create tool",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <OverlayBody>
              <Field label="Name">
                <Input
                  autoFocus
                  aria-label="New tool name"
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Prepare daily digest"
                />
              </Field>
              <Field label="Implementation">
                <Choice
                  label="Implementation"
                  value={kind}
                  options={["workflow", "connector"]}
                  onChange={(v) => setKind(v as ToolDefinition["kind"])}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </OverlayBody>
            <FormActions inset>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create tool"}
              </Button>
            </FormActions>
          </form>
        </TaskDialogContent>
      </Dialog>
    </BaseLayout>
  );
}
