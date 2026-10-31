import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  parseToolDraft,
  type ToolDefinition,
  type WorkspaceRecord,
} from "@/lib/tool-workspace";

/** Source view editing the raw tool definition JSON. */
export function ToolSource({
  record,
  definition,
  source,
  sourceDirty,
  hasUnappliedFields,
  setSource,
  setError,
  setNotice,
  explainPendingEdits,
  change,
  serial,
}: {
  record: WorkspaceRecord;
  definition: ToolDefinition;
  source: string | null;
  sourceDirty: boolean;
  hasUnappliedFields: boolean;
  setSource: (source: string | null) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  explainPendingEdits: () => void;
  change: (next: ToolDefinition, track?: boolean, applyingSource?: boolean) => void;
  serial: (value: unknown) => string;
}) {
  return (
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
  );
}
