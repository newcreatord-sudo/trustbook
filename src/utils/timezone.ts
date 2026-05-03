export type DateParts = {
  year: number
  month: number
  day: number
}

type DateTimeParts = DateParts & {
  hour: number
  minute: number
}

function dateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function parseParts(d: Date, timeZone: string): DateTimeParts {
  const parts = dateTimeFormatter(timeZone).formatToParts(d)
  const read = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  }
}

export function datePartsFromDate(d: Date): DateParts {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  }
}

/** Data civile (Y-M-D) nel fuso dell’attività — base corretta per weekday/slot. */
export function calendarPartsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const read = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
  }
}

export function formatDatePartsKey(parts: DateParts): string {
  const mm = String(parts.month).padStart(2, '0')
  const dd = String(parts.day).padStart(2, '0')
  return `${parts.year}-${mm}-${dd}`
}

export function weekdayFromDateParts(parts: DateParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}

export function addDaysToDateParts(parts: DateParts, days: number): DateParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  d.setUTCDate(d.getUTCDate() + days)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  }
}

export function zonedDateTimeToUtcIso(params: {
  timeZone: string
  parts: DateParts
  hour: number
  minute: number
}): string {
  const { timeZone, parts, hour, minute } = params
  let guessMs = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0, 0)

  for (let i = 0; i < 3; i++) {
    const actual = parseParts(new Date(guessMs), timeZone)
    const desiredRef = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0, 0)
    const actualRef = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0)
    const deltaMin = Math.round((desiredRef - actualRef) / 60000)
    if (deltaMin === 0) break
    guessMs += deltaMin * 60000
  }

  return new Date(guessMs).toISOString()
}
