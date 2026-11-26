import { withMealIds } from '../domain/parsing'
import type { Meal, Plan } from '../domain/types'

/** Esqueleto para cargar el plan a mano. */
export function blankPlan(id: string): Plan {
  const meals: Omit<Meal, 'id'>[] = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'].map((name) => ({
    name,
    kind: 'meal',
    sections: [],
    dessert: null,
  }))
  return { id, name: 'Mi plan', createdAt: '', meals: withMealIds(meals), waterLiters: 2, notes: [] }
}
