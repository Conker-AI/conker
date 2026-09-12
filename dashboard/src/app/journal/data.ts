export type JournalEntry = {
  id: string
  time: string
  actor: string
  event: string
  detail: string
  source: string
}
export const entries: JournalEntry[] = [
  {
    id: "j1",
    time: "Today · 16:43",
    actor: "Conker",
    event: "Approval requested",
    detail: "email.send · coach draft waiting for your decision. Nothing sent.",
    source: "/inbox/coach",
  },
  {
    id: "j2",
    time: "Today · 16:42",
    actor: "Conker",
    event: "Calendar read",
    detail: "Read 3 events · Personal · 13–18 September. No calendar change.",
    source: "/chat/week",
  },
  {
    id: "j3",
    time: "Today · 15:22",
    actor: "Workshop",
    event: "Intent mismatch",
    detail:
      "files.delete · 47 PDFs requested while summarising. Files remain in place.",
    source: "/inbox/cleanup",
  },
  {
    id: "j4",
    time: "Today · 11:08",
    actor: "Conker",
    event: "Acted, no reply",
    detail:
      "reminder.create completed, but the model reply timed out. Do not repeat the action.",
    source: "/chat/server",
  },
  {
    id: "j5",
    time: "Today · 03:00",
    actor: "System",
    event: "Recovery snapshot",
    detail:
      "4.2 GB · manifest checked. This snapshot’s restore drill has not run; recoverability is unproven.",
    source: "/system",
  },
  {
    id: "j6",
    time: "Yesterday · 19:10",
    actor: "You",
    event: "Conversation branched",
    detail:
      "Training thread linked to its parent. The model summary remains untrusted context.",
    source: "/chat/judo",
  },
  {
    id: "j7",
    time: "Yesterday · 18:02",
    actor: "Conker",
    event: "Email delivered",
    detail:
      "Sunday lunch · owner approval consumed once. Fixture receipt mail_017 retained.",
    source: "/inbox/sent",
  },
  {
    id: "j8",
    time: "10 Sep · 18:20",
    actor: "Conker",
    event: "Pattern noted",
    detail:
      "Two 25-minute revision blocks finished before dinner. Limited evidence, not a firm preference.",
    source: "/memory#study",
  },
]
