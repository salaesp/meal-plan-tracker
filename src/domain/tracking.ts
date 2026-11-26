import { formatDay } from './dates'
import type { AppData, DayLog, ItemLog, Meal, Plan, Status } from './types'

export interface StatusInfo {
  value: Status
  label: string
  points: number
}

export const STATUSES: readonly StatusInfo[] = [
  { value: 'done', label: 'Como el plan', points: 1 },
  { value: 'partial', label: 'Parecido', points: 0.5 },
  { value: 'failed', label: 'Distinto', points: 0 },
]

export const statusInfo = (status: Status) => STATUSES.find((entry) => entry.value === status)!

export const CONTEXT_GROUPS = [
  { id: 'hunger', label: 'Hambre', options: ['Poca', 'Normal', 'Mucha'] },
  { id: 'place', label: 'Dónde', options: ['Casa', 'Trabajo', 'Afuera'] },
  { id: 'mood', label: 'Cómo me sentí', options: ['Bien', 'Regular', 'Mal'] },
] as const

export const WATER_STEP_ML = 500

export interface ChecklistItem {
  key: string
  mealId: string
  label: string
  isDessert: boolean
}

export const dessertKey = (mealId: string) => `${mealId}:dessert`

export function checklist(plan: Plan): ChecklistItem[] {
  return plan.meals.flatMap((meal: Meal) => {
    const main = { key: meal.id, mealId: meal.id, label: meal.name, isDessert: false }
    if (!meal.dessert) return [main]
    return [main, { key: dessertKey(meal.id), mealId: meal.id, label: 'Postre', isDessert: true }]
  })
}

export const itemTitle = (plan: Plan, item: ChecklistItem) =>
  item.isDessert ? `Postre (${plan.meals.find((meal) => meal.id === item.mealId)?.name ?? ''})` : item.label

export function activePlanId(data: AppData): string {
  return data.activations.at(-1)?.planId ?? data.plans[0]!.id
}

/** Plan que rige en una fecha: el del registro del día o el activado más reciente hasta entonces. */
export function planForDate(data: AppData, date: string): Plan {
  const logged = data.days[date]?.planId
  const activation = [...data.activations].reverse().find((entry) => entry.date <= date) ?? data.activations[0]
  const find = (id: string | undefined) => data.plans.find((plan) => plan.id === id)
  return find(logged) ?? find(activation?.planId) ?? data.plans[0]!
}

export function dayLog(data: AppData, date: string): DayLog {
  return data.days[date] ?? { date, planId: planForDate(data, date).id, items: {}, waterMl: 0, extras: [] }
}

function updateDay(data: AppData, date: string, change: (log: DayLog) => DayLog): AppData {
  return { ...data, days: { ...data.days, [date]: { ...change(dayLog(data, date)), updatedAt: Date.now() } } }
}

export function setItem(data: AppData, date: string, key: string, patch: ItemLog): AppData {
  return updateDay(data, date, (log) => ({
    ...log,
    items: { ...log.items, [key]: { ...log.items[key], ...patch } },
  }))
}

const snackIds = (plan: Plan) => plan.meals.filter((meal) => meal.kind === 'snack').map((meal) => meal.id)

/** Fija (o borra con `undefined`) el estado. Las colaciones combinadas se marcan juntas. */
export function applyStatus(data: AppData, date: string, key: string, status: Status | undefined): AppData {
  const items = dayLog(data, date).items
  const mirrored = items[key]?.combined ? snackIds(planForDate(data, date)).filter((id) => items[id]?.combined) : [key]
  const keys = mirrored.includes(key) ? mirrored : [key]
  return keys.reduce((next, id) => setItem(next, date, id, { status }), data)
}

/** Tocar de nuevo el estado marcado lo borra. */
export function toggleStatus(data: AppData, date: string, key: string, status: Status): AppData {
  const current = data.days[date]?.items[key]?.status
  return applyStatus(data, date, key, current === status ? undefined : status)
}

export function setCombined(data: AppData, date: string, key: string, combined: boolean): AppData {
  const status = dayLog(data, date).items[key]?.status
  return snackIds(planForDate(data, date)).reduce(
    (next, id) => setItem(next, date, id, combined && status ? { combined, status } : { combined }),
    data,
  )
}

export function toggleContext(data: AppData, date: string, key: string, group: string, value: string): AppData {
  const context = { ...dayLog(data, date).items[key]?.context }
  if (context[group] === value) delete context[group]
  else context[group] = value
  return setItem(data, date, key, { context })
}

export function changeWater(data: AppData, date: string, deltaMl: number): AppData {
  return updateDay(data, date, (log) => ({ ...log, waterMl: Math.max(0, log.waterMl + deltaMl) }))
}

export function toggleTrained(data: AppData, date: string): AppData {
  return updateDay(data, date, (log) => ({ ...log, trained: !log.trained }))
}

/** Hay algo cargado en el día (para avisar antes de pisarlo al copiar). */
export function hasLogged(log: DayLog | undefined): boolean {
  if (!log) return false
  return (
    Object.values(log.items).some((item) => item.status || item.note || item.combined) ||
    log.waterMl > 0 ||
    log.extras.length > 0 ||
    Boolean(log.trained)
  )
}

/** Días anteriores a `date` con algo cargado, del más reciente al más viejo. */
export function copyableDays(data: AppData, date: string, limit = 14): string[] {
  return Object.keys(data.days)
    .filter((day) => day < date && hasLogged(data.days[day]))
    .sort()
    .reverse()
    .slice(0, limit)
}

/** Copia comidas, agua, extras y entrenamiento de `from` a `to`, pisando lo que haya. Respeta el plan de `to`. */
export function copyDay(data: AppData, from: string, to: string): AppData {
  const source = data.days[from]
  if (!source || from === to) return data
  const keys = new Set(checklist(planForDate(data, to)).map((item) => item.key))
  const items = Object.fromEntries(Object.entries(source.items).filter(([key]) => keys.has(key)))
  const stamp = Date.now().toString(36)
  const extras = source.extras.map((extra, index) => ({ id: `${stamp}-${index}`, text: extra.text }))
  return updateDay(data, to, (log) => ({
    ...log,
    items: structuredClone(items),
    waterMl: source.waterMl,
    extras,
    trained: source.trained,
  }))
}

/** Devuelve el día a como estaba (`undefined`: día vacío). Sirve para deshacer. */
export function restoreDay(data: AppData, date: string, log: DayLog | undefined): AppData {
  return updateDay(data, date, () => log ?? dayLog({ ...data, days: {} }, date))
}

export function addExtra(data: AppData, date: string, id: string, text: string, time?: string): AppData {
  const trimmed = text.trim()
  if (!trimmed) return data
  return updateDay(data, date, (log) => ({ ...log, extras: [...log.extras, { id, text: trimmed, time }] }))
}

export function removeExtra(data: AppData, date: string, id: string): AppData {
  return updateDay(data, date, (log) => ({ ...log, extras: log.extras.filter((extra) => extra.id !== id) }))
}

export function setMealTime(data: AppData, mealId: string, time: string): AppData {
  const mealTimes = { ...data.settings?.mealTimes, [mealId]: time }
  return { ...data, settings: { ...data.settings, mealTimes } }
}

/** Activa un plan desde `today`. Los días anteriores conservan el plan que regía. */
export function activatePlan(data: AppData, plan: Plan, today: string): AppData {
  const plans = data.plans.some((entry) => entry.id === plan.id) ? data.plans : [...data.plans, plan]
  const activations = [...data.activations.filter((entry) => entry.date < today), { date: today, planId: plan.id }]
  const days = Object.fromEntries(
    Object.entries(data.days).map(([date, log]) => [date, date >= today ? { ...log, planId: plan.id, updatedAt: Date.now() } : log]),
  )
  return { ...data, plans, activations, days }
}

export interface Score {
  total: number
  marked: number
  counts: Record<Status, number>
  points: number
  /** 0 a 1; `null` si no hay nada registrado. */
  ratio: number | null
}

function toScore(counts: Record<Status, number>, total: number): Score {
  const marked = counts.done + counts.partial + counts.failed
  const points = counts.done + counts.partial * 0.5
  return { total, marked, counts, points, ratio: marked ? points / marked : null }
}

const emptyCounts = (): Record<Status, number> => ({ done: 0, partial: 0, failed: 0 })

export function scoreEntries(entries: (ItemLog | undefined)[]): Score {
  const counts = emptyCounts()
  for (const entry of entries) if (entry?.status) counts[entry.status] += 1
  return toScore(counts, entries.length)
}

export function dayScore(data: AppData, date: string): Score {
  const items = data.days[date]?.items ?? {}
  return scoreEntries(checklist(planForDate(data, date)).map((item) => items[item.key]))
}

export interface WeekRow {
  key: string
  label: string
  isDessert: boolean
  /** Una celda por fecha; `null` si el plan de ese día no tiene el ítem. */
  cells: (ItemLog | null)[]
  score: Score
}

export function weekRows(data: AppData, dates: string[]): WeekRow[] {
  const perDay = dates.map((date) => ({ date, plan: planForDate(data, date) }))
  const rows = new Map<string, ChecklistItem & { title: string }>()
  // El plan más nuevo define el orden de las filas.
  for (const { plan } of [...perDay].reverse()) {
    for (const item of checklist(plan)) {
      if (!rows.has(item.key)) rows.set(item.key, { ...item, title: itemTitle(plan, item) })
    }
  }
  return [...rows.values()].map((row) => {
    const cells = perDay.map(({ date, plan }) =>
      checklist(plan).some((item) => item.key === row.key) ? (data.days[date]?.items[row.key] ?? {}) : null,
    )
    return {
      key: row.key,
      label: row.title,
      isDessert: row.isDessert,
      cells,
      score: scoreEntries(cells.filter((cell) => cell !== null)),
    }
  })
}

export function weekScore(rows: WeekRow[]): Score {
  const counts = emptyCounts()
  for (const row of rows) for (const status of STATUSES) counts[status.value] += row.score.counts[status.value]
  return toScore(
    counts,
    rows.reduce((sum, row) => sum + row.score.total, 0),
  )
}

/** Una frase que mira hacia adelante, sin porcentajes. */
export function weekInsight(rows: WeekRow[]): string | null {
  const scored = rows.filter((row) => row.score.marked >= 2)
  if (!scored.length) return null
  const hardest = scored.reduce((a, b) => (b.score.ratio! < a.score.ratio! ? b : a))
  if (hardest.score.ratio === 1) return 'Todo lo registrado fue como el plan.'
  return `Lo que más cuesta esta semana: ${hardest.label.toLowerCase()}.`
}

export function countsText(score: Score): string {
  const parts = STATUSES.filter((status) => score.counts[status.value] > 0).map(
    (status) => `${status.label.toLowerCase()} ${score.counts[status.value]}`,
  )
  return parts.join(', ') || 'sin registro'
}

/** Texto plano para la nutricionista. Solo incluye hasta `today`. */
export function weekSummary(data: AppData, dates: string[], today: string): string {
  const past = dates.filter((date) => date <= today)
  if (!past.length) return 'Semana sin registros.'
  const rows = weekRows(data, past)
  const total = weekScore(rows)
  const lines = [
    `Seguimiento ${formatDay(past[0]!)} al ${formatDay(past.at(-1)!)}`,
    `Registradas: ${total.marked} de ${total.total} (${countsText(total)})`,
  ]
  if (total.ratio !== null) {
    lines.push(`Cumplimiento de lo registrado: ${Math.round(total.ratio * 100)}%`)
  }
  lines.push('', 'Por comida', ...rows.map((row) => `${row.label}: ${countsText(row.score)}`))

  const details: string[] = []
  for (const date of past) {
    const log = data.days[date]
    if (!log) continue
    const plan = planForDate(data, date)
    const parts: string[] = []
    for (const item of checklist(plan)) {
      const entry = log.items[item.key]
      const context = Object.values(entry?.context ?? {})
      const note = entry?.note?.trim()
      const notable = (entry?.status && entry.status !== 'done') || note || context.length
      if (!notable) continue
      const state = entry?.status ? statusInfo(entry.status).label.toLowerCase() : 'no la hice'
      const extra = [note, context.length ? `[${context.join(', ').toLowerCase()}]` : ''].filter(Boolean).join(' ')
      parts.push(`  ${itemTitle(plan, item)}: ${state}${extra ? ` — ${extra}` : ''}`)
    }
    if (log.extras.length) {
      parts.push(`  Algo más: ${log.extras.map((entry) => (entry.time ? `${entry.time} ${entry.text}` : entry.text)).join(', ')}`)
    }
    if (log.trained) parts.push('  Entrené')
    if (plan.waterLiters > 0) {
      parts.push(`  Agua: ${(log.waterMl / 1000).toLocaleString('es-AR')} / ${plan.waterLiters.toLocaleString('es-AR')} L`)
    }
    if (parts.length) details.push(formatDay(date), ...parts)
  }
  if (details.length) lines.push('', 'Detalle', ...details)
  return lines.join('\n')
}
