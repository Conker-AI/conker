import { type Dispatch, type SetStateAction } from "react";
import { List, PanelBottom, Plus, Redo2, Undo2 } from "lucide-react";
import { type Connection } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CollectionSearch } from "@/components/design-system";
import {
  NODE_LABELS,
  type NodeKind,
  type ToolDefinition,
  type ToolRun,
} from "@/lib/tool-workspace";
import { ToolCanvas } from "./tool-canvas";

const stepTypes: NodeKind[] = [
  "tool_call",
  "workflow_call",
  "set",
  "calculation",
  "condition",
  "loop",
  "return",
];

/** Build-mode canvas column: add-step palette, steps outline, undo/redo and the workflow canvas. */
export function ToolStepCanvas({
  definition,
  selected,
  setSelected,
  canvasRun,
  palette,
  setPalette,
  query,
  setQuery,
  outline,
  setOutline,
  history,
  future,
  panel,
  setPanel,
  pendingEdits,
  liveSave,
  liveRun,
  sourceDirty,
  connect,
  add,
  undo,
  redo,
  explainPendingEdits,
  setDefinition,
  setSource,
  change,
}: {
  definition: ToolDefinition;
  selected: string | null;
  setSelected: (id: string | null) => void;
  canvasRun: ToolRun | undefined;
  palette: boolean;
  setPalette: (palette: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  outline: boolean;
  setOutline: (outline: boolean) => void;
  history: ToolDefinition[];
  future: ToolDefinition[];
  panel: "test" | "history" | null;
  setPanel: (panel: "test" | "history" | null) => void;
  pendingEdits: boolean;
  liveSave?: (definition: ToolDefinition) => Promise<void>;
  liveRun?: () => void;
  sourceDirty: boolean;
  connect: (connection: Connection) => void;
  add: (type: NodeKind) => void;
  undo: () => void;
  redo: () => void;
  explainPendingEdits: () => void;
  setDefinition: Dispatch<SetStateAction<ToolDefinition>>;
  setSource: (source: string | null) => void;
  change: (next: ToolDefinition, track?: boolean, applyingSource?: boolean) => void;
}) {
  return (
    <div className="tools-canvas-column">
      <div className="tools-build-controls">
        <Popover open={palette} onOpenChange={setPalette}>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <Plus />
              Add step
            </PopoverTrigger>
          <PopoverContent align="start" className="space-y-3">
            <CollectionSearch
              label="Search steps"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a step…"
            />
            {stepTypes
              .filter((t) =>
                NODE_LABELS[t]
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((t) => {
                return (
                  <Button
                    key={t}
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => add(t)}
                  >
                    <Plus />
                    {NODE_LABELS[t]}
                  </Button>
                );
              })}
            <p className="text-xs text-muted-foreground">
              Model calls and arbitrary code need a connected runtime.
            </p>
          </PopoverContent>
        </Popover>
        <Button
          variant={outline ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={outline}
          onClick={() => setOutline(!outline)}
        >
          <List />
          Steps
        </Button>
        <div className="tools-toolbar-spacer" />
        <Button
          size="sm"
          variant="ghost"
          aria-label="Undo edit"
          disabled={!history.length || pendingEdits}
          onClick={undo}
        >
          <Undo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Redo edit"
          disabled={!future.length || pendingEdits}
          onClick={redo}
        >
          <Redo2 />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={!!panel}
          disabled={!!liveSave && !liveRun}
          aria-label={liveRun ? 'Workflow runs' : 'Test panel'}
          onClick={() => liveRun ? liveRun() : setPanel(panel ? null : "test")}
        >
          <PanelBottom />
          <span className="hidden sm:inline">{liveRun ? 'Runs' : 'Test panel'}</span>
        </Button>
      </div>
      <div className="tools-canvas-row">
        {outline && (
          <div className="tools-outline" aria-label="Workflow steps">
            {definition.nodes.map((n) => (
              <button
                key={n.id}
                className={`tool-outline-row ${n.id === selected ? "is-selected" : ""}`}
                onClick={() => setSelected(n.id)}
              >
                <span className="block font-medium">{n.label}</span>
                <span className="text-xs text-muted-foreground">
                  {NODE_LABELS[n.type]}
                </span>
              </button>
            ))}
          </div>
        )}
        <ToolCanvas
          definition={definition}
          selected={selected}
          onSelect={setSelected}
          onMove={(id, position) => {
            if (sourceDirty) {
              explainPendingEdits();
              return;
            }
            setDefinition((d) => ({
              ...d,
              nodes: d.nodes.map((n) =>
                n.id === id ? { ...n, position } : n,
              ),
            }));
            setSource(null);
          }}
          onConnect={connect}
          onRemoveEdge={(id) =>
            change({
              ...definition,
              edges: definition.edges.filter((e) => e.id !== id),
            })
          }
          run={canvasRun}
        />
      </div>
    </div>
  );
}
