import type { Approval, Proposal } from "../domain/approval-description";
export type { Approval, Proposal } from "../domain/approval-description";
export { approvalTitle, toolTemplates } from "../domain/approval-description";
export const inboxFixtures: (Approval | Proposal)[] = [
  {
    kind: "approval",
    id: "coach",
    tool: "email.send",
    agent: "Conker",
    args: {
      to: "Daniel <coach@dojo.example>",
      subject: "Friday’s open mat",
      body: "Hi Daniel, is open mat running this Friday at 17:00? I’d like to come if there’s space. Thanks, Alexey",
    },
    asked: "Also ask coach if Friday’s open mat is on.",
    source: "/chat/week#week-user",
    reversible: "This email cannot be unsent once delivered.",
    reason:
      "Sending mail acts outward. Your current grant covers reading mail and preparing drafts only.",
    grant: "mail-drafts · read and prepare · no sending",
    budget: "€0 of €0 · 0 of 3 draft preparations used today",
    digest: "7e34ba37c2aead673fef6021e371856611dbe2926301a5934a2cdb593cdbefc92",
    decision: "Today, 21:00",
    spendSeconds: 120,
    lifecycle: "pending",
  },
  {
    kind: "proposal",
    id: "revision",
    title: "Keep Sunday’s revision short",
    noticed:
      "Your last three long revision blocks ran into the evening. The shorter ones finished before dinner.",
    evidence: "Study notes · 6, 8 and 10 September",
    source: "/memory/study",
    effect:
      "Prepare two 25-minute calendar blocks for Sunday at 10:00 and 11:00. You’ll review the times before any calendar change.",
  },
  {
    kind: "approval",
    id: "cleanup",
    tool: "files.delete",
    agent: "Workshop",
    args: { directory: "/home/alexey/Downloads", count: 47, pattern: "*.pdf" },
    asked: "Summarise the reading notes in my Downloads folder.",
    source: "/chat/reading#reading-user",
    intentEvidence: {
      matches: false,
      detail:
        "Intent mismatch: summarising notes does not require deleting them.",
    },
    reversible:
      "Permanent deletion. These files are outside the last verified backup.",
    reason:
      "Deletion is outside the reading grant. The requested action does not match your request to summarise.",
    grant: "reading-notes · observe only",
    budget: "0 deletions allowed without a separate decision",
    digest: "eb50de5f11a8d0e70a583f96f21ea8f26359d04c08a0d083c20cc738f1db95441",
    decision: "Today, 20:00",
    spendSeconds: 60,
    lifecycle: "pending",
  },
  {
    kind: "approval",
    id: "sent",
    tool: "email.send",
    agent: "Conker",
    args: {
      to: "Mum <mum@example.test>",
      subject: "Sunday lunch",
      body: "Yes, 14:00 works. See you then!",
    },
    asked: "Reply to Mum about Sunday.",
    source: "/chat/week#sent-user",
    reversible: "Delivered emails cannot be unsent.",
    reason: "Sending mail acts outward.",
    grant: "mail-drafts · prepare only",
    budget: "€0 charged",
    digest: "2f91d30ee3e1d4c6e629284a615d172f778543bcb6bb981d978033d67885ebdf",
    decision: "Yesterday, 19:00",
    spendSeconds: 120,
    lifecycle: "consumed",
  },
  {
    kind: "approval",
    id: "expired",
    tool: "email.send",
    agent: "Conker",
    args: {
      to: "School office <office@school.example>",
      subject: "Exam room",
      body: "Which room is Monday’s maths exam in?",
    },
    asked: "Check where my exam is.",
    source: "/chat/week#expired-user",
    reversible: "Delivered emails cannot be unsent.",
    reason: "Sending mail acts outward.",
    grant: "mail-drafts · prepare only",
    budget: "No spend",
    digest: "98e8f079fd26a4d9709b7f107adbbf29a92d04bff582f1c232ef52b01821d1ac",
    decision: "Yesterday, 18:00 · elapsed",
    spendSeconds: 120,
    lifecycle: "expired",
  },
];
