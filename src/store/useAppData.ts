import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData } from '../domain/types'
import { adoptLegacy, loadData, parseData, storageKeyFor } from './storage'
import { createSync } from './sync'

export type Update = (change: (data: AppData) => AppData) => void

const PUSH_DELAY_MS = 1500
/** Con la app a la vista, cada cuánto se buscan cambios de otros dispositivos. */
const REFRESH_MS = 30_000

function persist(key: string, data: AppData): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

/**
 * La base es la fuente de verdad; `localStorage` (una clave por cuenta) es
 * caché para abrir rápido y trabajar sin conexión.
 * `sync`: guarda también en el servidor y trae lo de otros dispositivos.
 * `data` es `null` mientras falte la bienvenida.
 */
export function useAppData(userId: string | null, sync: boolean) {
  const key = storageKeyFor(userId)
  const [initial] = useState(() => {
    adoptLegacy(window.localStorage, key)
    return loadData(window.localStorage, key)
  })
  const [data, setData] = useState(initial.data)
  const [saveFailed, setSaveFailed] = useState(false)
  /** Ya se intentó bajar del servidor (con o sin éxito). */
  const [settled, setSettled] = useState(false)
  const latest = useRef(data)
  latest.current = data

  const [syncer] = useState(() =>
    createSync({
      read: () => latest.current,
      write: (next) => {
        latest.current = next
        setData(next)
        setSaveFailed(!persist(key, next))
      },
    }),
  )

  // Guardar dentro del mismo cambio evita pisar datos de otra pestaña al montar.
  const update = useCallback<Update>(
    (change) => {
      setData((current) => {
        if (!current) return current
        const changed = change(current)
        if (changed === current) return current
        const next = { ...changed, updatedAt: Date.now() }
        setSaveFailed(!persist(key, next))
        return next
      })
    },
    [key],
  )

  /** Reemplaza todo, también en la base (restaurar un backup). */
  const replace = useCallback(
    (restored: AppData) => {
      syncer.replaceNext()
      update(() => restored)
    },
    [syncer, update],
  )

  /** Primer guardado, al terminar la bienvenida. */
  const create = useCallback(
    (first: AppData) => {
      const next = { ...first, updatedAt: Date.now() }
      setSaveFailed(!persist(key, next))
      setData(next)
    },
    [key],
  )

  useEffect(() => {
    if (!sync) return
    const run = () => void syncer.run().finally(() => setSettled(true))
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run()
      else void syncer.flush()
    }
    run()
    // En la compu, volver a la ventana no cambia la visibilidad: hace falta `focus`.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run()
    }, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', run)
    window.addEventListener('online', run)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', run)
      window.removeEventListener('online', run)
    }
  }, [sync, syncer])

  useEffect(() => {
    if (!sync || !syncer.dirty()) return
    const timer = setTimeout(() => void syncer.run(), PUSH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [sync, syncer, data])

  useEffect(() => {
    void navigator.storage?.persist?.()
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key || event.newValue === null) return
      const next = parseData(event.newValue)
      if (next) setData(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  // Sin datos locales no se ofrece la bienvenida hasta saber qué hay en la base.
  const loading = sync && data === null && !settled
  return { data, update, replace, create, saveFailed, recovered: initial.recovered, loading }
}
