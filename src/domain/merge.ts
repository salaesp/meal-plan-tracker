import { mergeDay } from './dayFields'
import { pruneDeletedPlans } from './tracking'
import type { Activation, AppData, DayLog, Settings, Supplement } from './types'

/**
 * Cada suplemento se fusiona por separado: vale la versión con `updatedAt` más
 * nuevo (los borrados también son versiones, así no vuelven). Antes se tomaba la
 * lista entera del lado más nuevo y un dispositivo desactualizado borraba lo que
 * se había agregado en otro.
 */
function mergeSupplements(older: Supplement[] | undefined, newer: Supplement[] | undefined): Supplement[] | undefined {
  if (!older || !newer) return newer ?? older
  const byId = new Map<string, Supplement>()
  for (const entry of [...older, ...newer]) {
    const seen = byId.get(entry.id)
    if (!seen || (entry.updatedAt ?? 0) >= (seen.updatedAt ?? 0)) byId.set(entry.id, entry)
  }
  return [...byId.values()]
}

/** Horarios y bienvenida: se suman, y ante choque vale el lado más nuevo. */
function mergeSettings(older: Settings | undefined, newer: Settings | undefined): Settings | undefined {
  if (!older || !newer) return newer ?? older
  const onboardedAt = newer.onboardedAt ?? older.onboardedAt
  const supplements = mergeSupplements(older.supplements, newer.supplements)
  return {
    mealTimes: { ...older.mealTimes, ...newer.mealTimes },
    ...(onboardedAt ? { onboardedAt } : {}),
    ...(supplements ? { supplements } : {}),
  }
}

/**
 * Une el registro de este dispositivo con el del servidor. Cada día se une
 * campo por campo (ver `mergeDay`); planes, activaciones y
 * planes borrados se suman; del aviso descartado queda el más nuevo.
 */
export function mergeData(local: AppData, remote: AppData): AppData {
  const plans = [...local.plans, ...remote.plans.filter((plan) => !local.plans.some((own) => own.id === plan.id))]

  const days: Record<string, DayLog> = {}
  for (const date of new Set([...Object.keys(local.days), ...Object.keys(remote.days)])) {
    days[date] = mergeDay(local.days[date], remote.days[date])
  }

  // Si ambos activaron un plan el mismo día, vale el del lado con cambios más nuevos.
  const [older, newer] = (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0) ? [remote, local] : [local, remote]
  const byDate = new Map<string, Activation>()
  for (const entry of [...older.activations, ...newer.activations]) byDate.set(entry.date, entry)
  const activations = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))

  const settings = mergeSettings(older.settings, newer.settings)
  const updatedAt = Math.max(local.updatedAt ?? 0, remote.updatedAt ?? 0) || undefined
  // Los borrados se suman: un plan borrado en un lado no vuelve desde el otro.
  const deletedPlans = [...new Set([...(local.deletedPlans ?? []), ...(remote.deletedPlans ?? [])])]
  // El aviso descartado más reciente vale para los dos lados.
  const dismissed = [local.dismissedMissedDay, remote.dismissedMissedDay].filter(Boolean).sort().pop()
  return pruneDeletedPlans({
    version: 1,
    plans,
    activations,
    days,
    ...(settings ? { settings } : {}),
    ...(deletedPlans.length ? { deletedPlans } : {}),
    ...(dismissed ? { dismissedMissedDay: dismissed } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  })
}
