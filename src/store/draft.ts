/** Borrador de plan sin activar: sobrevive a cambiar de pestaña o cerrar la app. */
import { isRecord, parsePlan } from '../domain/parsing'
import type { Draft } from './importPlan'

export const DRAFT_KEY = 'meal-plan:draft'
/** Igual que los registros, el borrador es de cada cuenta. */
export const draftKeyFor = (userId: string | null) => (userId ? `${DRAFT_KEY}:${userId}` : DRAFT_KEY)

export function loadDraft(storage: Pick<Storage, 'getItem'>, key = DRAFT_KEY): Draft | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? 'null')
    if (!isRecord(value)) return null
    const plan = parsePlan(value.plan)
    return plan ? { plan, sourceText: typeof value.sourceText === 'string' ? value.sourceText : '' } : null
  } catch {
    return null
  }
}

export function saveDraft(storage: Pick<Storage, 'setItem' | 'removeItem'>, draft: Draft | null, key = DRAFT_KEY): void {
  try {
    if (draft) storage.setItem(key, JSON.stringify(draft))
    else storage.removeItem(key)
  } catch {
    // Sin espacio: el borrador queda solo en memoria.
  }
}
