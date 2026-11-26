import { describe, expect, it, vi } from 'vitest'
import { planFromExtraction } from '../src/domain/parsing'
import { MAX_TEXT_CHARS, normalizePlanText, stripContactLines } from '../src/domain/planText'
import { handleParsePlan, type Ai } from '../worker/parse-plan'

const document = 'Desayuno: elegir una opción. '.repeat(10)
const section = { title: 'Base', rule: 'Elegí 1', options: ['pan'] }

const answers = [
  { groups: [{ names: ['Desayuno'], sections: [section], dessert: [] }] },
  { perDay: 1, sections: [section] },
  { waterLiters: 2, notes: [] },
]

function answerFor(input: Record<string, unknown>) {
  const format = input.response_format as { json_schema: { schema: { properties: object } } }
  const keys = Object.keys(format.json_schema.schema.properties)
  return answers[keys.includes('groups') ? 0 : keys.includes('perDay') ? 1 : 2]!
}

const fakeAi = (overrides: Partial<Ai> = {}): Ai => ({
  run: vi.fn(async (_model, input) => ({ response: answerFor(input) })),
  ...overrides,
})

function request(fields: Record<string, string | File>, headers: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return new Request('https://app.test/api/parse-plan', { method: 'POST', body: form, headers })
}

const post = (ai: Ai | undefined, req: Request) => handleParsePlan(req, ai)

describe('POST /api/parse-plan', () => {
  it('arma el plan desde texto', async () => {
    const response = await post(fakeAi(), request({ text: document }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { plan: { meals: { name: string }[] }; sourceText: string }
    expect(body.plan.meals.map((meal) => meal.name)).toEqual(['Desayuno', 'Colación'])
    expect(body.sourceText).toBe(document.trim())
  })

  it('no manda a la IA las líneas de contacto o identidad', async () => {
    const ai = fakeAi()
    const letterhead =
      'Ana Ejemplo\nLic. en Nutrición\nTel.: 11 0000-0000\nPaciente: Persona Prueba\nmail@ejemplo.test\n'
    expect((await post(ai, request({ text: letterhead + document }))).status).toBe(200)
    const sent = JSON.stringify(vi.mocked(ai.run).mock.calls)
    for (const secret of ['Ana Ejemplo', '0000-0000', 'Persona Prueba', 'mail@ejemplo']) {
      expect(sent).not.toContain(secret)
    }
    expect(sent).toContain('Desayuno')
  })

  it('lee respuestas en formato chat', async () => {
    const ai = fakeAi({
      run: vi.fn(async (_model, input) => ({
        choices: [{ message: { content: JSON.stringify(answerFor(input)) } }],
      })),
    })
    expect((await post(ai, request({ text: document }))).status).toBe(200)
  })

  it('convierte viñetas de Word y une renglones cortados', () => {
    const raw = 'Proteínas\r\n Carne magra, cuadril,\r\nPeceto o paleta (sin\r\ngrasa)\r\n• Pollo\r\nFormas de preparación'
    expect(normalizePlanText(raw)).toBe(
      'Proteínas\n- Carne magra, cuadril, Peceto o paleta (sin grasa)\n- Pollo\nFormas de preparación',
    )
  })

  it('junta las colaciones que llegan una por sección', () => {
    const one = (option: string) => ({ title: option, rule: '', options: [option] })
    const plan = planFromExtraction(
      { snacks: { perDay: 2, sections: [one('Fruta'), one('Huevo'), one('Barra')] } },
      'x',
      '2026-01-01',
    )
    expect(plan.meals[0]?.sections).toEqual([{ title: 'Opciones', rule: 'Elegí 1', options: ['Fruta', 'Huevo', 'Barra'] }])
  })

  it('el filtro de contacto no toca alimentos ni cantidades', () => {
    const plan = 'Desayuno\n2 rodajas de pan (50 gr)\nTelitas de arroz: 2 unidades\nCelery: libre'
    expect(stripContactLines(plan)).toBe(plan)
  })

  it('si la IA no encuentra comidas lo dice sin registrar el contenido', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ai = fakeAi({ run: vi.fn(async () => ({ response: {} })) })
    expect((await post(ai, request({ text: document }))).status).toBe(422)
    expect(warn).toHaveBeenCalledWith('parse-plan sin comidas', { caracteres: document.trim().length })
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
    ['un archivo en lugar de texto', request({ file: new File(['x'], 'a.pdf') }), 422],
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
