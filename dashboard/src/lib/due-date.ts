/** A due day as people say it: "Fri 20 Nov". The input is YYYY-MM-DD, a day without a time zone. */
export function dueLabel(day: string): string {
  const parsed = new Date(`${day}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return day
  return parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
