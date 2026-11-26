import { createAuthClient } from 'better-auth/react'
import { useEffect, useState, type ReactNode } from 'react'
import { DRAFT_KEY } from '../store/draft'
import { LoginScreen } from './LoginScreen'
import { readCachedUser, resolveAuth, USER_KEY, type User } from './state'

const authClient = createAuthClient()

export interface Account {
  /** `null` en modo desarrollo sin cuenta. */
  user: User | null
  offline: boolean
  /** Devuelve un mensaje si no se pudo cerrar la sesión. */
  signOut: () => Promise<string | null>
}

export function AuthGate({ children }: { children: (account: Account) => ReactNode }) {
  const session = authClient.useSession()
  const [cached, setCached] = useState(() => readCachedUser(window.localStorage))
  const [guest, setGuest] = useState(false)
  const user = session.data?.user
  const state = resolveAuth(
    {
      isPending: session.isPending,
      user: user ? { id: user.id, name: user.name, email: user.email } : null,
      error: session.error,
    },
    cached,
  )

  const confirmed = state.status === 'signed-in' && !state.offline && user ? JSON.stringify(state.user) : null
  const rejected = state.status === 'signed-out' && !state.unavailable
  useEffect(() => {
    if (confirmed) {
      window.localStorage.setItem(USER_KEY, confirmed)
      setCached(JSON.parse(confirmed) as User)
    } else if (rejected) {
      window.localStorage.removeItem(USER_KEY)
      setCached(null)
    }
  }, [confirmed, rejected])

  const signIn = async () => {
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/',
      errorCallbackURL: '/?ingreso=error',
    })
    if (!error) return null
    // 404: el servidor no tiene credenciales de Google.
    return error.status === 404
      ? 'El ingreso con Google todavía no está configurado.'
      : 'No se pudo iniciar el ingreso con Google. Probá de nuevo.'
  }

  const signOut = async () => {
    const { error } = await authClient.signOut()
    if (error) return 'No se pudo cerrar la sesión. Revisá tu conexión.'
    window.localStorage.removeItem(USER_KEY)
    // El borrador guarda texto del plan: no queda para la próxima persona.
    window.localStorage.removeItem(DRAFT_KEY)
    setCached(null)
    setGuest(false)
    return null
  }

  if (guest) {
    return children({ user: null, offline: false, signOut })
  }
  if (state.status === 'loading') {
    return (
      <p className="splash" role="status">
        Cargando…
      </p>
    )
  }
  if (state.status === 'signed-out') {
    return (
      <LoginScreen
        unavailable={state.unavailable}
        onSignIn={signIn}
        // Solo en `pnpm dev`: el build de producción elimina este acceso.
        onGuest={import.meta.env.DEV ? () => setGuest(true) : undefined}
      />
    )
  }
  return children({ user: state.user, offline: state.offline, signOut })
}
