export type Memory = { id: string; text: string; category: string; confidence: string; age: string; provenance: string; source: string; language?: string }
export const memories: Memory[] = [
  { id: "judo", text: "Judo is on Tuesdays and Thursdays at 18:30.", category: "Training", confidence: "High", age: "Today", provenance: "You said this directly · one source message", source: "/chat/week#intent" },
  { id: "study", text: "Short revision blocks leave more of the evening free.", category: "School", confidence: "Tentative", age: "2 days", provenance: "Inferred from 3 study notes · not confirmed by you", source: "/journal?actor=Conker" },
  { id: "mornings", text: "Я предпочитаю тренироваться перед школой.", category: "Preference", confidence: "Medium", age: "18 days", provenance: "Your own words · before term started", source: "/chat/judo#morning-preference", language: "ru" },
  { id: "server", text: "Conker runs on your own 16 GB server, without a GPU.", category: "Projects", confidence: "High", age: "4 days", provenance: "You stated this during server setup", source: "/chat/server#server-spec" },
]

