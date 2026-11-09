/**
 * Writes the reference synoptic of lot V7 (plan v2): the document saved by
 * the editor and the export of its frame, to be read by SCorp-io without
 * retouching, and an image of it.
 *
 *   npm run build && npx vite preview --port 8000 --outDir dist/editor &
 *   node scripts/gtb-reference.mjs [http://localhost:8000] [docs/v7]
 *
 * The steps are those of the end-to-end test (tests/e2e/gtb-reference.js).
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { buildReference, describeExport } from '../tests/e2e/gtb-reference.js'

const base = process.argv[2] ?? 'http://localhost:8000'
const out = process.argv[3] ?? 'docs/v7'
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto(`${base}/index.html?lang=fr`)
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload()
await page.waitForFunction(() => window.svgEditor?.symbols && window.svgEditor?.templates)
await page.evaluate(() => document.querySelector('se-storage-dialog')?.setAttribute('dialog', 'close'))
await page.evaluate(() => window.svgEditor.setConfig({ lang: 'fr' }))
const { saved, exported } = await page.evaluate(buildReference)
const summary = await page.evaluate(describeExport, exported)
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'synoptique-reference.svg'), saved)
fs.writeFileSync(path.join(out, 'synoptique-reference-export.svg'), exported)
// An image of the export, as an <img> shows it
const png = await page.evaluate((svg) => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1920
    canvas.height = 1080
    canvas.getContext('2d').drawImage(img, 0, 0)
    resolve(canvas.toDataURL('image/png'))
  }
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
}), exported)
fs.writeFileSync(path.join(out, 'synoptique-reference.png'), Buffer.from(png.split(',')[1], 'base64'))
console.log(JSON.stringify({ ...summary, uses: summary.uses.length, pipes: summary.pipes.length }, null, 1))
await browser.close()
