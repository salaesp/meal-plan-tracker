import type { ReactNode } from 'react'
import type { Status } from '../domain/types'

const PATHS = {
  done: <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />,
  partial: <path d="M5 9.5c2.3-2 4.7-2 7 0s4.7 2 7 0M5 15.5c2.3-2 4.7-2 7 0s4.7 2 7 0" />,
  failed: <path d="M5 9.5h14M5 15h14M15.5 4.5L8.5 20" />,
  desayuno: (
    <>
      <path d="M5 10h11v4.5a4.5 4.5 0 01-4.5 4.5h-2A4.5 4.5 0 015 14.5zM16 11h1.5a2.25 2.25 0 010 4.5H16" />
      <path d="M8.5 3.5v2.5M12.5 3.5v2.5M4 21.5h13" />
    </>
  ),
  almuerzo: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
    </>
  ),
  merienda: (
    <>
      <path d="M6.5 11h11c.5 5.5-1.8 9.5-5.5 9.5S6 16.5 6.5 11zM6 11h12" />
      <path d="M12.5 11l4-7.5h2.5" />
    </>
  ),
  cena: <path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z" />,
  colacion: (
    <>
      <path d="M12 8.5c-1.5-1.5-6.5-1.8-6.5 4 0 4 2.5 8 4.5 8 .8 0 1.2-.5 2-.5s1.2.5 2 .5c2 0 4.5-4 4.5-8 0-5.8-5-5.5-6.5-4z" />
      <path d="M12 8.5c0-2.5 1-4 3-5" />
    </>
  ),
  otra: <path d="M7 3v7a2 2 0 004 0V3M9 12v9M17 21V3c-2 1.5-3 4-3 7.5V14h3" />,
  agua: <path d="M12 3.5c3.2 3.9 6 7.2 6 10.5a6 6 0 01-12 0c0-3.3 2.8-6.6 6-10.5z" />,
  entreno: <path d="M3.5 9.5v5M6.5 7v10M6.5 12h11M17.5 7v10M20.5 9.5v5" />,
  settings: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5" />,
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
  week: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17M8.5 3v3M15.5 3v3" />
    </>
  ),
  plan: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  note: <path d="M6 3.5h8.5L19 8v12.5H6zM14 3.5V8h5M9 12.5h7M9 16.5h4.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  share: <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />,
  file: <path d="M6 3h8l5 5v13H6zM14 3v5h5" />,
  person: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" />
    </>
  ),
  download: <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14" />,
  upload: <path d="M12 14.5v-11M7.5 8l4.5-4.5L16.5 8M5 19.5h14" />,
  logout: <path d="M14 4.5H6.5v15H14M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

/** Círculo de estado: relleno con ícono si está marcado, punteado si no. */
export function StatusIcon({ status, size = 28 }: { status?: Status; size?: number }) {
  return (
    <span className={`status-icon ${status ? `is-${status}` : 'is-empty'}`} style={{ width: size, height: size }}>
      {status && <Icon name={status} size={Math.round(size * 0.6)} />}
    </span>
  )
}
