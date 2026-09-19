import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReferenceSection } from "@/components/reference-section";
import { useConker } from "@/lib/api/store";
import {
  MOCK_CONNECTORS,
  type ToolDefinition,
  type ToolField,
  type JsonValue,
  type ToolNode,
  type WorkspaceRecord,
} from "@/lib/tool-workspace";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && (
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function ValueInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: JsonValue | undefined;
  onChange: (v: JsonValue) => void;
}) {
  return (
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
  );
}
export function JsonEditor({
  label,
  value,
  onApply,
  hint,
  source,
  onSourceChange,
}: {
  label: string;
  value: unknown;
  onApply: (value: unknown) => void;
  hint?: string;
  source?: string;
  onSourceChange: (source: string | null) => void;
}) {
  const [error, setError] = useState("");
  const text = source ?? JSON.stringify(value, null, 2);
  const changed = text !== JSON.stringify(value, null, 2);
  return (
    <Field label={label} hint={hint}>
      <Textarea
        aria-label={label}
        className="min-h-32 font-mono text-xs"
        spellCheck={false}
        value={text}
        onChange={(e) => onSourceChange(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!changed}
        onClick={() => {
          try {
            onApply(JSON.parse(text));
            onSourceChange(null);
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Invalid JSON");
          }
        }}
      >
        Apply {label.toLowerCase()}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!changed}
        onClick={() => {
          onSourceChange(null);
          setError("");
        }}
      >
        Discard {label.toLowerCase()} changes
      </Button>
      {changed && (
        <p className="text-xs text-muted-foreground">
          Unapplied changes in this field
        </p>
      )}
    </Field>
  );
}
export function NodeFields({
  node,
  records,
  onChange,
  argumentSource,
  onArgumentSourceChange,
}: {
  node: ToolNode;
  records: WorkspaceRecord[];
  onChange: (node: ToolNode) => void;
  argumentSource?: string;
  onArgumentSourceChange: (source: string | null) => void;
}) {
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
            <Select
              value={`${node.config.toolId}@${node.config.version}`}
              onValueChange={(v) => {
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
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            Publish a preview version of another tool first. This call stays
            pinned to that version.
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
            <Choice
              label="Tool to call"
              value={String(node.config.tool)}
              options={MOCK_CONNECTORS}
              onChange={(v) => config("tool", v)}
            />
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
            hint="Fixture response only. No service is called."
          />
        </>
      )}
      {(node.type === "set" || node.type === "return") && (
        <Field
          label="Value"
          hint="Use literal JSON, plain text, $input.name, $steps.stepId or $last."
        >
          <ValueInput
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
              label="Left value"
              value={node.config.left}
              onChange={(v) => config("left", v)}
            />
          </Field>
          {node.config.operator !== "exists" && (
            <Field label="Right value">
              <ValueInput
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
function SchemaFields({
  name,
  fields,
  onChange,
}: {
  name: string;
  fields: ToolField[];
  onChange: (fields: ToolField[]) => void;
}) {
  const update = (index: number, change: Partial<ToolField>) =>
    onChange(fields.map((f, i) => (i === index ? { ...f, ...change } : f)));
  return (
    <ReferenceSection title={name}>
      <div className="space-y-3">
        {fields.map((f, i) => (
          <div key={i} className="tool-schema-row">
            <Input
              aria-label={`${name} field ${i + 1} name`}
              value={f.name}
              placeholder="Field name"
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <Choice
              label={`${name} field ${i + 1} type`}
              value={f.type}
              options={["string", "number", "boolean", "array", "object"]}
              onChange={(type) =>
                update(i, { type: type as ToolField["type"] })
              }
            />
            <div className="flex items-center gap-2">
              <Switch
                aria-label={`${name} field ${i + 1} required`}
                checked={f.required}
                onCheckedChange={(required) => update(i, { required })}
              />
              <span className="text-xs">Required</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${name.toLowerCase()} field ${i + 1}`}
              onClick={() => onChange(fields.filter((_, idx) => idx !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...fields,
            {
              name: `field${fields.length + 1}`,
              type: "string",
              required: true,
            },
          ])
        }
      >
        <Plus />
        Add {name.toLowerCase().slice(0, -1)}
      </Button>
    </ReferenceSection>
  );
}
export function ToolConfiguration({
  definition,
  onChange,
}: {
  definition: ToolDefinition;
  onChange: (definition: ToolDefinition) => void;
}) {
  const registryTools = useConker((data) => data.tools);
  const tickets = useConker((data) => data.tickets);
  const registryTool =
    registryTools.find((tool) => tool.id === definition.id) ??
    registryTools.find((tool) => tool.name === definition.name);
  const relatedRequests = registryTool
    ? tickets.filter(
        (ticket) =>
          ticket.tool === registryTool.name || ticket.tool === registryTool.id,
      )
    : [];
  const update = (value: Partial<ToolDefinition>) =>
    onChange({ ...definition, ...value });
  return (
    <div className="tool-configuration">
      <div className="space-y-6">
        <ReferenceSection title="Identity">
          <Field label="Tool name">
            <Input
              aria-label="Tool name"
              value={definition.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <Field
            label="Description"
            hint="Tell the agent when this capability is useful."
          >
            <Textarea
              aria-label="Tool description"
              value={definition.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
        </ReferenceSection>
        <SchemaFields
          name="Inputs"
          fields={definition.inputs}
          onChange={(inputs) => update({ inputs })}
        />
        <SchemaFields
          name="Outputs"
          fields={definition.outputs}
          onChange={(outputs) => update({ outputs })}
        />
        {registryTool && (
          <ReferenceSection title="Fixture registry">
            <p className="text-xs text-muted-foreground">
              Recorded sample facts for {registryTool.name}. These are read-only
              registry details, not live permissions or activity from this
              draft.
            </p>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-muted-foreground">Scope</dt>
                <dd>{registryTool.scope}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sensitivity</dt>
                <dd>{registryTool.sensitivity}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Recent use</dt>
                <dd>{registryTool.recentUse}</dd>
              </div>
            </dl>
            {relatedRequests.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Related Inbox requests</h4>
                <ul className="space-y-2">
                  {relatedRequests.map((ticket) => (
                    <li key={ticket.id}>
                      <Link
                        to={`/inbox/${encodeURIComponent(ticket.id)}`}
                        className="text-primary underline underline-offset-4"
                      >
                        {ticket.request}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {ticket.status} · {ticket.agent}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No related fixture requests in Inbox.
              </p>
            )}
          </ReferenceSection>
        )}
      </div>
      <div className="space-y-6">
        <ReferenceSection title="Access & effects">
          <Field label="Effect">
            <Choice
              label="Tool effect"
              value={definition.effect}
              options={["read", "prepare", "write"]}
              onChange={(effect) =>
                update({ effect: effect as ToolDefinition["effect"] })
              }
            />
          </Field>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="agent-visible">Expose to agents</Label>
            <Switch
              id="agent-visible"
              checked={definition.agentVisible}
              onCheckedChange={(agentVisible) => update({ agentVisible })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Preview metadata only. Publishing here grants no live access.
          </p>
          <Field
            label="Connection references"
            hint="Comma-separated connection:name references. Never paste a key."
          >
            <Input
              aria-label="Connection references"
              placeholder="connection:mail"
              value={definition.credentialRefs.join(", ")}
              onChange={(e) =>
                update({
                  credentialRefs: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Button variant="link" asChild>
            <Link to="/settings?tab=connections">Manage connections</Link>
          </Button>
        </ReferenceSection>
        <ReferenceSection title="Execution limits">
          {(
            [
              ["maxSteps", "Maximum steps", 2, 200],
              ["maxLoopItems", "Maximum loop items", 1, 50],
              ["timeoutMs", "Timeout (ms)", 100, 30000],
            ] as const
          ).map(([key, label, min, max]) => (
            <Field key={key} label={label}>
              <Input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                value={definition.budgets[key]}
                onChange={(e) =>
                  update({
                    budgets: {
                      ...definition.budgets,
                      [key]: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
          ))}
        </ReferenceSection>
        <ReferenceSection title="Runtime boundary">
          <p className="text-sm text-muted-foreground">
            ToolGate owns credentials and action policy. Tests use local
            fixtures. Arbitrary code, real model calls and scheduling are not
            connected.
          </p>
        </ReferenceSection>
      </div>
    </div>
  );
}
