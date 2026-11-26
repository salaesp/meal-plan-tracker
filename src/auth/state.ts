/** Decide qué mostrar según la sesión. La app tiene que abrir sin conexión. */
export interface User {
  id: string
  name: string
  email: string
}

export type AuthState =
  | { status: 'loading' }
  /** `offline`: no se pudo verificar la sesión y se usa el último usuario conocido. */
  | { status: 'signed-in'; user: User; offline: boolean }
  /** `unavailable`: no se pudo consultar el servidor. */
  | { status: 'signed-out'; unavailable: boolean }

export interface SessionQuery {
  isPending: boolean
  user: User | null
  /** `status` HTTP del error; sin status es falla de red. */
  error: { status?: number } | null
}

export function resolveAuth(query: SessionQuery, cached: User | null): AuthState {
  if (query.user) return { status: 'signed-in', user: query.user, offline: false }
  const rejected = query.error?.status === 401 || query.error?.status === 403
  if (query.error && !rejected) {
    return cached ? { status: 'signed-in', user: cached, offline: true } : { status: 'signed-out', unavailable: true }
  }
  if (query.isPending) return cached ? { status: 'signed-in', user: cached, offline: false } : { status: 'loading' }
  return { status: 'signed-out', unavailable: false }
}

export const USER_KEY = 'meal-plan:user'

export function readCachedUser(storage: Pick<Storage, 'getItem'>): User | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(USER_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const { id, name, email } = value as Record<string, unknown>
    return typeof id === 'string' && typeof name === 'string' && typeof email === 'string' ? { id, name, email } : null
  } catch {
    return null
  }
}
