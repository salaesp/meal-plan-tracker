/**
 * Plan de ejemplo, genérico e inventado. No es una recomendación nutricional.
 * Los planes reales de cada persona nunca van en el repositorio.
 */
import { withMealIds } from '../domain/parsing'
import type { Plan, Section } from '../domain/types'

const breakfast: Section[] = [
  {
    title: 'Infusión',
    rule: 'A gusto',
    hint: 'Café, té o mate',
    options: ['Café', 'Té', 'Mate'],
  },
  {
    title: 'Base',
    rule: 'Elegí 1',
    hint: 'Pan, cereal o fruta',
    options: ['Pan integral', 'Cereal sin azúcar', 'Fruta fresca'],
  },
  {
    title: 'Proteína',
    rule: 'Elegí 1',
    hint: 'Huevo, yogur o queso',
    options: ['Huevo', 'Yogur natural', 'Queso fresco'],
  },
]

const mainMeal: Section[] = [
  {
    title: 'Proteína',
    rule: 'Elegí 1',
    hint: 'Pollo, pescado, carne o legumbres',
    options: ['Pollo', 'Pescado', 'Carne magra', 'Legumbres'],
  },
  {
    title: 'Hidrato',
    rule: 'Elegí 1',
    hint: 'Arroz, fideos o papa',
    options: ['Arroz', 'Fideos', 'Papa o batata'],
  },
  {
    title: 'Vegetales',
    rule: 'Libres',
    hint: 'Ensaladas o cocidos',
    options: ['Ensalada de hojas', 'Verduras cocidas'],
  },
]

const dessert: Section[] = [
  {
    title: 'Postre',
    rule: 'Elegí 1',
    hint: 'Fruta o yogur',
    options: ['Fruta fresca', 'Yogur'],
  },
]

const snack: Section[] = [
  {
    title: 'Opciones',
    rule: 'Elegí 1',
    hint: 'Fruta, frutos secos o yogur',
    options: ['Fruta fresca', 'Un puñado de frutos secos', 'Yogur natural'],
  },
]

export const seedPlan: Plan = {
  id: 'plan-ejemplo',
  name: 'Plan de ejemplo',
  createdAt: '2026-01-01',
  waterLiters: 2,
  meals: withMealIds([
    { name: 'Desayuno', kind: 'meal', sections: breakfast, dessert: null },
    { name: 'Almuerzo', kind: 'meal', sections: mainMeal, dessert },
    { name: 'Merienda', kind: 'meal', sections: breakfast, dessert: null },
    { name: 'Cena', kind: 'meal', sections: mainMeal, dessert },
    { name: 'Colación 1', kind: 'snack', sections: snack, dessert: null },
    { name: 'Colación 2', kind: 'snack', sections: snack, dessert: null },
  ]),
  notes: [
    {
      title: 'Indicaciones',
      rule: '',
      hint: 'Hidratación y constancia',
      options: ['Tomá agua durante el día', 'Si te salís del plan, retomalo en la próxima comida'],
    },
  ],
}
