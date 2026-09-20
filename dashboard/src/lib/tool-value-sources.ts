import type { ToolDefinition, ToolRun } from "./tool-workspace";

export type ToolValueSource = { path: string; label: string; detail: string };
const safeKey = (key: string) =>
  /^[a-zA-Z0-9_-]+$/.test(key) &&
  !["__proto__", "constructor", "prototype"].includes(key);

/** Offer only steps that occur on every path from Input to this step. */
export function toolValueSources(
  definition: ToolDefinition,
  nodeId: string,
  run?: ToolRun,
): ToolValueSource[] {
  const root = definition.nodes.find((node) => node.type === "input");
  if (!root || root.id === nodeId) return [];
  const reachable = (blocked?: string) => {
    const seen = new Set<string>();
    const pending = [root.id];
    while (pending.length) {
      const id = pending.pop()!;
      if (id === blocked || seen.has(id)) continue;
      seen.add(id);
      definition.edges
        .filter((edge) => edge.source === id)
        .forEach((edge) => pending.push(edge.target));
    }
    return seen;
  };
  const connected = reachable();
  const sources: ToolValueSource[] = definition.inputs
    .filter((field) => safeKey(field.name))
    .map((field) => ({
      path: `$input.${field.name}`,
      label: field.name,
      detail: `Caller input · ${field.type}${field.required ? "" : " · optional"}`,
    }));
  if (!connected.has(nodeId)) return sources;
  sources.push({
    path: "$last",
    label: "Previous step result",
    detail: "The result on the branch that runs",
  });
  for (const node of definition.nodes) {
    if (
      node.id === nodeId ||
      node.id === root.id ||
      !connected.has(node.id) ||
      reachable(node.id).has(nodeId)
    )
      continue;
    const path = `$steps.${node.id}`;
    sources.push({ path, label: node.label, detail: "Complete step result" });
    const receipt = run?.steps.find(
      (step) => step.nodeId === node.id && step.status === "completed",
    );
    const fields = (value: unknown, prefix: string, depth: number) => {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        depth > 2
      )
        return;
      Object.entries(value)
        .slice(0, 30)
        .forEach(([key, nested]) => {
          if (!safeKey(key)) return;
          sources.push({
            path: `${prefix}.${key}`,
            label: `${node.label} / ${key}`,
            detail: "Field observed in this draft’s last test",
          });
          fields(nested, `${prefix}.${key}`, depth + 1);
        });
    };
    fields(receipt?.output, path, 1);
  }
  return sources;
}
