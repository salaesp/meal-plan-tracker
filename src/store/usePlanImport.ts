import { useCallback, useRef, useState } from 'react'
import { loadDraft, saveDraft } from './draft'
import { importPlan, SessionExpiredError, type Draft } from './importPlan'

export interface PlanImport {
  draft: Draft | null
  setDraft: (draft: Draft | null) => void
  /** Momento en que empezó la lectura en curso; `null` si no hay ninguna. */
  startedAt: number | null
  error: string
  expired: boolean
  /** Sube cada vez que una lectura termina bien. */
  finished: number
  start: (input: File | string) => Promise<void>
  cancel: () => void
}

/** Vive por encima de las pantallas para no perder la lectura al navegar. */
export function usePlanImport(): PlanImport {
  const [draft, setDraftState] = useState(() => loadDraft(window.localStorage))
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [finished, setFinished] = useState(0)
  const controller = useRef<AbortController | null>(null)

  const setDraft = useCallback((next: Draft | null) => {
    saveDraft(window.localStorage, next)
    setDraftState(next)
  }, [])

  const start = useCallback(
    async (input: File | string) => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      setStartedAt(Date.now())
      setError('')
      setExpired(false)
      try {
        const result = await importPlan(input, current.signal)
        if (current.signal.aborted) return
        setDraft(result)
        setFinished((count) => count + 1)
      } catch (caught) {
        if (current.signal.aborted) return
        if (caught instanceof SessionExpiredError) setExpired(true)
        else setError(caught instanceof Error ? caught.message : 'No se pudo procesar el plan.')
      } finally {
        if (controller.current === current) setStartedAt(null)
      }
    },
    [setDraft],
  )

  const cancel = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setStartedAt(null)
  }, [])

  return { draft, setDraft, startedAt, error, expired, finished, start, cancel }
}
