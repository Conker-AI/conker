import type { Snapshot } from "@/lib/api/client"

/**
 * Shared view of the current snapshot, refreshed after every store mutation.
 * The plan and activity inherit the briefing's source date and sample/live mode;
 * this selector does not turn a suggested plan into confirmed calendar events.
 */
export function getDailyOverview(snapshot: Snapshot) {
  const planningSession = snapshot.sessions.find(session => session.mode === "plan")
  return {
    planSource: planningSession ? `/chat/${planningSession.id}` : "/companion",
    briefing: snapshot.dailyBriefing,
    companionSession: snapshot.sessions.find(session => session.id === snapshot.companionSessionId),
    pendingTickets: snapshot.tickets.filter(ticket => ticket.status === "Needs you"),
    agenda: snapshot.plan,
    recentActivity: snapshot.entries.slice(0, 4),
    jobs: snapshot.jobs,
    recentSessions: snapshot.sessions
      .filter(session => session.id !== snapshot.companionSessionId && !session.archived)
      .sort((a, b) => a.minutesAgo - b.minutesAgo)
      .slice(0, 3),
  }
}
