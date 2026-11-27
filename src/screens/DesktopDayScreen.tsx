import { useState } from 'react'
import { announceDayChange, MealBadge, PlanOptions, StatusChoices, useDayEnter, type Notify } from '../components/common'
import { Icon } from '../components/icons'
import { addDays, dayAndMonth, formatDay, longWeekday, parseISODate, weekDates } from '../domain/dates'
import { mealTheme } from '../domain/mealTheme'
import { focusMeal, formatTime, nextMeal, orderedMains, snackMeals } from '../domain/schedule'
import {
  applyStatus,
  checklist,
  CONTEXT_GROUPS,
  copyDay,
  dayLog,
  dayScore,
  dessertKey,
  planForDate,
  restoreDay,
  setItem,
  toggleContext,
} from '../domain/tracking'
import type { AppData, DayLog, Meal, Status } from '../domain/types'
import type { Update } from '../store/useAppData'
import { CopyDaySheet, ExtrasCard, Habits } from './DayScreen'

interface Props {
  data: AppData
  update: Update
  date: string
  today: string
  /** Comida a mostrar desplegada (ruta #/comida/fecha/id). */
  openMealId?: string
  notify: Notify
}

const SHORT_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const currentHour = () => {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60
}

/** Hoy en escritorio: la semana arriba para moverse entre días y el día completo debajo. */
export function DesktopDayScreen({ data, update, date, today, openMealId, notify }: Props) {
  const isToday = date === today
  const plan = planForDate(data, date)
  const log = dayLog(data, date)
  const score = dayScore(data, date)
  const times = data.settings?.mealTimes
  const [hour] = useState(currentHour)
  const [openId, setOpenId] = useState<string | null>(openMealId ?? null)
  const [copying, setCopying] = useState(false)
  const focusId = isToday ? (focusMeal(plan, log, hour, times)?.id ?? null) : null

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
      notify({ text: next ? `Retomá en ${next.name.toLowerCase()}.` : 'Mañana retomás el plan.' })
    }
  }

  const copyFrom = (from: string) => {
    const before = data.days[date]
    update((current) => copyDay(current, from, date))
    setCopying(false)
    notify({
      text: `Copiaste ${formatDay(from)}`,
      action: { label: 'Deshacer', run: () => update((current) => restoreDay(current, date, before)) },
    })
  }

  const meals = [
    ...orderedMains(plan, times).map(({ meal, hour: mealHour }) => ({ meal, time: formatTime(mealHour) })),
    ...snackMeals(plan).map((meal) => ({ meal, time: 'Cuando quieras' })),
  ]
  const nextWeek = addDays(weekDates(date)[0]!, 7)
  const enter = useDayEnter(date)
  const announce = (target: string) => announceDayChange(target, target > date ? 'next' : 'previous')

  return (
    <div className="desk-day-screen">
      <nav className="desk-week" aria-label="Días de la semana">
        <a
          className="icon-button"
          href={`#/dia/${addDays(date, -7)}`}
          aria-label="Semana anterior"
          onClick={() => announce(addDays(date, -7))}
        >
          <Icon name="left" />
        </a>
        <ul className="desk-days">
          {weekDates(date).map((day) => (
            <li key={day}>
              <WeekDay data={data} day={day} today={today} selected={day === date} onPick={() => announce(day)} />
            </li>
          ))}
        </ul>
        {nextWeek <= today ? (
          <a className="icon-button" href={`#/dia/${nextWeek}`} aria-label="Semana siguiente" onClick={() => announce(nextWeek)}>
            <Icon name="right" />
          </a>
        ) : (
          <span className="icon-button disabled" aria-hidden="true">
            <Icon name="right" />
          </span>
        )}
      </nav>

      <div className={`desk-layout ${enter.className}`} onAnimationEnd={enter.onAnimationEnd}>
        <section aria-labelledby="desk-day-title">
          <header className="desk-head">
            <div>
              <p className="eyebrow muted">
                {isToday ? 'Hoy · ' : ''}
                {longWeekday(date)} · {score.marked} de {score.total} registradas
              </p>
              <h1 id="desk-day-title">{dayAndMonth(date)}</h1>
            </div>
            <div className="desk-head-actions">
              {!isToday && (
                <a className="button secondary" href="#/">
                  Ir a hoy
                </a>
              )}
              <button type="button" className="button secondary" onClick={() => setCopying(true)}>
                Copiar otro día
              </button>
            </div>
          </header>

          <ul className="desk-meals">
            {meals.map(({ meal, time }) => (
              <li key={meal.id}>
                <MealCard
                  data={data}
                  update={update}
                  date={date}
                  meal={meal}
                  time={time}
                  log={log}
                  current={meal.id === focusId}
                  open={openId === meal.id}
                  onToggle={() => setOpenId(openId === meal.id ? null : meal.id)}
                  onMark={mark}
                />
              </li>
            ))}
          </ul>
        </section>

        <aside className="desk-side" aria-label="Resto del día">
          <Habits data={data} date={date} log={log} liters={plan.waterLiters} update={update} />
          <ExtrasCard date={date} log={log} isToday={isToday} update={update} />
        </aside>
      </div>

      {copying && <CopyDaySheet data={data} date={date} onPick={copyFrom} onClose={() => setCopying(false)} />}
    </div>
  )
}

function WeekDay(props: { data: AppData; day: string; today: string; selected: boolean; onPick: () => void }) {
  const { data, day, today, selected } = props
  const parsed = parseISODate(day)
  const label = `${day === today ? 'Hoy' : SHORT_DAYS[parsed.getDay()]} ${parsed.getDate()}`
  if (day > today) {
    return (
      <span className="desk-day future">
        {label}
        <span className="mini-dots" aria-hidden="true" />
      </span>
    )
  }
  const items = data.days[day]?.items ?? {}
  const score = dayScore(data, day)
  return (
    <a
      className={selected ? 'desk-day selected' : 'desk-day'}
      href={`#/dia/${day}`}
      onClick={selected ? undefined : props.onPick}
      aria-current={selected ? 'date' : undefined}
      aria-label={`${formatDay(day)}: ${score.marked} de ${score.total} registradas`}
    >
      {label}
      <span className="mini-dots" aria-hidden="true">
        {checklist(planForDate(data, day)).map((item) => {
          const status = items[item.key]?.status
          return <span key={item.key} className={status ? `mini-dot is-${status}` : 'mini-dot'} />
        })}
      </span>
    </a>
  )
}

function MealCard(props: {
  data: AppData
  update: Update
  date: string
  meal: Meal
  time: string
  log: DayLog
  current: boolean
  open: boolean
  onToggle: () => void
  onMark: (key: string, status: Status) => void
}) {
  const { meal, log, date, update } = props
  const entry = log.items[meal.id]
  const theme = mealTheme(meal)
  const hasNote = Boolean(entry?.note?.trim() || Object.keys(entry?.context ?? {}).length)
  return (
    <article className={props.current ? 'desk-meal current' : 'desk-meal'}>
      <div className="desk-meal-row">
        <MealBadge theme={theme} className={`row-badge theme-${theme}`} />
        <div className="desk-meal-name">
          <h2>{meal.name}</h2>
          <small>
            {props.current && !entry?.status ? 'Ahora · ' : ''}
            {props.time}
          </small>
        </div>
        <StatusChoices
          variant="inline"
          label={`Cómo fue ${meal.name}`}
          value={entry?.status}
          onSelect={(status) => props.onMark(meal.id, status)}
        />
      </div>
      {meal.dessert && (
        <div className="desk-meal-row dessert">
          <span>Postre</span>
          <StatusChoices
            variant="inline"
            label={`Cómo fue el postre de ${meal.name.toLowerCase()}`}
            value={log.items[dessertKey(meal.id)]?.status}
            onSelect={(status) => props.onMark(dessertKey(meal.id), status)}
          />
        </div>
      )}
      <button type="button" className="link desk-more" aria-expanded={props.open} onClick={props.onToggle}>
        {props.open ? 'Ocultar' : 'Qué comer y nota'}
        {!props.open && hasNote && (
          <>
            {' '}
            <Icon name="note" size={16} />
            <span className="sr-only">(con nota)</span>
          </>
        )}
      </button>
      {props.open && (
        <div className="desk-meal-body">
          <PlanOptions sections={[...meal.sections, ...(meal.dessert ?? [])]} />
          {CONTEXT_GROUPS.map((group) => (
            <div className="desk-context" role="group" aria-label={group.label} key={group.id}>
              <span>{group.label}</span>
              <div className="chips">
                {group.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="chip"
                    aria-pressed={entry?.context?.[group.id] === option}
                    onClick={() => update((current) => toggleContext(current, date, meal.id, group.id, option))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <textarea
            value={entry?.note ?? ''}
            onChange={(event) => {
              const note = event.target.value
              update((current) => setItem(current, date, meal.id, { note }))
            }}
            placeholder="Nota (opcional)"
            aria-label={`Nota de ${meal.name.toLowerCase()}`}
            rows={2}
            maxLength={500}
          />
        </div>
      )}
    </article>
  )
}
