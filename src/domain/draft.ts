import { parsePlan, withMealIds } from './parsing'
import type { Plan } from './types'

/**
 * Convierte lo revisado en un plan listo para activar: id nuevo (los días ya
 * registrados siguen apuntando al anterior), ids de comida según el nombre y
 * sin opciones vacías. `null` si no quedó ninguna comida con nombre.
 */
export function finalizeDraft(draft: Plan, id: string, createdAt: string): Plan | null {
  const meals = withMealIds(draft.meals.filter((meal) => meal.name.trim()))
  return parsePlan({ ...draft, id, createdAt, meals })
}
