import { describe, expect, it } from 'vitest'
import { seedPlan } from '../src/data/seedPlan'
import { addDays, isISODate, weekDates } from '../src/domain/dates'
import { finalizeDraft } from '../src/domain/draft'
import { mergeData } from '../src/domain/merge'
import { parsePlan, parseWater, planFromExtraction, sectionHint } from '../src/domain/parsing'
import {
  activatePlan,
  activePlanId,
  addExtra,
  addSupplement,
  changeWater,
  checklist,
  copyableDays,
  copyDay,
  dayScore,
  deletePlan,
  dismissMissedDay,
  missedDay,
  otherPlans,
  planForDate,
  removeSupplement,
  restoreDay,
  setCombined,
  setItem,
  setMealTime,
  supplementsFor,
  toggleContext,
  toggleStatus,
  toggleSupplement,
  toggleTrained,
  weekInsight,
  weekRows,
  weekSummary,
} from '../src/domain/tracking'
import { blankPlan } from '../src/data/blankPlan'
import { focusMeal, formatTime, nextMeal, orderedMains, parseTime, pendingMeals } from '../src/domain/schedule'
import { loadDraft, saveDraft } from '../src/store/draft'
import type { Plan } from '../src/domain/types'
import { adoptLegacy, CORRUPT_KEY, initialData, loadData, parseData, STORAGE_KEY, storageKeyFor } from '../src/store/storage'

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

describe('fusión entre dispositivos', () => {
  const date = '2026-11-26'
  it('un dispositivo nuevo recibe el plan y los días del servidor', () => {
    let server = activatePlan(initialData(), newPlan, '2026-11-20')
    server = toggleStatus(server, date, 'desayuno', 'done')
    server = { ...server, updatedAt: 100 }
    const merged = mergeData(initialData(), server)
    expect(merged.activations.at(-1)?.planId).toBe('plan-nuevo')
    expect(merged.plans.map((plan) => plan.id)).toContain('plan-nuevo')
    expect(merged.days[date]?.items.desayuno?.status).toBe('done')
  })

  it('cada día se queda con la versión más nueva', () => {
    const base = initialData()
    const a = { ...base, days: { [date]: { date, planId: 'plan-ejemplo', items: { cena: { status: 'done' as const } }, waterMl: 0, extras: [], updatedAt: 1 } } }
    const b = { ...base, days: { [date]: { date, planId: 'plan-ejemplo', items: { cena: { status: 'failed' as const } }, waterMl: 0, extras: [], updatedAt: 2 } } }
    expect(mergeData(a, b).days[date]?.items.cena?.status).toBe('failed')
    expect(mergeData(b, a).days[date]?.items.cena?.status).toBe('failed')
  })
})

describe('almacenamiento por cuenta', () => {
  const memory = () => {
    const map = new Map<string, string>()
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    }
  }

  it('la primera cuenta hereda lo anterior y la segunda empieza de cero', () => {
    const storage = memory()
    storage.setItem(STORAGE_KEY, JSON.stringify(toggleStatus(initialData(), '2026-11-26', 'cena', 'done')))
    adoptLegacy(storage, storageKeyFor('a'))
    adoptLegacy(storage, storageKeyFor('b'))
    expect(loadData(storage, storageKeyFor('a')).data!.days['2026-11-26']).toBeDefined()
    expect(loadData(storage, storageKeyFor('b')).data).toBeNull()
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('cantidades', () => {
  it('conserva la cantidad de cada sección', () => {
    const plan = parsePlan({
      id: 'p',
      meals: [{ id: 'almuerzo', name: 'Almuerzo', kind: 'meal', sections: [{ title: 'Proteína', quantity: ' 300 g en crudo ', rule: '', options: ['Pollo'] }] }],
    })
    expect(plan?.meals[0]?.sections[0]?.quantity).toBe('300 g en crudo')
  })
})

describe('registro diario', () => {
  const date = '2026-11-26'

  it('lo que queda vacío no cuenta para el cumplimiento', () => {
    let data = toggleStatus(initialData(), date, 'desayuno', 'done')
    data = toggleStatus(data, date, 'almuerzo', 'partial')
    expect(dayScore(data, date)).toMatchObject({ marked: 2, total: 8, points: 1.5, ratio: 0.75 })
  })

  it('copia un día a otro y se puede deshacer', () => {
    const from = '2026-11-25'
    let data = toggleStatus(initialData(), from, 'desayuno', 'done')
    data = toggleTrained(addExtra(changeWater(data, from, 1000), from, 'a', 'alfajor'), from)
    data = toggleStatus(data, date, 'cena', 'failed')
    const before = data.days[date]
    const copied = copyDay(data, from, date)
    expect(copied.days[date]).toMatchObject({ waterMl: 1000, trained: true })
    expect(copied.days[date]?.items.desayuno?.status).toBe('done')
    expect(copied.days[date]?.items.cena).toBeUndefined()
    expect(copied.days[date]?.extras.map((extra) => extra.text)).toEqual(['alfajor'])
    expect(restoreDay(copied, date, before).days[date]).toMatchObject({ ...before, updatedAt: expect.any(Number) })
    expect(copyableDays(copied, date)).toEqual([from])
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
    data = toggleTrained(data, date)
    data = addExtra(data, date, 'a', 'pizza', '18:30')
    data = toggleStatus(data, '2026-11-27', 'almuerzo', 'done')
    const summary = weekSummary(data, weekDates(date), date)
    expect(summary).toContain('Lun 23/11 al Jue 26/11')
    expect(summary).toContain('Registradas: 2 de 32 (como el plan 1, distinto 1)')
    expect(summary).toContain('Cumplimiento de lo registrado: 50%')
    expect(summary).toContain('Entrené')
    expect(summary).toContain('Cena: distinto — [afuera]')
    expect(summary).toContain('Algo más: 18:30 pizza')
    expect(summary).not.toContain('Vie 27/11')
  })
})

describe('suplementos', () => {
  const date = '2026-11-26'
  const names = (data: ReturnType<typeof initialData>, day: string) => supplementsFor(data, day).map((entry) => entry.name)

  it('se cargan una vez y aparecen los días siguientes, no los anteriores', () => {
    let data = addSupplement(initialData(), date, 'c', 'Creatina')
    data = addSupplement(data, date, 'd', 'vitamina D')
    expect(names(data, date)).toEqual(['Creatina', 'vitamina D'])
    expect(names(data, '2026-12-03')).toEqual(['Creatina', 'vitamina D'])
    expect(names(data, '2026-11-25')).toEqual([])
  })

  it('no repite un nombre ni acepta uno vacío', () => {
    let data = addSupplement(initialData(), date, 'c', 'Creatina')
    expect(addSupplement(data, date, 'x', ' creatina ')).toBe(data)
    expect(addSupplement(data, date, 'y', '   ')).toBe(data)
  })

  it('se marcan por día', () => {
    let data = addSupplement(initialData(), date, 'c', 'Creatina')
    data = toggleSupplement(data, date, 'c')
    expect(data.days[date]?.supplements).toEqual(['c'])
    expect(data.days['2026-11-27']).toBeUndefined()
    expect(toggleSupplement(data, date, 'c').days[date]?.supplements).toEqual([])
  })

  it('quitar uno no cambia los días anteriores', () => {
    let data = addSupplement(initialData(), '2026-11-20', 'c', 'Creatina')
    data = toggleSupplement(data, '2026-11-25', 'c')
    data = toggleSupplement(data, date, 'c')
    data = removeSupplement(data, date, 'c')
    expect(names(data, '2026-11-25')).toEqual(['Creatina'])
    expect(data.days['2026-11-25']?.supplements).toEqual(['c'])
    expect(names(data, date)).toEqual([])
    expect(data.days[date]?.supplements).toEqual([])
    // Se puede volver a agregar con el mismo nombre.
    expect(names(addSupplement(data, date, 'c2', 'Creatina'), date)).toEqual(['Creatina'])
  })

  it('quitar uno agregado el mismo día lo borra del todo', () => {
    const data = removeSupplement(addSupplement(initialData(), date, 'c', 'Creatina'), date, 'c')
    expect(data.settings?.supplements).toEqual([])
  })

  it('se copian con el día, solo los vigentes', () => {
    let data = addSupplement(initialData(), '2026-11-20', 'c', 'Creatina')
    data = addSupplement(data, '2026-11-20', 'm', 'Magnesio')
    data = toggleSupplement(toggleSupplement(data, '2026-11-25', 'c'), '2026-11-25', 'm')
    data = removeSupplement(data, date, 'm')
    expect(copyDay(data, '2026-11-25', date).days[date]?.supplements).toEqual(['c'])
  })

  it('el resumen dice cuáles faltaron', () => {
    let data = addSupplement(initialData(), date, 'c', 'Creatina')
    data = addSupplement(data, date, 'd', 'Vitamina D')
    data = toggleSupplement(data, date, 'c')
    expect(weekSummary(data, [date], date)).toContain('Suplementos: no tomé Vitamina D')
    data = toggleSupplement(data, date, 'd')
    expect(weekSummary(data, [date], date)).toContain('Suplementos: todos')
  })

  it('sobreviven al guardado y, al fusionar, vale la lista del lado más nuevo', () => {
    let data = addSupplement(initialData(), '2026-11-20', 'c', 'Creatina')
    data = toggleSupplement(data, date, 'c')
    expect(parseData(JSON.stringify(data))).toEqual(data)

    const withList = { ...data, updatedAt: 1 }
    const removed = { ...removeSupplement(data, date, 'c'), updatedAt: 2 }
    expect(supplementsFor(mergeData(withList, removed), date)).toEqual([])
    expect(supplementsFor(mergeData(removed, withList), date)).toEqual([])
    // Un dispositivo sin lista no borra la del otro.
    expect(mergeData({ ...initialData(), updatedAt: 3, settings: { mealTimes: {} } }, withList).settings?.supplements).toHaveLength(1)
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

describe('borrar planes', () => {
  const unused: Plan = { ...seedPlan, id: 'plan-viejo', name: 'Plan viejo' }

  it('no deja borrar el plan activo', () => {
    const data = activatePlan(initialData(), newPlan, '2026-11-26')
    expect(deletePlan(data, 'plan-nuevo')).toBe(data)
  })

  it('un plan que nadie usó desaparece del todo', () => {
    const data = { ...initialData(), plans: [seedPlan, unused] }
    const after = deletePlan(data, 'plan-viejo')
    expect(after.plans.map((plan) => plan.id)).toEqual([seedPlan.id])
    expect(after.deletedPlans).toEqual(['plan-viejo'])
    expect(otherPlans(after)).toEqual([])
  })

  it('el historial sigue usando el plan borrado', () => {
    let data = toggleStatus(initialData(), '2026-11-25', 'colacion-2', 'done')
    data = activatePlan(data, newPlan, '2026-11-26')
    const after = deletePlan(data, seedPlan.id)
    // Sale de la lista, pero los días pasados conservan sus comidas y marcas.
    expect(otherPlans(after)).toEqual([])
    expect(planForDate(after, '2026-11-25').id).toBe(seedPlan.id)
    expect(planForDate(after, '2026-11-24').id).toBe(seedPlan.id)
    expect(checklist(planForDate(after, '2026-11-25')).map((item) => item.key)).toContain('colacion-2')
    expect(after.days['2026-11-25']?.items['colacion-2']?.status).toBe('done')
    expect(weekRows(after, weekDates('2026-11-26')).find((row) => row.key === 'colacion-2')?.cells[2]?.status).toBe('done')
  })

  it('el borrado sobrevive guardar y leer', () => {
    const data = deletePlan(activatePlan(initialData(), newPlan, '2026-11-26'), seedPlan.id)
    const loaded = parseData(JSON.stringify(data))!
    expect(loaded.deletedPlans).toEqual([seedPlan.id])
    expect(otherPlans(loaded)).toEqual([])
    expect(planForDate(loaded, '2026-11-25').id).toBe(seedPlan.id)
  })

  it('activarlo de nuevo lo saca de los borrados', () => {
    let data = deletePlan(activatePlan(initialData(), newPlan, '2026-11-26'), seedPlan.id)
    data = activatePlan(data, seedPlan, '2026-11-27')
    expect(data.deletedPlans).toBeUndefined()
    expect(otherPlans(data).map((plan) => plan.id)).toEqual(['plan-nuevo'])
  })

  it('la fusión no resucita un plan borrado en otro dispositivo', () => {
    const base = { ...initialData(), plans: [seedPlan, unused] }
    const deleted = { ...deletePlan(base, 'plan-viejo'), updatedAt: 1 }
    for (const merged of [mergeData(base, deleted), mergeData(deleted, base)]) {
      expect(merged.plans.map((plan) => plan.id)).toEqual([seedPlan.id])
      expect(merged.deletedPlans).toEqual(['plan-viejo'])
    }
  })

  it('si otro dispositivo lo activó mientras tanto, gana la activación', () => {
    const base = { ...initialData(), plans: [seedPlan, unused], updatedAt: 1 }
    const deleted = { ...deletePlan(base, 'plan-viejo'), updatedAt: 2 }
    const activated = { ...activatePlan(base, unused, '2026-11-27'), updatedAt: 3 }
    const merged = mergeData(deleted, activated)
    expect(activePlanId(merged)).toBe('plan-viejo')
    expect(merged.plans.some((plan) => plan.id === 'plan-viejo')).toBe(true)
    expect(merged.deletedPlans).toBeUndefined()
  })
})

describe('aviso de comidas sin registrar ayer', () => {
  const today = '2026-11-27'
  const withYesterday = () => toggleStatus(initialData(), '2026-11-26', 'desayuno', 'done')

  it('avisa cuántas comidas quedaron sin registrar ayer', () => {
    const data = withYesterday()
    const total = dayScore(data, '2026-11-26').total
    expect(missedDay(data, today)).toEqual({ date: '2026-11-26', missing: total - 1 })
  })

  it('sin registro de ayer no avisa', () => {
    expect(missedDay(initialData(), today)).toBeNull()
  })

  it('descartado, no vuelve para ese día ni después de guardar y leer', () => {
    const data = dismissMissedDay(withYesterday(), '2026-11-26')
    expect(data.dismissedMissedDay).toBe('2026-11-26')
    expect(missedDay(data, today)).toBeNull()
    expect(missedDay(parseData(JSON.stringify(data))!, today)).toBeNull()
  })

  it('un día nuevo sin registrar vuelve a mostrar el aviso', () => {
    let data = dismissMissedDay(withYesterday(), '2026-11-26')
    data = toggleStatus(data, '2026-11-27', 'desayuno', 'done')
    expect(missedDay(data, '2026-11-28')?.date).toBe('2026-11-27')
  })

  it('descartar un día anterior no pisa uno más nuevo', () => {
    const data = dismissMissedDay(withYesterday(), '2026-11-26')
    expect(dismissMissedDay(data, '2026-11-20')).toBe(data)
  })

  it('la fusión se queda con el descarte más nuevo', () => {
    const base = withYesterday()
    const old = dismissMissedDay(base, '2026-11-20')
    const recent = dismissMissedDay(base, '2026-11-26')
    for (const merged of [mergeData(old, recent), mergeData(recent, old), mergeData(base, recent), mergeData(recent, base)]) {
      expect(merged.dismissedMissedDay).toBe('2026-11-26')
      expect(missedDay(merged, today)).toBeNull()
    }
    expect(mergeData(base, base).dismissedMissedDay).toBeUndefined()
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

  it('respeta los horarios propios', () => {
    const times = { desayuno: '11:00', almuerzo: '15:30', cena: '23:00' }
    expect(focusMeal(seedPlan, log(), 11, times)?.id).toBe('desayuno')
    expect(pendingMeals(seedPlan, log(), 15, times).map((meal) => meal.id)).toEqual(['desayuno'])
    expect(orderedMains(seedPlan, { merienda: '12:00' }).map((entry) => entry.meal.id)[1]).toBe('merienda')
    expect([formatTime(13.5), parseTime('24:00')]).toEqual(['13:30', null])
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

  it('al fusionar conserva horarios y bienvenida, ganando lo más nuevo', () => {
    const settings = (mealTimes: Record<string, string>, onboardedAt?: string) => ({ mealTimes, onboardedAt })
    const local = { ...initialData(), updatedAt: 1, settings: settings({ cena: '21:00', desayuno: '07:00' }, '2026-11-20') }
    const remote = { ...initialData(), updatedAt: 2, settings: settings({ cena: '22:30' }) }
    expect(mergeData(local, remote).settings).toEqual({
      mealTimes: { cena: '22:30', desayuno: '07:00' },
      onboardedAt: '2026-11-20',
    })
    expect(mergeData(initialData(), remote).settings?.mealTimes).toEqual({ cena: '22:30' })
  })

  it('pide la bienvenida si no hay nada', () => {
    expect(loadData(memoryStorage())).toEqual({ data: null, recovered: false })
  })

  it('pide la bienvenida a quien solo tiene el ejemplo sin tocar', () => {
    const untouched = memoryStorage({ [STORAGE_KEY]: JSON.stringify(initialData()) })
    expect(loadData(untouched).data).toBeNull()
  })

  it('no la repite si hay registros, otro plan o ya se completó', () => {
    const kept = [
      toggleStatus(initialData(), '2026-11-26', 'desayuno', 'done'),
      initialData(newPlan, '2026-11-26'),
      initialData(undefined, '2026-11-26', { mealTimes: {}, onboardedAt: '2026-11-26' }),
    ]
    for (const data of kept) {
      expect(loadData(memoryStorage({ [STORAGE_KEY]: JSON.stringify(data) })).data).not.toBeNull()
    }
  })

  it('guarda los horarios y descarta los inválidos', () => {
    const data = setMealTime(setMealTime(initialData(), 'cena', '22:30'), 'desayuno', '99:00')
    expect(parseData(JSON.stringify(data))?.settings).toEqual({ mealTimes: { cena: '22:30' } })
  })

  it('el borrador sobrevive a recargar y se puede descartar', () => {
    const storage = { ...memoryStorage(), removeItem: (key: string) => void storage.values.delete(key) }
    saveDraft(storage, { plan: newPlan, sourceText: 'texto' })
    expect(loadDraft(storage)).toEqual({ plan: newPlan, sourceText: 'texto' })
    saveDraft(storage, null)
    expect(loadDraft(storage)).toBeNull()
  })

  it('el esqueleto manual es un plan válido', () => {
    expect(parsePlan(blankPlan('x'))?.meals).toHaveLength(4)
  })

  it('guarda una copia de los datos ilegibles', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{roto' })
    expect(loadData(storage)).toEqual({ data: null, recovered: true })
    expect(storage.values.get(CORRUPT_KEY)).toBe('{roto')
  })
})
