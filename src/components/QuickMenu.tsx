import { useEffect } from 'react'
import { STATUSES } from '../domain/tracking'
import type { Status } from '../domain/types'
import { Icon } from './icons'

interface Props {
  title: string
  value?: Status
  anchor: DOMRect
  /** `undefined` borra el estado ("No la hice"). */
  onSelect: (status: Status | undefined) => void
  onClose: () => void
}

/** Menú flotante con un ícono por opción, que sale al mantener apretada una comida. */
export function QuickMenu({ title, value, anchor, onSelect, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const below = anchor.bottom + 150 < window.innerHeight
  const style = below ? { top: anchor.bottom + 8 } : { bottom: window.innerHeight - anchor.top + 8 }
  const options: { status: Status | undefined; label: string }[] = [
    ...STATUSES.map((entry) => ({ status: entry.value as Status | undefined, label: entry.label })),
    { status: undefined, label: 'No la hice' },
  ]

  return (
    <div className="quick-backdrop" onClick={onClose}>
      <div
        className="quick-menu"
        style={style}
        role="dialog"
        aria-label={`Marcar ${title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <p>{title}</p>
        <div className="quick-options">
          {options.map((option) => {
            const name = option.status ?? 'none'
            return (
              <button
                key={name}
                type="button"
                className={`quick-option choice-${name}`}
                aria-pressed={value === option.status}
                onClick={() => {
                  navigator.vibrate?.(10)
                  onSelect(option.status)
                  onClose()
                }}
              >
                <Icon name={option.status ?? 'close'} size={26} />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
