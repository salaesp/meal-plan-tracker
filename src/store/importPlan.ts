import { toISODate } from '../domain/dates'
import { isRecord, parsePlan } from '../domain/parsing'
import type { Plan } from '../domain/types'
import { readPdfFile } from './pdfText'

export interface Draft {
  plan: Plan
  /** Texto original para comparar. Vacío cuando se edita un plan ya cargado. */
  sourceText: string
}

export class SessionExpiredError extends Error {}

/** Fecha y nombre según el día local (el servidor trabaja en UTC). */
export function datedPlan(plan: Plan, date = new Date()): Plan {
  const iso = toISODate(date)
  const [year, month, day] = iso.split('-')
  return { ...plan, createdAt: iso, name: `Plan ${day}/${month}/${year!.slice(2)}` }
}

export async function importPlan(input: File | string, signal?: AbortSignal): Promise<Draft> {
  const form = new FormData()
  form.set('text', typeof input === 'string' ? input : await readPdfFile(input))

  let response: Response
  try {
    response = await fetch('/api/parse-plan', { method: 'POST', body: form, signal })
  } catch {
    throw new Error('Sin conexión. La carga con IA necesita internet.')
  }
  if (response.status === 401) throw new SessionExpiredError()

  const body: unknown = await response.json().catch(() => null)
  if (!isRecord(body)) throw new Error('El servicio de IA no está disponible en este entorno.')
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'No se pudo procesar el plan.')

  const plan = parsePlan(body.plan)
  if (!plan) throw new Error('La respuesta no tiene un plan válido.')
  return { plan: datedPlan(plan), sourceText: typeof body.sourceText === 'string' ? body.sourceText : '' }
}
