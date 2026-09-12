export type Session = {
  id: string;
  title: string;
  date: string;
  parent?: string;
  mode: "plan" | "receipt" | "quiet";
  summary?: string;
};
export const sessionFixtures: Session[] = [
  {
    id: "week",
    title: "Make room for the week",
    date: "Today · 16:42",
    mode: "plan",
  },
  {
    id: "server",
    title: "One less thing to remember",
    date: "Today · 11:08",
    mode: "receipt",
  },
  {
    id: "judo",
    title: "Training around school",
    date: "Yesterday",
    parent: "week",
    mode: "quiet",
    summary:
      "Judo on Tuesdays and Thursdays. Keep Wednesday evening free. This model summary may miss context.",
  },
];
export const planningFixture = {
  intent:
    "Judo is Tuesday and Thursday at 18:30, and my maths exam is Monday. Help me leave room to study. Also ask coach if Friday’s open mat is on.",
  reply:
    "You’ve got room. I’d keep tomorrow for the exam, and leave training days light. Wednesday can stay yours.",
  plan: [
    {
      day: "Sun",
      date: "13",
      title: "A little revision, then stop",
      detail: "Two 25-minute blocks · functions & past questions",
    },
    {
      day: "Mon",
      date: "14",
      title: "Maths exam",
      detail: "09:00 · nothing extra on the plan",
    },
    {
      day: "Tue / Thu",
      date: "",
      title: "Back on the mat",
      detail: "18:30 · pack your judogi before school",
    },
  ],
  tool: {
    name: "calendar.read",
    args: { calendar: "Personal", from: "2026-09-13", to: "2026-09-18" },
    outcome: "Read 3 events. Nothing changed.",
    actionId: "act_fixture_calendar_031",
    duration: "180 ms",
  },
};

export const reminderReceiptFixture = {
  tool: "reminder.create",
  args: { title: "Check server backup", at: "Sunday 17:00" },
  outcome: "completed",
  action_id: "act_fixture_reminder_009",
};
export const sourceMessageFixtures: Record<
  string,
  { id: string; date: string; text: string }
> = {
  judo: {
    id: "morning-preference",
    date: "25 August ? earlier source conversation",
    text: "? ??????????? ????????????? ????? ??????.",
  },
  server: {
    id: "server-spec",
    date: "8 September ? earlier in this conversation",
    text: "Conker runs on my 16 GB server. No GPU. Text and a browser are enough for now.",
  },
};
