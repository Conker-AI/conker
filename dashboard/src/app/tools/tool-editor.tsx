import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ToolNode } from '@/lib/tool-workspace';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  History,
  List,
  Maximize,
  Minimize,
  PanelBottom,
  Plus,
  Redo2,
  Save,
  TestTube2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { type Connection } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CollectionSearch,
  WorkspaceInspector,
  OverlayBody,
  ConfirmationDialog,
} from "@/components/design-system";
import { ReferenceSection } from "@/components/reference-section";
import { conkerClient } from "@/lib/api";
import {
  createToolNode,
  NODE_LABELS,
  parseToolDraft,
  validateToolDefinition,
  type JsonValue,
  type NodeKind,
  type ToolDefinition,
  type ToolRun,
  type WorkspaceRecord,
} from "@/lib/tool-workspace";
import { ToolCanvas } from "./tool-canvas";
import { Choice, NodeFields, ToolConfiguration } from "./tool-fields";
import { ToolTestPanel } from "./tool-test-panel";

type EditorMode = "build" | "source" | "configure";
const stepTypes: NodeKind[] = [
  "tool_call",
  "workflow_call",
  "set",
  "calculation",
  "condition",
  "loop",
  "return",
];
const drafts = new Map<
  string,
  {
    definition: ToolDefinition;
    source: string | null;
    argumentSources: Record<string, string>;
  }
>();
const serial = (value: unknown) => JSON.stringify(value, null, 2);
export function ToolEditor({
  record,
  records,
  onBack,
  liveSave,
  livePublish,
  liveHistory,
  liveRun,
  capabilityPicker,
}: {
  record: WorkspaceRecord;
  records: WorkspaceRecord[];
  onBack: () => void;
  liveSave?: (definition: ToolDefinition) => Promise<void>;
  livePublish?: () => void;
  liveHistory?: () => void;
  liveRun?: () => void;
  capabilityPicker?: (node: ToolNode, onChange: (node: ToolNode) => void) => ReactNode;
}) {
  const [definition, setDefinition] = useState(
    () => (liveSave ? undefined : drafts.get(record.id)?.definition) ?? record.draft,
  );
  const [source, setSource] = useState<string | null>(
    () => (liveSave ? undefined : drafts.get(record.id)?.source) ?? null,
  );
  const [argumentSources, setArgumentSources] = useState<
    Record<string, string>
  >(() => (liveSave ? undefined : drafts.get(record.id)?.argumentSources) ?? {});
  const [testedDefinition, setTestedDefinition] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("build"),
    [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<ToolDefinition[]>([]),
    [future, setFuture] = useState<ToolDefinition[]>([]);
  const [query, setQuery] = useState(""),
    [palette, setPalette] = useState(false),
    [outline, setOutline] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<"test" | "history" | null>(null),
    [version, setVersion] = useState("draft");
  const [input, setInput] = useState(() =>
    serial(
      Object.fromEntries(
        definition.inputs
          .filter((f) => f.default !== undefined)
          .map((f) => [f.name, f.default]),
      ),
    ),
  );
  const [run, setRun] = useState<ToolRun | undefined>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(false);
  const [leave, setLeave] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null),
    [connectTo, setConnectTo] = useState<string | null>(null),
    [branch, setBranch] = useState("true");
  const workspace = useRef<HTMLDivElement>(null);
  const dirty = serial(definition) !== serial(record.draft),
    sourceDirty = source !== null && source !== serial(definition);
  const hasUnappliedFields = Object.keys(argumentSources).length > 0;
  const pendingEdits = sourceDirty || hasUnappliedFields;
  const issues = validateToolDefinition(definition, !!liveSave),
    node = definition.nodes.find((n) => n.id === selected);
  const canvasRun =
    !pendingEdits && testedDefinition === serial(definition) ? run : undefined;
  const stepReceipt = canvasRun?.steps.find((s) => s.nodeId === selected);
  useEffect(() => {
    if (!liveSave) drafts.set(record.id, { definition, source, argumentSources });
  }, [record.id, definition, source, argumentSources, liveSave]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || pendingEdits) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty, pendingEdits]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded]);
  const explainPendingEdits = () => {
    setError(
      sourceDirty
        ? "Apply or discard the source changes before continuing."
        : "Apply or discard the pending step arguments before continuing.",
    );
    if (hasUnappliedFields && !sourceDirty) {
      setMode("build");
      setSelected(Object.keys(argumentSources)[0]);
    }
  };
  const switchMode = (next: EditorMode) => {
    if (pendingEdits && next !== mode) {
      explainPendingEdits();
      return false;
    }
    setMode(next);
    setError("");
    return true;
  };
  const changeArgumentSource = (id: string, text: string | null) => {
    setError("");
    setArgumentSources((previous) => {
      const next = { ...previous };
      const canonical = definition.nodes.find((n) => n.id === id)?.config.args;
      if (text === null || text === serial(canonical)) delete next[id];
      else next[id] = text;
      return next;
    });
  };
  const change = (
    next: ToolDefinition,
    track = true,
    applyingSource = false,
  ) => {
    if (sourceDirty && !applyingSource) {
      explainPendingEdits();
      return;
    }
    if (track) {
      setHistory((h) => [...h.slice(-39), definition]);
      setFuture([]);
    }
    setDefinition(next);
    setSource(null);
    setNotice("");
  };
  const undo = () => {
    if (pendingEdits) {
      explainPendingEdits();
      return;
    }
    const previous = history.at(-1);
    if (previous) {
      setFuture((f) => [...f, definition]);
      setHistory((h) => h.slice(0, -1));
      setDefinition(previous);
      setSource(null);
    }
  };
  const redo = () => {
    if (pendingEdits) {
      explainPendingEdits();
      return;
    }
    const next = future.at(-1);
    if (next) {
      setHistory((h) => [...h, definition]);
      setFuture((f) => f.slice(0, -1));
      setDefinition(next);
      setSource(null);
    }
  };
  const task = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete action.");
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    task(async () => {
      if (pendingEdits)
        throw new Error(
          "Apply or discard pending source and argument changes before saving.",
        );
      if (liveSave) await liveSave(definition);
      else await conkerClient.toolWorkspace.save(definition);
      setNotice(liveSave ? "Draft saved to ToolGate." : "Draft saved for this preview session.");
    });
  const connect = (connection: Connection) => {
    const from = definition.nodes.find((n) => n.id === connection.source);
    if (
      !from ||
      !connection.target ||
      from.type === "return" ||
      connection.target === connection.source ||
      definition.nodes.find((n) => n.id === connection.target)?.type === "input"
    ) {
      setError(
        "Connect an output to a different step. Input starts the workflow; Return ends it.",
      );
      return;
    }
    const branchValue =
      from.type === "condition"
        ? connection.sourceHandle === "false"
          ? ("false" as const)
          : ("true" as const)
        : undefined;
    const edge = {
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      source: from.id,
      target: connection.target,
      ...(branchValue ? { branch: branchValue } : {}),
    };
    change({
      ...definition,
      edges: [
        ...definition.edges.filter(
          (e) => !(e.source === from.id && e.branch === branchValue),
        ),
        edge,
      ],
    });
    setError("");
  };
  const add = (type: NodeKind) => {
    const base = node ?? definition.nodes.find((n) => n.type === "input");
    const next = createToolNode(type, undefined, {
      x: (base?.position.x ?? 0) + 260,
      y: (base?.position.y ?? 160) + 150,
    });
    if (liveSave && type === 'tool_call') next.config.tool = '';
    let edges = definition.edges;
    if (
      base &&
      base.type !== "return" &&
      base.type !== "condition" &&
      type !== "condition"
    ) {
      const outgoing = edges.find((e) => e.source === base.id);
      edges = edges.filter((e) => e !== outgoing);
      edges = [
        ...edges,
        { id: `in-${next.id}`, source: base.id, target: next.id },
        ...(outgoing && type !== "return"
          ? [{ ...outgoing, source: next.id }]
          : []),
      ];
    }
    change({
      ...definition,
      kind: "workflow",
      nodes: [...definition.nodes, next],
      edges,
    });
    setSelected(next.id);
    setPalette(false);
  };
  const test = () =>
    task(async () => {
      if (liveSave) throw new Error("Live workflow execution is not connected yet.");
      if (pendingEdits)
        throw new Error(
          "Apply or discard pending source and argument changes before testing.",
        );
      const args: unknown = JSON.parse(input);
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new Error("Test inputs must be a JSON object.");
      if (version === "draft")
        await conkerClient.toolWorkspace.save(definition);
      const result = await conkerClient.toolWorkspace.run(
        record.id,
        args as Record<string, JsonValue>,
        version === "draft" ? undefined : Number(version),
      );
      setRun(result);
      setTestedDefinition(version === "draft" ? serial(definition) : null);
      setPanel("test");
      setNotice(
        result.status === "completed"
          ? "Fixture test completed. No external action performed."
          : "Fixture test failed. Inspect the error below.",
      );
    });
  const exportDefinition = () => {
    const url = URL.createObjectURL(
      new Blob([serial(definition)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${definition.id}.${liveSave ? "draft" : "preview"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div
      ref={workspace}
      className={`tools-workspace${expanded ? " tools-workspace-expanded" : ""}`}
    >
      <div className="tools-toolbar">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to tool library"
          disabled={busy}
          onClick={() => { if (liveSave && (dirty || pendingEdits)) setLeave(true); else onBack(); }}
        >
          <ArrowLeft />
        </Button>
        <div className="tool-title">
          <strong className="truncate text-sm">{definition.name}</strong>
          <span className="text-xs text-muted-foreground">
            {dirty ? "Unsaved draft" : "Draft"} · {liveSave ? "ToolGate draft" : "local preview"}
          </span>
        </div>
        <Select
          value={mode}
          onValueChange={(v) => {
            switchMode(v as EditorMode);
          }}
        >
          <SelectTrigger aria-label="Editor view" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="build">Build</SelectItem>
            <SelectItem value="source">Source</SelectItem>
            <SelectItem value="configure">Configure</SelectItem>
          </SelectContent>
        </Select>
        <div className="tools-toolbar-spacer" />
        <Button
          variant="outline"
          size="sm"
          disabled={busy || pendingEdits || !dirty}
          onClick={() => void save()}
        >
          <Save />
          Save
        </Button>
        <Button
          size="sm"
          disabled={
            (!!liveSave && (!liveRun || dirty)) || busy || pendingEdits || (version === "draft" && issues.length > 0)
          }
          onClick={() => {
            if (liveRun) { liveRun(); return; }
            setPanel("test");
            void test();
          }}
        >
          <TestTube2 />
          {liveRun ? 'Run' : 'Test'}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="More tool actions"
            >
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled={(!!liveSave && (!livePublish || dirty)) || busy || pendingEdits || issues.length > 0}
              onClick={() =>
                void task(async () => {
                  if (livePublish) { livePublish(); return; }
                  if (pendingEdits)
                    throw new Error(
                      "Apply or discard pending changes before publishing.",
                    );
                  await conkerClient.toolWorkspace.save(definition);
                  const v = await conkerClient.toolWorkspace.publish(record.id);
                  setNotice(
                    `Preview v${v.version} published. No live tool or access was created.`,
                  );
                })
              }
            >
              <Check />
              {liveSave ? "Publish saved version" : "Publish preview version"}
            </Button>
            <Button
              variant="ghost"
              disabled={pendingEdits}
              onClick={exportDefinition}
            >
              <Download />
              Export definition
            </Button>
            <Button variant="ghost" disabled={!!liveSave && !liveHistory} onClick={() => liveHistory ? liveHistory() : setPanel("history")}>
              <History />
              Versions & runs
            </Button>
            <Button
              variant="ghost"
              disabled={!!liveSave || pendingEdits}
              onClick={() =>
                void task(async () => {
                  const copied = await conkerClient.toolWorkspace.create(
                    `${definition.name} copy`,
                    definition.kind,
                  );
                  await conkerClient.toolWorkspace.save({
                    ...definition,
                    id: copied.id,
                    name: `${definition.name} copy`,
                  });
                  setNotice("Copy added to the tool library.");
                })
              }
            >
              <Copy />
              Duplicate tool
            </Button>
            <Button variant="ghost" disabled={!!liveSave} onClick={() => setRemove(true)}>
              <Trash2 />
              Delete preview tool
            </Button>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          aria-label={expanded ? "Restore workspace" : "Maximize workspace"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize /> : <Maximize />}
        </Button>
      </div>
      {liveSave && <p className="tools-feedback text-xs text-muted-foreground">Saved in ToolGate. Publish a saved version, grant caller access, then run it with its existing approval rules.</p>}
      {error && (
        <div role="alert" className="tools-feedback text-destructive">
          {error}
          <Button variant="ghost" size="sm" onClick={() => setError("")}>
            Dismiss
          </Button>
        </div>
      )}
      {hasUnappliedFields && (
        <div role="status" className="tools-feedback">
          Step arguments have unapplied changes. Apply or discard them to save,
          test or publish.
          <Button variant="ghost" size="sm" onClick={explainPendingEdits}>
            Review arguments
          </Button>
        </div>
      )}
      <div className="tools-body">
        {mode === "build" && (
          <>
            <div className="tools-canvas-column">
              <div className="tools-build-controls">
                <Popover open={palette} onOpenChange={setPalette}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus />
                      Add step
                    </Button>
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
            {node && (
              <WorkspaceInspector
                label="Tool step inspector"
                title={node.label}
                description={`${NODE_LABELS[node.type]} · ${node.id}`}
                onClose={() => setSelected(null)}
              >
                <OverlayBody>
                  <NodeFields
                    capabilityPicker={capabilityPicker}
                    key={node.id}
                    node={node}
                    definition={definition}
                    run={canvasRun}
                    records={records}
                    argumentSource={argumentSources[node.id]}
                    onArgumentSourceChange={(text) =>
                      changeArgumentSource(node.id, text)
                    }
                    onChange={(next) =>
                      change({
                        ...definition,
                        nodes: definition.nodes.map((n) =>
                          n.id === next.id ? next : n,
                        ),
                      })
                    }
                  />
                  <ReferenceSection title="Connections">
                    {definition.edges
                      .filter(
                        (e) => e.source === node.id || e.target === node.id,
                      )
                      .map((e) => (
                        <div key={e.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 break-words text-xs">
                            {
                              definition.nodes.find((n) => n.id === e.source)
                                ?.label
                            }{" "}
                            →{" "}
                            {
                              definition.nodes.find((n) => n.id === e.target)
                                ?.label
                            }
                            {e.branch && ` (${e.branch})`}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove connection ${e.source} to ${e.target}`}
                            onClick={() =>
                              change({
                                ...definition,
                                edges: definition.edges.filter(
                                  (edge) => edge.id !== e.id,
                                ),
                              })
                            }
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                    {node.type !== "return" && (
                      <>
                        <Choice
                          label="Connect to step"
                          value={
                            connectFrom === node.id
                              ? (connectTo ?? "none")
                              : "none"
                          }
                          options={[
                            "none",
                            ...definition.nodes
                              .filter(
                                (n) => n.id !== node.id && n.type !== "input",
                              )
                              .map((n) => n.id),
                          ]}
                          onChange={(id) => {
                            setConnectFrom(node.id);
                            setConnectTo(id);
                          }}
                        />
                        {node.type === "condition" && (
                          <Choice
                            label="Branch"
                            value={branch}
                            options={["true", "false"]}
                            onChange={setBranch}
                          />
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            connectFrom !== node.id ||
                            !connectTo ||
                            connectTo === "none"
                          }
                          onClick={() =>
                            connect({
                              source: node.id,
                              target: connectTo!,
                              sourceHandle:
                                node.type === "condition" ? branch : null,
                              targetHandle: null,
                            })
                          }
                        >
                          Connect next step
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Replaces this output’s existing connection.
                        </p>
                      </>
                    )}
                  </ReferenceSection>
                  {stepReceipt && (
                    <ReferenceSection title="Last test output">
                      <p className="text-xs">{stepReceipt.status}</p>
                      <pre className="tool-json">
                        {stepReceipt.error ??
                          serial(stepReceipt.output ?? null)}
                      </pre>
                    </ReferenceSection>
                  )}
                  {node.type !== "input" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (argumentSources[node.id] !== undefined) {
                          explainPendingEdits();
                          return;
                        }
                        change({
                          ...definition,
                          nodes: definition.nodes.filter(
                            (n) => n.id !== node.id,
                          ),
                          edges: definition.edges.filter(
                            (e) => e.source !== node.id && e.target !== node.id,
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      <Trash2 />
                      Remove step
                    </Button>
                  )}
                </OverlayBody>
              </WorkspaceInspector>
            )}
          </>
        )}
        {mode === "source" && (
          <div className="tool-source">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <span className="mr-auto text-xs text-muted-foreground">
                definition.json · same draft as the canvas
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!sourceDirty}
                onClick={() => {
                  setSource(null);
                  setError("");
                }}
              >
                Discard source changes
              </Button>
              <Button
                size="sm"
                disabled={!sourceDirty}
                onClick={() => {
                  try {
                    const parsed = parseToolDraft(source!);
                    if (parsed.id !== record.id)
                      throw new Error(
                        "Keep the tool ID unchanged. Use Duplicate to create another tool.",
                      );
                    if (hasUnappliedFields) {
                      explainPendingEdits();
                      return;
                    }
                    change(parsed, true, true);
                    setError("");
                    setNotice("Source applied to the canvas.");
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Invalid definition",
                    );
                  }
                }}
              >
                Apply source
              </Button>
            </div>
            <Textarea
              aria-label="Tool definition JSON"
              className="tool-source-input"
              spellCheck={false}
              value={source ?? serial(definition)}
              onChange={(e) => setSource(e.target.value)}
            />
            <p className="px-4 py-2 text-xs text-muted-foreground">
              Structured workflow source. JavaScript/Python execution is not
              connected.
            </p>
          </div>
        )}
        {mode === "configure" && (
          <div className="tool-config-scroll">
            <ToolConfiguration definition={definition} onChange={change} live={!!liveSave} />
          </div>
        )}
      </div>
      {panel && (
        <ToolTestPanel
          panel={panel}
          setPanel={setPanel}
          record={record}
          definition={definition}
          version={version}
          setVersion={setVersion}
          input={input}
          setInput={setInput}
          run={run}
          runMatchesDraft={!!canvasRun}
          onRun={test}
          disabled={
            busy || pendingEdits || (version === "draft" && issues.length > 0)
          }
          onRestore={(d) => {
            if (pendingEdits) {
              explainPendingEdits();
              return;
            }
            change(structuredClone(d));
            setNotice(
              "Version restored to draft. Published versions are unchanged.",
            );
          }}
          onSelectRun={(selectedRun) => {
            setRun(selectedRun);
            setTestedDefinition(null);
          }}
          onSelectStep={(id) => {
            if (!switchMode("build")) return;
            setSelected(id);
          }}
        />
      )}
      {issues.length > 0 && (
        <details className="tool-validation">
          <summary>
            {issues.length} {issues.length === 1 ? "issue" : "issues"} to
            resolve before testing or publishing
          </summary>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>
                <button
                  className="text-left hover:underline"
                  onClick={() => {
                    if (issue.nodeId) {
                      if (!switchMode("build")) return;
                      setSelected(issue.nodeId);
                    }
                  }}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <footer className="tools-status">
        <span role="status">
          {notice ||
            `${definition.nodes.length} steps · ${definition.edges.length} connections · ${sourceDirty ? "Source changes not applied" : hasUnappliedFields ? "Apply or discard pending step arguments" : liveSave ? "Save to preserve changes" : "Changes reset on reload"}`}
        </span>
        <span className="hidden sm:inline">
          {issues.length ? "Needs attention" : "Definition valid"} · {liveRun ? 'Published runs via ToolGate' : 'No live execution'}
        </span>
      </footer>
      <ConfirmationDialog pending={busy} open={leave} onOpenChange={setLeave} title="Discard unsaved changes?" description="Your saved ToolGate draft is unchanged. Unsaved edits will be discarded." actionLabel="Discard changes" onConfirm={onBack} />
      <ConfirmationDialog
        open={remove}
        onOpenChange={setRemove}
        title={`Delete “${definition.name}”?`}
        description="Removes this tool and its preview versions and test runs from this browser session. Nothing is deleted from ToolGate."
        actionLabel="Delete preview tool"
        pending={busy}
        error={error}
        onConfirm={() =>
          task(async () => {
            await conkerClient.toolWorkspace.remove(record.id);
            drafts.delete(record.id);
            onBack();
          })
        }
      />
    </div>
  );
}
