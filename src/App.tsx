import { useCallback, useEffect, useRef, useState } from 'react'
import type { Account } from './auth/AuthGate'
import { Toast, type Notify, type ToastMessage } from './components/common'
import { Icon, type IconName } from './components/icons'
import { isISODate, toISODate } from './domain/dates'
import { activatePlan } from './domain/tracking'
import { DayScreen } from './screens/DayScreen'
import { PlanScreen } from './screens/PlanScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { WeekScreen } from './screens/WeekScreen'
import type { Draft } from './store/importPlan'
import { useAppData } from './store/useAppData'

function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/** Se actualiza si la app queda abierta pasada la medianoche. */
function useToday() {
  const [today, setToday] = useState(() => toISODate(new Date()))
  useEffect(() => {
    const refresh = () => setToday(toISODate(new Date()))
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return today
}

const TABS: { id: string; href: string; label: string; icon: IconName }[] = [
  { id: 'hoy', href: '#/', label: 'Hoy', icon: 'today' },
  { id: 'semana', href: '#/semana', label: 'Semana', icon: 'week' },
  { id: 'plan', href: '#/plan', label: 'Plan', icon: 'plan' },
]

export function App({ account }: { account: Account }) {
  const { data, update, saveFailed, recovered, loading } = useAppData(account.user?.id ?? null, account.user !== null && !account.offline)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const hash = useHash()
  const today = useToday()
  const [, route = '', dateParam, itemKey = ''] = hash.split('/')
  // Las rutas con fecha futura o inválida caen en hoy.
  const date = isISODate(dateParam) && dateParam <= today ? dateParam : today

  const notify = useCallback<Notify>((message) => setToast({ ...message, id: Date.now() }), [])
  const dismiss = useCallback(() => setToast(null), [])

  // Abrir o cerrar la hoja de una comida no mueve el scroll del día.
  const previousRoute = useRef(route)
  useEffect(() => {
    const was = previousRoute.current
    previousRoute.current = route
    if (route !== 'comida' && was !== 'comida') window.scrollTo(0, 0)
  }, [hash, route])

  const openDraft = (next: Draft) => {
    setDraft(next)
    window.location.hash = '#/revisar'
  }
  const closeDraft = () => {
    setDraft(null)
    window.location.hash = '#/plan'
  }

  let screen
  let tab = 'hoy'
  if (route === 'semana') {
    tab = 'semana'
    screen = <WeekScreen key={date} data={data} date={date} today={today} notify={notify} />
  } else if (route === 'plan' || route === 'revisar') {
    tab = 'plan'
    screen =
      route === 'revisar' && draft ? (
        <ReviewScreen
          key={draft.plan.id}
          draft={draft}
          onChange={setDraft}
          onDiscard={closeDraft}
          onActivate={(plan) => {
            update((current) => activatePlan(current, plan, today))
            setDraft(null)
            window.location.hash = '#/'
          }}
        />
      ) : (
        <PlanScreen
          account={account}
          data={data}
          update={update}
          today={today}
          hasDraft={draft !== null}
          onDraft={openDraft}
        />
      )
  } else {
    screen = (
      <DayScreen
        key={`${date}-${today}`}
        data={data}
        update={update}
        date={date}
        today={today}
        openMealId={route === 'comida' ? decodeURIComponent(itemKey).replace(/:dessert$/, '') : undefined}
        notify={notify}
      />
    )
  }

  if (loading) {
    return (
      <p className="splash" role="status">
        Cargando tu plan…
      </p>
    )
  }

  return (
    <>
      <main>
        {saveFailed && (
          <p className="notice error" role="alert">
            No se pudo guardar en este dispositivo. Exportá un backup desde Plan.
          </p>
        )}
        {recovered && (
          <p className="notice error" role="alert">
            Los datos guardados no se pudieron leer. Quedó una copia interna y arrancaste de cero.
          </p>
        )}
        {screen}
      </main>
      <Toast toast={toast} onDismiss={dismiss} />
      <nav className="tabs" aria-label="Secciones">
        {TABS.map((entry) => (
          <a key={entry.id} href={entry.href} aria-current={tab === entry.id ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={entry.icon} size={22} />
            </span>
            {entry.label}
          </a>
        ))}
      </nav>
    </>
  )
}
