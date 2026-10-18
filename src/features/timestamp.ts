// Timestamps are stored as milliseconds since 1970-01-01T00:00:00Z, the same
// unit as Date.getTime(). Numbers can't be mutated through a shared reference,
// compare with `<`, and are what the algorithms work with anyway.

/** The largest distance from the epoch a Date can represent, in milliseconds. */
const MAX_TIME = 8.64e15

// Date.parse is too lenient to validate with: it rolls '2025-02-30' over to
// March 2, and reads '2025-1-1' in the machine's time zone. This accepts only
// ISO 8601 dates and date-times, with 'T' or a space between them.
const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/

// Date.UTC reads years 0 to 99 as 1900 to 1999; setUTCFullYear doesn't.
// Months are 1-based here; day 0 is the last day of the month before.
const utc = (
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0
): number => {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hours, minutes, seconds, ms)
  return date.getTime()
}

export const daysInMonth = (year: number, month: number): number =>
  new Date(utc(year, month + 1, 0)).getUTCDate()

// A string without an offset is read as UTC, so the same data gives the same
// timestamps on every machine. Data recorded in local time is shifted by the
// same offset on every row, which keeps its order and its intervals.
const parseIso = (text: string): number | undefined => {
  const match = ISO.exec(text)
  if (match === null) return undefined
  // Groups that didn't match are undefined, so the defaults fill them in
  const [
    ,
    year,
    month,
    day,
    hour = '0',
    minute = '0',
    second = '0',
    fraction = '',
    offset = 'Z'
  ] = match
  const y = Number(year)
  const mo = Number(month)
  const d = Number(day)
  const h = Number(hour)
  const mi = Number(minute)
  const s = Number(second)
  // Digits past milliseconds are dropped: a Date can't hold them
  const ms = Number(fraction.padEnd(3, '0').slice(0, 3))
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return Number.NaN
  if (h > 23 || mi > 59 || s > 59) return Number.NaN

  let offsetMs = 0
  if (offset !== 'Z') {
    const sign = offset.startsWith('-') ? -1 : 1
    const offsetHours = Number(offset.slice(1, 3))
    const offsetMinutes = Number(offset.slice(4, 6))
    if (offsetHours > 23 || offsetMinutes > 59) return Number.NaN
    offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60_000
  }
  return utc(y, mo, d, h, mi, s, ms) - offsetMs
}

export type TimestampCheck =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly code: 'invalid_type' | 'invalid_timestamp' }

/**
 * Converts a `Date`, a number of milliseconds or an ISO 8601 string to
 * milliseconds since the epoch. Other types are `invalid_type`; values of the
 * right type that aren't a real point in time, such as an Invalid Date or
 * '2025-02-30', are `invalid_timestamp`.
 */
export const parseTimestamp = (value: unknown): TimestampCheck => {
  let time: number
  if (value instanceof Date) {
    time = value.getTime()
  } else if (typeof value === 'number') {
    time = value
  } else if (typeof value === 'string') {
    const parsed = parseIso(value)
    if (parsed === undefined) return { ok: false, code: 'invalid_type' }
    time = parsed
  } else {
    return { ok: false, code: 'invalid_type' }
  }
  // Rejects NaN (an Invalid Date or an impossible calendar date), infinities,
  // and times a Date can't represent
  return Math.abs(time) <= MAX_TIME
    ? { ok: true, value: time }
    : { ok: false, code: 'invalid_timestamp' }
}
