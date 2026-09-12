import type { StatusEvidence } from "../ui";
import { fixtureLive } from "./shared";
export type JournalEntry = {
  id: string;
  time: string;
  date: string;
  actor: string;
  kind: string;
  summary: string;
  detail: string;
  to: string;
  evidence: StatusEvidence;
};
export const journalFixtures: JournalEntry[] = [
  {
    id: "j1",
    time: "16:43",
    date: "2026-09-12",
    actor: "Conker",
    kind: "Decision",
    summary: "A message to coach is waiting for your review",
    detail:
      "email.send · no external effect. Draft and intent are bound to one request.",
    to: "/inbox/coach",
    evidence: {
      state: "blocked",
      detail: "Waiting for your decision. Nothing sent.",
    },
  },
  {
    id: "j2",
    time: "16:42",
    date: "2026-09-12",
    actor: "Conker",
    kind: "Action",
    summary: "Read three events from your calendar",
    detail:
      "calendar.read · Personal · 13–18 September. Read-only action; no calendar change.",
    to: "/chat/week",
    evidence: fixtureLive("Fixture execution receipt act_calendar_031."),
  },
  {
    id: "j3",
    time: "15:22",
    date: "2026-09-12",
    actor: "Workshop",
    kind: "Decision",
    summary: "Deletion requested while summarising reading notes",
    detail:
      "files.delete · 47 PDFs. The proposed action does not match the owner’s request.",
    to: "/inbox/cleanup",
    evidence: {
      state: "blocked",
      detail: "Intent mismatch. Files remain in place.",
    },
  },
  {
    id: "j4",
    time: "11:08",
    date: "2026-09-12",
    actor: "Conker",
    kind: "Failure",
    summary: "A reminder was saved, but the reply timed out",
    detail:
      "acted_no_reply · reminder.create completed. Resuming requests only a reply.",
    to: "/chat/server",
    evidence: {
      state: "degraded",
      detail: "The action ran. The model reply is missing.",
    },
  },
  {
    id: "j5",
    time: "03:00",
    date: "2026-09-12",
    actor: "System",
    kind: "Job",
    summary: "Created the nightly recovery snapshot",
    detail:
      "4.2 GB · Postgres, Pi database, ToolGate vault and recovery material. Manifest checked; this snapshot’s restore drill is not run.",
    to: "/system",
    evidence: {
      state: "unknown",
      detail: "Snapshot exists; recoverability is unproven.",
    },
  },
  {
    id: "j6",
    time: "19:10",
    date: "2026-09-11",
    actor: "You",
    kind: "Fork",
    summary: "Branched the training conversation",
    detail:
      "A new thread, linked to its parent. The model summary remains untrusted context.",
    to: "/chat/judo",
    evidence: fixtureLive("Fixture session parent link recorded."),
  },
  {
    id: "j7",
    time: "18:02",
    date: "2026-09-11",
    actor: "Conker",
    kind: "Action",
    summary: "Sent your reply about Sunday lunch",
    detail:
      "You: ?Reply to Mum about Sunday.? Owner approval consumed once. Fixture delivery receipt is retained.",
    to: "/inbox/sent",
    evidence: fixtureLive("Fixture receipt mail_017."),
  },
  {
    id: "j8",
    time: "18:20",
    date: "2026-09-10",
    actor: "Conker",
    kind: "Turn",
    summary: "Noted what worked in a short revision block",
    detail:
      "You: ‘Two 25-minute blocks were enough to get through the questions.’ Earlier notes on 6 and 8 September described revision running into dinner. This is limited evidence, not a firm preference.",
    to: "/memory/study",
    evidence: {
      state: "unknown",
      detail: "Pattern is tentative; owner confirmation is missing.",
    },
  },
];
