import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  History,
  Maximize,
  Minimize,
  Save,
  TestTube2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { conkerClient } from "@/lib/api";
import {
  type ToolDefinition,
  type ValidationIssue,
  type WorkspaceRecord,
} from "@/lib/tool-workspace";

export type EditorMode = "build" | "source" | "configure";

/** Top bar with back, view switch, save, test, publish and maximize actions. */
export function ToolEditorToolbar({
  definition,
  record,
  busy,
  dirty,
  pendingEdits,
  expanded,
  mode,
  version,
  issues,
  liveSave,
  livePublish,
  liveHistory,
  liveRun,
  onBack,
  setLeave,
  setPanel,
  setRemove,
  setExpanded,
  setNotice,
  switchMode,
  save,
  test,
  task,
  exportDefinition,
}: {
  definition: ToolDefinition;
  record: WorkspaceRecord;
  busy: boolean;
  dirty: boolean;
  pendingEdits: boolean;
  expanded: boolean;
  mode: EditorMode;
  version: string;
  issues: ValidationIssue[];
  liveSave?: (definition: ToolDefinition) => Promise<void>;
  livePublish?: () => void;
  liveHistory?: () => void;
  liveRun?: () => void;
  onBack: () => void;
  setLeave: (leave: boolean) => void;
  setPanel: (panel: "test" | "history" | null) => void;
  setRemove: (remove: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setNotice: (notice: string) => void;
  switchMode: (next: EditorMode) => boolean;
  save: () => void;
  test: () => void;
  task: (action: () => Promise<void>) => Promise<void>;
  exportDefinition: () => void;
}) {
  return (
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
        <PopoverTrigger render={<Button
            variant="outline"
            size="icon"
            aria-label="More tool actions" />}>
            <ChevronDown />
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
  );
}
