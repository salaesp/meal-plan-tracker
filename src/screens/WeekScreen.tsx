import { useState } from 'react'
import { DateNav, Legend, type Notify } from '../components/common'
import { Icon, StatusIcon } from '../components/icons'
import { addDays, formatDay, formatRange, weekDates, weekdayInitial } from '../domain/dates'
import { STATUSES, statusInfo, weekInsight, weekRows, weekScore, weekSummary } from '../domain/tracking'
import type { AppData } from '../domain/types'

export function WeekScreen({ data, date, today, notify }: { data: AppData; date: string; today: string; notify: Notify }) {
  const [manual, setManual] = useState(false)
  const dates = weekDates(date)
  const rows = weekRows(data, dates)
  // Los días futuros no cuentan.
  const pastRows = weekRows(data, dates.filter((day) => day <= today))
  const total = weekScore(pastRows)
  const insight = weekInsight(pastRows)
  const summary = weekSummary(data, dates, today)
  const next = addDays(dates[0]!, 7)

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Seguimiento semanal', text: summary })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(summary)
      notify({ text: 'Resumen copiado' })
    } catch {
      setManual(true)
    }
  }

  return (
    <>
      <DateNav
        unit="Semana"
        eyebrow={dates.includes(today) ? 'Esta semana' : 'Semana'}
        title={formatRange(dates[0]!, dates[6]!)}
        previous={`#/semana/${addDays(dates[0]!, -7)}`}
        next={next <= today ? `#/semana/${next}` : null}
      />
      <p className="day-progress">
        {total.marked} de {total.total} registradas
      </p>

      <ul className="overview">
        {STATUSES.map((status) => (
          <li key={status.value}>
            <StatusIcon status={status.value} size={24} />
            <b>{total.counts[status.value]}</b>
            <span>{status.label}</span>
          </li>
        ))}
      </ul>
      {insight && <p className="insight">{insight}</p>}

      <div className="week-wrapper">
        <table className="week">
          <thead>
            <tr>
              <th scope="col">Comida</th>
              {dates.map((day) => (
                <th scope="col" key={day} className={day === today ? 'today' : undefined}>
                  {day <= today ? (
                    <a href={`#/dia/${day}`} aria-label={formatDay(day)} aria-current={day === today ? 'date' : undefined}>
                      {weekdayInitial(day)}
                    </a>
                  ) : (
                    <span className="future">{weekdayInitial(day)}</span>
                  )}
                </th>
              ))}
              <th scope="col" title="Como el plan / registradas que cuentan">
                <Icon name="done" size={16} />
                <span className="sr-only">Como el plan</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const score = pastRows.find((entry) => entry.key === row.key)?.score
              return (
                <tr key={row.key} className={row.isDessert ? 'dessert' : undefined}>
                  <th scope="row" title={row.label}>
                    {row.isDessert ? <span aria-label={row.label}>Postre</span> : row.label}
                  </th>
                  {row.cells.map((cell, index) => {
                    const status = cell?.status ? statusInfo(cell.status) : null
                    return (
                      <td key={dates[index]} className={dates[index] === today ? 'today' : undefined}>
                        <span
                          className={`cell ${cell && !status && dates[index]! <= today ? 'empty' : ''}`}
                          role="img"
                          aria-label={status?.label ?? (cell ? 'No la hice' : 'No aplica')}
                        >
                          {status && <StatusIcon status={status.value} size={24} />}
                        </span>
                      </td>
                    )
                  })}
                  <td className="count">{score?.marked ? `${score.counts.done}/${score.marked}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Legend />
      <p className="hint">Lo que queda vacío cuenta como "no la hice" y no entra en el cumplimiento.</p>

      <button type="button" className="button block" onClick={share}>
        <Icon name="share" size={18} />
        Compartir resumen
      </button>
      {manual && (
        <textarea readOnly value={summary} rows={10} aria-label="Resumen" onFocus={(event) => event.target.select()} />
      )}
    </>
  )
}
