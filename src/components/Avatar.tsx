import { useState } from 'react'
import type { User } from '../auth/state'
import { Icon } from './icons'

/** Inicial del nombre (o del mail) para el círculo cuando no hay foto. */
export function initialOf(user: Pick<User, 'name' | 'email'>): string {
  const source = user.name.trim() || user.email.trim()
  return source ? [...source][0]!.toLocaleUpperCase('es-AR') : ''
}

/** Círculo con la foto de perfil, la inicial o un ícono de persona. */
export function Avatar({ user, size = 36 }: { user: User | null; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null)
  const image = user?.image && user.image !== broken ? user.image : null
  const initial = user ? initialOf(user) : ''

  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {image ? (
        <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setBroken(image)} />
      ) : initial ? (
        initial
      ) : (
        <Icon name="person" size={Math.round(size * 0.55)} />
      )}
    </span>
  )
}
