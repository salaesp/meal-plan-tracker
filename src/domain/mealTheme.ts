/** Identidad visual por comida: indica qué comida es, nunca cómo fue. */
import { slugify } from './parsing'
import type { Meal } from './types'

export type MealTheme = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'colacion' | 'otra'

const MOMENTS: Record<MealTheme, string> = {
  desayuno: 'a la mañana',
  almuerzo: 'al mediodía',
  merienda: 'media tarde',
  cena: 'a la noche',
  colacion: 'cuando quieras',
  otra: '',
}

export function mealTheme(meal: Pick<Meal, 'name' | 'kind'>): MealTheme {
  if (meal.kind === 'snack') return 'colacion'
  const slug = slugify(meal.name)
  return (['desayuno', 'almuerzo', 'merienda', 'cena'] as const).find((name) => slug.startsWith(name)) ?? 'otra'
}

export const mealMoment = (theme: MealTheme) => MOMENTS[theme]
