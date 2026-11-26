export type Status = 'done' | 'partial' | 'failed' | 'skipped'

export interface Section {
  title: string
  /** Cómo se usa la lista: "Elegí 1", "Libres", etc. Puede quedar vacío. */
  rule: string
  /** Resumen corto de qué incluye, para verlo sin desplegar. */
  hint?: string
  options: string[]
}

export interface Meal {
  /** Slug del nombre. Estable entre planes para conservar marcas del día. */
  id: string
  name: string
  kind: 'meal' | 'snack'
  sections: Section[]
  /** `null` cuando la comida no lleva postre. */
  dessert: Section[] | null
}

export interface Plan {
  id: string
  name: string
  createdAt: string
  meals: Meal[]
  /** 0 cuando el plan no define agua. */
  waterLiters: number
  notes: Section[]
}

export interface ItemLog {
  status?: Status
  note?: string
  /** Chips opcionales: hambre, dónde, cómo me sentí. */
  context?: Record<string, string>
  /** Colación hecha junto con las demás. */
  combined?: boolean
}

export interface Extra {
  id: string
  text: string
  /** HH:MM, solo si se cargó en el momento. */
  time?: string
}

export interface DayLog {
  date: string
  planId: string
  items: Record<string, ItemLog>
  waterMl: number
  extras: Extra[]
}

export interface Activation {
  /** Primer día (YYYY-MM-DD) en que rige el plan. */
  date: string
  planId: string
}

export interface Settings {
  /** Hora habitual por comida (id → "HH:MM"). Sin valor se usa la sugerida. */
  mealTimes: Record<string, string>
  /** Fecha en que se completó la bienvenida. */
  onboardedAt?: string
}

export interface AppData {
  settings?: Settings
  version: 1
  plans: Plan[]
  /** Ordenadas por fecha ascendente. */
  activations: Activation[]
  days: Record<string, DayLog>
}
