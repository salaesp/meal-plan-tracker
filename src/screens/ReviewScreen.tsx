import { useState } from 'react'
import { finalizeDraft } from '../domain/draft'
import { parseWater } from '../domain/parsing'
import type { Meal, Plan, Section } from '../domain/types'
import type { Draft } from '../store/importPlan'

const emptySection = (): Section => ({ title: 'Opciones', rule: '', options: [''] })

function SectionsEditor({ sections, onChange }: { sections: Section[]; onChange: (sections: Section[]) => void }) {
  const patch = (index: number, change: Partial<Section>) =>
    onChange(sections.map((section, i) => (i === index ? { ...section, ...change } : section)))

  return (
    <>
      {sections.map((section, index) => (
        <fieldset key={index}>
          <label className="field">
            Título
            <input value={section.title} onChange={(event) => patch(index, { title: event.target.value })} />
          </label>
          <label className="field">
            Cantidad
            <input
              value={section.quantity ?? ''}
              placeholder="Ej. 300 g en crudo"
              onChange={(event) => patch(index, { quantity: event.target.value })}
            />
          </label>
          <label className="field">
            Regla
            <input
              value={section.rule}
              placeholder="Ej. Elegí 1"
              onChange={(event) => patch(index, { rule: event.target.value })}
            />
          </label>
          <label className="field">
            Resumen (se ve sin desplegar)
            <input
              value={section.hint ?? ''}
              placeholder="Ej. Huevos, queso o fiambre magro"
              onChange={(event) => patch(index, { hint: event.target.value })}
            />
          </label>
          <label className="field">
            Opciones (una por línea)
            <textarea
              rows={Math.min(12, section.options.length + 2)}
              value={section.options.join('\n')}
              onChange={(event) => patch(index, { options: event.target.value.split('\n') })}
            />
          </label>
          <button type="button" className="link" onClick={() => onChange(sections.filter((_, i) => i !== index))}>
            Quitar sección
          </button>
        </fieldset>
      ))}
      <button type="button" className="link" onClick={() => onChange([...sections, emptySection()])}>
        + Agregar sección
      </button>
    </>
  )
}

interface Props {
  draft: Draft
  onChange: (draft: Draft) => void
  onActivate: (plan: Plan) => void
  onDiscard: () => void
}

export function ReviewScreen({ draft, onChange, onActivate, onDiscard }: Props) {
  const { plan, sourceText } = draft
  const [water, setWater] = useState(() => String(plan.waterLiters || '').replace('.', ','))
  const [error, setError] = useState('')
  const setPlan = (change: Partial<Plan>) => onChange({ ...draft, plan: { ...plan, ...change } })
  const patchMeal = (index: number, change: Partial<Meal>) =>
    setPlan({ meals: plan.meals.map((meal, i) => (i === index ? { ...meal, ...change } : meal)) })

  const activate = () => {
    const finished = finalizeDraft(plan, `plan-${Date.now()}`, new Date().toISOString().slice(0, 10))
    if (finished) onActivate(finished)
    else setError('El plan necesita al menos una comida con nombre.')
  }

  return (
    <>
      <header className="page-header">
        <h1>Revisar plan</h1>
      </header>
      <p className="notice">
        {sourceText
          ? 'La IA puede omitir opciones o cambiar cantidades. Compará con el original antes de activar.'
          : 'Al activar se guarda como plan nuevo desde hoy; los días anteriores no cambian.'}
      </p>

      {sourceText && (
        <details className="card">
          <summary>Texto original</summary>
          <pre>{sourceText}</pre>
        </details>
      )}

      <section className="card">
        <label className="field">
          Nombre del plan
          <input value={plan.name} onChange={(event) => setPlan({ name: event.target.value })} />
        </label>
        <label className="field">
          Agua por día (litros)
          <input
            inputMode="decimal"
            value={water}
            onChange={(event) => {
              setWater(event.target.value)
              setPlan({ waterLiters: parseWater(event.target.value) })
            }}
          />
        </label>
      </section>

      {plan.meals.map((meal, index) => (
        <details className="card" key={meal.id}>
          <summary>
            {meal.name || 'Sin nombre'}
            <small>
              {meal.sections.length === 1 ? '1 sección' : `${meal.sections.length} secciones`}
              {meal.dessert ? ' · con postre' : ''}
            </small>
          </summary>
          <label className="field">
            Nombre
            <input value={meal.name} onChange={(event) => patchMeal(index, { name: event.target.value })} />
          </label>
          <SectionsEditor sections={meal.sections} onChange={(sections) => patchMeal(index, { sections })} />
          <label className="check">
            <input
              type="checkbox"
              checked={meal.dessert !== null}
              onChange={(event) => patchMeal(index, { dessert: event.target.checked ? [emptySection()] : null })}
            />
            Lleva postre
          </label>
          {meal.dessert && (
            <SectionsEditor sections={meal.dessert} onChange={(dessert) => patchMeal(index, { dessert })} />
          )}
          <button
            type="button"
            className="link danger"
            onClick={() => setPlan({ meals: plan.meals.filter((_, i) => i !== index) })}
          >
            Quitar esta comida
          </button>
        </details>
      ))}
      <button
        type="button"
        className="link"
        onClick={() =>
          setPlan({
            meals: [
              ...plan.meals,
              { id: `nueva-${Date.now()}`, name: 'Nueva comida', kind: 'meal', sections: [], dessert: null },
            ],
          })
        }
      >
        + Agregar comida
      </button>

      <details className="card">
        <summary>Indicaciones generales</summary>
        <SectionsEditor sections={plan.notes} onChange={(notes) => setPlan({ notes })} />
      </details>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="button block" onClick={activate}>
        Activar desde hoy
      </button>
      <button type="button" className="button secondary block" onClick={onDiscard}>
        Descartar
      </button>
    </>
  )
}
