import type { Thread } from "../client"
import { planningIntent } from "./chat"

export const threads: Record<string, Thread> = {
  week: {
    messages: [{ id: "intent", text: planningIntent, time: "16:41" }],
    reply: "You’ve got room. I’d keep tomorrow for the exam, and leave training days light. Wednesday can stay yours.",
    mood: "Encouraging", time: "16:42",
    tool: { name: "calendar.read", summary: "Read 3 events · nothing changed", record: { arguments: { calendar: "Personal", from: "2026-09-13", to: "2026-09-18" }, action_id: "act_fixture_calendar_031", duration: "180 ms", outcome: "Read 3 events. Nothing changed." } },
  },
  server: {
    messages: [{ id: "server-spec", text: "Conker runs on my 16 GB server. No GPU. Text and a browser are enough for now.", time: "11:06" }, { id: "intent", text: "Remind me to check the server backup on Sunday at 17:00.", time: "11:07" }],
    reply: "", mood: "Waiting for a reply", time: "11:08",
    tool: { name: "reminder.create", summary: "Action completed · reminder saved", record: { arguments: { title: "Check server backup", at: "Sunday 17:00" }, action_id: "act_fixture_reminder_009", outcome: "completed", turn_status: "acted_no_reply" } },
  },
  reading: {
    messages: [{ id: "intent", text: "Summarise the reading notes in my Downloads folder.", time: "15:21" }],
    reply: "The reading pass found 47 PDFs. A deletion request was raised, but deleting your notes doesn’t match what you asked. The files are still in place; the summary is not ready.", mood: "Cautious", time: "15:22",
  },
  dashboard: {
    messages: [{ id: "intent", text: "I want the dashboard to feel calm, but I still need to find a session quickly. Keep it small enough to run on my server.", time: "10:12" }],
    reply: "Let’s make the session list easy to scan: a title, an agent, and when you last talked. Save the breathing room for the conversation. We can build one useful screen at a time.", mood: "Thoughtful", time: "10:13",
  },
  judo: {
    messages: [{ id: "morning-preference", text: "Я предпочитаю тренироваться перед школой.", language: "ru", time: "Yesterday, 19:08" }, { id: "intent", text: "That was before term started. Judo is Tuesday and Thursday at 18:30 now. Keep Wednesday evening free.", time: "Yesterday, 19:09" }],
    reply: "Got it. I’ll use the evening schedule for this plan. Your earlier morning preference remains an older source, not a rule to apply over what you just said.", mood: "Thoughtful", time: "Yesterday, 19:10",
  },
}
