#!/usr/bin/env node
/**
 * Canvas performance bench.
 *
 * Measures the interactions that scale with the number of selected elements:
 * select all, one drag mousemove, drag release, undo, redo, zoom and a rubber
 * band covering the whole drawing. Each measure includes the next frame, so
 * that layout and paint triggered by the interaction are counted. The hover
 * measure is the exception: a mouse move without a button, averaged over 20
 * moves from one element to another, with the layout it causes but without
 * waiting for the next frame.
 *
 * The bench drives a built editor served over HTTP (`npm run build` then
 * `npm run start:e2e`) and dispatches synthetic mouse events, which keeps the
 * results deterministic.
 *
 * The snapping (lot V2) is measured apart, on a larger drawing: the search
 * of one drag move among the visible neighbours, averaged over 30 moves, the
 * index read once at the start of the gesture, and the hover.
 *
 * So is the drag of a large selection (lot V5, S1): the script time of one
 * move with everything selected, averaged over 10 moves, without the frame
 * the browser then draws; and the same move with its frame.
 *
 * Usage:
 *   node tests/perf/canvas-bench.mjs [--sizes=500,2000] [--snap-sizes=10000] [--drag-sizes=5000]
 *                                    [--url=http://localhost:8000/index.html]
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
const snapSizes = (args['snap-sizes'] || '').split(',').map(Number).filter(Boolean)
const dragSizes = (args['drag-sizes'] || '').split(',').map(Number).filter(Boolean)
const url = args.url || 'http://localhost:8000/index.html'

const MEASURES = [
  ['selectAll', 'Tout sélectionner'],
  ['dragMove', 'Un mouvement de glisser (tout sélectionné)'],
  ['dragRelease', 'Relâchement du glisser'],
  ['undo', 'Annuler le déplacement'],
  ['redo', 'Rétablir le déplacement'],
  ['zoom', 'Zoom ×2 (tout sélectionné)'],
  ['marquee', 'Rectangle de sélection couvrant tout (un mouvement)'],
  ['marqueeEdge', 'Rectangle de sélection jusqu\'au milieu, objets au bord testés sur leur géométrie (V4)'],
  ['singleDragMove', 'Un mouvement de glisser (un seul élément)'],
  ['groupResizeMove', 'Redimensionner tout, un mouvement (cadre commun)'],
  ['groupResizeRelease', 'Relâchement du redimensionnement collectif'],
  ['groupRotateMove', 'Pivoter tout, un mouvement (poignée du cadre commun)'],
  ['groupRotateRelease', 'Relâchement de la rotation collective'],
  ['scaleToolMove', 'Outil Échelle, un mouvement (traits compris)'],
  ['scaleToolRelease', 'Relâchement de l\'outil Échelle'],
  ['hover', 'Surbrillance au survol (un mouvement, sans attendre l\'image)'],
  ['snapSearch', 'Accroche : recherche d\'un mouvement (V2)'],
  ['snapIndex', 'Accroche : index au début du geste (V2)'],
  ['snapDragMove', 'Un mouvement de glisser avec accroche (V2)'],
  ['dragMoveScript', 'Glisser tout, calcul d\'un mouvement sans l\'image (V5)'],
  ['dragMoveFrame', 'Glisser tout, un mouvement et son image (V5)']
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
  for (const size of snapSizes) {
    results.sizes[size] = { ...results.sizes[size], ...await benchSnap(size) }
  }
  for (const size of dragSizes) {
    results.sizes[size] = { ...results.sizes[size], ...await benchDrag(size) }
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

    // Resize of the whole selection by a grip of its common frame.
    canvas.selectAllInCurrentLayer()
    await frame()
    const grip = document.getElementById('selectorGrip_resize_se')
    const gripPoint = center(grip)
    mouse('mousedown', grip, gripPoint.x, gripPoint.y)
    mouse('mousemove', grip, gripPoint.x + 10, gripPoint.y + 10)
    await frame()
    out.groupResizeMove = await time(() => mouse('mousemove', grip, gripPoint.x + 20, gripPoint.y + 15))
    out.groupResizeRelease = await time(() => mouse('mouseup', grip, gripPoint.x + 20, gripPoint.y + 15))
    canvas.undoMgr.undo()
    await frame()

    // Rotation of the whole selection by the handle of its common frame.
    canvas.selectAllInCurrentLayer()
    await frame()
    const rotateGrip = document.getElementById('selectorGrip_rotate')
    const rotatePoint = center(rotateGrip)
    mouse('mousedown', rotateGrip, rotatePoint.x, rotatePoint.y)
    mouse('mousemove', rotateGrip, rotatePoint.x + 10, rotatePoint.y)
    await frame()
    out.groupRotateMove = await time(() => mouse('mousemove', rotateGrip, rotatePoint.x + 20, rotatePoint.y + 5))
    out.groupRotateRelease = await time(() => mouse('mouseup', rotateGrip, rotatePoint.x + 20, rotatePoint.y + 5))
    canvas.undoMgr.undo()
    await frame()

    // The Scale tool (M9): the same grip scales everything, strokes
    // included.
    if (canvas.setScaleTool) {
      canvas.setScaleTool(true)
      canvas.selectAllInCurrentLayer()
      await frame()
      const scaleGrip = document.getElementById('selectorGrip_resize_se')
      const scalePoint = center(scaleGrip)
      mouse('mousedown', scaleGrip, scalePoint.x, scalePoint.y)
      mouse('mousemove', scaleGrip, scalePoint.x + 10, scalePoint.y + 10)
      await frame()
      out.scaleToolMove = await time(() => mouse('mousemove', scaleGrip, scalePoint.x + 20, scalePoint.y + 15))
      out.scaleToolRelease = await time(() => mouse('mouseup', scaleGrip, scalePoint.x + 20, scalePoint.y + 15))
      canvas.undoMgr.undo()
      canvas.setScaleTool(false)
      await frame()
    }

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

    // A band that stops in the middle of the drawing: the objects under its
    // edges are tested on their own geometry (lot V4), read on this move.
    canvas.clearSelection()
    await frame()
    const middle = { x: (content.left + content.right) / 2 + 1, y: (content.top + content.bottom) / 2 + 1 }
    mouse('mousedown', root, from.x, from.y)
    mouse('mousemove', root, from.x + 2, from.y + 2)
    await frame()
    out.marqueeEdge = await time(() => mouse('mousemove', root, middle.x, middle.y))
    mouse('mouseup', root, middle.x, middle.y)
    await frame()

    // Hover: the mouse passes from one element to another, no button down.
    canvas.clearSelection()
    await frame()
    const count = document.querySelectorAll('#svgcontent rect').length
    const outline = document.getElementById('selectorHover')
    let hoverTotal = 0
    const moves = 20
    for (let i = 0; i < moves; i++) {
      const target = document.getElementById(`r${(i * 37 + 3) % count}`)
      const p = center(target)
      const start = performance.now()
      mouse('mousemove', target, p.x, p.y, { buttons: 0 })
      // Flushes the layout the new outline causes.
      outline?.getBoundingClientRect()
      hoverTotal += performance.now() - start
      await frame()
    }
    out.hover = hoverTotal / moves
    mouse('mouseleave', root, 0, 0, { buttons: 0 })

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

/**
 * The snapping of a drag among `size` rectangles, all visible.
 * @param {number} size
 * @returns {Promise<object>}
 */
async function benchSnap (size) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.setDefaultTimeout(15 * 60 * 1000)
  await page.goto(url)
  await page.waitForFunction(() => window.svgEditor?.svgCanvas &&
    document.querySelector('se-storage-dialog')?.shadowRoot?.querySelector('#storage_ok'))
  await page.evaluate(() => {
    document.querySelector('se-storage-dialog').shadowRoot.querySelector('#storage_ok').click()
  })
  const measures = await page.evaluate(async (n) => {
    const cols = Math.ceil(Math.sqrt(n))
    const step = 1000 / cols
    const side = (600 / cols).toFixed(1)
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><g class="layer"><title>Layer 1</title>'
    for (let i = 0; i < n; i++) {
      // Shifted a little, so that not every line falls on another.
      const x = ((i % cols) * step + (i % 7) * 0.13).toFixed(2)
      const y = (Math.floor(i / cols) * step + (i % 5) * 0.11).toFixed(2)
      svg += `<rect id="r${i}" x="${x}" y="${y}" width="${side}" height="${side}" fill="#3a6"/>`
    }
    svg += '</g></svg>'
    const editor = window.svgEditor
    editor.setConfig({ objectSnapping: true, gridSnapping: false })
    editor.svgCanvas.setSvgString(svg)
    editor.zoomChanged(window, 'canvas')
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    await frame()
    const canvas = editor.svgCanvas
    const mouse = (type, target, x, y) => target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window
    }))
    const target = document.getElementById(`r${Math.floor(n / 2) + Math.floor(cols / 2)}`)
    const box = target.getBoundingClientRect()
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    mouse('mousedown', target, start.x, start.y)
    const first = performance.now()
    mouse('mousemove', target, start.x + 10, start.y + 10)
    const firstMove = performance.now() - first
    await frame()
    const out = { snapIndex: canvas.snapTiming?.index ?? NaN, snapFirstMove: firstMove }
    let search = 0
    let move = 0
    const moves = 30
    for (let i = 1; i <= moves; i++) {
      const t = performance.now()
      mouse('mousemove', target, start.x + 10 + i * 1.7, start.y + 10 + i * 1.3)
      move += performance.now() - t
      search += canvas.snapTiming?.search ?? NaN
    }
    mouse('mouseup', target, start.x + 60, start.y + 50)
    out.snapSearch = search / moves
    out.snapDragMove = move / moves
    out.snapBoxes = canvas.snapTiming?.boxes
    return out
  }, size)
  await page.close()
  return Object.fromEntries(Object.entries(measures).map(([key, ms]) => [key, Math.round(ms * 100) / 100]))
}

/**
 * The drag of `size` rectangles, all selected (lot V5, S1).
 * @param {number} size
 * @returns {Promise<object>}
 */
async function benchDrag (size) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.setDefaultTimeout(15 * 60 * 1000)
  await page.goto(url)
  await page.waitForFunction(() => window.svgEditor?.svgCanvas &&
    document.querySelector('se-storage-dialog')?.shadowRoot?.querySelector('#storage_ok'))
  await page.evaluate(() => {
    document.querySelector('se-storage-dialog').shadowRoot.querySelector('#storage_ok').click()
  })
  const measures = await page.evaluate(async (n) => {
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
    const editor = window.svgEditor
    editor.setConfig({ objectSnapping: false, gridSnapping: false })
    editor.svgCanvas.setSvgString(svg)
    editor.zoomChanged(window, 'canvas')
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    const mouse = (type, target, x, y) => target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window
    }))
    await frame()
    const canvas = editor.svgCanvas
    canvas.selectAllInCurrentLayer()
    await frame()
    const first = document.getElementById('r0')
    const box = first.getBoundingClientRect()
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    mouse('mousedown', first, start.x, start.y)
    mouse('mousemove', first, start.x + 10, start.y + 10)
    await frame()
    let script = 0
    let withFrame = 0
    const moves = 10
    for (let i = 1; i <= moves; i++) {
      const t = performance.now()
      mouse('mousemove', first, start.x + 10 + i * 2, start.y + 10 + i * 1.5)
      script += performance.now() - t
      await frame()
      withFrame += performance.now() - t
    }
    mouse('mouseup', first, start.x + 40, start.y + 30)
    return { dragMoveScript: script / moves, dragMoveFrame: withFrame / moves }
  }, size)
  await page.close()
  return Object.fromEntries(Object.entries(measures).map(([key, ms]) => [key, Math.round(ms * 100) / 100]))
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
