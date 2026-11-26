import { mealTheme } from '../domain/mealTheme'
import { formatTime, orderedMains, type MealTimes } from '../domain/schedule'
import type { Plan } from '../domain/types'
import { MealBadge } from './common'

interface Props {
  plan: Plan
  times: MealTimes
  onChange: (mealId: string, time: string) => void
}

export function MealTimesFields({ plan, times, onChange }: Props) {
  // El orden sigue el sugerido para que las filas no salten mientras se edita.
  return (
    <ul className="time-list">
      {orderedMains(plan).map(({ meal }) => {
        const theme = mealTheme(meal)
        const suggested = orderedMains(plan).find((entry) => entry.meal.id === meal.id)!.hour
        return (
          <li key={meal.id}>
            <label>
              <MealBadge theme={theme} className={`row-badge theme-${theme}`} />
              <span>{meal.name}</span>
              <input
                type="time"
                value={times[meal.id] ?? formatTime(suggested)}
                onChange={(event) => onChange(meal.id, event.target.value)}
              />
            </label>
          </li>
        )
      })}
    </ul>
  )
}
