import { addDays, formatDay } from './dates'
import type { AppData, DayLog, ItemLog, Meal, Plan, Status, Supplement } from './types'

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

const sameIds = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((id) => b.includes(id))

function updateDay(data: AppData, date: string, change: (log: DayLog) => DayLog): AppData {
  const before = dayLog(data, date)
  const after = change(before)
  const now = Date.now()
  const supplementsAt = sameIds(before.supplements, after.supplements) ? after.supplementsAt : now
  return {
    ...data,
    days: { ...data.days, [date]: { ...after, updatedAt: now, ...(supplementsAt ? { supplementsAt } : {}) } },
  }
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

/** Suplementos que corresponden a una fecha, en el orden en que se agregaron. */
export function supplementsFor(data: AppData, date: string): Supplement[] {
  return (data.settings?.supplements ?? []).filter((entry) => entry.since <= date && (!entry.until || date < entry.until))
}

/** Suma un suplemento desde `date` en adelante. Si ya hay uno vigente con ese nombre, no hace nada. */
export function addSupplement(data: AppData, date: string, id: string, name: string): AppData {
  const trimmed = name.trim()
  const key = trimmed.toLocaleLowerCase('es')
  if (!trimmed || supplementsFor(data, date).some((entry) => entry.name.toLocaleLowerCase('es') === key)) return data
  const supplements = [...(data.settings?.supplements ?? []), { id, name: trimmed, since: date, updatedAt: Date.now() }]
  return { ...data, settings: { mealTimes: {}, ...data.settings, supplements } }
}

/**
 * Deja de mostrar un suplemento desde `date`. Los días anteriores lo conservan
 * (con lo que se marcó); si se había agregado ese mismo día, desaparece del todo
 * (queda como borrado, `until = since`, para que otro dispositivo no lo traiga de vuelta).
 */
export function removeSupplement(data: AppData, date: string, id: string): AppData {
  const current = data.settings?.supplements ?? []
  const target = current.find((entry) => entry.id === id)
  if (!target) return data
  const until = target.since >= date ? target.since : date
  const supplements = current.map((entry) => (entry.id === id ? { ...entry, until, updatedAt: Date.now() } : entry))
  const next = { ...data, settings: { mealTimes: {}, ...data.settings, supplements } }
  const taken = data.days[date]?.supplements
  if (!taken?.includes(id)) return next
  return updateDay(next, date, (log) => ({ ...log, supplements: taken.filter((entry) => entry !== id) }))
}

export function toggleSupplement(data: AppData, date: string, id: string): AppData {
  return updateDay(data, date, (log) => {
    const taken = log.supplements ?? []
    return { ...log, supplements: taken.includes(id) ? taken.filter((entry) => entry !== id) : [...taken, id] }
  })
}

/** Hay algo cargado en el día (para avisar antes de pisarlo al copiar). */
export function hasLogged(log: DayLog | undefined): boolean {
  if (!log) return false
  return (
    Object.values(log.items).some((item) => item.status || item.note || item.combined) ||
    log.waterMl > 0 ||
    log.extras.length > 0 ||
    Boolean(log.trained) ||
    Boolean(log.supplements?.length)
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

/**
 * Copia comidas, agua, extras, entrenamiento y suplementos de `from` a `to`,
 * pisando lo que haya. Respeta el plan y los suplementos vigentes de `to`.
 */
export function copyDay(data: AppData, from: string, to: string): AppData {
  const source = data.days[from]
  if (!source || from === to) return data
  const keys = new Set(checklist(planForDate(data, to)).map((item) => item.key))
  const items = Object.fromEntries(Object.entries(source.items).filter(([key]) => keys.has(key)))
  const stamp = Date.now().toString(36)
  const extras = source.extras.map((extra, index) => ({ id: `${stamp}-${index}`, text: extra.text }))
  const active = new Set(supplementsFor(data, to).map((entry) => entry.id))
  const supplements = (source.supplements ?? []).filter((id) => active.has(id))
  return updateDay(data, to, (log) => ({
    ...log,
    items: structuredClone(items),
    waterMl: source.waterMl,
    extras,
    trained: source.trained,
    supplements: supplements.length ? supplements : undefined,
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
  // Activar un plan lo saca de los borrados (y suelta los que ya no hacen falta).
  return pruneDeletedPlans({ ...data, plans, activations, days })
}

/** El plan lo usa algún día registrado o alguna activación (historial). */
export const planInUse = (data: AppData, planId: string) =>
  data.activations.some((entry) => entry.planId === planId) ||
  Object.values(data.days).some((log) => log.planId === planId)

/** Planes que se ofrecen en "Otros planes": ni el activo ni los borrados. */
export function otherPlans(data: AppData): Plan[] {
  const activeId = activePlanId(data)
  const deleted = new Set(data.deletedPlans ?? [])
  return data.plans.filter((plan) => plan.id !== activeId && !deleted.has(plan.id))
}

/**
 * Aplica los borrados. Un plan borrado desaparece de la lista, pero si el
 * historial lo usa (días registrados o activaciones pasadas) su definición se
 * conserva oculta: sin ella esos días no sabrían qué comidas tenían. Los que
 * nadie usa se eliminan del todo. El plan activo nunca queda borrado.
 */
export function pruneDeletedPlans(data: AppData): AppData {
  if (!data.deletedPlans) return data
  const activeId = activePlanId(data)
  const deletedPlans = [...new Set(data.deletedPlans)].filter((id) => id !== activeId).sort()
  const deleted = new Set(deletedPlans)
  const plans = data.plans.filter((plan) => !deleted.has(plan.id) || planInUse(data, plan.id))
  const { deletedPlans: _drop, ...rest } = data
  return { ...rest, plans, ...(deletedPlans.length ? { deletedPlans } : {}) }
}

/** Borra un plan que no es el activo. */
export function deletePlan(data: AppData, planId: string): AppData {
  if (planId === activePlanId(data) || !data.plans.some((plan) => plan.id === planId)) return data
  return pruneDeletedPlans({ ...data, deletedPlans: [...(data.deletedPlans ?? []), planId] })
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

/** Aviso de comidas sin registrar del día anterior a `date`. */
export interface MissedDay {
  date: string
  missing: number
}

/**
 * Comidas que quedaron sin registrar el día anterior a `date`, o `null` si no
 * hay nada pendiente o el aviso de ese día ya se descartó.
 */
export function missedDay(data: AppData, date: string): MissedDay | null {
  const previous = addDays(date, -1)
  if (!data.days[previous]) return null
  if (data.dismissedMissedDay && data.dismissedMissedDay >= previous) return null
  const score = dayScore(data, previous)
  const missing = score.total - score.marked
  return missing > 0 ? { date: previous, missing } : null
}

/** Descarta el aviso de `date`. Solo se recuerda el último día descartado. */
export function dismissMissedDay(data: AppData, date: string): AppData {
  if (data.dismissedMissedDay && data.dismissedMissedDay >= date) return data
  return { ...data, dismissedMissedDay: date }
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
    const supplements = supplementsFor(data, date)
    if (supplements.length) {
      const taken = new Set(log.supplements ?? [])
      const missing = supplements.filter((entry) => !taken.has(entry.id))
      parts.push(
        missing.length
          ? `  Suplementos: no tomé ${missing.map((entry) => entry.name).join(', ')}`
          : '  Suplementos: todos',
      )
    }
    if (plan.waterLiters > 0) {
      parts.push(`  Agua: ${(log.waterMl / 1000).toLocaleString('es-AR')} / ${plan.waterLiters.toLocaleString('es-AR')} L`)
    }
    if (parts.length) details.push(formatDay(date), ...parts)
  }
  if (details.length) lines.push('', 'Detalle', ...details)
  return lines.join('\n')
}
