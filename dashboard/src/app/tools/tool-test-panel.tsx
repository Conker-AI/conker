import { TestTube2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ToolDefinition,
  ToolRun,
  WorkspaceRecord,
} from "@/lib/tool-workspace";
import { Field } from "./tool-fields";
const serial = (v: unknown) => JSON.stringify(v, null, 2);
export function ToolTestPanel({
  panel,
  setPanel,
  record,
  definition,
  version,
  setVersion,
  input,
  setInput,
  run,
  runMatchesDraft,
  onRun,
  disabled,
  onRestore,
  onSelectRun,
  onSelectStep,
}: {
  panel: "test" | "history";
  setPanel: (p: "test" | "history" | null) => void;
  record: WorkspaceRecord;
  definition: ToolDefinition;
  version: string;
  setVersion: (v: string) => void;
  input: string;
  setInput: (v: string) => void;
  run?: ToolRun;
  runMatchesDraft: boolean;
  onRun: () => Promise<void>;
  disabled: boolean;
  onRestore: (d: ToolDefinition) => void;
  onSelectRun: (r: ToolRun) => void;
  onSelectStep: (id: string) => void;
}) {
  const selectedDefinition =
    version === "draft"
      ? definition
      : (record.published.find((v) => v.version === Number(version))
          ?.definition ?? definition);
  return (
    <section
      className="tool-test-panel"
      aria-label={panel === "test" ? "Fixture test panel" : "Versions and runs"}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <strong className="text-sm">
          {panel === "test" ? "Test with fixtures" : "Versions & runs"}
        </strong>
        <Badge variant="outline">Preview</Badge>
        <div className="tools-toolbar-spacer" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanel(panel === "test" ? "history" : "test")}
        >
          {panel === "test" ? "History" : "Test inputs"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Close test panel"
          onClick={() => setPanel(null)}
        >
          <X />
        </Button>
      </div>
      {panel === "test" ? (
        <div className="tool-test-content">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={version} onValueChange={setVersion}>
                <SelectTrigger aria-label="Test version" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Current draft</SelectItem>
                  {record.published.map((p) => (
                    <SelectItem key={p.version} value={String(p.version)}>
                      Preview v{p.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setInput(
                    serial(
                      Object.fromEntries(
                        selectedDefinition.inputs
                          .filter((f) => f.default !== undefined)
                          .map((f) => [f.name, f.default]),
                      ),
                    ),
                  )
                }
              >
                Load defaults
              </Button>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() => void onRun()}
              >
                <TestTube2 />
                Run test
              </Button>
            </div>
            <Field label="Test inputs">
              <Textarea
                aria-label="Test inputs JSON"
                className="min-h-24 font-mono text-xs"
                spellCheck={false}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </Field>
          </div>
          <div>
            {run ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline">{run.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {run.version === "draft" ? "Draft" : `v${run.version}`} ·{" "}
                    {new Date(run.startedAt).toLocaleTimeString()}
                  </span>
                </div>
                {!runMatchesDraft && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    This receipt is for an earlier draft or published version. It does not validate the current canvas.
                  </p>
                )}
                <pre
                  className={`tool-json ${run.error ? "text-destructive" : ""}`}
                >
                  {run.error ?? serial(run.output)}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  {run.steps.map((s) => (
                    <Button
                      key={s.nodeId}
                      size="sm"
                      variant="outline"
                      disabled={!runMatchesDraft}
                      onClick={() => onSelectStep(s.nodeId)}
                    >
                      {s.label} · {s.status}
                    </Button>
                  ))}
                </div>
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer">
                    Full test receipt
                  </summary>
                  <pre className="tool-json mt-2">{serial(run)}</pre>
                </details>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Run the draft to inspect results and the branch taken. Connector
                steps return sample data; no service is called.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="tool-test-content">
          <div>
            <h3 className="mb-3 text-sm font-medium">
              Published preview versions
            </h3>
            {!record.published.length && (
              <p className="text-sm text-muted-foreground">
                No versions yet. Validate the draft, then publish from the tool
                menu.
              </p>
            )}
            {[...record.published].reverse().map((p) => (
              <div
                key={p.version}
                className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
              >
                <span className="text-xs">
                  v{p.version} · {new Date(p.publishedAt).toLocaleString()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRestore(p.definition)}
                >
                  Restore to draft
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVersion(String(p.version));
                    setPanel("test");
                  }}
                >
                  Test version
                </Button>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium">Test runs</h3>
            {!record.runs.length && (
              <p className="text-sm text-muted-foreground">
                Your fixture tests will appear here.
              </p>
            )}
            {record.runs.map((r) => (
              <button
                key={r.id}
                className="tool-run-row"
                onClick={() => {
                  onSelectRun(r);
                  setPanel("test");
                }}
              >
                <span>
                  {r.status} ·{" "}
                  {r.version === "draft" ? "Draft" : `v${r.version}`}
                </span>
                <span>{new Date(r.startedAt).toLocaleTimeString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
