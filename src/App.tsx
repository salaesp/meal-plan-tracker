import { useCallback, useEffect, useRef, useState } from 'react'
import type { Account } from './auth/AuthGate'
import { DESKTOP_QUERY, Toast, useMediaQuery, type Notify, type ToastMessage } from './components/common'
import { Icon, type IconName } from './components/icons'
import { isISODate, toISODate } from './domain/dates'
import { activatePlan } from './domain/tracking'
import type { AppData } from './domain/types'
import { DayScreen } from './screens/DayScreen'
import { DesktopDayScreen } from './screens/DesktopDayScreen'
import { Onboarding } from './screens/Onboarding'
import { PlanScreen } from './screens/PlanScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { WeekScreen } from './screens/WeekScreen'
import { useAppData, type Update } from './store/useAppData'
import { usePlanImport, type PlanImport } from './store/usePlanImport'

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
  const userId = account.user?.id ?? null
  const { data, update, replace, create, saveFailed, recovered, loading } = useAppData(userId, userId !== null && !account.offline)
  const importer = usePlanImport(userId)
  const hash = useHash()
  const today = useToday()

  if (loading) {
    return (
      <p className="splash" role="status">
        Cargando tu plan…
      </p>
    )
  }

  if (!data) {
    return (
      <Onboarding
        account={account}
        importer={importer}
        hash={hash}
        today={today}
        recovered={recovered}
        onFinish={create}
      />
    )
  }
  return (
    <Main
      account={account}
      data={data}
      update={update}
      replace={replace}
      importer={importer}
      hash={hash}
      today={today}
      saveFailed={saveFailed}
    />
  )
}

interface MainProps {
  account: Account
  data: AppData
  update: Update
  replace: (data: AppData) => void
  importer: PlanImport
  hash: string
  today: string
  saveFailed: boolean
}

function Main({ account, data, update, replace, importer, hash, today, saveFailed }: MainProps) {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const desktop = useMediaQuery(DESKTOP_QUERY)
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

  // Al terminar la IA: en Plan pasa a revisar; en otra pestaña avisa.
  const seen = useRef(importer.finished)
  useEffect(() => {
    if (importer.finished === seen.current) return
    seen.current = importer.finished
    const review = () => {
      window.location.hash = '#/revisar'
    }
    if (route === 'plan') review()
    else notify({ text: 'Tu plan está listo para revisar.', action: { label: 'Revisar', run: review } })
  }, [importer.finished, route, notify])

  const closeDraft = () => {
    importer.setDraft(null)
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
      route === 'revisar' && importer.draft ? (
        <ReviewScreen
          key={importer.draft.plan.id}
          draft={importer.draft}
          onChange={importer.setDraft}
          onDiscard={closeDraft}
          onActivate={(plan) => {
            update((current) => activatePlan(current, plan, today))
            importer.setDraft(null)
            window.location.hash = '#/'
          }}
        />
      ) : (
        <PlanScreen
          account={account}
          data={data}
          update={update}
          replace={replace}
          today={today}
          importer={importer}
        />
      )
  } else if (desktop) {
    screen = (
      <DesktopDayScreen
        key={`${date}-${today}-${route === 'comida' ? itemKey : ''}`}
        data={data}
        update={update}
        date={date}
        today={today}
        openMealId={route === 'comida' ? decodeURIComponent(itemKey).replace(/:dessert$/, '') : undefined}
        notify={notify}
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

  return (
    <>
      <main className={desktop && tab === 'hoy' ? 'wide' : undefined}>
        {saveFailed && (
          <p className="notice error" role="alert">
            No se pudo guardar en este dispositivo. Exportá un backup desde Plan.
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
