export type Approval = {
  kind: "approval";
  id: string;
  tool: string;
  intentEvidence?: { matches: boolean; detail: string };
  agent: string;
  args: Record<string, string | number>;
  asked: string;
  source: string;
  reversible: string;
  reason: string;
  grant: string;
  budget: string;
  digest: string;
  decision: string;
  spendSeconds: number;
  lifecycle: "pending" | "consumed" | "expired";
};
export type Proposal = {
  kind: "proposal";
  id: string;
  title: string;
  noticed: string;
  evidence: string;
  source: string;
  effect: string;
};
export const toolTemplates = {
  "email.send": {
    service: "Mail",
    effect: "External",
    template: "Send an email to {to}",
    fields: { to: "To", subject: "Subject", body: "Message" },
  },
  "files.delete": {
    service: "Files",
    effect: "Deletion",
    template: "Delete {count} files from {directory}",
    fields: { directory: "Folder", count: "Files", pattern: "Matching" },
  },
} as const;
export function approvalTitle(item: Approval) {
  return toolDefinition(item.tool).template.replace(
    /\{(\w+)\}/g,
    (_, key: string) => String(item.args[key] ?? "[missing argument]"),
  );
}

export function toolDefinition(tool: string) {
  return Object.hasOwn(toolTemplates, tool)
    ? toolTemplates[tool as keyof typeof toolTemplates]
    : {
        service: tool,
        effect: "Unknown",
        template: "Review unsupported tool: " + tool,
        fields: {},
      };
}
