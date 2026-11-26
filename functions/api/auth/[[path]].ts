/** /api/auth/* — ingreso con Google, callback, sesión y salida. */
import { ConfigError, createAuth, jsonError, type AuthEnv } from '../../_lib/auth'

export async function onRequest({ request, env }: { request: Request; env: AuthEnv }): Promise<Response> {
  try {
    return await createAuth(env).handler(request)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error('auth', error.message)
    return jsonError(500, 'El ingreso no está configurado.')
  }
}
