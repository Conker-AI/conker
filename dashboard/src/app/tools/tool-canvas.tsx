import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type Connection,
} from "@xyflow/react";
import {
  ArrowDownToLine,
  Braces,
  Calculator,
  Check,
  GitBranch,
  Plus,
  Minus,
  Maximize,
  Repeat2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  NODE_LABELS,
  type ToolDefinition,
  type ToolNode,
  type ToolRun,
} from "@/lib/tool-workspace";
import "@xyflow/react/dist/style.css";

const nodeIcons = {
  input: Braces,
  tool_call: Wrench,
  workflow_call: GitBranch,
  set: Braces,
  calculation: Calculator,
  condition: GitBranch,
  loop: Repeat2,
  return: ArrowDownToLine,
};
type CanvasNode = Node<{ step: ToolNode; status?: string }, "step">;
function StepNode({ data }: NodeProps<CanvasNode>) {
  const Icon = nodeIcons[data.step.type];
  return (
    <div className={`tool-step tool-step-${data.step.type}`}>
      {data.step.type !== "input" && (
        <Handle
          type="target"
          position={Position.Left}
          aria-label="Input connection"
        />
      )}
      <div className="tool-step-main">
        <span className="tool-step-icon">
          <Icon size={19} />
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-sm">{data.step.label}</strong>
          <span className="text-xs text-muted-foreground">
            {NODE_LABELS[data.step.type]}
          </span>
        </div>
        {data.status === "completed" && (
          <Check className="ml-auto size-4 text-success" />
        )}
      </div>
      <div className="tool-step-detail">
        {data.step.type === "tool_call"
          ? String(data.step.config.tool)
          : data.step.type === "workflow_call"
            ? `${data.step.config.toolId} · v${data.step.config.version}`
            : data.step.type === "condition"
              ? `If ${data.step.config.left} ${data.step.config.operator} ${data.step.config.right ?? ""}`
              : data.step.type === "loop"
                ? `Up to ${data.step.config.limit} items`
                : data.step.type === "input"
                  ? "Arguments from caller"
                  : data.step.type === "return"
                    ? "Result to caller"
                    : data.step.type === "calculation"
                      ? String(data.step.config.operator)
                      : "Store a value"}
      </div>
      {data.status && (
        <span
          className={`tool-step-status ${data.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {data.status}
        </span>
      )}
      {data.step.type === "condition" ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            style={{ top: "32%" }}
            aria-label="True branch"
          />
          <span className="tool-port-label tool-port-true">T</span>
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: "75%" }}
            aria-label="False branch"
          />
          <span className="tool-port-label tool-port-false">F</span>
        </>
      ) : (
        data.step.type !== "return" && (
          <Handle
            type="source"
            position={Position.Right}
            aria-label="Next step"
          />
        )
      )}
    </div>
  );
}
const nodeTypes = { step: StepNode };
export function ToolCanvas({
  definition,
  selected,
  onSelect,
  onMove,
  onConnect,
  onRemoveEdge,
  run,
}: {
  definition: ToolDefinition;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: { x: number; y: number }) => void;
  onConnect: (connection: Connection) => void;
  onRemoveEdge: (id: string) => void;
  run?: ToolRun;
}) {
  const [instance, setInstance] =
    useState<ReactFlowInstance<CanvasNode> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const [showGraph, setShowGraph] = useState(false);
  useEffect(() => {
    if (!instance || !container.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void instance.fitView({ padding: 0.15, maxZoom: 0.95 });
      }, 120);
    });
    observer.observe(container.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [instance, mobile, showGraph]);
  const nodes = useMemo(
    () =>
      definition.nodes.map((step) => ({
        id: step.id,
        position: step.position,
        deletable: false,
        type: "step" as const,
        selected: step.id === selected,
        data: {
          step,
          status: run?.steps.find((s) => s.nodeId === step.id)?.status,
        },
        ariaLabel: `${step.label}, ${NODE_LABELS[step.type]}`,
      })),
    [definition.nodes, selected, run],
  );
  const edges = useMemo(
    () =>
      definition.edges.map((edge) => ({
        ...edge,
        sourceHandle: edge.branch,
        type: "smoothstep",
        label: edge.branch,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "var(--muted-foreground)", strokeWidth: 1.4 },
        labelStyle: { fill: "var(--foreground)", fontSize: 11 },
        labelBgStyle: { fill: "var(--card)" },
        ariaLabel: `Connection ${edge.source} to ${edge.target}${edge.branch ? ` (${edge.branch})` : ""}`,
      })),
    [definition.edges],
  );
  return (
    <div
      ref={container}
      className="tool-canvas"
      aria-label="Tool workflow canvas"
    >
      {mobile && (
        <div className="tool-mobile-view">
          <span className="text-xs text-muted-foreground">
            {definition.nodes.length} workflow steps
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowGraph(!showGraph)}
          >
            {showGraph ? "Step list" : "Show graph"}
          </Button>
        </div>
      )}
      {mobile && !showGraph ? (
        <div className="tool-mobile-steps" aria-label="Workflow steps">
          {definition.nodes.map((step) => {
            const Icon = nodeIcons[step.type];
            const receipt = run?.steps.find((item) => item.nodeId === step.id);
            const next = definition.edges.filter(
              (edge) => edge.source === step.id,
            );
            return (
              <button
                key={step.id}
                className={`tool-mobile-step ${selected === step.id ? "is-selected" : ""}`}
                onClick={() => onSelect(step.id)}
              >
                <span className="flex items-center gap-3">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm">{step.label}</strong>
                    <span className="text-xs text-muted-foreground">
                      {NODE_LABELS[step.type]}
                      {receipt && ` · ${receipt.status}`}
                    </span>
                  </span>
                </span>
                {next.length > 0 && (
                  <span className="mt-3 block border-t pt-2 text-xs text-muted-foreground">
                    {next
                      .map(
                        (edge) =>
                          `${edge.branch ? `${edge.branch} → ` : "→ "}${definition.nodes.find((n) => n.id === edge.target)?.label ?? edge.target}`,
                      )
                      .join(" · ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setInstance}
            onNodeClick={(_, node) => onSelect(node.id)}
            onPaneClick={() => onSelect(null)}
            onNodeDragStop={(_, node) => onMove(node.id, node.position)}
            onConnect={onConnect}
            onEdgesDelete={(removed) =>
              removed.forEach((edge) => onRemoveEdge(edge.id))
            }
            onNodesChange={(changes) => {
              for (const change of changes)
                if (change.type === "position" && change.position)
                  onMove(change.id, change.position);
                else if (change.type === "select" && change.selected)
                  onSelect(change.id);
            }}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 0.95 }}
            minZoom={0.2}
            maxZoom={1.5}
            defaultEdgeOptions={{ type: "smoothstep" }}
            proOptions={{ hideAttribution: false }}
          >
            <Background color="var(--border)" gap={24} size={1} />
          </ReactFlow>
          <div className="tool-canvas-controls">
            <Button
              variant="outline"
              size="icon"
              aria-label="Zoom in"
              onClick={() => void instance?.zoomIn()}
            >
              <Plus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Zoom out"
              onClick={() => void instance?.zoomOut()}
            >
              <Minus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Fit workflow"
              onClick={() =>
                void instance?.fitView({ padding: 0.25, maxZoom: 0.95 })
              }
            >
              <Maximize />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
