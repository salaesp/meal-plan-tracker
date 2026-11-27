import { useEffect, useRef, useState, type AnimationEvent, type PointerEvent, type TouchEvent } from 'react'
import type { MealTheme } from '../domain/mealTheme'
import { sectionHint } from '../domain/parsing'
import { STATUSES } from '../domain/tracking'
import type { Section, Status } from '../domain/types'
import { Icon, StatusIcon } from './icons'

export const vibrate = () => navigator.vibrate?.(10)

/** Pantalla ancha: la app usa el diseño de escritorio. */
export const DESKTOP_QUERY = '(min-width: 1024px)'

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}

const LONG_PRESS_MS = 450

/**
 * Mientras el dedo sigue apoyado, evita que el sistema seleccione texto o abra su menú
 * (lupa, "Copiar"…). Hace falta a nivel documento: el menú rápido aparece debajo del dedo
 * antes de que el navegador dispare su propia pulsación larga, y esta caería sobre él.
 * Si la pulsación larga se disparó, también anula el click que el navegador genera al
 * soltar, que si no caería sobre el fondo del menú recién abierto y lo cerraría.
 */
function blockSelectionUntilRelease(fired: () => boolean) {
  const block = (event: Event) => event.preventDefault()
  const swallowClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    window.removeEventListener('click', swallowClick, true)
  }
  const release = (event?: Event) => {
    document.removeEventListener('selectstart', block, true)
    document.removeEventListener('contextmenu', block, true)
    window.removeEventListener('pointerup', release, true)
    window.removeEventListener('pointercancel', release, true)
    if (event?.type === 'pointerup' && fired()) {
      window.addEventListener('click', swallowClick, true)
      setTimeout(() => window.removeEventListener('click', swallowClick, true), 400)
    }
  }
  document.addEventListener('selectstart', block, true)
  document.addEventListener('contextmenu', block, true)
  window.addEventListener('pointerup', release, true)
  window.addEventListener('pointercancel', release, true)
  return release
}

/** Mantener apretado: llama a `onLong` con el rect del elemento y anula el click que sigue. */
export function useLongPress(onLong: (rect: DOMRect) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef({ x: 0, y: 0 })
  const fired = useRef(false)
  const release = useRef<(() => void) | undefined>(undefined)
  const cancel = () => clearTimeout(timer.current)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      release.current?.()
    },
    [],
  )
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      fired.current = false
      start.current = { x: event.clientX, y: event.clientY }
      const target = event.currentTarget
      cancel()
      release.current?.()
      release.current = blockSelectionUntilRelease(() => fired.current)
      timer.current = setTimeout(() => {
        fired.current = true
        window.getSelection()?.removeAllRanges()
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
  }
}

export type DayDirection = 'next' | 'previous'

/** Cambio de día pedido por gesto o botón: el día que entra lo usa para elegir de qué lado aparece. */
let pendingEnter: { date: string; direction: DayDirection; at: number } | null = null

export function announceDayChange(date: string, direction: DayDirection) {
  pendingEnter = { date, direction, at: Date.now() }
}

/**
 * Clase de entrada del día recién montado (`day-enter-next` / `day-enter-previous`), si se llegó
 * con un gesto o un botón de día anterior/siguiente. Se limpia al terminar la animación.
 */
export function useDayEnter(date: string) {
  const [direction, setDirection] = useState(() => {
    const pending = pendingEnter
    return pending && pending.date === date && Date.now() - pending.at < 1500 ? pending.direction : null
  })
  useEffect(() => {
    if (pendingEnter?.date === date) pendingEnter = null
  }, [date])
  return {
    className: direction ? `day-enter-${direction}` : '',
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) setDirection(null)
    },
  }
}

const SWIPE_DISTANCE = 70
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Deslizar horizontalmente con respuesta visual: el elemento de `ref` sigue al dedo (con resistencia),
 * al soltar pasado el umbral sale hacia ese lado y llama al handler; si no, vuelve a su lugar.
 * Ignora gestos mayormente verticales (el navegador sigue haciendo scroll: el elemento necesita
 * `touch-action: pan-y`) y los que empiezan en un campo de texto. Sin `left`/`right` ese lado
 * solo se estira un poco y vuelve.
 */
export function useSwipe<T extends HTMLElement>(options: { left?: () => void; right?: () => void; enabled?: boolean }) {
  const ref = useRef<T>(null)
  const gesture = useRef<{
    x: number
    y: number
    axis: 'x' | 'y' | null
    dx: number
    last: { x: number; t: number }
    velocity: number
  } | null>(null)
  const leaving = useRef(false)
  const enabled = options.enabled ?? true

  const place = (offset: number, transition = '') => {
    const element = ref.current
    if (!element) return
    element.style.transition = transition
    element.style.transform = offset ? `translate3d(${offset}px, 0, 0)` : ''
    element.style.willChange = offset && !transition ? 'transform' : ''
  }
  const springBack = () => place(0, 'transform 320ms cubic-bezier(0.34, 1.4, 0.64, 1)')

  // Si se deshabilita a mitad de gesto (se abrió un menú), volver a su lugar.
  useEffect(() => {
    if (!enabled && gesture.current) {
      gesture.current = null
      springBack()
    }
  })

  const handlers = {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0]
      const field = (event.target as HTMLElement).closest('input, textarea, select')
      if (!enabled || leaving.current || !touch || field || event.touches.length !== 1) {
        gesture.current = null
        return
      }
      const now = event.timeStamp
      gesture.current = {
        x: touch.clientX,
        y: touch.clientY,
        axis: null,
        dx: 0,
        last: { x: touch.clientX, t: now },
        velocity: 0,
      }
    },
    onTouchMove: (event: TouchEvent) => {
      const current = gesture.current
      const touch = event.touches[0]
      if (!current || !touch) return
      if (!enabled || event.touches.length !== 1) {
        gesture.current = null
        springBack()
        return
      }
      const dx = touch.clientX - current.x
      const dy = touch.clientY - current.y
      if (!current.axis) {
        if (Math.hypot(dx, dy) < 10) return
        current.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y'
      }
      if (current.axis !== 'x') return
      const dt = event.timeStamp - current.last.t
      if (dt > 0) current.velocity = (touch.clientX - current.last.x) / dt
      current.last = { x: touch.clientX, t: event.timeStamp }
      current.dx = dx
      if (reducedMotion()) return
      const allowed = dx < 0 ? options.left : options.right
      // Con resistencia; hacia un lado sin destino, apenas se estira.
      const offset = allowed ? dx * 0.6 : (dx / (1 + Math.abs(dx) / 80)) * 0.35
      place(offset)
    },
    onTouchEnd: () => finish(),
    onTouchCancel: () => {
      gesture.current = null
      springBack()
    },
  }

  const finish = () => {
    const current = gesture.current
    gesture.current = null
    if (!current || current.axis !== 'x') return
    const { dx, velocity } = current
    const handler = dx < 0 ? options.left : options.right
    const flick = Math.abs(dx) >= 30 && Math.abs(velocity) >= 0.4 && Math.sign(velocity) === Math.sign(dx)
    if (!handler || !enabled || (Math.abs(dx) < SWIPE_DISTANCE && !flick)) {
      springBack()
      return
    }
    if (reducedMotion() || !ref.current) {
      handler()
      return
    }
    leaving.current = true
    const element = ref.current
    place(Math.sign(dx) * element.offsetWidth, 'transform 180ms cubic-bezier(0.4, 0, 1, 1), opacity 180ms linear')
    element.style.opacity = '0'
    setTimeout(() => {
      handler()
      // Si la pantalla no se reemplazó (no hubo cambio de ruta), que vuelva a verse.
      setTimeout(() => {
        leaving.current = false
        if (ref.current) {
          ref.current.style.opacity = ''
          place(0)
        }
      }, 400)
    }, 170)
  }

  return { ref, handlers }
}

/**
 * - `primary`: "Como el plan" ancho arriba y las otras tres debajo (tarjeta Ahora).
 * - `grid`: 2×2 (hoja de detalle).
 * - `compact`: 4 en fila con etiqueta chica (postre).
 * - `inline`: píldoras en fila con ícono y etiqueta (escritorio).
 */
export function StatusChoices(props: {
  label: string
  value?: Status
  variant: 'primary' | 'grid' | 'compact' | 'inline'
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
          <Icon name={status.value} size={props.variant === 'compact' || props.variant === 'inline' ? 18 : 22} />
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
          {section.quantity && <p className="quantity">{section.quantity}</p>}
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
            <span>
              {section.title}
              {section.quantity && <b className="quantity"> · {section.quantity}</b>}
            </span>
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
  /** Avisa antes de navegar con las flechas (para animar el cambio en esa dirección). */
  onNavigate?: (direction: DayDirection) => void
}) {
  return (
    <header className="date-nav">
      <div>
        <p>{props.eyebrow}</p>
        <h1>{props.title}</h1>
      </div>
      <div className="date-nav-buttons">
        <a
          className="icon-button"
          href={props.previous}
          aria-label={`${props.unit} anterior`}
          onClick={() => props.onNavigate?.('previous')}
        >
          <Icon name="left" />
        </a>
        {props.next ? (
          <a
            className="icon-button"
            href={props.next}
            aria-label={`${props.unit} siguiente`}
            onClick={() => props.onNavigate?.('next')}
          >
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
