import { describe, expect, it } from 'vitest'
import { seedPlan } from '../src/data/seedPlan'
import type { AppData } from '../src/domain/types'
import { setItem, toggleTrained } from '../src/domain/tracking'
import { fingerprint, initialData, parseData } from '../src/store/storage'
import { createSync } from '../src/store/sync'

const DATE = '2026-03-02'

function fakeServer() {
  const server = { data: null as string | null, uploads: 0, down: false }
  const request = async (_url: string, init?: RequestInit) => {
    if (server.down) return new Response(null, { status: 500 })
    if (init?.method !== 'PUT') return Response.json({ data: server.data })
    server.data = JSON.stringify(parseData(init.body as string))
    server.uploads += 1
    return Response.json({})
  }
  return { server, request }
}

function device(request: ReturnType<typeof fakeServer>['request'], start: AppData | null) {
  const state = { data: start }
  const syncer = createSync({
    read: () => state.data,
    write: (next) => {
      state.data = next
    },
    request,
  })
  return { state, syncer, edit: (change: (data: AppData) => AppData) => (state.data = change(state.data!)) }
}

const start = () => initialData(seedPlan, DATE, { mealTimes: {}, onboardedAt: DATE })

describe('sincronización entre dispositivos', () => {
  it('un dispositivo nuevo adopta lo guardado en la base', async () => {
    const { request } = fakeServer()
    const phone = device(request, setItem(start(), DATE, 'cena', { status: 'done' }))
    await phone.syncer.run()
    const computer = device(request, null)
    await computer.syncer.run()
    expect(computer.state.data?.days[DATE]?.items.cena?.status).toBe('done')
  })

  it('los cambios de ambos terminan en los dos', async () => {
    const { request } = fakeServer()
    const phone = device(request, start())
    const computer = device(request, null)
    await phone.syncer.run()
    await computer.syncer.run()

    phone.edit((data) => setItem(data, DATE, 'cena', { status: 'done' }))
    await phone.syncer.run()
    // La compu todavía no vio el cambio del celu y registra otro día.
    computer.edit((data) => setItem(data, '2026-03-03', 'cena', { status: 'failed' }))
    await computer.syncer.run()
    await phone.syncer.run()

    for (const { state } of [phone, computer]) {
      expect(state.data?.days[DATE]?.items.cena?.status).toBe('done')
      expect(state.data?.days['2026-03-03']?.items.cena?.status).toBe('failed')
    }
  })

  it('sin cambios no vuelve a subir, aunque cada uno ordene distinto', async () => {
    const { server, request } = fakeServer()
    const other = { ...seedPlan, id: 'plan-otro' }
    const phone = device(request, { ...start(), plans: [seedPlan, other] })
    const computer = device(request, { ...start(), plans: [other, seedPlan] })
    phone.edit((data) => toggleTrained(toggleTrained(data, DATE), DATE))
    for (let round = 0; round < 2; round += 1) {
      await phone.syncer.run()
      await computer.syncer.run()
    }
    const uploads = server.uploads
    await phone.syncer.run()
    await computer.syncer.run()
    expect(server.uploads).toBe(uploads)
    expect(computer.syncer.dirty()).toBe(false)
    expect(fingerprint(phone.state.data!)).toBe(fingerprint(computer.state.data!))
  })

  it('no sube nada si todavía no pudo bajar', async () => {
    const { server, request } = fakeServer()
    server.down = true
    const phone = device(request, start())
    await phone.syncer.run()
    server.down = false
    await phone.syncer.flush()
    expect(server.uploads).toBe(0)
    expect(phone.syncer.dirty()).toBe(true)
  })

  it('restaurar un backup reemplaza lo de la base', async () => {
    const { server, request } = fakeServer()
    const phone = device(request, setItem(start(), DATE, 'cena', { status: 'done' }))
    await phone.syncer.run()
    phone.syncer.replaceNext()
    phone.edit(() => start())
    await phone.syncer.run()
    expect(parseData(server.data!)?.days).toEqual({})
    expect(phone.state.data?.days).toEqual({})
  })
})
