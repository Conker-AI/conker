import type { GatewayJobTiming } from './gateway/jobs'

/**
 * Starters: ready-made AI jobs on the Cron jobs screen ("Start from an idea"). A starter only fills
 * in the New AI job form (name, instructions, timing, agent); the owner changes what they like and
 * creates it with the usual password check. Nothing here runs, schedules or behaves on its own: a
 * starter is words and a suggested time, the same as typing them. Proactive work stays the owner's
 * instructions carried out by an agent with its tools (context/design/automation-and-access.md).
 *
 * Each one asks only for what an AI job can reach today: memory from the owner's chats, web search,
 * and tools the owner connects (named in `needs`). Pi has no monthly timing, so a monthly report
 * runs weekly and says in its instructions which week counts. Checked by
 * scripts/check-job-starters.cjs.
 */
export type JobStarterWhen =
  | { kind: 'daily'; time: string }
  | { kind: 'weekly'; day: number; time: string }
  | { kind: 'hours'; every: number }

export type JobStarter = {
  /** Stable lower-case words joined by dashes. */
  id: string
  /** The job's name, as the form fills it in. */
  name: string
  /** One plain sentence for the list. */
  summary: string
  /** What the agent should do, in the owner's words. */
  instructions: string
  when: JobStarterWhen
  /** Pi's default agent (the companion) when absent. */
  agentId?: string
  /** What it needs connected first, completing "It needs …". */
  needs?: string
}

/** The "Every few hours" choices of the New AI job form. */
export const jobIntervalHours = [1, 2, 3, 4, 6, 12] as const

export const jobStarters: readonly JobStarter[] = [
  {
    id: 'morning-brief',
    name: 'Morning brief',
    summary: 'What today holds and the one thing to do first.',
    instructions: 'Get me ready for today. Look at my calendar for today, the deadlines and plans you remember from my chats, and anything I said I’d do today. Tell me in a few short lines what today holds, anything due or overdue, and the one thing I should do first. Keep it short enough to read in a minute.',
    when: { kind: 'daily', time: '08:00' },
  },
  {
    id: 'homework-deadlines',
    name: 'Homework and deadlines',
    summary: 'Homework, exams and tasks due in the next three days.',
    instructions: 'Look for homework, assignments, exams and other deadlines in the next three days, from my calendar and what you remember from my chats. Tell me only about the ones that aren’t done yet: what it is, when it’s due, and what’s left to do. Offer to help with the hardest one. If nothing is due soon, stay quiet.',
    when: { kind: 'daily', time: '16:00' },
  },
  {
    id: 'evening-wrap-up',
    name: 'Evening wrap-up',
    summary: 'What you got done today, what’s still open, and tomorrow.',
    instructions: 'Wrap up my day. From what you remember of today’s chats and my calendar, list in a few short lines what I got done, what’s still open, and what’s coming tomorrow. If something I planned for today slipped, suggest when to fit it in. If the day was quiet and tomorrow is clear, stay quiet.',
    when: { kind: 'daily', time: '21:00' },
  },
  {
    id: 'proactive-check',
    name: 'Proactive check',
    summary: 'Looks around and speaks up only when something needs you.',
    instructions: 'Look around for anything that needs me now or soon: deadlines coming up, things I said I’d do and haven’t, people waiting for my answer, and anything new in the tools you can read. If something needs me, tell me in one line, then what you can do about it. If nothing does, stay quiet.',
    when: { kind: 'hours', every: 4 },
  },
  {
    id: 'event-reminders',
    name: 'Event reminders',
    summary: 'A heads-up before each event in your calendar.',
    instructions: 'Check my calendar for events that start in the next hour. For each one you haven’t reminded me about yet, tell me the time, the place or link, and anything I should bring or prepare. If nothing starts soon, stay quiet.',
    when: { kind: 'hours', every: 1 },
    needs: 'a calendar tool, like a Google Calendar MCP server',
  },
  {
    id: 'email-triage',
    name: 'Email triage',
    summary: 'New email sorted into needs you, can wait and noise.',
    instructions: 'Look at the email I got since your last run. List the messages that need me today, one line each with why. Count the rest as “can wait” or “noise”. If a message needs only a short reply, draft one for me to check, but don’t send anything. If nothing needs me, stay quiet.',
    when: { kind: 'hours', every: 3 },
    needs: 'an email tool, like a Gmail MCP server',
  },
  {
    id: 'study-group-digest',
    name: 'Study group digest',
    summary: 'What your study group decided and asked you today.',
    instructions: 'Read what my study group wrote today. Tell me what they decided, any questions for me, tasks someone gave me, and new deadlines. Leave out small talk. Don’t reply to the group for me. If nothing new happened, stay quiet.',
    when: { kind: 'daily', time: '20:00' },
    needs: 'a tool that reads your group chat, like a Telegram or Discord MCP server',
  },
  {
    id: 'gig-watcher',
    name: 'Freelance gig watcher',
    summary: 'New freelance gigs that fit your skills, with links.',
    instructions: 'Search the web for new freelance gigs and small paid projects that fit my skills and interests, from what you know about me. Tell me only about ones you haven’t told me about before: the title, the pay if it’s listed, the link, and one line on why it fits. Skip anything that looks like a scam or asks me to pay first. If there’s nothing new and good, stay quiet.',
    when: { kind: 'hours', every: 6 },
  },
  {
    id: 'check-in',
    name: 'Check-in',
    summary: 'Asks how you’re doing when you seem stuck.',
    instructions: 'Think about what you remember from my recent chats. If I seem stuck on something, stressed, or have gone quiet on something I care about, ask me in one or two friendly lines how it’s going, and offer one concrete way you can help. If everything looks fine, stay quiet.',
    when: { kind: 'daily', time: '18:00' },
  },
  {
    id: 'break-reminder',
    name: 'Break reminder',
    summary: 'A short reminder to rest, every two hours outside quiet hours.',
    instructions: 'Remind me in one short line to take a five-minute break: stand up, drink some water and look away from the screen. Word it a little differently each time.',
    when: { kind: 'hours', every: 2 },
  },
  {
    id: 'weekly-review',
    name: 'Weekly review',
    summary: 'Your week looked back on, and what matters next week.',
    instructions: 'Look back at my week, from my calendar and what you remember from my chats. Tell me what I got done, what slipped and why it might have, and the three things that matter most next week. Keep it short and honest, and end with one change that would make next week easier.',
    when: { kind: 'weekly', day: 0, time: '18:00' },
  },
  {
    id: 'monthly-spending',
    name: 'Monthly spending report',
    summary: 'Last month’s spending, on the first Monday of each month.',
    instructions: 'This runs every Monday. Only in the first week of the month (the 1st to the 7th), report on last month; on other Mondays there’s nothing for me. Look at what I spent last month: the total, the biggest items, the categories, and how it compares with the month before. Point out anything unusual and any subscription I could cancel.',
    when: { kind: 'weekly', day: 1, time: '09:00' },
    needs: 'a tool that reads your spending, like a bank or budgeting app’s MCP server',
  },
]

/** The timing Pi stores for a starter, exactly as the New AI job form sends it. */
export function starterTiming(when: JobStarterWhen): GatewayJobTiming {
  if (when.kind === 'hours') return { kind: 'interval', time: '00:00', day: 0, hours: when.every }
  return { kind: when.kind, time: when.time, day: when.kind === 'weekly' ? when.day : 0, hours: 24 }
}
