/**
 * How the dashboard writes times and dates, from the owner's choices in Settings > You (time format and
 * date format). Both start at "Follow this device", which is exactly what the browser writes on its own,
 * so nothing changes until he picks. A pick changes only the hour cycle and the order of day, month and
 * year: the fields each screen shows stay its own. Answers Conker writes are not touched. A screen
 * already open shows a new pick when it next draws.
 */
export type TimeFormat = 'device' | '24h' | '12h'
export type DateOrder = 'device' | 'dmy' | 'mdy' | 'ymd'
export type DateFormatChoice = { time: TimeFormat; date: DateOrder }
type When = Date | number | string

/** Both left at "Follow this device". */
export const DEVICE_DATE_FORMAT: DateFormatChoice = { time: 'device', date: 'device' }
/** What `toLocaleString()`, `toLocaleDateString()` and `toLocaleTimeString()` show when given no fields. */
const DATE_TIME: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }
const DATE_ONLY: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' }
const TIME_ONLY: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', second: 'numeric' }
/** English word order for each pick; the screens around the dates are in English too. */
const ORDER_LOCALE = { dmy: 'en-GB', mdy: 'en-US' } as const

let current: DateFormatChoice = DEVICE_DATE_FORMAT

/**
 * The owner's choice as the settings sync last saw it (src/settings/appearance.ts sets it when the app
 * starts and whenever his settings change). Kept here, with no imports, so any module can format a date.
 */
export function dateFormatChoice(): DateFormatChoice {
  return current
}

export function setDateFormatChoice(choice: DateFormatChoice): void {
  current = choice
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(locale: string | undefined, options: Intl.DateTimeFormatOptions) {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let found = formatters.get(key)
  if (!found) formatters.set(key, (found = new Intl.DateTimeFormat(locale, options)))
  return found
}

const hasTime = (options: Intl.DateTimeFormatOptions) => !!(options.hour || options.minute || options.second || options.timeStyle)
const hasDate = (options: Intl.DateTimeFormatOptions) => !!(options.year || options.month || options.day || options.weekday || options.dateStyle)

/** The hour cycle to use: the pick, or this device's own when the words follow another order. */
function hourCycle(time: TimeFormat, forced: boolean): Intl.DateTimeFormatOptions['hourCycle'] {
  if (time === '24h') return 'h23'
  if (time === '12h') return 'h12'
  return forced ? formatter(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle : undefined
}

/** Year, month and day as numbers, biggest first (2026-10-28), with the time after it. */
function yearFirst(date: Date, options: Intl.DateTimeFormatOptions, cycle: Intl.DateTimeFormatOptions['hourCycle']) {
  const { dateStyle, timeStyle, timeZone } = options
  const style: Intl.DateTimeFormatOptions = dateStyle ? { year: 'numeric', month: 'numeric', day: 'numeric', weekday: dateStyle === 'full' ? 'long' : undefined } : options
  const out: string[] = []
  if (style.weekday) out.push(formatter(undefined, { weekday: style.weekday, timeZone }).format(date))
  if (style.year || style.month || style.day) {
    const parts = formatter('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date)
    const part = (type: string) => parts.find(item => item.type === type)?.value
    out.push([style.year && part('year'), style.month && part('month'), style.day && part('day')].filter(Boolean).join('-'))
  }
  if (hasTime(options)) {
    const time: Intl.DateTimeFormatOptions = timeStyle ? { timeStyle } : { hour: options.hour, minute: options.minute, second: options.second }
    out.push(formatter(undefined, { ...time, timeZoneName: options.timeZoneName, timeZone, hourCycle: cycle }).format(date))
  }
  return out.join(' ')
}

/**
 * A time and/or date in the owner's format. `options` names the fields to show, as for
 * `Intl.DateTimeFormat`; left out, it shows what `toLocaleString()` shows.
 */
export function formatDateTime(value: When, options: Intl.DateTimeFormatOptions = DATE_TIME, choice: DateFormatChoice = dateFormatChoice()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown time'
  const fields = { ...options, hour12: undefined }
  const order = hasDate(fields) ? choice.date : 'device'
  const timed = hasTime(fields)
  const cycle = timed ? hourCycle(choice.time, order !== 'device') : undefined
  if (order === 'ymd') return yearFirst(date, fields, cycle)
  const locale = order === 'device' ? undefined : ORDER_LOCALE[order]
  // Without a pick this is the browser's own formatter with the caller's own fields, as before.
  if (!cycle && order === 'device') return formatter(undefined, options).format(date)
  return formatter(locale, cycle ? { ...fields, hourCycle: cycle } : fields).format(date)
}

/** A date in the owner's format; left out, the fields `toLocaleDateString()` shows. */
export function formatDate(value: When, options: Intl.DateTimeFormatOptions = DATE_ONLY, choice?: DateFormatChoice): string {
  return formatDateTime(value, options, choice)
}

/** A time in the owner's format; left out, the fields `toLocaleTimeString()` shows. */
export function formatTime(value: When, options: Intl.DateTimeFormatOptions = TIME_ONLY, choice?: DateFormatChoice): string {
  return formatDateTime(value, options, choice)
}
