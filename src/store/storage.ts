import { seedPlan } from '../data/seedPlan'
import { isISODate } from '../domain/dates'
import { isRecord, parsePlan } from '../domain/parsing'
import { STATUSES } from '../domain/tracking'
import type { Activation, AppData, DayLog, ItemLog, Plan, Status } from '../domain/types'

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

export function initialData(): AppData {
  return {
    version: 1,
    plans: [seedPlan],
    activations: [{ date: seedPlan.createdAt, planId: seedPlan.id }],
    days: {},
  }
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
  return {
    date,
    planId: value.planId,
    items,
    waterMl,
    extras,
    trained: value.trained === true ? true : undefined,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined,
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
  return { version: 1, plans, activations, days, updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined }
}

export interface LoadResult {
  data: AppData
  /** Había datos ilegibles; quedaron copiados en `CORRUPT_KEY`. */
  recovered: boolean
}

export function loadData(storage: Pick<Storage, 'getItem' | 'setItem'>, key = STORAGE_KEY): LoadResult {
  const raw = storage.getItem(key)
  if (raw === null) return { data: initialData(), recovered: false }
  const data = parseData(raw)
  if (data) return { data, recovered: false }
  storage.setItem(CORRUPT_KEY, raw)
  return { data: initialData(), recovered: true }
}
