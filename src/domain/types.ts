/** Sin estado = no la hice (o todavía no registrada). */
export type Status = 'done' | 'partial' | 'failed'

export interface Section {
  title: string
  /** Cómo se usa la lista: "Elegí 1", "Libres", etc. Puede quedar vacío. */
  rule: string
  /** Cantidad de la sección tal como figura en el plan (ej. "300 g en crudo"). */
  quantity?: string
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
  /** Última modificación (ms), para fusionar entre dispositivos. */
  updatedAt?: number
  /** Entrené ese día. */
  trained?: boolean
  /** Ids de los suplementos que tomé ese día. */
  supplements?: string[]
}

export interface Activation {
  /** Primer día (YYYY-MM-DD) en que rige el plan. */
  date: string
  planId: string
}

/**
 * Suplemento que se toma todos los días. Se carga una vez desde el día y
 * queda para los siguientes; no depende del plan.
 */
export interface Supplement {
  id: string
  name: string
  /** Primer día (YYYY-MM-DD) en que aparece. */
  since: string
  /** Día desde el que deja de aparecer. Los días anteriores lo conservan. */
  until?: string
}

export interface Settings {
  /** Hora habitual por comida (id → "HH:MM"). Sin valor se usa la sugerida. */
  mealTimes: Record<string, string>
  /** Fecha en que se completó la bienvenida. */
  onboardedAt?: string
  /** Lista completa, también los que se dejaron de tomar (con `until`). */
  supplements?: Supplement[]
}

export interface AppData {
  settings?: Settings
  version: 1
  plans: Plan[]
  /** Ordenadas por fecha ascendente. */
  activations: Activation[]
  days: Record<string, DayLog>
  /**
   * Ids de planes borrados. Se conservan para que la fusión con otro
   * dispositivo (o con la base) no los resucite.
   */
  deletedPlans?: string[]
  /**
   * Último día (YYYY-MM-DD) cuyo aviso de "comidas sin registrar" se cerró.
   * Un día posterior sin registrar vuelve a mostrar el aviso.
   */
  dismissedMissedDay?: string
  /** Última modificación (ms). */
  updatedAt?: number
}
