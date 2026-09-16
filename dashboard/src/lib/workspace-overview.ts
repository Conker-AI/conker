import type { Snapshot } from "@/lib/api/client"

/** Home summarizes Conker's work. Personal planning belongs to connected apps. */
export function getWorkspaceOverview(snapshot: Snapshot) {
  return {
    pendingTickets: snapshot.tickets.filter(ticket => ticket.status === "Needs you"),
    recentActivity: snapshot.entries.slice(0, 4),
    recentSessions: snapshot.sessions
      .filter(session => session.id !== snapshot.companionSessionId && !session.archived && !session.isDraft)
      .sort((a, b) => a.minutesAgo - b.minutesAgo)
      .slice(0, 3),
    enabledJobs: snapshot.jobs.filter(job => job.status === "Scheduled").length,
    pausedJobs: snapshot.jobs.filter(job => job.status === "Paused").length,
  }
}
