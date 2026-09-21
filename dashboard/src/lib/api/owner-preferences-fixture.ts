import type { OwnerPreferences, OwnerPreferencesClient } from "./owner-preferences-types"

export function validateOwnerPreferences(value: OwnerPreferences): OwnerPreferences {
  if (!value || !value.quietHours || !value.dailyBudget) throw new Error("Provide all owner preference fields.")
  const quiet = value.quietHours, budget = value.dailyBudget
  if (typeof quiet.enabled !== "boolean" || typeof quiet.urgentExceptions !== "boolean") throw new Error("Choose valid quiet-hour options.")
  if (![quiet.start, quiet.end].every(time => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error("Use valid start and end times for quiet hours.")
  if (quiet.enabled && quiet.start === quiet.end) throw new Error("Quiet hours need different start and end times. Overnight windows are supported.")
  const timeZone = typeof quiet.timeZone === "string" ? quiet.timeZone.trim() : ""
  if (!timeZone || timeZone.length > 100) throw new Error("Enter a valid IANA time zone, such as Asia/Jerusalem.")
  try { new Intl.DateTimeFormat("en", { timeZone }).format() } catch { throw new Error("Enter a valid IANA time zone, such as Asia/Jerusalem.") }
  if (!["meaningful", "urgent_only", "off"].includes(value.urgency)) throw new Error("Choose a notification urgency preference.")
  if (!Number.isInteger(budget.suggestions) || budget.suggestions < 0 || budget.suggestions > 100) throw new Error("Use 0–100 suggestions per day.")
  if (!Number.isInteger(budget.researchMinutes) || budget.researchMinutes < 0 || budget.researchMinutes > 1440) throw new Error("Use 0–1440 research minutes per day.")
  if (!Number.isInteger(budget.costCents) || budget.costCents < 0 || budget.costCents > 100000) throw new Error("Use a daily cost ceiling from $0 to $1,000, in whole cents.")
  if (![0, 5, 15, 30, 60].includes(value.idleTimeoutMinutes)) throw new Error("Choose an available idle timeout.")
  return { quietHours: { enabled: quiet.enabled, start: quiet.start, end: quiet.end, timeZone, urgentExceptions: quiet.urgentExceptions }, urgency: value.urgency, dailyBudget: { suggestions: budget.suggestions, researchMinutes: budget.researchMinutes, costCents: budget.costCents }, idleTimeoutMinutes: value.idleTimeoutMinutes }
}

/** Configuration preview only: no timers, notifications, grants, or authentication. */
export function createOwnerPreferencesFixture(): OwnerPreferencesClient {
  let saved: OwnerPreferences = { quietHours: { enabled: true, start: "22:00", end: "07:00", timeZone: "Asia/Jerusalem", urgentExceptions: false }, urgency: "meaningful", dailyBudget: { suggestions: 4, researchMinutes: 30, costCents: 0 }, idleTimeoutMinutes: 15 }
  return {
    async load() { return structuredClone(saved) },
    async save(value) { const next = validateOwnerPreferences(value); saved = next; return structuredClone(saved) },
  }
}
