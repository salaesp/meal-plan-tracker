/**
 * Sincronización con `/api/data`: bajar, unir y subir. La base es la fuente de
 * verdad y cada dispositivo vuelve a unir antes de subir.
 */
import { mergeData } from '../domain/merge'
import type { AppData } from '../domain/types'
import { fingerprint, isUntouched, parseData } from './storage'

interface Options {
  /** Lo que hay ahora en este dispositivo. */
  read: () => AppData | null
  /** Guarda en este dispositivo lo que llegó de la base. */
  write: (data: AppData) => void
  request?: (url: string, init?: RequestInit) => Promise<Response>
}

export function createSync({ read, write, request = (url, init) => fetch(url, init) }: Options) {
  /** Huella de lo último que sabemos que tiene la base. */
  let synced: string | null = null
  let downloaded = false
  /** La próxima subida pisa la base sin unir (restaurar un backup). */
  let overwrite = false
  let running: Promise<void> | null = null
  let again = false

  const upload = async (data: AppData, keepalive = false, replace = false): Promise<boolean> => {
    const mark = fingerprint(data)
    if (mark === synced && !replace) return true
    const body = JSON.stringify(data)
    const response = await request(replace ? '/api/data?replace=1' : '/api/data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: keepalive && body.length < 60_000,
    })
    if (response.ok) synced = mark
    return response.ok
  }

  const once = async () => {
    if (overwrite) {
      const local = read()
      if (local && (await upload(local, false, true))) {
        overwrite = false
        downloaded = true
      }
      return
    }
    const response = await request('/api/data')
    if (!response.ok) return
    const body = (await response.json()) as { data?: unknown }
    // Se restauró un backup mientras bajaba: esta descarga ya no sirve.
    if (overwrite) {
      again = true
      return
    }
    const remote = typeof body.data === 'string' ? parseData(body.data) : null
    // Un ejemplo sin tocar en la base no cuenta: falta la bienvenida.
    if (remote && !isUntouched(remote)) {
      const local = read()
      const merged = local ? mergeData(local, remote) : remote
      if (!local || fingerprint(merged) !== fingerprint(local)) write(merged)
      synced = fingerprint(remote)
    } else {
      synced = null
    }
    downloaded = true
    const next = read()
    if (next) await upload(next)
  }

  return {
    /** Si ya hay una en curso, se repite al terminar en vez de superponerse. */
    run(): Promise<void> {
      if (running) {
        again = true
        return running
      }
      running = (async () => {
        try {
          do {
            again = false
            await once()
          } while (again)
        } catch {
          // Sin conexión: sigue con lo local y reintenta después.
        } finally {
          running = null
        }
      })()
      return running
    },

    /**
     * Al ocultar la app no hay tiempo de bajar y unir: sube lo pendiente.
     * Nunca antes de la primera descarga, para no pisar la base desde un
     * dispositivo desactualizado.
     */
    async flush(): Promise<void> {
      const local = read()
      if (!downloaded || !local) return
      await upload(local, true).catch(() => false)
    },

    /** Hay cambios locales que la base todavía no tiene. */
    dirty(): boolean {
      const local = read()
      return local !== null && fingerprint(local) !== synced
    },

    replaceNext() {
      overwrite = true
    },
  }
}
