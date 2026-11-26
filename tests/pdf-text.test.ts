import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES, NO_TEXT_MESSAGE, readPdfFile, readPdfText } from '../src/store/pdfText'

/** PDF mínimo de una página, armado a mano para no versionar documentos reales. */
function pdf(lines: string[]): Uint8Array {
  const stream = `BT /F1 10 Tf 40 800 Td 14 TL ${lines.map((line) => `(${line}) Tj T*`).join(' ')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = body.length
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(body)
}

describe('lectura de PDF en el dispositivo', () => {
  it('extrae el texto', async () => {
    const lines = Array.from({ length: 8 }, (_, index) => `Desayuno opcion ${index}: pan integral 50 gr`)
    const text = await readPdfText(pdf(lines))
    expect(text).toContain('Desayuno opcion 0')
    expect(text).toContain('opcion 7')
  })

  it('avisa si no hay texto', async () => {
    await expect(readPdfText(pdf([]))).rejects.toThrow(NO_TEXT_MESSAGE)
  })

  it('avisa si el archivo no es un PDF válido', async () => {
    await expect(readPdfText(new TextEncoder().encode('esto no es un pdf'))).rejects.toThrow('No se pudo leer el PDF')
  })

  it('rechaza archivos enormes sin leerlos', async () => {
    const huge = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'a.pdf')
    await expect(readPdfFile(huge)).rejects.toThrow('5 MB')
  })
})
