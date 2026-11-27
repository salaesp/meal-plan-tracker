/**
 * GET/PUT /api/data — el registro completo de la persona, para usarlo desde
 * varios dispositivos. El cliente une antes de subir, pero entre su descarga y
 * su subida otro dispositivo pudo guardar algo: por eso acá se vuelve a unir con
 * lo que ya hay. `?replace=1` pisa todo (restaurar un backup).
 */
import { mergeData } from '../src/domain/merge'
import { parseData } from '../src/store/storage'
import { jsonError, type D1 } from './auth'

export const MAX_DATA_BYTES = 2 * 1024 * 1024

export async function handleGetData(db: D1 | undefined, userId: string): Promise<Response> {
  if (!db) return jsonError(500, 'Falta la base de datos.')
  const row = (await db.prepare('select data, updated_at from user_data where user_id = ?').bind(userId).first()) as
    | { data: string; updated_at: number }
    | null
  return Response.json({ data: row?.data ?? null, updatedAt: row?.updated_at ?? null }, { headers: { 'cache-control': 'no-store' } })
}

export async function handlePutData(request: Request, db: D1 | undefined, userId: string): Promise<Response> {
  if (!db) return jsonError(500, 'Falta la base de datos.')
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return jsonError(403, 'Origen no permitido.')
  const text = await request.text()
  if (text.length > MAX_DATA_BYTES) return jsonError(413, 'Hay demasiados datos para guardar.')
  const incoming = parseData(text)
  if (!incoming) return jsonError(400, 'Datos inválidos.')
  const replace = new URL(request.url).searchParams.get('replace') === '1'
  const row = replace
    ? null
    : ((await db.prepare('select data from user_data where user_id = ?').bind(userId).first()) as { data: string } | null)
  const stored = row ? parseData(row.data) : null
  const data = stored ? mergeData(incoming, stored) : incoming
  const updatedAt = Date.now()
  await db
    .prepare(
      'insert into user_data (user_id, data, updated_at) values (?, ?, ?) ' +
        'on conflict(user_id) do update set data = excluded.data, updated_at = excluded.updated_at',
    )
    .bind(userId, JSON.stringify(data), updatedAt)
    .run()
  return Response.json({ updatedAt }, { headers: { 'cache-control': 'no-store' } })
}
