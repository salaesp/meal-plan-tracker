/**
 * Validación de datos que no controlamos: respuestas de la IA, formulario de
 * revisión y archivos de backup. Lo usan la app y el Worker.
 */
import type { Meal, Plan, Section } from './types'

const MAX_MEALS = 12
const MAX_SNACKS = 6
const MAX_SECTIONS = 20
const MAX_OPTIONS = 60
const MAX_TEXT = 600

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '')

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'comida'
  )
}

/** Resumen a mostrar plegado: el del plan o el comienzo de cada opción. */
export function sectionHint(section: Section): string {
  if (section.hint) return section.hint
  return section.options
    .map((option) => option.split(/[(:,]/)[0]!.trim())
    .filter(Boolean)
    .join(' · ')
}

export function parseSections(value: unknown): Section[] {
  return asArray(value)
    .slice(0, MAX_SECTIONS)
    .flatMap((entry) => {
      if (!isRecord(entry)) return []
      const title = asText(entry.title)
      const rule = asText(entry.rule)
      const options = asArray(entry.options).map(asText).filter(Boolean).slice(0, MAX_OPTIONS)
      if (!options.length && !rule) return []
      const hint = asText(entry.hint).slice(0, 120)
      return [{ title: title || 'Opciones', rule, ...(hint ? { hint } : {}), options }]
    })
}

/** Asigna ids únicos a partir de los nombres. */
export function withMealIds(meals: Omit<Meal, 'id'>[]): Meal[] {
  const used = new Set<string>()
  return meals.map((meal) => {
    const base = slugify(meal.name)
    let id = base
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
    used.add(id)
    return { ...meal, id }
  })
}

export function parseWater(value: unknown): number {
  const liters = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  return typeof liters === 'number' && Number.isFinite(liters) && liters > 0 && liters <= 8 ? liters : 0
}

/**
 * Forma que le pedimos a la IA. Las comidas que comparten contenido van en un
 * solo grupo (ej. "Desayuno / Merienda") para no generar el texto dos veces.
 */
export interface Extraction {
  mealGroups?: unknown
  snacks?: unknown
  general?: unknown
}

/** El modelo a veces arma una sección por colación: se juntan en una sola lista. */
function mergeSingleOptions(sections: Section[]): Section[] {
  if (sections.length < 3 || sections.some((section) => section.options.length > 2)) return sections
  return [{ title: 'Opciones', rule: 'Elegí 1', options: sections.flatMap((section) => section.options) }]
}

export function planFromExtraction(extraction: Extraction, id: string, createdAt: string): Plan {
  const mains: Omit<Meal, 'id'>[] = []
  const groups = isRecord(extraction.mealGroups) ? asArray(extraction.mealGroups.groups) : []
  for (const group of groups) {
    if (!isRecord(group)) continue
    const sections = parseSections(group.sections)
    const dessert = parseSections(group.dessert)
    for (const name of asArray(group.names).map(asText).filter(Boolean)) {
      mains.push({ name, kind: 'meal', sections, dessert: dessert.length ? dessert : null })
    }
  }

  const dayOrder = ['desayuno', 'almuerzo', 'merienda', 'cena']
  const rank = (name: string) => {
    const index = dayOrder.indexOf(slugify(name))
    return index === -1 ? dayOrder.length : index
  }
  mains.sort((a, b) => rank(a.name) - rank(b.name))

  const snackData = isRecord(extraction.snacks) ? extraction.snacks : {}
  const snackSections = mergeSingleOptions(parseSections(snackData.sections))
  const requested = typeof snackData.perDay === 'number' ? Math.round(snackData.perDay) : 0
  const perDay = Math.min(MAX_SNACKS, Math.max(requested, snackSections.length ? 1 : 0))
  const snacks: Omit<Meal, 'id'>[] = Array.from({ length: perDay }, (_, index) => ({
    name: perDay === 1 ? 'Colación' : `Colación ${index + 1}`,
    kind: 'snack',
    sections: snackSections,
    dessert: null,
  }))

  const general = isRecord(extraction.general) ? extraction.general : {}
  return {
    id,
    name: `Plan ${createdAt.slice(0, 10)}`,
    createdAt,
    meals: withMealIds([...mains.slice(0, MAX_MEALS - snacks.length), ...snacks]),
    waterLiters: parseWater(general.waterLiters),
    notes: parseSections(general.notes),
  }
}

/** Plan ya armado (backup o respuesta de la Function). `null` si no es usable. */
export function parsePlan(value: unknown): Plan | null {
  if (!isRecord(value)) return null
  const id = asText(value.id)
  if (!id) return null
  const used = new Set<string>()
  const meals: Meal[] = []
  for (const entry of asArray(value.meals).slice(0, MAX_MEALS)) {
    if (!isRecord(entry)) continue
    const name = asText(entry.name)
    const mealId = asText(entry.id)
    if (!name || !mealId || used.has(mealId)) continue
    used.add(mealId)
    meals.push({
      id: mealId,
      name,
      kind: entry.kind === 'snack' ? 'snack' : 'meal',
      sections: parseSections(entry.sections),
      dessert: Array.isArray(entry.dessert) ? parseSections(entry.dessert) : null,
    })
  }
  if (!meals.length) return null
  return {
    id,
    name: asText(value.name) || 'Plan',
    createdAt: asText(value.createdAt),
    meals,
    waterLiters: parseWater(value.waterLiters),
    notes: parseSections(value.notes),
  }
}
