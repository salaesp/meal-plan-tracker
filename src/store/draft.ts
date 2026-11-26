/** Borrador de plan sin activar: sobrevive a cambiar de pestaña o cerrar la app. */
import { isRecord, parsePlan } from '../domain/parsing'
import type { Draft } from './importPlan'

export const DRAFT_KEY = 'meal-plan:draft'

export function loadDraft(storage: Pick<Storage, 'getItem'>): Draft | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(DRAFT_KEY) ?? 'null')
    if (!isRecord(value)) return null
    const plan = parsePlan(value.plan)
    return plan ? { plan, sourceText: typeof value.sourceText === 'string' ? value.sourceText : '' } : null
  } catch {
    return null
  }
}

export function saveDraft(storage: Pick<Storage, 'setItem' | 'removeItem'>, draft: Draft | null): void {
  try {
    if (draft) storage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else storage.removeItem(DRAFT_KEY)
  } catch {
    // Sin espacio: el borrador queda solo en memoria.
  }
}
