export type Session = { id: string; title: string; agent: string; subtitle: string; updated: string; minutesAgo: number; pinned: boolean; mode: "plan" | "receipt" | "quiet" | "reading" | "project" }
export const sessions: Session[] = [
  { id: "week", title: "Make room for the week", agent: "Conker", subtitle: "Study, training, and a little breathing room", updated: "1 min ago", minutesAgo: 1, pinned: true, mode: "plan" },
  { id: "reading", title: "The reading notes", agent: "Workshop", subtitle: "A summary request with an unexpected deletion", updated: "1 hr ago", minutesAgo: 81, pinned: false, mode: "reading" },
  { id: "server", title: "One less thing to remember", agent: "Conker", subtitle: "Sunday’s server backup reminder", updated: "5 hr ago", minutesAgo: 335, pinned: false, mode: "receipt" },
  { id: "judo", title: "Training around school", agent: "Conker", subtitle: "Branched from Make room for the week", updated: "Yesterday", minutesAgo: 1293, pinned: true, mode: "quiet" },
  { id: "dashboard", title: "A dashboard that earns its space", agent: "Workshop", subtitle: "Small components, clear boundaries", updated: "2 days ago", minutesAgo: 2880, pinned: false, mode: "project" },
]
export const plan = [
  { day: "SUN", date: "13", title: "A little revision, then stop", detail: "Two 25-minute blocks · functions & past questions" },
  { day: "MON", date: "14", title: "Maths exam", detail: "09:00 · nothing extra on the plan" },
  { day: "TUE / THU", date: "", title: "Back on the mat", detail: "18:30 · pack your judogi before school" },
]
export const planningIntent = "Judo is Tuesday and Thursday at 18:30, and my maths exam is Monday. Help me leave room to study. Also ask coach if Friday’s open mat is on."

