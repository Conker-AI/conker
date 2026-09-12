export type Approval = {
  kind: "approval";
  id: string;
  tool: "email.send" | "files.delete";
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
  return toolTemplates[item.tool].template.replace(
    /\{(\w+)\}/g,
    (_, key: string) => String(item.args[key] ?? "[missing argument]"),
  );
}
