// Extracts plain text from a digital (text-selectable) PDF — e.g. an
// academic calendar, unlike hall tickets which need OCR (see
// hall-ticket-ocr.ts's honesty note on why). We drive pdfjs-dist's legacy
// build directly rather than pdf-parse: pdf-parse's ancient bundled pdfjs
// throws "bad XRef entry" under Electron's runtime (works fine under plain
// Node, so the bug is invisible in unit tests). Lines are reconstructed from
// each text item's vertical position so the output is one row per line,
// roughly matching visual reading order for a simple table layout.

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let pdfjsPromise: Promise<PdfjsModule> | null = null
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjsPromise
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise
  try {
    const lines: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      // Bucket items by their baseline Y (transform[5]); items sharing a row
      // land in the same bucket, then we order each row left-to-right by X.
      const rows = new Map<number, { x: number; str: string }[]>()
      for (const item of content.items) {
        if (!('str' in item) || item.str === '') continue
        const y = Math.round(item.transform[5])
        const row = rows.get(y)
        if (row) row.push({ x: item.transform[4], str: item.str })
        else rows.set(y, [{ x: item.transform[4], str: item.str }])
      }
      const ys = [...rows.keys()].sort((a, b) => b - a) // top of the page first
      for (const y of ys) {
        const line = rows
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map((i) => i.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (line) lines.push(line)
      }
    }
    return lines.join('\n')
  } finally {
    await loadingTask.destroy()
  }
}
