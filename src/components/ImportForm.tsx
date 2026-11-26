import { useEffect, useState } from 'react'
import type { PlanImport } from '../store/usePlanImport'
import { Icon } from './icons'

function Progress({ startedAt, onCancel }: { startedAt: number; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000))

  return (
    <div className="progress" role="status">
      <span className="spinner" aria-hidden="true" />
      <h3>Leyendo tu plan…</h3>
      <p>
        Suele tardar cerca de un minuto. <span aria-hidden="true">{seconds} s</span>
      </p>
      <button type="button" className="link" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

/** Elegir PDF o pegar texto y mandarlo a la IA. */
export function ImportForm({ importer, onExpired }: { importer: PlanImport; onExpired: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const input = file ?? pasted.trim()

  if (importer.startedAt !== null) {
    return <Progress startedAt={importer.startedAt} onCancel={importer.cancel} />
  }

  return (
    <>
      {importer.draft && (
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
      <button type="button" className="button block" disabled={!input} onClick={() => void importer.start(input)}>
        Analizar con IA
      </button>
      <p className="hint">
        El PDF se lee en tu dispositivo y solo el texto se envía a Cloudflare Workers AI. Antes de usarlo vas a
        revisarlo.
      </p>
      {importer.error && (
        <p className="notice error" role="alert">
          {importer.error}
        </p>
      )}
      {importer.expired && (
        <p className="notice error" role="alert">
          Venció tu sesión.{' '}
          <button type="button" className="link" onClick={onExpired}>
            Volver a ingresar
          </button>
        </p>
      )}
    </>
  )
}
