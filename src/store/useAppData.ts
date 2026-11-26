import { useCallback, useEffect, useState } from 'react'
import type { AppData } from '../domain/types'
import { loadData, parseData, STORAGE_KEY } from './storage'

export type Update = (change: (data: AppData) => AppData) => void

export function useAppData() {
  const [initial] = useState(() => loadData(window.localStorage))
  const [data, setData] = useState(initial.data)
  const [saveFailed, setSaveFailed] = useState(false)

  const save = useCallback((next: AppData) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setSaveFailed(false)
    } catch {
      setSaveFailed(true)
    }
    return next
  }, [])

  // Guardar dentro del mismo cambio evita pisar datos de otra pestaña al montar.
  const update = useCallback<Update>(
    (change) => setData((current) => (current ? save(change(current)) : current)),
    [save],
  )
  /** Primer guardado, al terminar la bienvenida. */
  const create = useCallback((next: AppData) => setData(save(next)), [save])

  useEffect(() => {
    void navigator.storage?.persist?.()
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return
      const next = parseData(event.newValue)
      if (next) setData(next)
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  return { data, update, create, saveFailed, recovered: initial.recovered }
}
