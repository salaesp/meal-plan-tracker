/** Preparación del texto de un plan antes de mandarlo a la IA. La usan la app y el Worker. */

export const MIN_TEXT_CHARS = 100
/** El modelo tiene 24k tokens de contexto: entra el texto y la respuesta. */
export const MAX_TEXT_CHARS = 30_000

/** Viñetas comunes y las de fuentes tipo Wingdings (zona de uso privado). */
const BULLET = /^\s*[-•●○▪■‣◦➢✓]\s*/

/**
 * Deja una opción por renglón, marcada con "- ": así el modelo reconoce las
 * listas. Une los renglones que el PDF cortó a mitad de una opción.
 */
export function normalizePlanText(text: string): string {
  const out: string[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.test(raw)
    const line = raw.replace(BULLET, '').replace(/[-]/g, '').trim()
    const previous = out.at(-1)
    if (bullet) {
      if (line) out.push(`- ${line}`)
    } else if (previous?.startsWith('- ') && line && (/^[(\p{Ll}]/u.test(line) || previous.endsWith(','))) {
      out[out.length - 1] = `${previous} ${line}`
    } else {
      out.push(line)
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const EMAIL =/[\w.+-]+@[\w-]+\.[\w.-]+/
const PHONE_LINE = /\b(tel|tel[eé]fono|cel|celular|whatsapp)\b\.?\s*:/i
const PERSON_LINE = /^\s*(paciente|dni|lic\.?\s|m\.?\s?[np]\.?\s?\d|matr[ií]cula)/i

/**
 * Quita las líneas con datos de contacto o identidad que se repiten en los
 * membretes. No es exhaustivo: un nombre suelto puede quedar.
 */
export function stripContactLines(text: string): string {
  const lines = text.split('\n')
  const dropped = new Set(
    lines.filter((line) => EMAIL.test(line) || PHONE_LINE.test(line) || PERSON_LINE.test(line)).map((line) => line.trim()),
  )
  // El nombre del profesional suele ir justo arriba del título ("Lic. en …").
  lines.forEach((line, index) => {
    const previous = lines[index - 1]?.trim()
    if (/^\s*lic\.?\s/i.test(line) && previous) dropped.add(previous)
  })
  return lines
    .filter((line) => !dropped.has(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
