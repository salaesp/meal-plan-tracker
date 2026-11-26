/**
 * Lee el texto de un PDF en el dispositivo (el archivo no se envía).
 * pdf.js se descarga recién cuando alguien elige un PDF.
 */
import { MIN_TEXT_CHARS } from '../domain/planText'

export const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_PAGES = 30

export const NO_TEXT_MESSAGE =
  'El PDF no tiene texto seleccionable (parece una imagen o un escaneo). Pegá el texto del plan en el campo de abajo.'

export async function readPdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  let pages: string[]
  try {
    const pdf = await getDocumentProxy(data)
    try {
      if (pdf.numPages > MAX_PAGES) throw new Error(`El PDF tiene más de ${MAX_PAGES} páginas.`)
      pages = (await extractText(pdf, { mergePages: false })).text
    } finally {
      await pdf.loadingTask.destroy()
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'PasswordException') throw new Error('El PDF tiene contraseña. Quitásela o pegá el texto.')
    if (error instanceof Error && error.message.startsWith('El PDF')) throw error
    throw new Error('No se pudo leer el PDF. Pegá el texto del plan.')
  }
  const text = pages.join('\n\n').trim()
  if (text.length < MIN_TEXT_CHARS) throw new Error(NO_TEXT_MESSAGE)
  return text
}

export async function readPdfFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera los 5 MB.')
  return readPdfText(new Uint8Array(await file.arrayBuffer()))
}
