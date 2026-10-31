import { useState, type ReactNode } from "react";
import { Braces } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import {
  toolValueSources,
  type ToolValueSource,
} from "@/lib/tool-value-sources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MOCK_CONNECTORS,
  type ToolDefinition,
  type JsonValue,
  type ToolNode,
  type WorkspaceRecord,
  type ToolRun,
} from "@/lib/tool-workspace";
import { Choice, Field, JsonEditor } from "./tool-fields";

function ValueInput({
  label,
  value,
  onChange,
  sources,
}: {
  label: string;
  value: JsonValue | undefined;
  onChange: (v: JsonValue) => void;
  sources: ToolValueSource[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Input
        aria-label={label}
        value={typeof value === "string" ? value : JSON.stringify(value ?? "")}
        onChange={(e) => {
          let parsed: JsonValue;
          try {
            parsed = JSON.parse(e.target.value) as JsonValue;
          } catch {
            parsed = e.target.value;
          }
          onChange(parsed);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={`Choose source for ${label.toLowerCase()}`}
            title="Choose an input or previous result" />}>
            <Braces />
          </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] p-0"
        >
          <Command>
            <CommandInput placeholder="Find an input or result…" />
            <CommandList>
              <CommandEmpty>
                No available values. Connect an earlier step or define inputs.
              </CommandEmpty>
              {sources.map((source) => (
                <CommandItem
                  key={source.path}
                  value={`${source.path} ${source.label}`}
                  onClick={() => {
                    onChange(source.path);
                    setOpen(false);
                  }}
                  className="flex-col items-start gap-1"
                >
                  <span>{source.label}</span>
                  <code className="text-xs text-muted-foreground break-all">
                    {source.path}
                  </code>
                  <span className="text-xs text-muted-foreground">
                    {source.detail}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
export function NodeFields({
  node,
  definition,
  run,
  records,
  onChange,
  argumentSource,
  onArgumentSourceChange,
  capabilityPicker,
}: {
  node: ToolNode;
  definition: ToolDefinition;
  run?: ToolRun;
  records: WorkspaceRecord[];
  onChange: (node: ToolNode) => void;
  argumentSource?: string;
  onArgumentSourceChange: (source: string | null) => void;
  capabilityPicker?: (node: ToolNode, onChange: (node: ToolNode) => void) => ReactNode;
}) {
  const sources = toolValueSources(definition, node.id, run);
  const config = (key: string, value: JsonValue) =>
    onChange({ ...node, config: { ...node.config, [key]: value } });
  return (
    <div className="space-y-4">
      <Field label="Step name">
        <Input
          aria-label="Step name"
          value={node.label}
          onChange={(e) => onChange({ ...node, label: e.target.value })}
        />
      </Field>
      {node.type === "input" && (
        <p className="text-sm text-muted-foreground">
          Caller arguments enter here. Define their names and types in
          Configure.
        </p>
      )}
      {node.type === "workflow_call" && (
        <>
          <Field label="Published tool">
            {capabilityPicker ? capabilityPicker(node, onChange) : <Select
              value={`${node.config.toolId}@${node.config.version}`}
              items={records.flatMap(r => r.published.map(p => ({ value: `${r.id}@${p.version}`, label: `${p.definition.name} · v${p.version}` })))}
              onValueChange={v => { if (v === null) return;
                const [toolId, version] = v.split("@");
                onChange({
                  ...node,
                  config: { ...node.config, toolId, version: Number(version) },
                });
              }}
            >
              <SelectTrigger
                aria-label="Published tool version"
                className="w-full"
              >
                <SelectValue placeholder="Choose a published version" />
              </SelectTrigger>
              <SelectContent>
                {records.flatMap((r) =>
                  r.published.map((p) => (
                    <SelectItem
                      key={`${r.id}@${p.version}`}
                      value={`${r.id}@${p.version}`}
                    >
                      {p.definition.name} · v{p.version}
                    </SelectItem>
                  )),
                )}
              </SelectContent>
            </Select>}
          </Field>
          <p className="text-xs text-muted-foreground">
            {capabilityPicker ? 'Select a published workflow. This call stays pinned to its selected version.' : 'Publish a preview version of another tool first. This call stays pinned to that version.'}
          </p>
          <JsonEditor
            key={`${node.id}-args`}
            label="Arguments"
            value={node.config.args}
            source={argumentSource}
            onSourceChange={onArgumentSourceChange}
            onApply={(v) => {
              if (!v || typeof v !== "object" || Array.isArray(v))
                throw new Error("Arguments must be a JSON object.");
              config("args", v as JsonValue);
            }}
          />
        </>
      )}
      {node.type === "tool_call" && (
        <>
          <Field label="Tool">
            {capabilityPicker ? capabilityPicker(node, onChange) : <Choice
              label="Tool to call"
              value={String(node.config.tool)}
              options={MOCK_CONNECTORS}
              onChange={(v) => config("tool", v)}
            />}
          </Field>
          <JsonEditor
            key={`${node.id}-args`}
            label="Arguments"
            value={node.config.args}
            source={argumentSource}
            onSourceChange={onArgumentSourceChange}
            onApply={(v) => {
              if (!v || typeof v !== "object" || Array.isArray(v))
                throw new Error("Arguments must be a JSON object.");
              config("args", v as JsonValue);
            }}
            hint={capabilityPicker ? 'Arguments are passed to the registered tool when a published workflow runs.' : 'Fixture response only. No service is called.'}
          />
        </>
      )}
      {(node.type === "set" || node.type === "return") && (
        <Field
          label="Value"
          hint="Use literal JSON, plain text, $input.name, $steps.stepId or $last."
        >
          <ValueInput
            sources={sources}
            label="Step value"
            value={node.config.value}
            onChange={(v) => config("value", v)}
          />
        </Field>
      )}
      {(node.type === "calculation" || node.type === "condition") && (
        <>
          <Field label="Operation">
            <Choice
              label="Operation"
              value={String(node.config.operator)}
              options={
                node.type === "calculation"
                  ? ["add", "subtract", "multiply", "divide"]
                  : ["equals", "greater", "less", "contains", "exists"]
              }
              onChange={(v) => config("operator", v)}
            />
          </Field>
          <Field label="Left value">
            <ValueInput
              sources={sources}
              label="Left value"
              value={node.config.left}
              onChange={(v) => config("left", v)}
            />
          </Field>
          {node.config.operator !== "exists" && (
            <Field label="Right value">
              <ValueInput
                sources={sources}
                label="Right value"
                value={node.config.right}
                onChange={(v) => config("right", v)}
              />
            </Field>
          )}
          <p className="text-xs text-muted-foreground">
            References: $input.value · $last · $steps.stepId
          </p>
        </>
      )}
      {node.type === "loop" && (
        <>
          <Field
            label="Items"
            hint="An array or a reference such as $input.items."
          >
            <ValueInput
              sources={sources}
              label="Loop items"
              value={node.config.items}
              onChange={(v) => config("items", v)}
            />
          </Field>
          <Field label="Item operation">
            <Choice
              label="Item operation"
              value={String(node.config.operation)}
              options={["identity", "uppercase", "trim"]}
              onChange={(v) => config("operation", v)}
            />
          </Field>
          <Field label="Maximum items">
            <Input
              aria-label="Maximum items"
              type="number"
              min={1}
              max={50}
              value={Number(node.config.limit)}
              onChange={(e) => config("limit", Number(e.target.value))}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            This preview transforms items. Nested tool calls inside loops are
            not connected.
          </p>
        </>
      )}
    </div>
  );
}
