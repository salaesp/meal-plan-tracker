import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeData } from '../domain/merge'
import type { AppData } from '../domain/types'
import { loadData, parseData, STORAGE_KEY } from './storage'

export type Update = (change: (data: AppData) => AppData) => void

const PUSH_DELAY_MS = 1500

function persist(data: AppData): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

/**
 * `sync`: guarda también en el servidor y trae lo de otros dispositivos.
 * Nunca se sube nada antes de la primera descarga, para no pisar el registro
 * del servidor con el de un dispositivo nuevo.
 */
export function useAppData(sync: boolean) {
  const [initial] = useState(() => loadData(window.localStorage))
  const [data, setData] = useState(initial.data)
  const [saveFailed, setSaveFailed] = useState(false)
  const [pulled, setPulled] = useState(false)
  const latest = useRef(data)
  latest.current = data
  /** Último JSON que sabemos que tiene el servidor. */
  const synced = useRef<string | null>(null)

  // Guardar dentro del mismo cambio evita pisar datos de otra pestaña al montar.
  const update = useCallback<Update>((change) => {
    setData((current) => {
      const changed = change(current)
      if (changed === current) return current
      const next = { ...changed, updatedAt: Date.now() }
      setSaveFailed(!persist(next))
      return next
    })
  }, [])

  const push = useCallback(async (next: AppData, keepalive = false) => {
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
      if (remote) {
        const merged = mergeData(latest.current, remote)
        if (JSON.stringify(merged) !== JSON.stringify(latest.current)) {
          setData(merged)
          setSaveFailed(!persist(merged))
        }
        synced.current = JSON.stringify(remote)
        latest.current = merged
      }
      setPulled(true)
      await push(latest.current)
    } catch {
      // Sin conexión: sigue funcionando con lo local.
    }
  }, [push])

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
      if (event.key !== STORAGE_KEY || event.newValue === null) return
      const next = parseData(event.newValue)
      if (next) setData(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { data, update, saveFailed, recovered: initial.recovered }
}
