import { useState, type ReactNode } from "react";
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
import {
  type ToolDefinition,
  type ToolField,
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
  options: readonly (string | { label: string; value: string })[];
  onChange: (v: string) => void;
}) {
  const items = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  return (
    <Select value={value} onValueChange={value => { if (value !== null) onChange(value) }} items={items}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
        <p role="alert" className="text-xs text-destructive-foreground">
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
/** Draft metadata for a ToolGate tool; saving grants no execution access. */
export function ToolConfiguration({ definition, onChange }: { definition: ToolDefinition; onChange: (definition: ToolDefinition) => void }) {
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
            Draft metadata only. Saving grants no execution access.
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
            ToolGate stores this draft. Compilation, publication, credential binding and execution remain unavailable.
          </p>
        </ReferenceSection>
      </div>
    </div>
  );
}
