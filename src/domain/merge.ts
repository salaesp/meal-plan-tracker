import { pruneDeletedPlans } from './tracking'
import type { Activation, AppData, DayLog, Settings } from './types'

/**
 * Horarios y bienvenida: se suman, y ante choque vale el lado más nuevo.
 * Los suplementos se toman enteros del lado más nuevo que tenga lista (así
 * quitar uno en un dispositivo no lo hace volver desde el otro).
 */
function mergeSettings(older: Settings | undefined, newer: Settings | undefined): Settings | undefined {
  if (!older || !newer) return newer ?? older
  const onboardedAt = newer.onboardedAt ?? older.onboardedAt
  const supplements = newer.supplements ?? older.supplements
  return {
    mealTimes: { ...older.mealTimes, ...newer.mealTimes },
    ...(onboardedAt ? { onboardedAt } : {}),
    ...(supplements ? { supplements } : {}),
  }
}

/**
 * Une el registro de este dispositivo con el del servidor. Cada día se queda
 * con la versión más reciente; planes, activaciones y
 * planes borrados se suman; del aviso descartado queda el más nuevo.
 */
export function mergeData(local: AppData, remote: AppData): AppData {
  const plans = [...local.plans, ...remote.plans.filter((plan) => !local.plans.some((own) => own.id === plan.id))]

  const days: Record<string, DayLog> = {}
  for (const date of new Set([...Object.keys(local.days), ...Object.keys(remote.days)])) {
    const mine = local.days[date]
    const theirs = remote.days[date]
    days[date] = !theirs || (mine && (mine.updatedAt ?? 0) >= (theirs.updatedAt ?? 0)) ? mine! : theirs
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
