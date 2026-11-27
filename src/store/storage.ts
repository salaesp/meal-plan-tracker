import { seedPlan } from '../data/seedPlan'
import { isISODate } from '../domain/dates'
import { isRecord, parsePlan } from '../domain/parsing'
import { parseTime } from '../domain/schedule'
import { pruneDeletedPlans, STATUSES } from '../domain/tracking'
import type { Activation, AppData, DayLog, ItemLog, Plan, Settings, Status, Supplement } from '../domain/types'

export const STORAGE_KEY = 'meal-plan:data'
/** Cada cuenta guarda lo suyo; sin cuenta (solo desarrollo) se usa la clave base. */
export const storageKeyFor = (userId: string | null) => (userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY)

/**
 * Antes de separar por cuenta todo se guardaba en `STORAGE_KEY`. La primera
 * cuenta que entra se queda con eso; las siguientes empiezan de cero.
 */
export function adoptLegacy(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, key: string): void {
  if (key === STORAGE_KEY || storage.getItem(key) !== null) return
  const legacy = storage.getItem(STORAGE_KEY)
  if (legacy === null) return
  storage.setItem(key, legacy)
  storage.removeItem(STORAGE_KEY)
}

export const CORRUPT_KEY = 'meal-plan:corrupt'

/** Datos de arranque con el plan elegido, vigente desde `date`. */
export function initialData(plan: Plan = seedPlan, date: string = seedPlan.createdAt, settings?: Settings): AppData {
  return {
    version: 1,
    plans: [plan],
    activations: [{ date, planId: plan.id }],
    days: {},
    ...(settings ? { settings } : {}),
  }
}

/** Solo el plan de ejemplo, sin registros y sin haber pasado por la bienvenida. */
export const isUntouched = (data: AppData) =>
  !data.settings?.onboardedAt &&
  data.plans.length === 1 &&
  data.plans[0]!.id === seedPlan.id &&
  Object.keys(data.days).length === 0

function parseSettings(value: unknown): Settings | undefined {
  if (!isRecord(value)) return undefined
  const mealTimes = Object.fromEntries(
    Object.entries(isRecord(value.mealTimes) ? value.mealTimes : {}).filter(
      (pair): pair is [string, string] => typeof pair[1] === 'string' && parseTime(pair[1]) !== null,
    ),
  )
  const supplements = Array.isArray(value.supplements) ? value.supplements.flatMap(parseSupplement) : undefined
  return {
    mealTimes,
    ...(isISODate(value.onboardedAt) ? { onboardedAt: value.onboardedAt } : {}),
    // Una lista vacía se conserva: dice que se quitaron todos.
    ...(supplements ? { supplements } : {}),
  }
}

function parseSupplement(value: unknown): Supplement[] {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !isISODate(value.since)) return []
  const name = value.name.trim()
  if (!name) return []
  return [
    {
      id: value.id,
      name,
      since: value.since,
      ...(isISODate(value.until) ? { until: value.until } : {}),
      ...(typeof value.updatedAt === 'number' ? { updatedAt: value.updatedAt } : {}),
    },
  ]
}

const isStatus = (value: unknown): value is Status => STATUSES.some((entry) => entry.value === value)

function parseDay(date: string, value: unknown): DayLog | null {
  if (!isISODate(date) || !isRecord(value) || typeof value.planId !== 'string') return null
  const items: Record<string, ItemLog> = {}
  for (const [key, entry] of Object.entries(isRecord(value.items) ? value.items : {})) {
    if (!isRecord(entry)) continue
    const context = Object.fromEntries(
      Object.entries(isRecord(entry.context) ? entry.context : {}).filter(
        (pair): pair is [string, string] => typeof pair[1] === 'string',
      ),
    )
    items[key] = {
      status: isStatus(entry.status) ? entry.status : undefined,
      note: typeof entry.note === 'string' ? entry.note : undefined,
      context: Object.keys(context).length ? context : undefined,
      combined: entry.combined === true ? true : undefined,
    }
  }
  const extras = (Array.isArray(value.extras) ? value.extras : []).flatMap((extra) =>
    isRecord(extra) && typeof extra.id === 'string' && typeof extra.text === 'string'
      ? [{ id: extra.id, text: extra.text, time: typeof extra.time === 'string' ? extra.time : undefined }]
      : [],
  )
  const waterMl = typeof value.waterMl === 'number' && value.waterMl > 0 ? value.waterMl : 0
  const supplements = [
    ...new Set((Array.isArray(value.supplements) ? value.supplements : []).filter((id) => typeof id === 'string')),
  ] as string[]
  return {
    date,
    planId: value.planId,
    items,
    waterMl,
    extras,
    trained: value.trained === true ? true : undefined,
    supplements: supplements.length ? supplements : undefined,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined,
    ...(typeof value.supplementsAt === 'number' ? { supplementsAt: value.supplementsAt } : {}),
  }
}

/** `null` si el contenido no es un guardado válido. */
export function parseData(raw: string): AppData | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.plans)) return null

  // El plan inicial no se edita (editar crea otro id): se toma siempre la versión del código.
  const plans = value.plans
    .map(parsePlan)
    .filter((plan): plan is Plan => plan !== null)
    .map((plan) => (plan.id === seedPlan.id ? seedPlan : plan))
  if (!plans.length) return null

  const activations = (Array.isArray(value.activations) ? value.activations : [])
    .flatMap((entry): Activation[] =>
      isRecord(entry) && isISODate(entry.date) && plans.some((plan) => plan.id === entry.planId)
        ? [{ date: entry.date, planId: entry.planId as string }]
        : [],
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!activations.length) return null

  const days: Record<string, DayLog> = {}
  for (const [date, entry] of Object.entries(isRecord(value.days) ? value.days : {})) {
    const day = parseDay(date, entry)
    if (day) days[date] = day
  }
  const settings = parseSettings(value.settings)
  const deletedPlans = (Array.isArray(value.deletedPlans) ? value.deletedPlans : []).filter(
    (id): id is string => typeof id === 'string',
  )
  return pruneDeletedPlans({
    version: 1,
    plans,
    activations,
    days,
    ...(settings ? { settings } : {}),
    ...(deletedPlans.length ? { deletedPlans } : {}),
    ...(isISODate(value.dismissedMissedDay) ? { dismissedMissedDay: value.dismissedMissedDay } : {}),
    ...(typeof value.updatedAt === 'number' ? { updatedAt: value.updatedAt } : {}),
  })
}

/**
 * Representación estable para saber si dos registros dicen lo mismo. Cada
 * dispositivo ordena claves y planes distinto; sin esto volverían a subir lo
 * mismo en cada sincronización.
 */
export function fingerprint(data: AppData): string {
  const clean = parseData(JSON.stringify(data)) ?? data
  const plans = [...clean.plans].sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify({ ...clean, plans }, (_key, value: unknown) =>
    isRecord(value) && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  )
}

export interface LoadResult {
  /** `null`: hay que mostrar la bienvenida. */
  data: AppData | null
  /** Había datos ilegibles; quedaron copiados en `CORRUPT_KEY`. */
  recovered: boolean
}

export function loadData(storage: Pick<Storage, 'getItem' | 'setItem'>, key = STORAGE_KEY): LoadResult {
  const raw = storage.getItem(key)
  if (raw === null) return { data: null, recovered: false }
  const data = parseData(raw)
  if (data) return { data: isUntouched(data) ? null : data, recovered: false }
  storage.setItem(CORRUPT_KEY, raw)
  return { data: null, recovered: true }
}
