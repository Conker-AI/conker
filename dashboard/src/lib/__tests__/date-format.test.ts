import { afterEach, describe, expect, it } from 'vitest'
import { dateFormatChoice, DEVICE_DATE_FORMAT, formatDate, formatDateTime, formatTime, setDateFormatChoice, type DateFormatChoice } from '../date-format'

// Friday 20 November 2026, 14:05:09 UTC. Every case names the time zone, so the run's own zone never matters.
const AT = Date.UTC(2026, 10, 20, 14, 5, 9)
const UTC = { timeZone: 'UTC' } as const
const pick = (time: DateFormatChoice['time'], date: DateFormatChoice['date']): DateFormatChoice => ({ time, date })

afterEach(() => setDateFormatChoice(DEVICE_DATE_FORMAT))

describe('date format: following this device', () => {
  it('writes exactly what the browser writes on its own', () => {
    const at = new Date(AT)
    expect(formatDateTime(at)).toBe(at.toLocaleString())
    expect(formatDate(at)).toBe(at.toLocaleDateString())
    expect(formatTime(at)).toBe(at.toLocaleTimeString())
    expect(formatDateTime(AT, { month: 'short', day: 'numeric', ...UTC })).toBe(new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...UTC }).format(at))
    expect(formatDateTime(at.toISOString(), { hour: '2-digit', minute: '2-digit', hour12: true, ...UTC })).toBe(at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true, ...UTC }))
  })

  it('says the time is unknown instead of throwing on a bad value', () => {
    expect(formatDateTime('not a date')).toBe('Unknown time')
  })

  it('uses the choice the settings sync last set', () => {
    expect(dateFormatChoice()).toEqual(DEVICE_DATE_FORMAT)
    setDateFormatChoice(pick('24h', 'ymd'))
    expect(formatDateTime(AT, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...UTC })).toBe('2026-11-20 14:05')
  })
})

describe('date format: time format', () => {
  const time = { hour: 'numeric', minute: '2-digit', ...UTC } as const
  it('24-hour', () => expect(formatTime(AT, time, pick('24h', 'mdy'))).toBe('14:05'))
  it('12-hour', () => expect(formatTime(AT, time, pick('12h', 'mdy'))).toBe('2:05 PM'))
  it('a pick wins over a screen asking for 12 hours', () => expect(formatTime(AT, { ...time, hour12: true }, pick('24h', 'mdy'))).toBe('14:05'))
  it('a pick on a device date order', () => expect(formatTime(AT, time, pick('24h', 'device'))).toMatch(/14.05/))
  it('a date-only screen ignores the hour cycle', () =>
    expect(formatDate(AT, { day: 'numeric', month: 'short', ...UTC }, pick('12h', 'device'))).toBe(new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...UTC }).format(AT)))
  it('a time-only screen ignores the date order', () => expect(formatTime(AT, time, pick('device', 'ymd'))).toBe(new Intl.DateTimeFormat(undefined, time).format(AT)))
})

describe('date format: date format', () => {
  const day = { day: 'numeric', month: 'short', year: 'numeric', ...UTC } as const
  it('day first', () => expect(formatDate(AT, day, pick('device', 'dmy'))).toBe('20 Nov 2026'))
  it('month first', () => expect(formatDate(AT, day, pick('device', 'mdy'))).toBe('Nov 20, 2026'))
  it('year first', () => expect(formatDate(AT, day, pick('device', 'ymd'))).toBe('2026-11-20'))
  it('year first keeps only the fields asked for', () => {
    expect(formatDate(AT, { month: 'short', day: 'numeric', ...UTC }, pick('device', 'ymd'))).toBe('11-20')
    expect(formatDate(AT, { month: 'short', year: 'numeric', ...UTC }, pick('device', 'ymd'))).toBe('2026-11')
    expect(formatDate(AT, { weekday: 'short', ...UTC }, pick('device', 'ymd'))).toBe(new Intl.DateTimeFormat(undefined, { weekday: 'short', ...UTC }).format(AT))
  })
  it('year first with a weekday and a 12-hour time', () => {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', ...UTC }).format(AT)
    expect(formatDateTime(AT, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...UTC }, pick('12h', 'ymd'))).toMatch(new RegExp(`^${weekday} 11-20 2:05\\sPM$`))
  })
  it('year first from date and time styles', () => {
    expect(formatDateTime(AT, { dateStyle: 'medium', timeStyle: 'short', ...UTC }, pick('24h', 'ymd'))).toBe('2026-11-20 14:05')
    expect(formatDateTime(AT, { dateStyle: 'full', ...UTC }, pick('device', 'ymd'))).toMatch(/ 2026-11-20$/)
  })
  it('styles in the other orders', () => {
    expect(formatDateTime(AT, { dateStyle: 'medium', timeStyle: 'short', ...UTC }, pick('24h', 'dmy'))).toBe('20 Nov 2026, 14:05')
    expect(formatDateTime(AT, { dateStyle: 'medium', timeStyle: 'short', ...UTC }, pick('12h', 'mdy'))).toBe('Nov 20, 2026, 2:05 PM')
  })
  it('a date order keeps this device hour cycle when the time format follows it', () => {
    const deviceCycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
    const shown = formatDateTime(AT, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...UTC }, pick('device', 'dmy'))
    expect(shown).toBe(deviceCycle === 'h23' || deviceCycle === 'h24' ? '20 Nov, 14:05' : '20 Nov, 2:05 pm')
  })
  it('the full default under a pick', () => expect(formatDateTime(AT, undefined, pick('24h', 'dmy'))).toMatch(/^\d{2}\/\d{2}\/2026, \d{2}:05:09$/))
})
