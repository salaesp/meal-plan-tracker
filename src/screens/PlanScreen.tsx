import { useState } from 'react'
import type { Account } from '../auth/AuthGate'
import { MealBadge, SectionList } from '../components/common'
import { Icon } from '../components/icons'
import { formatDay } from '../domain/dates'
import { mealTheme } from '../domain/mealTheme'
import { activatePlan, activePlanId } from '../domain/tracking'
import type { AppData } from '../domain/types'
import { importPlan, SessionExpiredError, type Draft } from '../store/importPlan'
import { parseData } from '../store/storage'
import type { Update } from '../store/useAppData'

interface Props {
  account: Account
  data: AppData
  update: Update
  today: string
  hasDraft: boolean
  onDraft: (draft: Draft) => void
}

export function PlanScreen({ account, data, update, today, hasDraft, onDraft }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [accountError, setAccountError] = useState('')
  const signOut = async () => setAccountError((await account.signOut()) ?? '')
  const activeId = activePlanId(data)
  const active = data.plans.find((plan) => plan.id === activeId)!
  const input = file ?? pasted.trim()

  const analyze = async () => {
    setLoading(true)
    setError('')
    setExpired(false)
    try {
      onDraft(await importPlan(input))
    } catch (caught) {
      if (caught instanceof SessionExpiredError) setExpired(true)
      else setError(caught instanceof Error ? caught.message : 'No se pudo procesar el plan.')
    } finally {
      setLoading(false)
    }
  }

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
    update(() => restored)
    setBackupMessage('Backup restaurado.')
  }

  return (
    <>
      <header className="page-header">
        <h1>Plan</h1>
      </header>

      <div className="card-header">
        <h2>{active.name}</h2>
        <button type="button" className="link" onClick={() => onDraft({ plan: active, sourceText: '' })}>
          Editar
        </button>
      </div>
      {active.meals.map((meal) => (
        <details className={`meal-card theme-${mealTheme(meal)}`} key={meal.id}>
          <summary>
            <MealBadge theme={mealTheme(meal)} />
            {meal.name}
          </summary>
          <div className="meal-card-body">
            <SectionList sections={meal.sections} />
            {meal.dessert && <SectionList sections={meal.dessert} />}
          </div>
        </details>
      ))}
      {active.notes.length > 0 && (
        <details className="card">
          <summary>Indicaciones generales</summary>
          <SectionList sections={active.notes} />
        </details>
      )}

      <section className="card quiet">
        <h2>Cargar plan nuevo</h2>
        {hasDraft && (
          <p className="notice">
            Tenés un borrador sin activar. <a href="#/revisar">Seguir revisando</a>
          </p>
        )}
        <div className="file-picker">
          <label className="button secondary">
            <Icon name="file" size={18} />
            {file ? 'Cambiar PDF' : 'Elegir PDF'}
            <input
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                event.target.value = ''
              }}
            />
          </label>
          {file && (
            <span className="file-name">
              {file.name}
              <button type="button" className="link" onClick={() => setFile(null)}>
                Quitar
              </button>
            </span>
          )}
        </div>
        <label className="field">
          O pegá el texto
          <textarea
            rows={4}
            value={pasted}
            disabled={file !== null}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="Desayuno / Merienda…"
          />
        </label>
        <button type="button" className="button block" disabled={!input || loading} onClick={analyze}>
          {loading ? 'Leyendo el plan… puede tardar un minuto' : 'Analizar con IA'}
        </button>
        <p className="hint">El documento se envía a Cloudflare Workers AI. Antes de activarlo vas a revisarlo.</p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {expired && (
          <p className="notice error" role="alert">
            Venció tu sesión.{' '}
            <button type="button" className="link" onClick={signOut}>
              Volver a ingresar
            </button>
          </p>
        )}
      </section>

      {data.plans.length > 1 && (
        <section className="card">
          <h2>Otros planes</h2>
          <ul className="extras">
            {data.plans
              .filter((plan) => plan.id !== activeId)
              .map((plan) => (
                <li key={plan.id}>
                  <span>{plan.name}</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => update((current) => activatePlan(current, plan, today))}
                  >
                    Activar desde hoy
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {account.user && (
        <section className="card">
          <h2>Cuenta</h2>
          <p className="hint">
            {account.user.name} · {account.user.email}
            {account.offline && ' · sin conexión'}
          </p>
          <button type="button" className="button secondary block" onClick={signOut}>
            Cerrar sesión
          </button>
          {accountError && (
            <p className="notice error" role="alert">
              {accountError}
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2>Backup</h2>
        <p className="hint">
          Los datos viven solo en este dispositivo. Exportá cada tanto. Hoy es {formatDay(today)}.
        </p>
        <button type="button" className="button secondary block" onClick={exportBackup}>
          Exportar datos
        </button>
        <label className="button secondary block">
          Restaurar desde archivo
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
        {backupMessage && (
          <p className="notice" role="status">
            {backupMessage}
          </p>
        )}
      </section>
    </>
  )
}
