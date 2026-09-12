import { inboxFixtures } from "../fixtures/inbox";
import { agentFixtures } from "../fixtures/agents";
import { toolFixtures } from "../fixtures/tools";
import { memoryFixtures } from "../fixtures/memory";
import { jobFixtures } from "../fixtures/jobs";
import { journalFixtures } from "../fixtures/journal";
import {
  serviceFixtures,
  databaseFixtures,
  hostFixtures,
  backupFixture,
  backupManifestFixture,
} from "../fixtures/system";
import { planningFixture } from "../fixtures/chat";
import type {
  Action,
  Approval,
  CharacterProfile,
  Contact,
  Group,
  Companion,
  Agent,
  Session,
  Message,
  Run,
  InboxItem,
  ProposalRecord,
  JournalEvent,
  Citation,
  Capability,
  ConversationPolicy,
} from "../domain/model";

export const policy: ConversationPolicy = {
  id: "local-retained",
  inference: "local",
  transcript: "retained",
  memoryRead: true,
  memoryWrite: true,
};
const session = (
  id: string,
  contactId: string,
  title: string,
  participantIds: string[],
  extra: Partial<Session> = {},
): Session => ({
  id,
  contactId,
  title,
  participantIds,
  policy,
  updatedAt: "2026-09-12T16:42:00",
  ...extra,
});
const message = (
  id: string,
  sessionId: string,
  role: Message["role"],
  text: string,
  extra: Partial<Message> = {},
): Message => ({
  id,
  sessionId,
  role,
  author: role === "user" ? "You" : "Conker",
  text,
  createdAt: "16:42",
  delivery: "accepted",
  ...extra,
});
function recordMap<T extends { id: string }>(records: T[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}
export function createDatabase() {
  const contacts: Contact[] = [
    {
      id: "home",
      name: "Conker",
      target: { kind: "companion", id: "primary" },
      initials: "C",
      subtitle: "Your companion · a little room for life",
      sessionIds: ["week", "server", "judo"],
    },
    {
      id: "workshop",
      name: "Workshop",
      target: { kind: "agent", id: "workshop" },
      initials: "W",
      subtitle: "Build, understand, make it work",
      sessionIds: ["build", "reading"],
    },
    {
      id: "study",
      name: "Study room",
      target: { kind: "group", id: "study-group" },
      initials: "SR",
      subtitle: "Conker + Workshop",
      sessionIds: ["exam"],
    },
  ];
  const sessions = [
    session("week", "home", "Make room for the week", ["conker"]),
    session("server", "home", "One less thing to remember", ["conker"]),
    session("judo", "home", "Training around school", ["conker"], {
      parentId: "week",
      parentMessageId: "week-user",
      summary:
        "A model-written summary: keep training days light. This may miss context.",
    }),
    session("build", "workshop", "The backup, one step at a time", [
      "workshop",
    ]),
    session("reading", "workshop", "Reading notes", ["workshop"]),
    session("exam", "study", "Functions without the fog", [
      "conker",
      "workshop",
    ]),
  ];
  const approvals: Approval[] = inboxFixtures
    .filter(
      (row): row is typeof row & { kind: "approval" } =>
        row.kind === "approval",
    )
    .map((row) => ({
      ...row,
      actionId: `action-${row.id}`,
      decideBy: row.decision,
      revision: 1,
      decision:
        row.lifecycle === "expired"
          ? "expired"
          : row.lifecycle === "consumed"
            ? "approved"
            : "pending",
    }));
  const actions: Action[] = approvals.map((row) => ({
    id: row.actionId,
    sessionId: row.source.split("/")[2].split("#")[0],
    tool: row.tool,
    args: row.args,
    approvalId: row.id,
    status:
      row.lifecycle === "consumed"
        ? "completed"
        : row.lifecycle === "expired"
          ? "expired"
          : "awaiting_approval",
    ...(row.lifecycle === "consumed"
      ? { receipt: "Fixture delivery receipt mail_017" }
      : {}),
  }));
  actions.push(
    {
      id: "calendar",
      sessionId: "week",
      tool: "calendar.read",
      args: planningFixture.tool.args,
      status: "completed",
      receipt: "Read 3 events. Nothing changed.",
    },
    {
      id: "reminder",
      sessionId: "server",
      tool: "reminder.create",
      args: { title: "Check server backup", at: "Sunday 17:00" },
      status: "completed",
      receipt: "Fixture reminder_009 saved.",
      replyMissing: true,
    },
    {
      id: "uncertain",
      sessionId: "build",
      tool: "backup.capture",
      args: { target: "conker-home" },
      status: "outcome_unknown",
    },
  );
  const messages = [
    message("week-user", "week", "user", planningFixture.intent),
    message("sent-user", "week", "user", "Reply to Mum about Sunday."),
    message("expired-user", "week", "user", "Check where my exam is."),
    message(
      "week-plan",
      "week",
      "assistant",
      "You’ve got room. Keep Sunday for the exam, and training days light. Wednesday can stay yours.\n\nSunday · two 25-minute revision blocks, then stop.\nMonday · maths exam at 09:00; nothing extra.\nTuesday & Thursday · back on the mat at 18:30.\n\nI drafted the message to coach. Have a look before anything leaves here.",
      {
        runId: "week-run",
        actionIds: ["calendar", "action-coach"],
        emotion: "thoughtful",
        citationIds: ["training"],
      },
    ),
    message(
      "server-spec",
      "server",
      "user",
      "Conker runs on my 16 GB server. No GPU. Text and a browser are enough for now.",
    ),
    message(
      "server-user",
      "server",
      "user",
      "Save a reminder to check the server backup on Sunday.",
    ),
    message(
      "server-receipt",
      "server",
      "assistant",
      "The reminder was saved. My reply didn’t arrive.",
      { actionIds: ["reminder"] },
    ),
    message(
      "morning-preference",
      "judo",
      "user",
      "Я предпочитаю тренироваться перед школой.",
    ),
    message(
      "judo-reply",
      "judo",
      "assistant",
      "Запомню это как предпочтение, а не как правило. С началом школы расписание могло измениться.",
      { emotion: "warm" },
    ),
    message(
      "build-user",
      "build",
      "user",
      "Can we check the backup before changing anything else?",
    ),
    message(
      "build-reply",
      "build",
      "assistant",
      "The connection dropped after dispatch. I don’t have a receipt yet. I’ll check the existing action before suggesting anything else.",
      { author: "Workshop", actionIds: ["uncertain"] },
    ),
    message(
      "reading-user",
      "reading",
      "user",
      "Summarise the reading notes in my Downloads folder.",
    ),
    message(
      "reading-reply",
      "reading",
      "assistant",
      "The requested operation needs review: deleting files is not summarising them.",
      { author: "Workshop", actionIds: ["action-cleanup"] },
    ),
    message(
      "exam-user",
      "exam",
      "user",
      "I get what a function is, but inverse functions still feel backwards.",
    ),
    message(
      "exam-reply",
      "exam",
      "assistant",
      "Let’s try it with a number. If f(x) = 2x + 3, what happened to 5? Now undo those steps in reverse order.",
      { emotion: "encouraging", runId: "exam-run" },
    ),
  ];
  const character: CharacterProfile = {
    id: "companion",
    name: "Conker",
    speakingStyle: "Clear, warm, never over-explaining.",
    personality: "Curious and grounded. Leave room for the owner’s judgement.",
    renderer: "static",
    assets: [],
    expressions: {
      neutral: null,
      warm: null,
      thoughtful: null,
      encouraging: null,
    },
  };
  return {
    contacts: recordMap(contacts),
    sessions: recordMap(sessions),
    messages: recordMap(messages),
    actions: recordMap(actions),
    approvals: recordMap(approvals),
    companion: {
      primary: {
        id: "primary",
        agentId: "conker",
        contactId: "home",
        characterId: "companion",
      } as Companion,
    },
    identities: recordMap<Agent>([
      {
        id: "conker",
        name: "Conker",
        role: "Companion",
        characterId: "companion",
      },
      { id: "workshop", name: "Workshop", role: "Software specialist" },
    ]),
    groups: {
      "study-group": {
        id: "study-group",
        name: "Study room",
        revision: 1,
        agentIds: ["conker", "workshop"],
      } as Group,
    },
    runs: {
      "week-run": {
        id: "week-run",
        sessionId: "week",
        submissionId: "week-user",
        messageId: "week-plan",
        status: "completed",
        cursor: 0,
        model: "Local ? Qwen 2.5 3B",
        costUsd: null,
        participantSnapshot: { agentIds: ["conker"] },
        policy,
        delegations: [],
      },
      "exam-run": {
        id: "exam-run",
        sessionId: "exam",
        submissionId: "exam-submission",
        messageId: "exam-reply",
        status: "completed",
        cursor: 0,
        model: "Local · Qwen 2.5 3B",
        costUsd: null,
        participantSnapshot: {
          agentIds: ["conker", "workshop"],
          groupRevision: 1,
        },
        policy,
        delegations: [
          {
            id: "scratch-worker",
            task: "Check the inverse-function example",
            outcome: "Example checked · ephemeral worker finished",
          },
        ],
      },
    } as Record<string, Run>,
    submissions: {} as Record<string, string>,
    inbox: recordMap<InboxItem>(
      inboxFixtures.map((row) => ({
        id: row.id,
        kind: row.kind,
        resourceId: row.id,
      })),
    ),
    proposals: recordMap<ProposalRecord>(
      inboxFixtures.filter(
        (row): row is ProposalRecord => row.kind === "proposal",
      ),
    ),
    journal: recordMap<JournalEvent>(
      journalFixtures.map((row) => ({
        ...row,
        ...(row.id === "j1"
          ? { actionId: "action-coach" }
          : row.id === "j2"
            ? { actionId: "calendar" }
            : row.id === "j3"
              ? { actionId: "action-cleanup" }
              : row.id === "j4"
                ? { actionId: "reminder" }
                : {}),
      })),
    ),
    citations: {
      training: {
        id: "training",
        sessionId: "week",
        messageId: "week-user",
        excerpt: "Judo is Tuesday and Thursday at 18:30",
        deleted: false,
      } as Citation,
    } as Record<string, Citation>,
    character: { companion: character },
    capabilities: recordMap<Capability>(
      ["reply", "emotion", "fork", "policy", "studio"]
        .map((id) => ({ id, supported: true, authorised: true }))
        .concat([
          { id: "deep-search", supported: false, authorised: true },
          { id: "terminal", supported: false, authorised: false },
        ]),
    ),
    agents: recordMap(agentFixtures),
    tools: recordMap(toolFixtures),
    memory: recordMap(
      memoryFixtures.map((row) => ({
        ...row,
        forgotten: false,
        correction: "",
      })),
    ),
    jobs: recordMap(
      jobFixtures.map((row) => ({ ...row, paused: false, runs: 0 })),
    ),
    system: {
      overview: {
        services: serviceFixtures,
        databases: databaseFixtures,
        host: hostFixtures,
        backup: backupFixture,
        manifest: backupManifestFixture,
      },
    },
    profile: {
      owner: { name: "Alexey", companion: "Conker", shape: "Practical" },
    },
  };
}
export const db = createDatabase();
export function log(
  summary: string,
  kind: string,
  to: string,
  actionId?: string,
) {
  const id = crypto.randomUUID();
  db.journal[id] = {
    id,
    actor: "You",
    summary,
    kind,
    to,
    actionId,
    date: "2026-09-12",
    time: "Now",
    detail: "Stateful fixture transition. No real action occurred.",
    evidence: { state: "planned", detail: "Preview record only." },
  };
}
