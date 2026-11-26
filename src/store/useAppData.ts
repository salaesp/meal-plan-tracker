import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeData } from '../domain/merge'
import type { AppData } from '../domain/types'
import { adoptLegacy, isUntouched, loadData, parseData, storageKeyFor } from './storage'

export type Update = (change: (data: AppData) => AppData) => void

const PUSH_DELAY_MS = 1500

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
 * Nunca se sube nada antes de la primera descarga, para no pisar el registro
 * del servidor con el de un dispositivo nuevo.
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
  const [pulled, setPulled] = useState(false)
  /** Ya se intentó bajar del servidor (con o sin éxito). */
  const [settled, setSettled] = useState(false)
  const latest = useRef(data)
  latest.current = data
  /** Último JSON que sabemos que tiene el servidor. */
  const synced = useRef<string | null>(null)

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

  /** Primer guardado, al terminar la bienvenida. */
  const create = useCallback(
    (first: AppData) => {
      const next = { ...first, updatedAt: Date.now() }
      setSaveFailed(!persist(key, next))
      setData(next)
    },
    [key],
  )

  const push = useCallback(async (next: AppData | null, keepalive = false) => {
    if (!next) return
    const body = JSON.stringify(next)
    if (body === synced.current) return
    try {
      const response = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: keepalive && body.length < 60_000,
      })
      if (response.ok) synced.current = body
    } catch {
      // Sin conexión: se reintenta con el próximo cambio.
    }
  }, [])

  const pull = useCallback(async () => {
    try {
      const response = await fetch('/api/data')
      if (!response.ok) return
      const body = (await response.json()) as { data?: unknown }
      const remote = typeof body.data === 'string' ? parseData(body.data) : null
      // Un ejemplo sin tocar en el servidor no cuenta: falta la bienvenida.
      if (remote && !isUntouched(remote)) {
        const local = latest.current
        const merged = local ? mergeData(local, remote) : remote
        if (JSON.stringify(merged) !== JSON.stringify(local)) {
          setData(merged)
          setSaveFailed(!persist(key, merged))
        }
        synced.current = JSON.stringify(remote)
        latest.current = merged
      }
      setPulled(true)
      await push(latest.current)
    } catch {
      // Sin conexión: sigue funcionando con lo local.
    } finally {
      setSettled(true)
    }
  }, [push, key])

  useEffect(() => {
    if (!sync) return
    void pull()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pull()
      else void push(latest.current, true)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [sync, pull, push])

  useEffect(() => {
    if (!sync || !pulled) return
    const timer = setTimeout(() => void push(data), PUSH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [sync, pulled, data, push])

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
  return { data, update, create, saveFailed, recovered: initial.recovered, loading }
}
