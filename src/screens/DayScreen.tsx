import { useState } from 'react'
import { DateNav, MealBadge, PlanOptions, StatusChoices, useLongPress, useSwipe, type Notify } from '../components/common'
import { QuickMenu } from '../components/QuickMenu'
import { Icon, StatusIcon } from '../components/icons'
import { addDays, dayAndMonth, formatDay, longWeekday } from '../domain/dates'
import { mealMoment, mealTheme } from '../domain/mealTheme'
import { focusMeal, nextMeal, orderedMains, pendingMeals, snackMeals } from '../domain/schedule'
import {
  addExtra,
  applyStatus,
  changeWater,
  checklist,
  copyableDays,
  copyDay,
  dayLog,
  dayScore,
  dessertKey,
  hasLogged,
  planForDate,
  removeExtra,
  restoreDay,
  statusInfo,
  toggleTrained,
  WATER_STEP_ML,
} from '../domain/tracking'
import type { AppData, DayLog, Meal, Status } from '../domain/types'
import type { Update } from '../store/useAppData'
import { MealSheet } from './MealSheet'

interface Props {
  data: AppData
  update: Update
  date: string
  today: string
  /** Comida con la hoja de detalle abierta (ruta #/comida/fecha/id). */
  openMealId?: string
  notify: Notify
}

/** Si la hoja se abrió desde el día, cerrar vuelve atrás en el historial (igual que el botón atrás). */
let openedFromDay = false

const currentHour = () => {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60
}

export function DayScreen({ data, update, date, today, openMealId, notify }: Props) {
  const isToday = date === today
  const plan = planForDate(data, date)
  const log = dayLog(data, date)
  const score = dayScore(data, date)
  const times = data.settings?.mealTimes
  const [hour] = useState(currentHour)
  const [focusId, setFocusId] = useState(() => (isToday ? (focusMeal(plan, log, hour, times)?.id ?? null) : null))
  const focus = plan.meals.find((meal) => meal.id === focusId) ?? null
  const pending = isToday ? pendingMeals(plan, log, hour, times).filter((meal) => meal.id !== focusId) : []
  const yesterday = addDays(date, -1)
  const yesterdayScore = isToday && data.days[yesterday] ? dayScore(data, yesterday) : null
  const yesterdayMissing = yesterdayScore ? yesterdayScore.total - yesterdayScore.marked : 0

  const open = (mealId: string) => {
    openedFromDay = true
    window.location.hash = `#/comida/${date}/${mealId}`
  }
  const close = () => {
    if (openedFromDay) {
      openedFromDay = false
      window.history.back()
    } else {
      window.location.replace(`#/dia/${date}`)
    }
  }

  const [quick, setQuick] = useState<{ meal: Meal; anchor: DOMRect } | null>(null)
  const [copying, setCopying] = useState(false)
  const swipe = useSwipe({
    left: () => date < today && (window.location.hash = `#/dia/${addDays(date, 1)}`),
    right: () => {
      window.location.hash = `#/dia/${addDays(date, -1)}`
    },
  })

  const copyFrom = (from: string) => {
    const before = data.days[date]
    update((current) => copyDay(current, from, date))
    setCopying(false)
    notify({
      text: `Copiaste ${formatDay(from)}`,
      action: { label: 'Deshacer', run: () => update((current) => restoreDay(current, date, before)) },
    })
  }

  const mark = (key: string, status: Status) => {
    const before = log.items[key]?.status
    const after = before === status ? undefined : status
    update((current) => applyStatus(current, date, key, after))
    const mealId = key.replace(/:dessert$/, '')
    const meal = plan.meals.find((entry) => entry.id === mealId)
    const name = key.endsWith(':dessert') ? `postre de ${meal?.name.toLowerCase()}` : (meal?.name ?? '')
    if (!after) {
      notify({
        text: `Desmarcaste ${name}`,
        action: { label: 'Deshacer', run: () => update((current) => applyStatus(current, date, key, before)) },
      })
    } else if (key === mealId && after === 'failed') {
      const next = nextMeal(plan, log, mealId, times)
      notify({
        text: next ? 'Retomá en la próxima comida.' : 'Mañana retomás el plan.',
        action: next ? { label: `Ver ${next.name.toLowerCase()}`, run: () => open(next.id) } : undefined,
      })
    }
  }

  return (
    <div {...(openMealId || copying || quick ? {} : swipe)} className="day-screen">
      <DateNav
        unit="Día"
        eyebrow={isToday ? `Hoy · ${longWeekday(date)}` : longWeekday(date)}
        title={dayAndMonth(date)}
        previous={`#/dia/${addDays(date, -1)}`}
        next={date < today ? `#/dia/${addDays(date, 1)}` : null}
      />
      <div className="day-progress" aria-live="polite">
        <span className="pebbles" aria-hidden="true">
          {checklist(plan).map((item) => (
            <StatusIcon key={item.key} status={log.items[item.key]?.status} size={16} />
          ))}
        </span>
        <span>
          {score.marked} de {score.total} registradas
        </span>
        {!isToday && <a href="#/">Ir a hoy</a>}
        <button type="button" className="link" onClick={() => setCopying(true)}>
          Copiar otro día
        </button>
      </div>

      {pending.length > 0 && (
        <div className="banner">
          <span>Te quedó sin registrar:</span>
          {pending.map((meal) => (
            <button key={meal.id} type="button" className="chip" onClick={() => open(meal.id)}>
              {meal.name}
            </button>
          ))}
        </div>
      )}
      {yesterdayMissing > 0 && pending.length === 0 && (
        <div className="banner">
          <span>
            Ayer {yesterdayMissing === 1 ? 'quedó 1 comida' : `quedaron ${yesterdayMissing} comidas`} sin registrar.
          </span>
          <a className="chip" href={`#/dia/${yesterday}`}>
            Completar
          </a>
        </div>
      )}

      {focus ? (
        <NowCard
          key={focus.id}
          meal={focus}
          log={log}
          onMark={mark}
          onOpen={() => open(focus.id)}
          onNext={() => setFocusId(focusMeal(plan, dayLog(data, date), currentHour(), times)?.id ?? null)}
        />
      ) : (
        isToday &&
        score.marked > 0 && <p className="done-message">Registraste todas las comidas de hoy.</p>
      )}

      <h2 className="group-title">{isToday ? 'Tu día' : 'Comidas'}</h2>
      <ul className="day-list">
        {orderedMains(plan, times).map(({ meal }, index, mains) => {
          const focusIndex = mains.findIndex((entry) => entry.meal.id === focusId)
          const position = focusIndex < 0 || index < focusIndex ? '' : index === focusIndex ? 'current' : 'upcoming'
          return (
            <li key={meal.id} className={position}>
              <DayRow
                meal={meal}
                log={log}
                current={position === 'current'}
                onOpen={() => open(meal.id)}
                onLong={(anchor) => setQuick({ meal, anchor })}
              />
            </li>
          )
        })}
      </ul>
      {snackMeals(plan).length > 0 && (
        <>
          <h2 className="group-title">
            Colaciones <small>cuando quieras, mejor cerca del entrenamiento</small>
          </h2>
          <ul className="snack-chips">
            {snackMeals(plan).map((meal) => (
              <li key={meal.id}>
                <SnackChip meal={meal} log={log} onOpen={() => open(meal.id)} onLong={(anchor) => setQuick({ meal, anchor })} />
              </li>
            ))}
          </ul>
        </>
      )}

      {plan.waterLiters > 0 && <WaterCard date={date} log={log} liters={plan.waterLiters} update={update} />}
      <ExtrasCard date={date} log={log} isToday={isToday} update={update} />

      {openMealId && (
        <MealSheet data={data} update={update} date={date} mealId={openMealId} onMark={mark} onClose={close} />
      )}
      {quick && (
        <QuickMenu
          title={quick.meal.name}
          value={log.items[quick.meal.id]?.status}
          anchor={quick.anchor}
          onSelect={(status) => update((current) => applyStatus(current, date, quick.meal.id, status))}
          onClose={() => setQuick(null)}
        />
      )}
      {copying && <CopyDaySheet data={data} date={date} onPick={copyFrom} onClose={() => setCopying(false)} />}
    </div>
  )
}

function NowCard(props: {
  meal: Meal
  log: DayLog
  onMark: (key: string, status: Status) => void
  onOpen: () => void
  onNext: () => void
}) {
  const { meal, log } = props
  const status = log.items[meal.id]?.status
  const dessertStatus = log.items[dessertKey(meal.id)]?.status
  const complete = Boolean(status) && (!meal.dessert || Boolean(dessertStatus))
  const theme = mealTheme(meal)

  return (
    <section className={`now theme-${theme}`} aria-labelledby="now-title">
      <div className="now-head">
        <MealBadge theme={theme} />
        <div>
          <p className="eyebrow">
            {meal.kind === 'snack' ? 'Pendiente' : 'Ahora'}
            {mealMoment(theme) && ` · ${mealMoment(theme)}`}
          </p>
          <h2 id="now-title">{meal.name}</h2>
        </div>
      </div>
      <StatusChoices variant="primary" label={`Cómo fue ${meal.name}`} value={status} onSelect={(s) => props.onMark(meal.id, s)} />
      {meal.dessert && (
        <div className="now-dessert">
          <h3>Postre</h3>
          <StatusChoices
            variant="compact"
            label="Cómo fue el postre"
            value={dessertStatus}
            onSelect={(s) => props.onMark(dessertKey(meal.id), s)}
          />
        </div>
      )}
      <h3 className="sheet-label">Qué comer</h3>
      <PlanOptions sections={[...meal.sections, ...(meal.dessert ?? [])]} />
      <div className="now-footer">
        <button type="button" className="link" onClick={props.onOpen}>
          Nota y contexto
        </button>
        {complete && (
          <button type="button" className="button" onClick={props.onNext}>
            Siguiente
            <Icon name="right" size={18} />
          </button>
        )}
      </div>
    </section>
  )
}

interface RowProps {
  meal: Meal
  log: DayLog
  onOpen: () => void
  onLong: (anchor: DOMRect) => void
}

function DayRow({ meal, log, current, onOpen, onLong }: RowProps & { current: boolean }) {
  const press = useLongPress(onLong)
  const entry = log.items[meal.id]
  const dessert = log.items[dessertKey(meal.id)]?.status
  const hasNote = Boolean(entry?.note?.trim() || Object.keys(entry?.context ?? {}).length)
  const theme = mealTheme(meal)
  return (
    <button type="button" className="day-row" onClick={onOpen} {...press}>
      <StatusIcon status={entry?.status} size={32} />
      <span className="row-text">
        <span className="row-title">
          {meal.name}
          {hasNote && (
            <>
              <Icon name="note" size={16} />
              <span className="sr-only">(con nota)</span>
            </>
          )}
        </span>
        <span className={`row-sub ${entry?.status ? `text-${entry.status}` : ''}`}>
          {entry?.status ? statusInfo(entry.status).label : current ? 'Ahora' : 'Sin registrar'}
        </span>
        {meal.dessert && (
          <span className={`row-sub ${dessert ? `text-${dessert}` : ''}`}>
            Postre: {dessert ? statusInfo(dessert).label.toLowerCase() : 'sin registrar'}
          </span>
        )}
      </span>
      <MealBadge theme={theme} className={`row-badge theme-${theme}`} />
    </button>
  )
}

function SnackChip({ meal, log, onOpen, onLong }: RowProps) {
  const press = useLongPress(onLong)
  const entry = log.items[meal.id]
  return (
    <button type="button" className="snack-chip" onClick={onOpen} {...press}>
      <StatusIcon status={entry?.status} size={32} />
      <span className="row-text">
        <span className="row-title">{meal.name}</span>
        <span className="row-sub">
          {entry?.status ? statusInfo(entry.status).label : 'Sin registrar'}
          {entry?.combined && ' · combinada'}
        </span>
      </span>
    </button>
  )
}

export function WaterCard(props: { date: string; log: DayLog; liters: number; update: Update }) {
  const { date, log, update } = props
  const format = (ml: number) => (ml / 1000).toLocaleString('es-AR')
  const targetMl = props.liters * 1000
  const glasses = Math.ceil(targetMl / WATER_STEP_ML)
  const add = (deltaMl: number) => update((current) => changeWater(current, date, deltaMl))
  return (
    <section className="card">
      <div className="card-header">
        <h2>Agua</h2>
        <span>
          {format(log.waterMl)} / {format(targetMl)} L
        </span>
      </div>
      <div className="water">
        <div className="glasses" role="group" aria-label="Vasos de 500 ml">
          {Array.from({ length: glasses }, (_, index) => {
            const level = (index + 1) * WATER_STEP_ML
            const full = log.waterMl >= level
            // Tocar el último vaso lleno lo vacía.
            const target = log.waterMl === level ? level - WATER_STEP_ML : level
            return (
              <button
                key={index}
                type="button"
                className={full ? 'glass full' : 'glass'}
                aria-pressed={full}
                aria-label={`Marcar ${format(target)} L`}
                onClick={() => add(target - log.waterMl)}
              />
            )
          })}
        </div>
        <button type="button" className="icon-button primary" aria-label="Sumar 500 ml" onClick={() => add(WATER_STEP_ML)}>
          <Icon name="plus" />
        </button>
      </div>
    </section>
  )
}

export function ExtrasCard(props: { date: string; log: DayLog; isToday: boolean; update: Update }) {
  const { date, log, update } = props
  const [text, setText] = useState('')
  return (
    <section className="card">
      <h2>Algo más</h2>
      <p className="hint">Lo que comiste fuera de las comidas, sin juzgar.</p>
      <div className="chips extras-chips">
        <button
          type="button"
          className="chip"
          aria-pressed={Boolean(log.trained)}
          onClick={() => update((current) => toggleTrained(current, date))}
        >
          Entrené
        </button>
      </div>
      {log.extras.length > 0 && (
        <ul className="extras">
          {log.extras.map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.time && <time>{entry.time}</time>} {entry.text}
              </span>
              <button type="button" className="link" onClick={() => update((current) => removeExtra(current, date, entry.id))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault()
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const time = props.isToday ? new Date().toTimeString().slice(0, 5) : undefined
          update((current) => addExtra(current, date, id, text, time))
          setText('')
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ej. un alfajor"
          aria-label="Qué comiste además"
          maxLength={200}
        />
        <button type="submit" className="button" disabled={!text.trim()}>
          Agregar
        </button>
      </form>
    </section>
  )
}

export function CopyDaySheet(props: { data: AppData; date: string; onPick: (from: string) => void; onClose: () => void }) {
  const { data, date } = props
  const days = copyableDays(data, date)
  const replacing = hasLogged(data.days[date])
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div
        className="sheet copy-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Copiar otro día"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-header copy-header">
          <h2>Copiar otro día</h2>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </header>
        <p className="hint">
          Copia comidas, agua, extras y entrenamiento{replacing ? ', y reemplaza lo que ya cargaste hoy' : ''}. Podés deshacerlo.
        </p>
        {days.length === 0 && <p className="hint">Todavía no hay días anteriores con registro.</p>}
        <ul className="copy-list">
          {days.map((day) => {
            const score = dayScore(data, day)
            return (
              <li key={day}>
                <button type="button" className="copy-day" onClick={() => props.onPick(day)}>
                  <strong>{formatDay(day)}</strong>
                  <small>
                    {score.marked} de {score.total} registradas
                  </small>
                </button>
              </li>
            )
          })}
        </ul>
        <label className="field">
          Otra fecha
          <input
            type="date"
            max={addDays(date, -1)}
            onChange={(event) => event.target.value && data.days[event.target.value] && props.onPick(event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
