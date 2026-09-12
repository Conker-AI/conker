export type Tool = { id: string; name: string; purpose: string; sensitivity: "Observe" | "Prepare" | "Act locally" | "Act outward"; scope: string; recentUse: string }
export const tools: Tool[] = [
  { id: "calendar", name: "calendar.read", purpose: "Read events from your personal calendar", sensitivity: "Observe", scope: "Conker", recentUse: "1 min ago · 3 events" },
  { id: "mail-read", name: "email.read", purpose: "Read messages within the mail grant", sensitivity: "Observe", scope: "Conker", recentUse: "24 min ago · 2 messages" },
  { id: "mail-draft", name: "email.draft", purpose: "Prepare a message for your review", sensitivity: "Prepare", scope: "Conker", recentUse: "1 min ago · coach draft" },
  { id: "mail-send", name: "email.send", purpose: "Deliver an email outside your server", sensitivity: "Act outward", scope: "Conker · approval required", recentUse: "Yesterday · mail_017" },
  { id: "notes", name: "files.read", purpose: "Read scoped project and study notes", sensitivity: "Observe", scope: "Workshop", recentUse: "1 hr ago · 47 PDFs" },
  { id: "delete", name: "files.delete", purpose: "Permanently remove scoped files", sensitivity: "Act locally", scope: "Workshop · approval required", recentUse: "Blocked · no deletion" },
  { id: "reminder", name: "reminder.create", purpose: "Save a reminder on your server", sensitivity: "Act locally", scope: "Conker", recentUse: "5 hr ago · receipt retained" },
  { id: "host", name: "system.status", purpose: "Read host telemetry; no shell access", sensitivity: "Observe", scope: "Conker, Workshop", recentUse: "7 min ago · stale sample" },
]

