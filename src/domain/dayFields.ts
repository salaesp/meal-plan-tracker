/**
 * Cada parte de un día (cada comida, el agua, el entrenamiento, "algo más", los
 * suplementos y el plan) lleva su propia hora de cambio. Así, al fusionar dos
 * dispositivos, tocar el agua en uno no pisa la cena marcada en el otro.
 */
import type { DayLog, ItemLog } from './types'

const SIMPLE_FIELDS = ['planId', 'waterMl', 'trained', 'extras', 'supplements'] as const
type SimpleField = (typeof SIMPLE_FIELDS)[number]

/** Clave en `changedAt` de una comida (o postre) del día. */
export const itemField = (key: string) => `item:${key}`

/** JSON con claves ordenadas y sin `undefined`, para comparar valores. */
function stable(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry,
  )
}

const simpleValue = (log: DayLog, field: SimpleField): unknown =>
  field === 'supplements' ? [...(log.supplements ?? [])].sort() : field === 'trained' ? Boolean(log.trained) : log[field]

/** Todas las claves de campo presentes en el día. */
function fieldsOf(log: DayLog): string[] {
  return [...SIMPLE_FIELDS, ...Object.keys(log.items).map(itemField)]
}

/**
 * Hora de cambio de un campo. Un día guardado antes de que existiera
 * `changedAt` usa su `updatedAt` para todo.
 */
export function fieldAt(log: DayLog, field: string): number {
  return log.changedAt ? (log.changedAt[field] ?? 0) : (log.updatedAt ?? 0)
}

/** Marca con `now` los campos que cambiaron entre `before` y `after`. */
export function stampChanges(before: DayLog, after: DayLog, now: number): Record<string, number> {
  const stamps: Record<string, number> = {}
  for (const field of fieldsOf(before)) {
    const at = fieldAt(before, field)
    if (at) stamps[field] = at
  }
  for (const field of SIMPLE_FIELDS) {
    if (stable(simpleValue(before, field)) !== stable(simpleValue(after, field))) stamps[field] = now
  }
  for (const key of new Set([...Object.keys(before.items), ...Object.keys(after.items)])) {
    if (stable(before.items[key]) !== stable(after.items[key])) stamps[itemField(key)] = now
  }
  return stamps
}

/** Une dos versiones del mismo día campo por campo: gana el cambio más nuevo. */
export function mergeDay(mine: DayLog | undefined, theirs: DayLog | undefined): DayLog {
  if (!mine || !theirs) return (mine ?? theirs)!
  // Ante empate (o sin marcas), el día modificado más recientemente.
  const [first, second] = (mine.updatedAt ?? 0) >= (theirs.updatedAt ?? 0) ? [mine, theirs] : [theirs, mine]
  const pick = (field: string) => (fieldAt(second, field) > fieldAt(first, field) ? second : first)
  const changedAt: Record<string, number> = {}
  const stamp = (field: string, source: DayLog) => {
    const at = fieldAt(source, field)
    if (at) changedAt[field] = at
  }

  const merged: DayLog = { ...first, items: {} }
  for (const field of SIMPLE_FIELDS) {
    const source = pick(field)
    stamp(field, source)
    if (field === 'planId') merged.planId = source.planId
    else if (field === 'waterMl') merged.waterMl = source.waterMl
    else if (field === 'extras') merged.extras = source.extras
    else if (field === 'trained') merged.trained = source.trained
    else merged.supplements = source.supplements
  }
  for (const key of new Set([...Object.keys(mine.items), ...Object.keys(theirs.items)])) {
    const source = pick(itemField(key))
    stamp(itemField(key), source)
    const item: ItemLog | undefined = source.items[key]
    if (item) merged.items[key] = item
  }
  const updatedAt = Math.max(mine.updatedAt ?? 0, theirs.updatedAt ?? 0)
  return { ...merged, changedAt, ...(updatedAt ? { updatedAt } : {}) }
}
