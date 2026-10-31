import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ToolNode } from '@/lib/tool-workspace';
import { type Connection } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/design-system";
import { conkerClient } from "@/lib/api";
import {
  createToolNode,
  editorValidation,
  type JsonValue,
  type NodeKind,
  type SavedCheck,
  type ToolDefinition,
  type ToolRun,
  type WorkspaceRecord,
} from "@/lib/tool-workspace";
import { ToolConfiguration } from "./tool-fields";
import { ToolTestPanel } from "./tool-test-panel";
import { ToolEditorToolbar, type EditorMode } from "./tool-editor-toolbar";
import { ToolStepCanvas } from "./tool-editor-canvas";
import { ToolStepInspector } from "./tool-editor-inspector";
import { ToolSource } from "./tool-editor-source";

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
  savedCheck,
}: {
  record: WorkspaceRecord;
  records: WorkspaceRecord[];
  onBack: () => void;
  liveSave?: (definition: ToolDefinition) => Promise<void>;
  livePublish?: () => void;
  liveHistory?: () => void;
  liveRun?: () => void;
  capabilityPicker?: (node: ToolNode, onChange: (node: ToolNode) => void) => ReactNode;
  /** ToolGate's check of the saved draft (live only); it wins over the quick local check. */
  savedCheck?: SavedCheck;
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
  const { issues, label: checkLabel } = editorValidation(definition, !!liveSave, dirty, savedCheck),
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
      <ToolEditorToolbar
        definition={definition}
        record={record}
        busy={busy}
        dirty={dirty}
        pendingEdits={pendingEdits}
        expanded={expanded}
        mode={mode}
        version={version}
        issues={issues}
        liveSave={liveSave}
        livePublish={livePublish}
        liveHistory={liveHistory}
        liveRun={liveRun}
        onBack={onBack}
        setLeave={setLeave}
        setPanel={setPanel}
        setRemove={setRemove}
        setExpanded={setExpanded}
        setNotice={setNotice}
        switchMode={switchMode}
        save={save}
        test={test}
        task={task}
        exportDefinition={exportDefinition}
      />
      {liveSave && <p className="tools-feedback text-xs text-muted-foreground">Saved in ToolGate. Publish a saved version, grant caller access, then run it with its existing approval rules.</p>}
      {error && (
        <div role="alert" className="tools-feedback text-destructive-foreground">
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
            <ToolStepCanvas
              definition={definition}
              selected={selected}
              setSelected={setSelected}
              canvasRun={canvasRun}
              palette={palette}
              setPalette={setPalette}
              query={query}
              setQuery={setQuery}
              outline={outline}
              setOutline={setOutline}
              history={history}
              future={future}
              panel={panel}
              setPanel={setPanel}
              pendingEdits={pendingEdits}
              liveSave={liveSave}
              liveRun={liveRun}
              sourceDirty={sourceDirty}
              connect={connect}
              add={add}
              undo={undo}
              redo={redo}
              explainPendingEdits={explainPendingEdits}
              setDefinition={setDefinition}
              setSource={setSource}
              change={change}
            />
            {node && (
              <ToolStepInspector
                node={node}
                definition={definition}
                records={records}
                capabilityPicker={capabilityPicker}
                canvasRun={canvasRun}
                argumentSources={argumentSources}
                changeArgumentSource={changeArgumentSource}
                change={change}
                setSelected={setSelected}
                connectFrom={connectFrom}
                connectTo={connectTo}
                setConnectFrom={setConnectFrom}
                setConnectTo={setConnectTo}
                branch={branch}
                setBranch={setBranch}
                connect={connect}
                stepReceipt={stepReceipt}
                explainPendingEdits={explainPendingEdits}
                serial={serial}
              />
            )}
          </>
        )}
        {mode === "source" && (
          <ToolSource
            record={record}
            definition={definition}
            source={source}
            sourceDirty={sourceDirty}
            hasUnappliedFields={hasUnappliedFields}
            setSource={setSource}
            setError={setError}
            setNotice={setNotice}
            explainPendingEdits={explainPendingEdits}
            change={change}
            serial={serial}
          />
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
          {checkLabel} · {liveRun ? 'Published runs via ToolGate' : 'No live execution'}
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
