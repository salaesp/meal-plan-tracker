import { readdirSync, readFileSync } from 'node:fs'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { testUtils } from 'better-auth/plugins'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { onRequest as authRoute } from '../functions/api/auth/[[path]]'
import { onRequest as middleware } from '../functions/api/_middleware'
import { authOptions, type AuthEnv, type D1 } from '../functions/_lib/auth'
import { readCachedUser, resolveAuth } from '../src/auth/state'

const ORIGIN = 'http://localhost:5173'

let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1 }>>>
let env: AuthEnv

beforeAll(async () => {
  // D1 local en memoria, sin tocar la cuenta de Cloudflare.
  proxy = await getPlatformProxy<{ DB: D1 }>({ persist: false, remoteBindings: false })
  env = {
    DB: proxy.env.DB,
    BETTER_AUTH_SECRET: 'secreto-solo-para-tests-0123456789abcdef',
    BETTER_AUTH_URL: ORIGIN,
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
  }
  for (const file of readdirSync('migrations').sort()) {
    const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/^--.*$/gm, '')
    for (const statement of sql.split(';').filter((part) => part.trim())) {
      await env.DB!.prepare(statement).run()
    }
  }
}, 60_000)

afterAll(() => proxy?.dispose())

async function login(email: string) {
  const auth = betterAuth({ ...authOptions(env), plugins: [testUtils()] })
  const { test } = await auth.$context
  const user = await test.saveUser(test.createUser({ email, name: 'Persona de prueba' }))
  return { user, headers: await test.getAuthHeaders({ userId: user.id }) }
}

async function callApi(path: string, headers?: Headers, environment: AuthEnv = env) {
  const data: Record<string, unknown> = {}
  const next = vi.fn(async () => new Response('ok'))
  const request = new Request(`${ORIGIN}${path}`, { method: 'POST', headers })
  const response = await middleware({ request, env: environment, data, next })
  return { response, data, next }
}

describe('base de datos', () => {
  it('las migraciones cubren lo que pide la configuración de auth', async () => {
    const pending = await getMigrations(authOptions(env))
    expect(pending.toBeCreated).toEqual([])
    expect(pending.toBeAdded).toEqual([])
  })
})

describe('protección de /api', () => {
  it('rechaza sin sesión', async () => {
    const { response, next } = await callApi('/api/parse-plan')
    expect(response.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rechaza una cookie falsificada', async () => {
    const headers = new Headers({ cookie: 'better-auth.session_token=inventado.firma' })
    expect((await callApi('/api/parse-plan', headers)).response.status).toBe(401)
  })

  it('deja pasar con sesión válida e identifica a la persona', async () => {
    const { user, headers } = await login('una@example.com')
    const { response, data } = await callApi('/api/parse-plan', headers)
    expect(response.status).toBe(200)
    expect(data.userId).toBe(user.id)
  })

  it('cada sesión es de su dueño', async () => {
    const first = await login('dos@example.com')
    const second = await login('tres@example.com')
    expect((await callApi('/api/x', first.headers)).data.userId).toBe(first.user.id)
    expect((await callApi('/api/x', second.headers)).data.userId).toBe(second.user.id)
  })

  it('no bloquea las rutas de ingreso', async () => {
    expect((await callApi('/api/auth/get-session')).next).toHaveBeenCalled()
  })

  it('falla cerrado si falta configuración', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { response, next } = await callApi('/api/parse-plan', undefined, { DB: env.DB })
    expect(response.status).toBe(500)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('ingreso con Google', () => {
  it('redirige a Google con el callback de la app', async () => {
    const request = new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    })
    const response = await authRoute({ request, env })
    expect(response.status).toBe(200)
    const { url } = (await response.json()) as { url: string }
    const target = new URL(url)
    expect(target.host).toBe('accounts.google.com')
    expect(target.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback/google`)
  })

  it('no permite volver a un sitio ajeno después de ingresar', async () => {
    const request = new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ provider: 'google', callbackURL: 'https://sitio-ajeno.test/' }),
    })
    expect((await authRoute({ request, env })).status).toBe(403)
  })
})

describe('estado de sesión en la app', () => {
  const user = { id: '1', name: 'A', email: 'a@example.com' }

  it('abre sin conexión con el último usuario conocido', () => {
    expect(resolveAuth({ isPending: false, user: null, error: {} }, user)).toEqual({
      status: 'signed-in',
      user,
      offline: true,
    })
    expect(resolveAuth({ isPending: false, user: null, error: { status: 500 } }, null)).toEqual({
      status: 'signed-out',
      unavailable: true,
    })
  })

  it('sale si el servidor dice que no hay sesión', () => {
    expect(resolveAuth({ isPending: false, user: null, error: null }, user)).toEqual({
      status: 'signed-out',
      unavailable: false,
    })
    expect(resolveAuth({ isPending: false, user: null, error: { status: 401 } }, user).status).toBe('signed-out')
  })

  it('mientras verifica no muestra el ingreso a quien ya había entrado', () => {
    expect(resolveAuth({ isPending: true, user: null, error: null }, user).status).toBe('signed-in')
    expect(resolveAuth({ isPending: true, user: null, error: null }, null).status).toBe('loading')
  })

  it('ignora un usuario guardado ilegible', () => {
    expect(readCachedUser({ getItem: () => '{roto' })).toBeNull()
    expect(readCachedUser({ getItem: () => '{"id":1}' })).toBeNull()
  })
})
