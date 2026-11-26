import { describe, expect, it, vi } from 'vitest'
import { MAX_TEXT_CHARS, onRequestPost, type Ai } from '../functions/api/parse-plan'

const document = 'Desayuno: elegir una opción. '.repeat(10)
const section = { title: 'Base', rule: 'Elegí 1', options: ['pan'] }

const answers = [
  { groups: [{ names: ['Desayuno'], sections: [section], dessert: [] }] },
  { perDay: 1, sections: [section] },
  { waterLiters: 2, notes: [] },
]

function answerFor(input: Record<string, unknown>) {
  const format = input.response_format as { json_schema: { properties: object } }
  const keys = Object.keys(format.json_schema.properties)
  return answers[keys.includes('groups') ? 0 : keys.includes('perDay') ? 1 : 2]!
}

const fakeAi = (overrides: Partial<Ai> = {}): Ai => ({
  run: vi.fn(async (_model, input) => ({ response: answerFor(input) })),
  toMarkdown: vi.fn(async () => ({ format: 'markdown', data: document })),
  ...overrides,
})

function request(fields: Record<string, string | File>, headers: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return new Request('https://app.test/api/parse-plan', { method: 'POST', body: form, headers })
}

const post = (ai: Ai | undefined, req: Request) => onRequestPost({ request: req, env: { AI: ai } })

describe('POST /api/parse-plan', () => {
  it('arma el plan desde texto', async () => {
    const response = await post(fakeAi(), request({ text: document }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { plan: { meals: { name: string }[] }; sourceText: string }
    expect(body.plan.meals.map((meal) => meal.name)).toEqual(['Desayuno', 'Colación'])
    expect(body.sourceText).toBe(document.trim())
  })

  it('convierte el PDF antes de extraer', async () => {
    const ai = fakeAi()
    const pdf = new File(['%PDF'], 'mi plan.pdf', { type: 'application/pdf' })
    expect((await post(ai, request({ file: pdf }))).status).toBe(200)
    expect(ai.toMarkdown).toHaveBeenCalledOnce()
  })

  it('acepta la respuesta como string JSON y reintenta una vez', async () => {
    let failed = false
    const ai = fakeAi({
      run: vi.fn(async (_model, input) => {
        if (!failed) {
          failed = true
          throw new Error("JSON Mode couldn't be met")
        }
        return { response: JSON.stringify(answerFor(input)) }
      }),
    })
    expect((await post(ai, request({ text: document }))).status).toBe(200)
    expect(ai.run).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['texto corto', request({ text: 'hola' }), 422],
    ['texto enorme', request({ text: 'a'.repeat(MAX_TEXT_CHARS + 1) }), 413],
    ['archivo no PDF', request({ file: new File(['x'], 'a.png', { type: 'image/png' }) }), 415],
    ['otro origen', request({ text: document }, { origin: 'https://otro.test' }), 403],
  ])('rechaza %s sin gastar IA', async (_name, req, status) => {
    const ai = fakeAi()
    expect((await post(ai, req)).status).toBe(status)
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('informa cuota agotada sin reintentar', async () => {
    const ai = fakeAi({
      run: vi.fn(async () => {
        throw new Error('3036: you have used up your daily free allocation of 10,000 neurons')
      }),
    })
    expect((await post(ai, request({ text: document }))).status).toBe(429)
    expect(ai.run).toHaveBeenCalledTimes(3)
  })

  it('devuelve error claro si la IA falla o falta el binding', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ai = fakeAi({ run: vi.fn(async () => ({ response: 'no es json' })) })
    expect((await post(ai, request({ text: document }))).status).toBe(502)
    expect((await post(undefined, request({ text: document }))).status).toBe(500)
  })
})
