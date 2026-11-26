/**
 * Worker de la app. Cloudflare sirve los archivos estáticos y solo `/api/*`
 * pasa por acá (`run_worker_first` en wrangler.jsonc).
 *
 * Todo `/api/*` exige sesión, salvo `/api/auth/*`. Las rutas nuevas van en
 * `routes` y quedan protegidas por defecto.
 */
import { ConfigError, createAuth, jsonError, type AuthEnv } from './auth'
import { handleGetData, handlePutData } from './data'
import { handleParsePlan, type Ai } from './parse-plan'

export interface Env extends AuthEnv {
  AI?: Ai
  ASSETS?: { fetch(request: Request): Promise<Response> }
}

type Route = (request: Request, env: Env, userId: string) => Promise<Response>

const routes: Record<string, Partial<Record<string, Route>>> = {
  '/api/parse-plan': { POST: (request, env) => handleParsePlan(request, env.AI) },
  '/api/data': {
    GET: (_request, env, userId) => handleGetData(env.DB, userId),
    PUT: (request, env, userId) => handlePutData(request, env.DB, userId),
  },
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const auth = createAuth(env)
    // Ingreso con Google, callback, sesión y salida.
    if (path.startsWith('/api/auth/')) return await auth.handler(request)

    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return jsonError(401, 'Tenés que iniciar sesión.')

    const methods = Object.hasOwn(routes, path) ? routes[path] : undefined
    if (!methods) return jsonError(404, 'No existe.')
    const route = Object.hasOwn(methods, request.method) ? methods[request.method] : undefined
    if (!route) return jsonError(405, 'Método no permitido.')
    return await route(request, env, session.user.id)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error('auth', error.message)
    return jsonError(500, 'El ingreso no está configurado.')
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path.startsWith('/api/')) return handleApi(request, env, path)
    return env.ASSETS ? env.ASSETS.fetch(request) : jsonError(404, 'No existe.')
  },
}
