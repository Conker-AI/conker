import type { ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import { type Connection } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { WorkspaceInspector, OverlayBody } from "@/components/design-system";
import { ReferenceSection } from "@/components/reference-section";
import {
  NODE_LABELS,
  type ToolDefinition,
  type ToolNode,
  type ToolRun,
  type ToolStepReceipt,
  type WorkspaceRecord,
} from "@/lib/tool-workspace";
import { Choice } from "./tool-fields";
import { NodeFields } from "./tool-node-fields";

/** Inspector for the selected workflow step: fields, connections and last test output. */
export function ToolStepInspector({
  node,
  definition,
  records,
  capabilityPicker,
  canvasRun,
  argumentSources,
  changeArgumentSource,
  change,
  setSelected,
  connectFrom,
  connectTo,
  setConnectFrom,
  setConnectTo,
  branch,
  setBranch,
  connect,
  stepReceipt,
  explainPendingEdits,
  serial,
}: {
  node: ToolNode;
  definition: ToolDefinition;
  records: WorkspaceRecord[];
  capabilityPicker?: (node: ToolNode, onChange: (node: ToolNode) => void) => ReactNode;
  canvasRun: ToolRun | undefined;
  argumentSources: Record<string, string>;
  changeArgumentSource: (id: string, text: string | null) => void;
  change: (next: ToolDefinition, track?: boolean, applyingSource?: boolean) => void;
  setSelected: (id: string | null) => void;
  connectFrom: string | null;
  connectTo: string | null;
  setConnectFrom: (id: string | null) => void;
  setConnectTo: (id: string | null) => void;
  branch: string;
  setBranch: (branch: string) => void;
  connect: (connection: Connection) => void;
  stepReceipt: ToolStepReceipt | undefined;
  explainPendingEdits: () => void;
  serial: (value: unknown) => string;
}) {
  return (
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
  );
}
