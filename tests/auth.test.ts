import { readdirSync, readFileSync } from 'node:fs'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { testUtils } from 'better-auth/plugins'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { authOptions, type D1 } from '../worker/auth'
import worker, { type Env } from '../worker/index'
import { readCachedUser, resolveAuth } from '../src/auth/state'

const ORIGIN = 'http://localhost:5173'

let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1 }>>>
let env: Env

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

const callApi = (path: string, headers?: Headers, environment: Env = env, method = 'POST') =>
  worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers }), environment)

const authRoute = ({ request }: { request: Request }) => worker.fetch(request, env)

describe('base de datos', () => {
  it('las migraciones cubren lo que pide la configuración de auth', async () => {
    const pending = await getMigrations(authOptions(env))
    expect(pending.toBeCreated).toEqual([])
    expect(pending.toBeAdded).toEqual([])
  })
})

describe('protección de /api', () => {
  it('rechaza sin sesión', async () => {
    expect((await callApi('/api/parse-plan')).status).toBe(401)
    expect((await callApi('/api/ruta-que-no-existe')).status).toBe(401)
  })

  it('rechaza una cookie falsificada', async () => {
    const headers = new Headers({ cookie: 'better-auth.session_token=inventado.firma' })
    expect((await callApi('/api/parse-plan', headers)).status).toBe(401)
  })

  it('con sesión válida llega a la ruta', async () => {
    const { headers } = await login('una@example.com')
    // Sin binding de IA la ruta responde su propio error: pasó el control de sesión.
    const response = await callApi('/api/parse-plan', headers)
    expect(await response.json()).toEqual({ error: 'Falta el binding de Workers AI.' })
  })

  it('con sesión distingue ruta y método inexistentes', async () => {
    const { headers } = await login('dos@example.com')
    expect((await callApi('/api/nada', headers)).status).toBe(404)
    expect((await callApi('/api/constructor', headers)).status).toBe(404)
    expect((await callApi('/api/parse-plan', headers, env, 'GET')).status).toBe(405)
  })

  it('cada sesión es de su dueño', async () => {
    const first = await login('tres@example.com')
    const second = await login('cuatro@example.com')
    for (const { user, headers } of [first, second]) {
      const response = await callApi('/api/auth/get-session', headers, env, 'GET')
      expect(((await response.json()) as { user: { id: string } }).user.id).toBe(user.id)
    }
  })

  it('falla cerrado si falta configuración', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await callApi('/api/parse-plan', undefined, { DB: env.DB })).status).toBe(500)
  })

  it('lo que no es /api lo sirven los archivos estáticos', async () => {
    const assets = { fetch: vi.fn(async () => new Response('index')) }
    const response = await callApi('/semana', undefined, { ASSETS: assets }, 'GET')
    expect(await response.text()).toBe('index')
  })
})

describe('ingreso con Google', () => {
  it('redirige a Google con el callback de la app', async () => {
    const request = new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    })
    const response = await authRoute({ request })
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
    expect((await authRoute({ request })).status).toBe(403)
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
