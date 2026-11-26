/** Fechas como string YYYY-MM-DD en hora local. */

export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseISODate(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toISODate(parseISODate(value)) === value
}

export function addDays(iso: string, amount: number): string {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + amount)
  return toISODate(date)
}

/** Lunes a domingo de la semana que contiene `iso`. */
export function weekDates(iso: string): string[] {
  const weekday = (parseISODate(iso).getDay() + 6) % 7
  const monday = addDays(iso, -weekday)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

const SHORT_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function formatDay(iso: string): string {
  const date = parseISODate(iso)
  return `${SHORT_DAYS[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`
}

const LONG_DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export const longWeekday = (iso: string) => LONG_DAYS[parseISODate(iso).getDay()] ?? ''

export function dayAndMonth(iso: string): string {
  const date = parseISODate(iso)
  return `${date.getDate()} de ${MONTHS[date.getMonth()]}`
}

/** "23 – 29 nov", o "30 nov – 6 dic" si cruza de mes. */
export function formatRange(from: string, to: string): string {
  const start = parseISODate(from)
  const end = parseISODate(to)
  const month = (date: Date) => MONTHS[date.getMonth()]!.slice(0, 3)
  const first = start.getMonth() === end.getMonth() ? `${start.getDate()}` : `${start.getDate()} ${month(start)}`
  return `${first} – ${end.getDate()} ${month(end)}`
}

export function weekdayInitial(iso: string): string {
  return ['D', 'L', 'M', 'M', 'J', 'V', 'S'][parseISODate(iso).getDay()] ?? ''
}
