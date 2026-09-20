import type { TaskStatus } from "@/lib/api/task-types"

export const taskLabels: Record<TaskStatus, string> = { planned: "Planned", in_progress: "In progress", blocked: "Blocked", completed: "Completed", cancelled: "Cancelled" }
export const isTerminal = (status: TaskStatus) => status === "completed" || status === "cancelled"
export function displayTime(value: string | null) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Time not recorded" }
export const taskHref = (id: string) => `/activity?tab=tasks&task=${encodeURIComponent(id)}`
export const runHref = (id: string) => `/activity?tab=runs&run=${encodeURIComponent(id)}`
