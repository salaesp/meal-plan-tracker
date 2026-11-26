import { useEffect, useRef, useState } from 'react'
import type { Account } from '../auth/AuthGate'
import { MealBadge } from '../components/common'
import { Icon } from '../components/icons'
import { ImportForm } from '../components/ImportForm'
import { MealTimesFields } from '../components/MealTimesFields'
import { blankPlan } from '../data/blankPlan'
import { seedPlan } from '../data/seedPlan'
import type { MealTimes } from '../domain/schedule'
import type { AppData, Plan } from '../domain/types'
import { datedPlan } from '../store/importPlan'
import { initialData, parseData } from '../store/storage'
import type { PlanImport } from '../store/usePlanImport'
import { ReviewScreen } from './ReviewScreen'

const STEPS = { plan: '#/inicio/plan', times: '#/inicio/horarios', review: '#/revisar' }

const go = (hash: string) => {
  window.location.hash = hash
}

interface Props {
  account: Account
  importer: PlanImport
  hash: string
  today: string
  recovered: boolean
  onFinish: (data: AppData) => void
}

/** Bienvenida → plan → horarios. Cada paso es una ruta para que funcione el botón atrás. */
export function Onboarding({ account, importer, hash, today, recovered, onFinish }: Props) {
  const [chosen, setChosen] = useState<Plan | null>(null)
  const [times, setTimes] = useState<MealTimes>({})

  // Cuando la IA termina, pasa sola a la revisión.
  const seen = useRef(importer.finished)
  useEffect(() => {
    if (importer.finished === seen.current) return
    seen.current = importer.finished
    go(STEPS.review)
  }, [importer.finished])

  // Con llaves: `scrollTo` puede devolver una promesa y un efecto no debe devolverla.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [hash])

  const choose = (plan: Plan) => {
    setChosen(plan)
    setTimes({})
    go(STEPS.times)
  }

  const finish = (data: AppData) => {
    importer.cancel()
    importer.setDraft(null)
    go('#/')
    onFinish(data)
  }

  if (hash === STEPS.review && importer.draft) {
    return (
      <main className="onboarding">
        <StepHeader step={2} back={STEPS.plan} />
        <ReviewScreen
          key={importer.draft.plan.id}
          draft={importer.draft}
          onChange={importer.setDraft}
          activateLabel="Continuar"
          intro={
            importer.draft.sourceText
              ? 'La IA puede omitir opciones o cambiar cantidades. Compará con el original.'
              : 'Completá las comidas con las indicaciones de tu plan. Podés editarlo después.'
          }
          onActivate={choose}
          onDiscard={() => {
            importer.setDraft(null)
            go(STEPS.plan)
          }}
        />
      </main>
    )
  }

  if (hash === STEPS.times && chosen) {
    const save = (mealTimes: MealTimes) =>
      finish(initialData(chosen, today, { mealTimes, onboardedAt: today }))
    return (
      <main className="onboarding">
        <StepHeader step={3} back={STEPS.plan} />
        <h1>¿A qué hora comés?</h1>
        <p className="lead">Así Hoy te muestra la comida que toca. Las colaciones no tienen horario.</p>
        <section className="card">
          <MealTimesFields
            plan={chosen}
            times={times}
            onChange={(mealId, time) => setTimes((current) => ({ ...current, [mealId]: time }))}
          />
        </section>
        <button type="button" className="button block" onClick={() => save(times)}>
          Empezar a registrar
        </button>
      </main>
    )
  }

  if (hash.startsWith('#/inicio/') || hash === STEPS.review) {
    return (
      <main className="onboarding">
        <StepHeader step={2} back="#/inicio" />
        <h1>Cargá tu plan</h1>
        <p className="lead">El PDF que te dio tu nutricionista, o su texto.</p>
        <section className="card">
          <ImportForm importer={importer} onExpired={() => void account.signOut()} />
        </section>
        {importer.startedAt === null && <OtherOptions importer={importer} onExample={choose} onRestore={finish} today={today} />}
      </main>
    )
  }

  return (
    <main className="onboarding welcome">
      <div className="login-badges" aria-hidden="true">
        {(['desayuno', 'almuerzo', 'merienda', 'cena'] as const).map((theme) => (
          <MealBadge key={theme} theme={theme} className={`login-badge theme-${theme}`} />
        ))}
      </div>
      <h1>{account.user ? `Hola, ${account.user.name.split(' ')[0]}` : 'Hola'}</h1>
      <p className="lead">Vamos a dejar tu plan listo en tres pasos.</p>
      <ul className="benefits">
        <li>
          <b>Tu plan a mano.</b> Antes de comer, mirá qué opciones tenés.
        </li>
        <li>
          <b>Un toque por comida.</b> Como el plan, parecido o distinto.
        </li>
        <li>
          <b>Sin calorías ni culpa.</b> Si te salís, retomás en la próxima.
        </li>
      </ul>
      {recovered && (
        <p className="notice error" role="alert">
          Los datos guardados no se pudieron leer. Quedó una copia interna; podés restaurar un backup.
        </p>
      )}
      <button type="button" className="button block" onClick={() => go(STEPS.plan)}>
        Empezar
      </button>
      {account.user && (
        <button type="button" className="link" onClick={() => void account.signOut()}>
          Salir de {account.user.email}
        </button>
      )}
    </main>
  )
}

function StepHeader({ step, back }: { step: number; back: string }) {
  return (
    <header className="step-header">
      <a className="icon-button" href={back} aria-label="Volver">
        <Icon name="left" />
      </a>
      <span className="step-bar" role="img" aria-label={`Paso ${step} de 3`}>
        {[1, 2, 3].map((index) => (
          <span key={index} className={index <= step ? 'on' : undefined} />
        ))}
      </span>
    </header>
  )
}

function OtherOptions(props: {
  importer: PlanImport
  today: string
  onExample: (plan: Plan) => void
  onRestore: (data: AppData) => void
}) {
  const [error, setError] = useState('')

  const restore = async (file: File) => {
    const data = parseData(await file.text())
    if (!data) {
      setError('Ese archivo no es un backup válido.')
      return
    }
    props.onRestore({
      ...data,
      settings: { mealTimes: {}, ...data.settings, onboardedAt: data.settings?.onboardedAt ?? props.today },
    })
  }

  return (
    <>
      <h2 className="group-title">Otras formas</h2>
      <div className="option-list">
        <button
          type="button"
          className="option"
          onClick={() => {
            props.importer.setDraft({ plan: datedPlan(blankPlan(`plan-${Date.now()}`)), sourceText: '' })
            go(STEPS.review)
          }}
        >
          <b>Cargarlo a mano</b>
          <small>Escribís las opciones de cada comida</small>
        </button>
        <button type="button" className="option" onClick={() => props.onExample(seedPlan)}>
          <b>Probar con un ejemplo</b>
          <small>Para conocer la app; después cargás el tuyo</small>
        </button>
        <label className="option">
          <b>Restaurar un backup</b>
          <small>Si ya usabas la app en otro dispositivo</small>
          <input
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void restore(file)
            }}
          />
        </label>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
