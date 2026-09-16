import type { JobInput, JobTiming } from "./models"

export const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
export const jobTimeZones = ["Asia/Jerusalem", "UTC", "Europe/London", "America/New_York"]

export function describeJobTiming(timing: JobTiming) {
  if (timing.kind === "interval") return `Every ${timing.hours} ${timing.hours === 1 ? "hour" : "hours"}`
  return `${timing.kind === "daily" ? "Daily" : weekdays[timing.day]} · ${timing.time}`
}

export function jobInputErrors(input: JobInput): Partial<Record<keyof JobInput, string>> {
  const errors: Partial<Record<keyof JobInput, string>> = {}
  if (!input.name.trim() || input.name.trim().length > 80) errors.name = "Give the job a name, up to 80 characters."
  if (!input.instructions.trim() || input.instructions.trim().length > 4000) errors.instructions = "Describe what the job should do, up to 4,000 characters."
  if (!input.agentId) errors.agentId = "Choose an agent."
  const timing = input.timing
  if (!["daily", "weekly", "interval"].includes(timing.kind)) errors.timing = "Choose a schedule."
  else if (timing.kind === "interval" && (!Number.isInteger(timing.hours) || timing.hours < 1 || timing.hours > 168)) errors.timing = "Use a whole number between 1 and 168 hours."
  else if (timing.kind !== "interval" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timing.time)) errors.timing = "Choose a valid time."
  else if (timing.kind === "weekly" && (!Number.isInteger(timing.day) || timing.day < 0 || timing.day > 6)) errors.timing = "Choose a day of the week."
  try { if (!input.timeZone) throw new Error(); new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format() }
  catch { errors.timeZone = "Choose a valid time zone." }
  return errors
}

export function normalizeJobInput(input: JobInput): JobInput {
  const error = Object.values(jobInputErrors(input))[0]
  if (error) throw new Error(error)
  return { ...structuredClone(input), name: input.name.trim(), instructions: input.instructions.trim() }
}
