import { useEffect, useRef, type PointerEvent, type TouchEvent } from 'react'
import type { MealTheme } from '../domain/mealTheme'
import { sectionHint } from '../domain/parsing'
import { STATUSES } from '../domain/tracking'
import type { Section, Status } from '../domain/types'
import { Icon, StatusIcon } from './icons'

export const vibrate = () => navigator.vibrate?.(10)

const LONG_PRESS_MS = 450

/** Mantener apretado: llama a `onLong` con el rect del elemento y anula el click que sigue. */
export function useLongPress(onLong: (rect: DOMRect) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef({ x: 0, y: 0 })
  const fired = useRef(false)
  const cancel = () => clearTimeout(timer.current)
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      fired.current = false
      start.current = { x: event.clientX, y: event.clientY }
      const target = event.currentTarget
      cancel()
      timer.current = setTimeout(() => {
        fired.current = true
        vibrate()
        onLong(target.getBoundingClientRect())
      }, LONG_PRESS_MS)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    onClickCapture: (event: { stopPropagation: () => void; preventDefault: () => void }) => {
      if (!fired.current) return
      fired.current = false
      event.stopPropagation()
      event.preventDefault()
    },
  }
}

/** Deslizar horizontalmente. Ignora gestos mayormente verticales y los que empiezan en un campo de texto. */
export function useSwipe(handlers: { left?: () => void; right?: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0]
      const field = (event.target as HTMLElement).closest('input, textarea')
      start.current = touch && !field && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null
    },
    onTouchEnd: (event: TouchEvent) => {
      const from = start.current
      const touch = event.changedTouches[0]
      start.current = null
      if (!from || !touch) return
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return
      if (dx < 0) handlers.left?.()
      else handlers.right?.()
    },
  }
}

/**
 * - `primary`: "Como el plan" ancho arriba y las otras tres debajo (tarjeta Ahora).
 * - `grid`: 2×2 (hoja de detalle).
 * - `compact`: 4 en fila con etiqueta chica (postre).
 */
export function StatusChoices(props: {
  label: string
  value?: Status
  variant: 'primary' | 'grid' | 'compact'
  onSelect: (status: Status) => void
}) {
  return (
    <div
      className={`choices choices-${props.variant}`}
      data-has-value={props.value !== undefined}
      role="group"
      aria-label={props.label}
    >
      {STATUSES.map((status) => (
        <button
          key={status.value}
          type="button"
          className={`choice choice-${status.value}`}
          aria-pressed={props.value === status.value}
          onClick={() => {
            vibrate()
            props.onSelect(status.value)
          }}
        >
          <Icon name={status.value} size={props.variant === 'compact' ? 18 : 22} />
          <span>{status.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Legend() {
  return (
    <ul className="legend">
      {STATUSES.map((status) => (
        <li key={status.value}>
          <StatusIcon status={status.value} size={18} /> {status.label}
        </li>
      ))}
    </ul>
  )
}

/** Listas del plan, siempre visibles (pestaña Plan). */
export function SectionList({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((section, index) => (
        <section className="plan-section" key={index}>
          <h3>{section.title}</h3>
          {section.rule && <p className="rule">{section.rule}</p>}
          <ul>
            {section.options.map((option, optionIndex) => (
              <li key={optionIndex}>{option}</li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

/** Listas del plan plegables, para consultar antes de comer. */
export function PlanOptions({ sections }: { sections: Section[] }) {
  return (
    <div className="plan-options">
      {sections.map((section, index) => (
        <details key={index}>
          <summary>
            <span>{section.title}</span>
            <small className="hint-line">{sectionHint(section)}</small>
          </summary>
          {section.rule && <p className="rule">{section.rule}</p>}
          <ul>
            {section.options.map((option, optionIndex) => (
              <li key={optionIndex}>{option}</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

export function DateNav(props: {
  eyebrow: string
  title: string
  previous: string
  next: string | null
  unit: string
}) {
  return (
    <header className="date-nav">
      <div>
        <p>{props.eyebrow}</p>
        <h1>{props.title}</h1>
      </div>
      <div className="date-nav-buttons">
        <a className="icon-button" href={props.previous} aria-label={`${props.unit} anterior`}>
          <Icon name="left" />
        </a>
        {props.next ? (
          <a className="icon-button" href={props.next} aria-label={`${props.unit} siguiente`}>
            <Icon name="right" />
          </a>
        ) : (
          <span className="icon-button disabled" aria-hidden="true">
            <Icon name="right" />
          </span>
        )}
      </div>
    </header>
  )
}

export function MealBadge({ theme, className = '' }: { theme: MealTheme; className?: string }) {
  return (
    <span className={`meal-badge ${className}`}>
      <Icon name={theme} size={className ? 24 : 32} />
    </span>
  )
}

export interface ToastMessage {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

export type Notify = (toast: Omit<ToastMessage, 'id'>) => void

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.action!.run()
                onDismiss()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
