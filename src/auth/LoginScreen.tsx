import { useState } from 'react'
import { MealBadge } from '../components/common'

interface Props {
  unavailable: boolean
  onSignIn: () => Promise<string | null>
  onGuest?: () => void
}

export function LoginScreen({ unavailable, onSignIn, onGuest }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() =>
    new URLSearchParams(window.location.search).has('ingreso') ? 'No se completó el ingreso. Probá de nuevo.' : '',
  )

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const message = await onSignIn()
      if (message) {
        setError(message)
        setBusy(false)
      }
      // Sin error el navegador sale hacia Google.
    } catch {
      setError('Sin conexión. El primer ingreso necesita internet.')
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login-badges" aria-hidden="true">
        {(['desayuno', 'almuerzo', 'merienda', 'cena'] as const).map((theme) => (
          <MealBadge key={theme} theme={theme} className={`login-badge theme-${theme}`} />
        ))}
      </div>
      <h1>Mi plan de comidas</h1>
      <p>Seguí el plan de tu nutricionista, comida a comida, sin contar calorías.</p>

      {unavailable && (
        <p className="notice error" role="alert">
          No se pudo contactar al servidor. Revisá tu conexión.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="button block" disabled={busy} onClick={start}>
        {busy ? 'Abriendo Google…' : 'Continuar con Google'}
      </button>
      {import.meta.env.DEV && onGuest && (
        <button type="button" className="link" onClick={onGuest}>
          Entrar sin cuenta (solo desarrollo)
        </button>
      )}
    </main>
  )
}
