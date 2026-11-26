import { describe, expect, it } from 'vitest'
import { seedPlan } from '../src/data/seedPlan'
import { addDays, isISODate, weekDates } from '../src/domain/dates'
import { finalizeDraft } from '../src/domain/draft'
import { parsePlan, parseWater, planFromExtraction, sectionHint } from '../src/domain/parsing'
import {
  activatePlan,
  activePlanId,
  addExtra,
  changeWater,
  checklist,
  dayScore,
  planForDate,
  setCombined,
  setItem,
  toggleContext,
  toggleStatus,
  weekInsight,
  weekRows,
  weekSummary,
} from '../src/domain/tracking'
import { focusMeal, nextMeal, orderedMains, pendingMeals } from '../src/domain/schedule'
import type { Plan } from '../src/domain/types'
import { CORRUPT_KEY, initialData, loadData, parseData, STORAGE_KEY } from '../src/store/storage'

const newPlan: Plan = {
  ...seedPlan,
  id: 'plan-nuevo',
  name: 'Plan nuevo',
  meals: seedPlan.meals.filter((meal) => meal.id !== 'colacion-2'),
}

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('fechas', () => {
  it('arma la semana de lunes a domingo', () => {
    expect(weekDates('2026-11-29')).toEqual(weekDates('2026-11-23'))
    expect(weekDates('2026-11-26')[0]).toBe('2026-11-23')
    expect(weekDates('2026-11-26')[6]).toBe('2026-11-29')
  })

  it('cruza meses y rechaza fechas imposibles', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(isISODate('2026-02-30')).toBe(false)
  })
})

describe('plan inicial', () => {
  it('tiene 4 comidas, 2 postres y 2 colaciones', () => {
    expect(checklist(seedPlan).map((item) => item.key)).toEqual([
      'desayuno',
      'almuerzo',
      'almuerzo:dessert',
      'merienda',
      'cena',
      'cena:dessert',
      'colacion-1',
      'colacion-2',
    ])
  })

  it('pasa la validación sin perder nada', () => {
    expect(parsePlan(seedPlan)).toEqual(seedPlan)
  })

  it('cada sección tiene resumen; sin resumen se arma con las opciones', () => {
    expect(seedPlan.meals.flatMap((meal) => meal.sections).every((section) => section.hint)).toBe(true)
    expect(sectionHint({ title: 'x', rule: '', options: ['Arroz (integral)', 'Fideos: 1 plato', 'Papa, batata'] })).toBe(
      'Arroz · Fideos · Papa',
    )
  })
})

describe('registro diario', () => {
  const date = '2026-11-26'

  it('"No la hice" se registra pero no cuenta para el cumplimiento', () => {
    let data = toggleStatus(initialData(), date, 'desayuno', 'done')
    data = toggleStatus(data, date, 'almuerzo', 'partial')
    data = toggleStatus(data, date, 'cena', 'skipped')
    expect(dayScore(data, date)).toMatchObject({ marked: 3, counted: 2, total: 8, points: 1.5, ratio: 0.75 })
  })

  it('las colaciones combinadas se marcan juntas', () => {
    let data = toggleStatus(initialData(), date, 'colacion-1', 'done')
    data = setCombined(data, date, 'colacion-1', true)
    expect(data.days[date]?.items['colacion-2']).toMatchObject({ status: 'done', combined: true })
    data = toggleStatus(data, date, 'colacion-2', 'partial')
    expect(data.days[date]?.items['colacion-1']?.status).toBe('partial')
    data = setCombined(data, date, 'colacion-1', false)
    data = toggleStatus(data, date, 'colacion-1', 'done')
    expect(data.days[date]?.items['colacion-2']?.status).toBe('partial')
  })

  it('el contexto se elige y se quita tocando de nuevo', () => {
    let data = toggleContext(initialData(), date, 'cena', 'place', 'Afuera')
    data = toggleContext(data, date, 'cena', 'hunger', 'Mucha')
    data = toggleContext(data, date, 'cena', 'place', 'Afuera')
    expect(data.days[date]?.items.cena?.context).toEqual({ hunger: 'Mucha' })
  })

  it('la frase semanal señala lo que más cuesta', () => {
    let data = initialData()
    for (const day of ['2026-11-23', '2026-11-24']) {
      data = toggleStatus(data, day, 'desayuno', 'done')
      data = toggleStatus(data, day, 'merienda', 'failed')
    }
    expect(weekInsight(weekRows(data, weekDates(date)))).toBe('Lo que más cuesta esta semana: merienda.')
  })

  it('desmarca al tocar dos veces y conserva la nota', () => {
    let data = setItem(initialData(), date, 'desayuno', { note: 'tostadas' })
    data = toggleStatus(data, date, 'desayuno', 'done')
    data = toggleStatus(data, date, 'desayuno', 'done')
    expect(data.days[date]?.items.desayuno).toEqual({ note: 'tostadas', status: undefined })
    expect(dayScore(data, date).ratio).toBeNull()
  })

  it('no deja agua negativa ni extras vacíos', () => {
    let data = changeWater(initialData(), date, -500)
    data = addExtra(data, date, 'a', '   ')
    expect(data.days[date]).toMatchObject({ waterMl: 0, extras: [] })
  })

  it('resume la semana con desvíos, contexto y extras, sin días futuros', () => {
    let data = toggleStatus(initialData(), date, 'cena', 'failed')
    data = toggleContext(data, date, 'cena', 'place', 'Afuera')
    data = toggleStatus(data, date, 'desayuno', 'done')
    data = toggleStatus(data, date, 'merienda', 'skipped')
    data = addExtra(data, date, 'a', 'pizza', '18:30')
    data = toggleStatus(data, '2026-11-27', 'almuerzo', 'done')
    const summary = weekSummary(data, weekDates(date), date)
    expect(summary).toContain('Lun 23/11 al Jue 26/11')
    expect(summary).toContain('Registradas: 3 de 32 (como el plan 1, distinto 1, no la hice 1)')
    expect(summary).toContain('Cumplimiento sin contar comidas no hechas: 50%')
    expect(summary).toContain('Cena: distinto — [afuera]')
    expect(summary).toContain('Algo más: 18:30 pizza')
    expect(summary).not.toContain('Vie 27/11')
  })
})

describe('cambio de plan', () => {
  it('rige desde hoy y no toca los días anteriores', () => {
    let data = toggleStatus(initialData(), '2026-11-25', 'colacion-2', 'done')
    data = toggleStatus(data, '2026-11-26', 'desayuno', 'done')
    data = activatePlan(data, newPlan, '2026-11-26')
    expect(activePlanId(data)).toBe('plan-nuevo')
    expect(planForDate(data, '2026-11-24').id).toBe(seedPlan.id)
    expect(planForDate(data, '2026-11-25').id).toBe(seedPlan.id)
    expect(planForDate(data, '2026-11-26').id).toBe('plan-nuevo')
    expect(data.days['2026-11-26']?.items.desayuno?.status).toBe('done')
  })

  it('marca como no aplicable lo que el plan de ese día no tiene', () => {
    const data = activatePlan(initialData(), newPlan, '2026-11-26')
    const row = weekRows(data, weekDates('2026-11-26')).find((entry) => entry.key === 'colacion-2')!
    expect(row.cells.map((cell) => cell !== null)).toEqual([true, true, true, false, false, false, false])
  })

  it('reactivar un plan anterior no lo duplica', () => {
    let data = activatePlan(initialData(), newPlan, '2026-11-26')
    data = activatePlan(data, seedPlan, '2026-11-26')
    expect(data.plans).toHaveLength(2)
    expect(activePlanId(data)).toBe(seedPlan.id)
  })
})

describe('extracción de IA', () => {
  const section = { title: 'Base', rule: 'Elegí 1', options: ['pan', ' ', 7] }

  it('expande grupos, ordena el día y genera colaciones', () => {
    const plan = planFromExtraction(
      {
        mealGroups: {
          groups: [
            { names: ['Almuerzo', 'Cena'], sections: [section], dessert: [section] },
            { names: ['Desayuno', 'Merienda'], sections: [section], dessert: [] },
          ],
        },
        snacks: { perDay: 2, sections: [section] },
        general: { waterLiters: 2.5, notes: [] },
      },
      'x',
      '2026-11-26',
    )
    expect(plan.meals.map((meal) => meal.name)).toEqual([
      'Desayuno',
      'Almuerzo',
      'Merienda',
      'Cena',
      'Colación 1',
      'Colación 2',
    ])
    expect(plan.meals[0]?.dessert).toBeNull()
    expect(plan.meals[1]?.dessert).toHaveLength(1)
    expect(plan.meals[0]?.sections[0]?.options).toEqual(['pan'])
    expect(plan.waterLiters).toBe(2.5)
  })

  it('tolera basura sin romper', () => {
    const plan = planFromExtraction({ mealGroups: 'no', snacks: { perDay: 99 }, general: null }, 'x', '2026-11-26')
    expect(plan.meals).toHaveLength(6)
    expect(planFromExtraction({}, 'x', '2026-11-26').meals).toEqual([])
    expect(parsePlan({ id: 'x', meals: [] })).toBeNull()
    expect(parseWater('2,5')).toBe(2.5)
    expect(parseWater(500)).toBe(0)
  })

  it('al activar el borrador recalcula ids y limpia vacíos', () => {
    const draft: Plan = {
      ...seedPlan,
      meals: [
        { id: 'a', name: 'Media mañana', kind: 'meal', sections: [{ title: 't', rule: '', options: ['x', ''] }], dessert: null },
        { id: 'b', name: '  ', kind: 'meal', sections: [], dessert: null },
      ],
    }
    const plan = finalizeDraft(draft, 'nuevo', '2026-11-26')
    expect(plan?.meals).toHaveLength(1)
    expect(plan?.meals[0]).toMatchObject({ id: 'media-manana', sections: [{ options: ['x'] }] })
  })
})

describe('horarios', () => {
  const date = '2026-11-26'
  const empty = initialData()
  const log = (data = empty) => data.days[date] ?? { date, planId: seedPlan.id, items: {}, waterMl: 0, extras: [] }

  it('ordena las comidas por horario y deja las colaciones aparte', () => {
    expect(orderedMains(seedPlan).map((entry) => entry.meal.id)).toEqual(['desayuno', 'almuerzo', 'merienda', 'cena'])
  })

  it('elige la comida de ahora según la hora, con margen previo', () => {
    expect(focusMeal(seedPlan, log(), 7)?.id).toBe('desayuno')
    expect(focusMeal(seedPlan, log(), 11.5)?.id).toBe('almuerzo')
    expect(focusMeal(seedPlan, log(), 16)?.id).toBe('merienda')
    expect(focusMeal(seedPlan, log(), 23)?.id).toBe('cena')
  })

  it('si la de ahora ya está, pasa a la siguiente y después a colaciones', () => {
    let data = toggleStatus(empty, date, 'almuerzo', 'done')
    expect(focusMeal(seedPlan, log(data), 12)?.id).toBe('merienda')
    data = toggleStatus(data, date, 'merienda', 'done')
    data = toggleStatus(data, date, 'cena', 'done')
    expect(focusMeal(seedPlan, log(data), 12)?.id).toBe('colacion-1')
  })

  it('avisa las comidas pasadas sin registrar y sugiere la próxima', () => {
    const data = toggleStatus(empty, date, 'desayuno', 'done')
    expect(pendingMeals(seedPlan, log(data), 18).map((meal) => meal.id)).toEqual(['almuerzo'])
    expect(nextMeal(seedPlan, log(data), 'almuerzo')?.id).toBe('merienda')
    expect(nextMeal(seedPlan, log(data), 'cena')).toBeNull()
  })
})

describe('guardado', () => {
  it('sobrevive ida y vuelta con contexto, combinadas y hora de extras', () => {
    let data = toggleStatus(initialData(), '2026-11-26', 'desayuno', 'done')
    data = toggleContext(data, '2026-11-26', 'desayuno', 'mood', 'Bien')
    data = setCombined(data, '2026-11-26', 'colacion-1', true)
    data = addExtra(data, '2026-11-26', 'x', 'mate', '10:00')
    expect(parseData(JSON.stringify(data))).toEqual(data)
  })

  it('arranca con el plan inicial si no hay nada', () => {
    expect(loadData(memoryStorage())).toEqual({ data: initialData(), recovered: false })
  })

  it('guarda una copia de los datos ilegibles', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{roto' })
    expect(loadData(storage).recovered).toBe(true)
    expect(storage.values.get(CORRUPT_KEY)).toBe('{roto')
  })
})
