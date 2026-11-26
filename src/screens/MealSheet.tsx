import { useEffect, useRef } from 'react'
import { MealBadge, PlanOptions, StatusChoices } from '../components/common'
import { Icon } from '../components/icons'
import { formatDay } from '../domain/dates'
import { mealTheme } from '../domain/mealTheme'
import { snackMeals } from '../domain/schedule'
import { CONTEXT_GROUPS, dayLog, dessertKey, planForDate, setCombined, setItem, toggleContext } from '../domain/tracking'
import type { AppData, Status } from '../domain/types'
import type { Update } from '../store/useAppData'

interface Props {
  data: AppData
  update: Update
  date: string
  mealId: string
  onMark: (key: string, status: Status) => void
  onClose: () => void
}

export function MealSheet({ data, update, date, mealId, onMark, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  const plan = planForDate(data, date)
  const meal = plan.meals.find((entry) => entry.id === mealId)
  if (!meal) return null

  const log = dayLog(data, date)
  const entry = log.items[meal.id]
  const otherSnacks = snackMeals(plan).length - 1

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`sheet-band theme-${mealTheme(meal)}`}>
          <div className="sheet-handle" aria-hidden="true" />
          <header className="sheet-header">
            <MealBadge theme={mealTheme(meal)} />
            <div>
              <h2 id="sheet-title">{meal.name}</h2>
              <small>{formatDay(date)}</small>
            </div>
            <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
        </div>

        <StatusChoices variant="grid" label={`Cómo fue ${meal.name}`} value={entry?.status} onSelect={(s) => onMark(meal.id, s)} />

        {meal.dessert && (
          <>
            <h3 className="sheet-label">Postre</h3>
            <StatusChoices
              variant="compact"
              label="Cómo fue el postre"
              value={log.items[dessertKey(meal.id)]?.status}
              onSelect={(s) => onMark(dessertKey(meal.id), s)}
            />
          </>
        )}

        {meal.kind === 'snack' && otherSnacks > 0 && (
          <label className="check">
            <input
              type="checkbox"
              checked={entry?.combined ?? false}
              onChange={(event) => update((current) => setCombined(current, date, meal.id, event.target.checked))}
            />
            La hice junto con {otherSnacks === 1 ? 'la otra colación' : 'las otras colaciones'}
          </label>
        )}

        <h3 className="sheet-label">Contexto (opcional)</h3>
        {CONTEXT_GROUPS.map((group) => (
          <div className="chip-group" role="group" aria-label={group.label} key={group.id}>
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
          aria-label="Nota"
          rows={2}
          maxLength={500}
        />

        <h3 className="sheet-label">Opciones del plan</h3>
        <PlanOptions sections={[...meal.sections, ...(meal.dessert ?? [])]} />

        <div className="sheet-footer">
          <button type="button" className="button block" onClick={onClose}>
            <Icon name="done" size={18} />
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
