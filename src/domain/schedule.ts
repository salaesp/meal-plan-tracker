/**
 * Orden del día y comida "de ahora" según la hora. Las colaciones no tienen
 * horario: se hacen cuando conviene (idealmente cerca del entrenamiento).
 */
import { slugify } from './parsing'
import type { DayLog, Meal, Plan } from './types'

const DEFAULT_HOURS: Record<string, number> = { desayuno: 8, almuerzo: 13, merienda: 17, cena: 21 }

/** La comida pasa a ser "la de ahora" este rato antes de su horario. */
export const LEAD_HOURS = 1.5

export type MealTimes = Record<string, string>

export interface TimedMeal {
  meal: Meal
  hour: number
}

/** "HH:MM" a horas con decimales; `null` si no es una hora válida. */
export function parseTime(value: string | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '')
  return match ? Number(match[1]) + Number(match[2]) / 60 : null
}

export function formatTime(hour: number): string {
  const minutes = Math.min(Math.round(hour * 60), 23 * 60 + 59)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Comidas principales en orden cronológico. Las de nombre desconocido van después de la anterior. */
export function orderedMains(plan: Plan, times: MealTimes = {}): TimedMeal[] {
  let last = 6
  const timed = plan.meals
    .filter((meal) => meal.kind === 'meal')
    .map((meal) => {
      const hour = parseTime(times[meal.id]) ?? DEFAULT_HOURS[slugify(meal.name)] ?? last + 0.5
      last = hour
      return { meal, hour }
    })
  return timed.sort((a, b) => a.hour - b.hour)
}

export const snackMeals = (plan: Plan) => plan.meals.filter((meal) => meal.kind === 'snack')

const isLogged = (log: DayLog, id: string) => Boolean(log.items[id]?.status)

/** Índice de la comida que toca por horario (sin mirar si está registrada). */
function scheduledIndex(mains: TimedMeal[], hour: number): number {
  return Math.max(0, mains.findLastIndex((entry) => entry.hour - LEAD_HOURS <= hour))
}

/** Comida para la tarjeta "Ahora": la que toca o la próxima sin registrar; si no, una colación pendiente. */
export function focusMeal(plan: Plan, log: DayLog, hour: number, times?: MealTimes): Meal | null {
  const mains = orderedMains(plan, times)
  const next = mains.slice(scheduledIndex(mains, hour)).find((entry) => !isLogged(log, entry.meal.id))
  return next?.meal ?? snackMeals(plan).find((meal) => !isLogged(log, meal.id)) ?? null
}

/** Comidas principales que ya pasaron y quedaron sin registrar. */
export function pendingMeals(plan: Plan, log: DayLog, hour: number, times?: MealTimes): Meal[] {
  const mains = orderedMains(plan, times)
  return mains
    .slice(0, scheduledIndex(mains, hour))
    .filter((entry) => !isLogged(log, entry.meal.id))
    .map((entry) => entry.meal)
}

/** Próxima comida principal sin registrar después de `mealId` (para retomar tras un desvío). */
export function nextMeal(plan: Plan, log: DayLog, mealId: string, times?: MealTimes): Meal | null {
  const mains = orderedMains(plan, times)
  const index = mains.findIndex((entry) => entry.meal.id === mealId)
  return mains.slice(index + 1).find((entry) => !isLogged(log, entry.meal.id) && entry.meal.id !== mealId)?.meal ?? null
}
