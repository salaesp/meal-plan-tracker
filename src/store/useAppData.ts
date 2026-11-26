import { useCallback, useEffect, useState } from 'react'
import type { AppData } from '../domain/types'
import { loadData, parseData, STORAGE_KEY } from './storage'

export type Update = (change: (data: AppData) => AppData) => void

export function useAppData() {
  const [initial] = useState(() => loadData(window.localStorage))
  const [data, setData] = useState(initial.data)
  const [saveFailed, setSaveFailed] = useState(false)

  // Guardar dentro del mismo cambio evita pisar datos de otra pestaña al montar.
  const update = useCallback<Update>((change) => {
    setData((current) => {
      const next = change(current)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        setSaveFailed(false)
      } catch {
        setSaveFailed(true)
      }
      return next
    })
  }, [])

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

  return { data, update, saveFailed, recovered: initial.recovered }
}
