/**
 * Autenticación: Google + sesiones en D1 (Better Auth).
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth'

/** Parte de la API de D1 que usamos (evita sumar los tipos globales de Workers). */
export interface D1 {
  prepare(query: string): any
  batch(statements: any[]): Promise<any[]>
  exec(query: string): Promise<unknown>
}

export interface AuthEnv {
  DB?: D1
  BETTER_AUTH_SECRET?: string
  /** Origen público de la app, ej. https://mi-app.pages.dev */
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

export class ConfigError extends Error {}

export function authOptions(env: AuthEnv) {
  const missing = (['DB', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'] as const).filter((key) => !env[key])
  if (missing.length) throw new ConfigError(`Falta configurar: ${missing.join(', ')}`)

  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const }
      : undefined

  return {
    database: env.DB as BetterAuthOptions['database'],
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    socialProviders: google ? { google } : {},
    session: {
      // La app se usa a diario: sesión larga que se renueva sola.
      expiresIn: 60 * 60 * 24 * 60,
      updateAge: 60 * 60 * 24,
    },
    // En memoria no sirve: cada pedido puede caer en otra instancia.
    rateLimit: { enabled: true, storage: 'database' as const, window: 60, max: 60 },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      // Explícito: la librería los apaga sola en entornos de test.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
  } satisfies BetterAuthOptions
}

export const createAuth = (env: AuthEnv) => betterAuth(authOptions(env))

export const jsonError = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } })
