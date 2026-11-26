/**
 * Todo /api/* exige sesión, salvo /api/auth/*. Las rutas nuevas quedan
 * protegidas por defecto y leen el usuario de `context.data.userId`.
 */
import { ConfigError, createAuth, jsonError, type AuthEnv } from '../_lib/auth'

interface Context {
  request: Request
  env: AuthEnv
  data: Record<string, unknown>
  next: () => Promise<Response>
}

export async function onRequest({ request, env, data, next }: Context): Promise<Response> {
  if (new URL(request.url).pathname.startsWith('/api/auth/')) return next()
  try {
    const session = await createAuth(env).api.getSession({ headers: request.headers })
    if (!session) return jsonError(401, 'Tenés que iniciar sesión.')
    data.userId = session.user.id
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error('auth', error.message)
    return jsonError(500, 'El ingreso no está configurado.')
  }
  return next()
}
