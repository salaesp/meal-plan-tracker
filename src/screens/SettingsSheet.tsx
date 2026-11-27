import { useEffect, useRef, useState } from 'react'
import type { Account } from '../auth/AuthGate'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/icons'
import type { AppData } from '../domain/types'
import { parseData } from '../store/storage'

interface Props {
  account: Account
  data: AppData
  /** Reemplaza todos los datos, también en la base. */
  replace: (data: AppData) => void
  today: string
  onClose: () => void
}

/** Ajustes de la cuenta: quién entró, backup y cerrar sesión. Se abre desde el avatar. */
export function SettingsSheet({ account, data, replace, today, onClose }: Props) {
  const [backupMessage, setBackupMessage] = useState('')
  const [accountError, setAccountError] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const { user } = account

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  const signOut = async () => setAccountError((await account.signOut()) ?? '')

  const exportBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `meal-plan-backup-${today}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const restoreBackup = async (backup: File) => {
    const restored = parseData(await backup.text())
    if (!restored) {
      setBackupMessage('Ese archivo no es un backup válido.')
      return
    }
    const count = Object.keys(restored.days).length
    if (!window.confirm(`Se van a reemplazar todos los datos actuales por el backup (${count} días). ¿Seguir?`)) return
    replace(restored)
    setBackupMessage('Backup restaurado.')
  }

  return (
    <div className="sheet-backdrop settings-backdrop" onClick={onClose}>
      <div
        ref={panel}
        className="sheet settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header settings-header">
          <h2 id="settings-title">Ajustes</h2>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <section className="settings-profile" aria-label="Cuenta">
          <Avatar user={user} size={56} />
          <div>
            {user ? (
              <>
                <h3>{user.name || user.email}</h3>
                {user.name && <p className="hint">{user.email}</p>}
                {account.offline && <p className="hint">Sin conexión</p>}
              </>
            ) : (
              <>
                <h3>Sin cuenta</h3>
                <p className="hint">Modo desarrollo: los datos quedan en este dispositivo.</p>
              </>
            )}
          </div>
        </section>

        <h3 className="sheet-label">Tus datos</h3>
        <p className="hint">
          {user
            ? 'Se guardan en tu cuenta y en este dispositivo. Igual podés bajarte un backup cada tanto.'
            : 'Los datos viven solo en este dispositivo. Exportá cada tanto.'}
        </p>
        <ul className="settings-list">
          <li>
            <button type="button" className="settings-row" onClick={exportBackup}>
              <Icon name="download" />
              <span>
                Exportar datos
                <small>Baja un archivo .json con todo</small>
              </span>
            </button>
          </li>
          <li>
            <label className="settings-row">
              <Icon name="upload" />
              <span>
                Importar backup
                <small>Reemplaza los datos actuales</small>
              </span>
              <input
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const backup = event.target.files?.[0]
                  event.target.value = ''
                  if (backup) void restoreBackup(backup)
                }}
              />
            </label>
          </li>
        </ul>
        {backupMessage && (
          <p className="notice" role="status">
            {backupMessage}
          </p>
        )}

        {user && (
          <>
            <button type="button" className="button secondary block settings-signout" onClick={signOut}>
              <Icon name="logout" size={18} />
              Cerrar sesión
            </button>
            {accountError && (
              <p className="notice error" role="alert">
                {accountError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
