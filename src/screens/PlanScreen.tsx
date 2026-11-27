import { useState } from 'react'
import type { Account } from '../auth/AuthGate'
import { MealBadge, SectionList } from '../components/common'
import { ImportForm } from '../components/ImportForm'
import { MealTimesFields } from '../components/MealTimesFields'
import { mealTheme } from '../domain/mealTheme'
import { activatePlan, activePlanId, setMealTime } from '../domain/tracking'
import type { AppData } from '../domain/types'
import type { Update } from '../store/useAppData'
import type { PlanImport } from '../store/usePlanImport'

interface Props {
  account: Account
  data: AppData
  update: Update
  today: string
  importer: PlanImport
}

export function PlanScreen({ account, data, update, today, importer }: Props) {
  const [accountError, setAccountError] = useState('')
  const signOut = async () => setAccountError((await account.signOut()) ?? '')
  const activeId = activePlanId(data)
  const active = data.plans.find((plan) => plan.id === activeId)!

  const edit = () => {
    if (importer.draft?.sourceText && !window.confirm('Tenés un plan sin revisar. ¿Descartarlo y editar el actual?')) return
    importer.setDraft({ plan: active, sourceText: '' })
    window.location.hash = '#/revisar'
  }

  return (
    <>
      <header className="page-header">
        <h1>Plan</h1>
      </header>

      <div className="card-header">
        <h2>{active.name}</h2>
        <button type="button" className="link" onClick={edit}>
          Editar
        </button>
      </div>
      {active.meals.map((meal) => (
        <details className={`meal-card theme-${mealTheme(meal)}`} key={meal.id}>
          <summary>
            <MealBadge theme={mealTheme(meal)} />
            {meal.name}
          </summary>
          <div className="meal-card-body">
            <SectionList sections={meal.sections} />
            {meal.dessert && <SectionList sections={meal.dessert} />}
          </div>
        </details>
      ))}
      {active.notes.length > 0 && (
        <details className="card">
          <summary>Indicaciones generales</summary>
          <SectionList sections={active.notes} />
        </details>
      )}

      <details className="card">
        <summary>Horarios de comidas</summary>
        <MealTimesFields
          plan={active}
          times={data.settings?.mealTimes ?? {}}
          onChange={(mealId, time) => update((current) => setMealTime(current, mealId, time))}
        />
      </details>

      <section className="card quiet">
        <h2>Cargar plan nuevo</h2>
        <ImportForm importer={importer} onExpired={signOut} />
        {accountError && (
          <p className="notice error" role="alert">
            {accountError}
          </p>
        )}
      </section>

      {data.plans.length > 1 && (
        <section className="card">
          <h2>Otros planes</h2>
          <ul className="extras">
            {data.plans
              .filter((plan) => plan.id !== activeId)
              .map((plan) => (
                <li key={plan.id}>
                  <span>{plan.name}</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => update((current) => activatePlan(current, plan, today))}
                  >
                    Activar desde hoy
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  )
}
