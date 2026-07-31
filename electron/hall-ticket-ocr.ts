// OCR-based text extraction for exam hall tickets (main process).
//
// WHY OCR: CHRIST hall tickets are "print-to-PDF" output (Ghostscript /
// PDFCreator) whose text layer is embedded as Type3 fonts with a numeric-index
// /Differences encoding and NO /ToUnicode map. That makes the text physically
// non-extractable as Unicode — pdfjs (and every other extractor) returns a
// consistent-but-scrambled cipher. So we rasterize the page and read the pixels
// instead.
//
// The one non-obvious step is grid-line removal: Tesseract reads the borderless
// header/instructions perfectly but mangles the bordered exam TABLE (wrong
// dates, missing course codes) because the grid lines wreck its layout
// analysis. Stripping long horizontal/vertical dark runs before OCR fixes it
// (validated: 15/15 fields correct on a real hall ticket).
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas'
import type { Worker } from 'tesseract.js'
import type { PdfOcrProgress } from './ipc/contract'

// Loaded lazily (not at startup) so tesseract.js — which spawns a worker_thread
// and loads a WASM core the first time it's used — costs nothing until an
// import actually runs. The app ships with asar disabled (build.asar=false), so
// this resolves from a normal node_modules tree in both dev and the packaged
// app; that avoids the asar-vs-unpacked worker/dependency split that otherwise
// crashes the OCR worker on launch.
const nodeRequire = createRequire(__filename)
function loadTesseract(): typeof import('tesseract.js') {
  return nodeRequire('tesseract.js') as typeof import('tesseract.js')
}

// pdfjs's canvas backend constructs these via globals; Node lacks them.
{
  const g = globalThis as unknown as Record<string, unknown>
  g.Path2D ??= Path2D
  g.DOMMatrix ??= DOMMatrix
  g.ImageData ??= ImageData
}

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsPromise: Promise<PdfjsModule> | null = null
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjsPromise
}

// Lets pdfjs create its own scratch canvases in Node.
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height))
    return { canvas, context: canvas.getContext('2d') }
  }
  reset(cc: { canvas: { width: number; height: number } }, width: number, height: number) {
    cc.canvas.width = Math.ceil(width)
    cc.canvas.height = Math.ceil(height)
  }
  destroy(cc: { canvas: { width: number; height: number } }) {
    cc.canvas.width = 0
    cc.canvas.height = 0
  }
}

// ~250 DPI at typical page size — enough for the small table text without
// blowing up OCR time.
const RENDER_SCALE = 4
// A run of dark pixels this long is a grid line, not a glyph stroke (cells span
// hundreds of px; the longest letter stroke is far shorter).
const H_LINE_FRACTION = 0.03
const V_LINE_FRACTION = 0.015
const DARK_LUMA = 150

/** Whitens long horizontal/vertical dark runs (table borders) in place. */
function stripGridLines(px: Uint8ClampedArray, w: number, h: number): void {
  const luma = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  }
  const clear = new Set<number>()
  const hMin = Math.round(w * H_LINE_FRACTION)
  const vMin = Math.round(h * V_LINE_FRACTION)

  for (let y = 0; y < h; y++) {
    let run = 0
    for (let x = 0; x <= w; x++) {
      if (x < w && luma(x, y) < DARK_LUMA) run++
      else {
        if (run >= hMin) for (let k = x - run; k < x; k++) clear.add(y * w + k)
        run = 0
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0
    for (let y = 0; y <= h; y++) {
      if (y < h && luma(x, y) < DARK_LUMA) run++
      else {
        if (run >= vMin) for (let k = y - run; k < y; k++) clear.add(k * w + x)
        run = 0
      }
    }
  }
  for (const idx of clear) {
    const i = idx * 4
    px[i] = px[i + 1] = px[i + 2] = 255
    // also whiten the pixel one row down — grid lines are 2-3px thick
    const below = i + w * 4
    if (below + 2 < px.length) {
      px[below] = px[below + 1] = px[below + 2] = 255
    }
  }
}

interface PdfPage {
  getViewport(opts: { scale: number }): { width: number; height: number }
  render(opts: unknown): { promise: Promise<void> }
}

async function renderCleanedPng(page: PdfPage, factory: NodeCanvasFactory): Promise<Buffer> {
  const viewport = page.getViewport({ scale: RENDER_SCALE })
  const w = Math.ceil(viewport.width)
  const h = Math.ceil(viewport.height)
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, w, h)
  await page.render({ canvasContext: ctx, viewport, canvasFactory: factory }).promise

  const img = ctx.getImageData(0, 0, w, h)
  stripGridLines(img.data, w, h)
  ctx.putImageData(img, 0, 0)
  return canvas.toBuffer('image/png')
}

function tessdataDir(): string {
  // Packaged: extraResources put it at resourcesPath/tessdata. Dev: __dirname is
  // dist-electron/, and the bundled traineddata lives at <project>/resources.
  // (app.getAppPath() points at dist-electron in the built app, not the repo
  // root, so it must NOT be used here — a wrong langPath makes tesseract.js fall
  // back to a network download that hangs.)
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tessdata')
    : path.join(__dirname, '..', 'resources', 'tessdata')
}

async function makeWorker(onTessProgress?: (status: string, progress: number) => void): Promise<Worker> {
  const dir = tessdataDir()
  // Fail loudly if the offline data is missing rather than letting tesseract.js
  // silently try (and hang on) a CDN fetch.
  if (!fs.existsSync(path.join(dir, 'eng.traineddata'))) {
    throw new Error(`OCR language data not found at ${dir}. Reinstall the app.`)
  }
  const tess = loadTesseract()
  // No corePath/workerPath overrides: the (unpacked, when packaged) tesseract.js
  // resolves its own worker + core relative to itself, avoiding an asar split.
  const worker = await tess.createWorker('eng', 1, {
    langPath: dir, // bundled eng.traineddata — no network
    cacheMethod: 'none',
    gzip: false,
    legacyCore: false,
    legacyLang: false,
    logger: (m: { status?: string; progress?: number }) => {
      if (onTessProgress && typeof m.progress === 'number') onTessProgress(m.status ?? '', m.progress)
    },
  } as never)
  // PSM 4 = single column of variable-size text — reads the exam table rows.
  await worker.setParameters({ tessedit_pageseg_mode: tess.PSM.SINGLE_COLUMN })
  return worker
}

/**
 * Rasterizes a hall-ticket PDF and OCRs it into plain text (one row per line),
 * the shape parseHallTicket consumes. OCRs at most the first few pages.
 */
export async function extractHallTicketText(
  pdfBytes: Uint8Array,
  onProgress?: (p: PdfOcrProgress) => void,
): Promise<string> {
  const emit = (stage: PdfOcrProgress['stage'], progress: number, detail: string) =>
    onProgress?.({ stage, progress: Math.max(0, Math.min(1, progress)), detail })

  emit('loading', 0.02, 'Opening the PDF…')
  const pdfjs = await loadPdfjs()
  const factory = new NodeCanvasFactory()
  // canvasFactory is a valid runtime option but missing from the .d.ts type.
  const loadingTask = pdfjs.getDocument({ data: pdfBytes, canvasFactory: factory } as unknown as Parameters<
    typeof pdfjs.getDocument
  >[0])
  const doc = await loadingTask.promise
  const pageCount = Math.min(doc.numPages, 3)
  emit('loading', 0.08, `Preparing ${pageCount} page${pageCount === 1 ? '' : 's'}…`)

  // Progress is split: 8% opening, then an equal slice per page (render, then
  // OCR — OCR is the slow part so it gets most of each slice).
  const pageSpan = 0.9 / pageCount
  let currentPage = 1
  const worker = await makeWorker((status, progress) => {
    if (!/recogniz/i.test(status)) return
    const base = 0.08 + (currentPage - 1) * pageSpan
    emit('recognizing', base + progress * pageSpan * 0.85, `Reading page ${currentPage} of ${pageCount}…`)
  })

  try {
    const pages: string[] = []
    for (let p = 1; p <= pageCount; p++) {
      currentPage = p
      emit('rendering', 0.08 + (p - 1) * pageSpan, `Rendering page ${p} of ${pageCount}…`)
      const page = (await doc.getPage(p)) as unknown as PdfPage
      const png = await renderCleanedPng(page, factory)
      const { data } = await worker.recognize(png)
      pages.push(data.text)
    }
    emit('done', 1, 'Finishing up…')
    return pages.join('\n')
  } finally {
    await worker.terminate()
    await loadingTask.destroy()
  }
}
