import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  History,
  Maximize,
  Minimize,
  Save,
  TestTube2,
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
import {
  type ToolDefinition,
  type ValidationIssue,
} from "@/lib/tool-workspace";

export type EditorMode = "build" | "source" | "configure";

/** Top bar with back, view switch, save, test, publish and maximize actions. */
export function ToolEditorToolbar({
  definition,
  busy,
  dirty,
  pendingEdits,
  expanded,
  mode,
  issues,
  livePublish,
  liveHistory,
  liveRun,
  onBack,
  setLeave,
  setExpanded,
  switchMode,
  save,
  exportDefinition,
}: {
  definition: ToolDefinition;
  busy: boolean;
  dirty: boolean;
  pendingEdits: boolean;
  expanded: boolean;
  mode: EditorMode;
  issues: ValidationIssue[];
  livePublish: () => void;
  liveHistory: () => void;
  liveRun: () => void;
  onBack: () => void;
  setLeave: (leave: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  switchMode: (next: EditorMode) => boolean;
  save: () => void;
  exportDefinition: () => void;
}) {
  return (
    <div className="tools-toolbar">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to tool library"
        disabled={busy}
        onClick={() => { if (dirty || pendingEdits) setLeave(true); else onBack(); }}
      >
        <ArrowLeft />
      </Button>
      <div className="tool-title">
        <strong className="truncate text-sm">{definition.name}</strong>
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved draft" : "Draft"} · ToolGate draft
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
        disabled={dirty || busy || pendingEdits || issues.length > 0}
        onClick={liveRun}
      >
        <TestTube2 />
        Run
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
            disabled={dirty || busy || pendingEdits || issues.length > 0}
            onClick={livePublish}
          >
            <Check />
            Publish saved version
          </Button>
          <Button
            variant="ghost"
            disabled={pendingEdits}
            onClick={exportDefinition}
          >
            <Download />
            Export definition
          </Button>
          <Button variant="ghost" onClick={liveHistory}>
            <History />
            Versions & runs
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
