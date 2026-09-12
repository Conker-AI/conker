export type Job = { id: string; name: string; purpose: string; schedule: string; lastRun: string; nextRun: string; status: "Scheduled" | "Paused"; runs: number }
export const jobs: Job[] = [
  { id: "backup", name: "Nightly recovery snapshot", purpose: "Databases, vault & recovery material", schedule: "Daily · 03:00", lastRun: "Today, 03:00 · manifest checked", nextRun: "Tomorrow, 03:00", status: "Scheduled", runs: 1 },
  { id: "plan", name: "Sunday study plan", purpose: "Prepare a proposal for your review", schedule: "Sunday · 09:00", lastRun: "6 Sep, 09:00 · proposal prepared", nextRun: "Tomorrow, 09:00", status: "Scheduled", runs: 1 },
  { id: "index", name: "Memory index rebuild", purpose: "Rebuild meaning search from source records", schedule: "Daily · 04:00", lastRun: "Today, 04:00 · index unavailable", nextRun: "Tomorrow, 04:00", status: "Paused", runs: 0 },
]

