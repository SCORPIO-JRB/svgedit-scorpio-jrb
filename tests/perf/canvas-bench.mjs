#!/usr/bin/env node
/**
 * Canvas performance bench.
 *
 * Measures the interactions that scale with the number of selected elements:
 * select all, one drag mousemove, drag release, undo, redo, zoom and a rubber
 * band covering the whole drawing. Each measure includes the next frame, so
 * that layout and paint triggered by the interaction are counted.
 *
 * The bench drives a built editor served over HTTP (`npm run build` then
 * `npm run start:e2e`) and dispatches synthetic mouse events, which keeps the
 * results deterministic.
 *
 * Usage:
 *   node tests/perf/canvas-bench.mjs [--sizes=500,2000] [--url=http://localhost:8000/index.html]
 *                                    [--out=results.json] [--budgets=tests/perf/budgets.json]
 *
 * Environment:
 *   PW_CHROMIUM_PATH  path to a Chromium binary, when the Playwright browsers
 *                     bundled with the project are not installed.
 *
 * With `--budgets`, the process exits with code 1 when a measure exceeds its
 * budget. A budget file maps a size to the maximum milliseconds per measure:
 *   { "2000": { "selectAll": 150, "dragMove": 100 } }
 */
import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=')
  return [key, rest.join('=') || 'true']
}))

const sizes = (args.sizes || '500,2000').split(',').map(Number).filter(Boolean)
const url = args.url || 'http://localhost:8000/index.html'

const MEASURES = [
  ['selectAll', 'Tout sélectionner'],
  ['dragMove', 'Un mouvement de glisser (tout sélectionné)'],
  ['dragRelease', 'Relâchement du glisser'],
  ['undo', 'Annuler le déplacement'],
  ['redo', 'Rétablir le déplacement'],
  ['zoom', 'Zoom ×2 (tout sélectionné)'],
  ['marquee', 'Rectangle de sélection couvrant tout (un mouvement)'],
  ['singleDragMove', 'Un mouvement de glisser (un seul élément)']
]

const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : {}

const browser = await chromium.launch(launchOptions)
const results = { date: new Date().toISOString(), url, sizes: {} }

try {
  for (const size of sizes) {
    results.sizes[size] = await benchSize(size)
  }
} finally {
  await browser.close()
}

printTable(results)

if (args.out) {
  await writeFile(args.out, JSON.stringify(results, null, 2) + '\n')
}

if (args.budgets) {
  const budgets = JSON.parse(await readFile(args.budgets, 'utf8'))
  const failures = checkBudgets(results, budgets)
  if (failures.length) {
    console.error('\nBudgets dépassés :')
    failures.forEach((failure) => console.error(`  - ${failure}`))
    process.exitCode = 1
  } else {
    console.log('\nTous les budgets sont respectés.')
  }
}

async function benchSize (size) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.setDefaultTimeout(15 * 60 * 1000)
  await page.goto(url)
  await page.waitForFunction(() => window.svgEditor?.svgCanvas &&
    document.querySelector('se-storage-dialog')?.shadowRoot?.querySelector('#storage_ok'))
  await page.evaluate(() => {
    document.querySelector('se-storage-dialog').shadowRoot.querySelector('#storage_ok').click()
  })

  await page.evaluate((n) => {
    const cols = Math.ceil(Math.sqrt(n))
    const step = 1000 / cols
    const side = (600 / cols).toFixed(1)
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><g class="layer"><title>Layer 1</title>'
    for (let i = 0; i < n; i++) {
      const x = ((i % cols) * step).toFixed(1)
      const y = (Math.floor(i / cols) * step).toFixed(1)
      svg += `<rect id="r${i}" x="${x}" y="${y}" width="${side}" height="${side}" fill="#3a6" stroke="#000" stroke-width="1"/>`
    }
    svg += '</g></svg>'
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.zoomChanged(window, 'canvas')

    const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    const mouse = (type, target, x, y, extra = {}) => target.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
      view: window,
      ...extra
    }))
    const center = (el) => {
      const box = el.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    // Times a synchronous or asynchronous step, including the next frame.
    const time = async (step) => {
      const start = performance.now()
      await step()
      await frame()
      return performance.now() - start
    }
    window.__bench = { frame, mouse, center, time }
  }, size)
  await page.waitForTimeout(300)

  const measures = await page.evaluate(async () => {
    const { mouse, center, time, frame } = window.__bench
    const canvas = window.svgEditor.svgCanvas
    const out = {}

    out.selectAll = await time(() => canvas.selectAllInCurrentLayer())

    const first = document.getElementById('r0')
    const start = center(first)
    mouse('mousedown', first, start.x, start.y)
    // The first move crosses the drag threshold; the second one is measured.
    mouse('mousemove', first, start.x + 10, start.y + 10)
    await frame()
    out.dragMove = await time(() => mouse('mousemove', first, start.x + 20, start.y + 20))
    out.dragRelease = await time(() => mouse('mouseup', first, start.x + 20, start.y + 20))

    out.undo = await time(() => canvas.undoMgr.undo())
    out.redo = await time(() => canvas.undoMgr.redo())

    canvas.selectAllInCurrentLayer()
    await frame()
    out.zoom = await time(() => window.svgEditor.bottomPanel.changeZoom(canvas.getZoom() * 200))
    window.svgEditor.zoomChanged(window, 'canvas')
    await frame()

    canvas.clearSelection()
    await frame()
    const root = document.getElementById('svgroot')
    const rootBox = root.getBoundingClientRect()
    const content = document.getElementById('svgcontent').getBoundingClientRect()
    const from = { x: rootBox.x + 5, y: rootBox.y + 5 }
    mouse('mousedown', root, from.x, from.y)
    mouse('mousemove', root, from.x + 2, from.y + 2)
    await frame()
    out.marquee = await time(() => mouse('mousemove', root, content.right + 5, content.bottom + 5))
    mouse('mouseup', root, content.right + 5, content.bottom + 5)
    await frame()

    canvas.clearSelection()
    await frame()
    const single = document.getElementById('r1')
    const point = center(single)
    mouse('mousedown', single, point.x, point.y)
    mouse('mousemove', single, point.x + 10, point.y + 10)
    await frame()
    out.singleDragMove = await time(() => mouse('mousemove', single, point.x + 20, point.y + 20))
    mouse('mouseup', single, point.x + 20, point.y + 20)

    return out
  })

  await page.close()
  return Object.fromEntries(Object.entries(measures).map(([key, ms]) => [key, Math.round(ms * 10) / 10]))
}

function printTable ({ sizes: bySize }) {
  const sizeKeys = Object.keys(bySize)
  const header = ['Mesure (ms)', ...sizeKeys.map((size) => `N=${size}`)]
  const rows = MEASURES.map(([key, label]) => [label, ...sizeKeys.map((size) => String(bySize[size][key] ?? '—'))])
  const widths = header.map((_, col) => Math.max(...[header, ...rows].map((row) => row[col].length)))
  const line = (row) => row.map((cell, col) => (col ? cell.padStart(widths[col]) : cell.padEnd(widths[col]))).join('  ')
  console.log(line(header))
  rows.forEach((row) => console.log(line(row)))
}

function checkBudgets ({ sizes: bySize }, budgets) {
  const failures = []
  for (const [size, limits] of Object.entries(budgets)) {
    const measured = bySize[size]
    if (!measured) continue
    for (const [key, max] of Object.entries(limits)) {
      if (measured[key] > max) {
        failures.push(`N=${size} ${key} : ${measured[key]} ms > ${max} ms`)
      }
    }
  }
  return failures
}
