#!/usr/bin/env node
/**
 * Compares the SVG written by two builds of the editor, byte for byte.
 *
 *   node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 \
 *     --new=http://127.0.0.1:8000 [--expect=name,name] [--out=report.json]
 *
 * Both builds are opened in Chromium (set PW_CHROMIUM_PATH to use a given
 * binary). The script checks:
 * - the import then export of every SVG file of the repository;
 * - scenarios that run the same canvas operations and mouse gestures on both.
 * A scenario listed in --expect may differ (an intended change); any other
 * difference makes the script exit with code 1. Build a reference with
 * build-reference.mjs: it must use its own canvas core.
 */
import { chromium } from '@playwright/test'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=')
  return [key, rest.join('=')]
}))
if (!args.ref || !args.new) {
  console.error('Usage: node tests/output/compare-output.mjs --ref=<url> --new=<url> [--expect=a,b] [--out=file]')
  process.exit(2)
}
const expected = new Set((args.expect || '').split(',').map((name) => name.trim()).filter(Boolean))

const root = resolve('.')
const SKIP = new Set(['node_modules', 'dist', '.git', 'images', 'test-results', 'coverage'])
const findSvgFiles = (dir) => readdirSync(dir).flatMap((name) => {
  if (SKIP.has(name) || name.startsWith('.')) { return [] }
  const path = join(dir, name)
  if (statSync(path).isDirectory()) { return findSvgFiles(path) }
  return name.endsWith('.svg') ? [path] : []
})

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>
<rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="2"/>
<rect id="r2" x="240" y="100" width="80" height="60" fill="#36a" transform="rotate(20 280 130)"/>
<ellipse id="e1" cx="420" cy="300" rx="50" ry="30" fill="#a63"/>
<circle id="c1" cx="150" cy="350" r="30" fill="url(#grad)"/>
<path id="p1" d="M 300 300 L 380 320 L 340 400 Z" fill="#999"/>
<text id="t1" x="60" y="60" font-size="20">Synoptique</text>
<g id="grp" transform="translate(10 0)"><rect id="g1" x="450" y="80" width="40" height="40"/><rect id="g2" x="500" y="80" width="40" height="40"/></g>
<line id="l1" x1="50" y1="450" x2="300" y2="430" stroke="#000"/>
</g><defs><linearGradient id="grad"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs></svg>`

const byId = (ids) => `[${ids.map((id) => `document.getElementById('${id}')`).join(', ')}]`
const SCENARIOS = {
  'move all (API)': 'c.selectAllInCurrentLayer(); c.moveSelectedElements(37, -12)',
  'move all then undo/redo': 'c.selectAllInCurrentLayer(); c.moveSelectedElements(37, -12); c.undoMgr.undo(); c.undoMgr.redo()',
  'resize attributes': `c.selectOnly(${byId(['r1'])}); c.changeSelectedAttribute('width', 140); c.changeSelectedAttribute('height', 30)`,
  'group, move, ungroup': `c.selectOnly(${byId(['r1', 'e1'])}); c.groupSelectedElements(); c.moveSelectedElements(20, 20); c.ungroupSelectedElement()`,
  clone: `c.selectOnly(${byId(['p1', 'c1'])}); c.cloneSelectedElements(20, 20)`,
  'align selected (multi)': `c.selectOnly(${byId(['r1', 'e1', 'p1'])}); c.alignSelectedElements('l', 'selected'); c.alignSelectedElements('m', 'selected')`,
  'align page (single)': `c.selectOnly(${byId(['e1'])}); c.alignSelectedElements('c', 'page')`,
  'distribute h (multi)': `c.selectOnly(${byId(['r1', 'e1', 'p1'])}); c.alignSelectedElements('dh', 'selected')`,
  'top/bottom single': `c.selectOnly(${byId(['r1'])}); c.moveToTopSelectedElement(); c.selectOnly(${byId(['l1'])}); c.moveToBottomSelectedElement()`,
  'convert to path': `c.selectOnly(${byId(['e1'])}); c.convertToPath()`,
  // Each shape keeps its own style and opacity (question 10; the export
  // already left out the "null" values the conversion wrote).
  'convert several to paths': `document.getElementById('r1').setAttribute('opacity', '0.5'); c.selectOnly(${byId(['r1', 'e1', 'l1'])}); c.convertSelectedToPaths()`,
  // A default value is left out only where that changes nothing: a group
  // with a wider stroke keeps the width of 1 of its child, and rx="0" stays
  // with ry="10". opacity="1" is left out, as before.
  'save keeps the defaults that matter': "document.getElementById('grp').setAttribute('stroke-width', '5'); document.getElementById('g1').setAttribute('stroke-width', '1'); const r = document.getElementById('r1'); r.setAttribute('rx', '0'); r.setAttribute('ry', '10'); document.getElementById('e1').setAttribute('opacity', '1')",
  // The path keeps everything the shape has but its geometry: fill-rule,
  // stroke-miterlimit, class, the title.
  'convert to path keeps all the shape has': `const e = document.getElementById('e1'); e.setAttribute('fill-rule', 'evenodd'); e.setAttribute('stroke-miterlimit', '2'); e.setAttribute('class', 'vanne'); const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = 'Vanne'; e.append(t); c.selectOnly(${byId(['e1'])}); c.convertToPath()`,
  'flip (multi)': `c.selectOnly(${byId(['r1', 'e1'])}); c.flipSelectedElements(-1, 1)`,
  'align largest (multi)': `c.selectOnly(${byId(['r1', 'e1', 'p1'])}); c.alignSelectedElements('t', 'largest')`,
  'setRotationAngle (multi)': `c.selectOnly(${byId(['r1', 'e1', 'r2'])}); c.setRotationAngle(30)`,
  'undo everything': `c.selectAllInCurrentLayer(); c.moveSelectedElements(5, 5); c.selectOnly(${byId(['r1'])}); c.changeSelectedAttribute('width', 10); while (c.undoMgr.getUndoStackSize()) c.undoMgr.undo()`,
  // Opening a group dims the other objects; closing it must leave no trace.
  'open group, move inside, close': `c.setContext(document.getElementById('grp')); c.selectOnly(${byId(['g1'])}); c.moveSelectedElements(15, 5); c.leaveContext()`,
  'open a rotated group (double click)': `c.selectOnly(${byId(['grp'])}); c.setRotationAngle(30); document.getElementById('g1').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window })); c.leaveContext()`,
  // The editor's clipboard and duplication, which M7 extends: an unmoved
  // copy and the editor's own clipboard give the same SVG as before.
  'copy, paste in place': `c.selectOnly(${byId(['r1', 'c1'])}); c.copySelectedElements(); c.pasteElements('in_place')`,
  'cut, paste at a point': `c.selectOnly(${byId(['e1', 't1'])}); c.cutSelectedElements(); c.pasteElements('point', 200, 220)`,
  // Moves that M9 makes faster (the selection boxes follow in two passes):
  // the drawing must not change.
  'distribute v page (multi)': `c.selectOnly(${byId(['r1', 'e1', 'p1', 't1'])}); c.alignSelectedElements('dv', 'page')`,
  'arrows, Shift+arrow (keys)': `c.selectOnly(${byId(['r1', 'grp', 'l1'])}); const press = (init) => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); press({ key: 'ArrowRight', code: 'ArrowRight' }); press({ key: 'ArrowRight', code: 'ArrowRight' }); press({ key: 'ArrowDown', code: 'ArrowDown', shiftKey: true })`,
  // M9: ungrouping keeps stroke widths, and the children get the stroke the
  // group gave them; M7 lost it (expected difference against M7).
  'ungroup a scaled group with a stroke': `c.selectOnly(${byId(['r1', 'e1'])}); c.groupSelectedElements(); const g = c.getSelectedElements()[0]; g.setAttribute('stroke', '#00f'); g.setAttribute('stroke-width', '5'); g.setAttribute('transform', 'scale(1.5)'); c.ungroupSelectedElement()`,
  // Decisions of 8 November (expected differences against M9): a clip path
  // follows its object; objects with the same fill are taken in the whole
  // page, inside groups too.
  'clip path follows a move': `const cp = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath'); cp.id = 'cpx'; cp.innerHTML = '<circle cx="140" cy="130" r="30"/>'; document.querySelector('#svgcontent defs').append(cp); document.getElementById('r1').setAttribute('clip-path', 'url(#cpx)'); c.selectOnly(${byId(['r1'])}); c.moveSelectedElements(25, 15)`,
  'same fill in the page then move': `c.selectOnly(${byId(['g1'])}); c.selectSimilar('fill'); c.moveSelectedElements(10, 10)`,
  'Mod+D twice, Alt+right arrow (keys)': `c.selectOnly(${byId(['r1', 'p1'])}); const key = (init) => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); key({ key: 'd', code: 'KeyD', ctrlKey: true }); key({ key: 'd', code: 'KeyD', ctrlKey: true }); key({ key: 'ArrowRight', code: 'ArrowRight', altKey: true })`
}
// Every element type alone: flip, rotation by the API, resize by a grip,
// rotation by the handle.
for (const id of ['r1', 'r2', 'e1', 'c1', 'p1', 't1', 'grp', 'l1']) {
  SCENARIOS[`flip ${id}`] = `c.selectOnly(${byId([id])}); c.flipSelectedElements(-1, 1)`
  SCENARIOS[`rotate ${id}`] = `c.selectOnly(${byId([id])}); c.setRotationAngle(25)`
  SCENARIOS[`grip resize ${id}`] = { grip: id }
  SCENARIOS[`handle rotate ${id}`] = { rotate: [id] }
}
SCENARIOS['handle rotate (multi)'] = { rotate: ['r1', 'e1', 'r2'] }
// Fields of the panel that existed before M4, with a value sent by their
// change event, as the field sends it once typed.
const FIELD_SCENARIOS = {
  'field X, Y of a path': { select: ['p1'], fields: [['selected_x', '120'], ['selected_y', '50']] },
  'field X of a group': { select: ['grp'], fields: [['selected_x', '400']] },
  'field X, Y of a text': { select: ['t1'], fields: [['selected_x', '80'], ['selected_y', '90']] },
  'field width, height of a rectangle': { select: ['r1'], fields: [['rect_width', '140'], ['rect_height', '30']] },
  'field radius of a circle': { select: ['c1'], fields: [['circle_r', '45']] },
  'field stroke width (single)': { select: ['r1'], fields: [['stroke_width', '5']] },
  'field opacity (single)': { select: ['e1'], fields: [['opacity', '50']] },
  'field angle (single)': { select: ['r2'], fields: [['angle', '45']] },
  'field stroke width (multi)': { select: ['r1', 'e1', 'p1'], fields: [['stroke_width', '3']] },
  'field opacity (multi)': { select: ['r1', 'e1'], fields: [['opacity', '40']] },
  'field angle (multi, same angle)': { select: ['r1', 'e1'], fields: [['angle', '30']] }
}
Object.assign(SCENARIOS, FIELD_SCENARIOS)

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : {})

const open = async (url) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(`${url.replace(/\/$/, '')}/index.html`)
  await page.waitForFunction(() => window.svgEditor?.svgCanvas &&
    document.querySelector('se-storage-dialog')?.shadowRoot?.querySelector('#storage_ok'))
  await page.evaluate(() => document.querySelector('se-storage-dialog').shadowRoot.querySelector('#storage_ok').click())
  await page.waitForTimeout(300)
  return page
}

const roundtrip = (page, svg) => page.evaluate((s) => {
  try {
    const ok = window.svgEditor.svgCanvas.setSvgString(s)
    return ok === false ? 'IMPORT_FAILED' : window.svgEditor.svgCanvas.getSvgString()
  } catch (e) {
    return `ERROR ${e.message}`
  }
}, svg)

const runScenario = (page, scenario) => page.evaluate(async ({ svg, scenario }) => {
  const c = window.svgEditor.svgCanvas
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
  c.setSvgString(svg)
  window.svgEditor.setConfig({ gridSnapping: false })
  c.setZoom(1)
  window.svgEditor.updateCanvas()
  c.clearSelection()
  await frame()
  try {
    if (typeof scenario === 'string') {
      // eslint-disable-next-line no-new-func
      new Function('c', scenario)(c)
    } else if (scenario.grip) {
      // Drag the south-east grip of a single element by 30, 20 pixels.
      c.selectOnly([document.getElementById(scenario.grip)], true)
      await frame()
      const grip = document.getElementById('selectorGrip_resize_se')
      const box = grip.getBoundingClientRect()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      const ev = (type, dx, dy) => grip.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, clientX: x + dx, clientY: y + dy, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window
      }))
      ev('mousedown', 0, 0)
      ev('mousemove', 10, 5)
      ev('mousemove', 30, 20)
      ev('mouseup', 30, 20)
    } else if (scenario.rotate) {
      // Drag the rotation handle by a quarter turn, in three moves.
      c.selectOnly(scenario.rotate.map((id) => document.getElementById(id)), true)
      await frame()
      const grip = document.getElementById('selectorGrip_rotate')
      const box = grip.getBoundingClientRect()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      const ev = (type, dx, dy) => grip.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, clientX: x + dx, clientY: y + dy, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window
      }))
      ev('mousedown', 0, 0)
      ev('mousemove', 15, 4)
      ev('mousemove', 30, 12)
      ev('mousemove', 37, 21)
      ev('mouseup', 37, 21)
    } else if (scenario.fields) {
      c.selectOnly(scenario.select.map((id) => document.getElementById(id)), true)
      await frame()
      for (const [id, value] of scenario.fields) {
        const field = document.getElementById(id)
        field.value = value
        field.dispatchEvent(new CustomEvent('change'))
        await frame()
      }
    } else if (scenario.drag) {
      // Drag the whole selection, optionally with Alt.
      if (scenario.selectAll) { c.selectAllInCurrentLayer() }
      await frame()
      const el = document.getElementById(scenario.drag)
      const box = el.getBoundingClientRect()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      const ev = (type, dx, dy) => el.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, altKey: Boolean(scenario.alt), clientX: x + dx, clientY: y + dy, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window
      }))
      ev('mousedown', 0, 0)
      ev('mousemove', 10, 10)
      ev('mousemove', 30, 20)
      ev('mousemove', 50, 25)
      ev('mouseup', 50, 25)
    }
  } catch (e) {
    return `ERROR ${e.message}`
  }
  await frame()
  return c.getSvgString()
}, { svg: DRAWING, scenario })

SCENARIOS['mouse drag of the whole selection'] = { drag: 'r1', selectAll: true }
SCENARIOS['mouse Alt+drag of one element'] = { drag: 'e1', alt: true }

const a = await open(args.ref)
const b = await open(args.new)
const report = { ref: args.ref, new: args.new, roundtrip: { total: 0, identical: 0, diffs: [] }, scenarios: [] }

for (const file of findSvgFiles(root)) {
  const svg = readFileSync(file, 'utf8')
  const [ra, rb] = [await roundtrip(a, svg), await roundtrip(b, svg)]
  report.roundtrip.total++
  if (ra === rb) {
    report.roundtrip.identical++
  } else {
    report.roundtrip.diffs.push(relative(root, file))
  }
}
for (const [name, scenario] of Object.entries(SCENARIOS)) {
  const [ra, rb] = [await runScenario(a, scenario), await runScenario(b, scenario)]
  report.scenarios.push({
    name,
    identical: ra === rb,
    expected: expected.has(name),
    ...(ra === rb ? {} : { ref: ra, new: rb })
  })
}
await browser.close()

const unexpected = report.scenarios.filter((s) => !s.identical && !s.expected)
console.log(`Round trips: ${report.roundtrip.identical}/${report.roundtrip.total} identical`)
report.roundtrip.diffs.forEach((file) => console.log(`  DIFF ${file}`))
const identicalCount = report.scenarios.filter((s) => s.identical).length
console.log(`Scenarios: ${identicalCount}/${report.scenarios.length} identical`)
report.scenarios.filter((s) => !s.identical).forEach((s) => {
  console.log(`  ${s.expected ? 'EXPECTED' : 'UNEXPECTED'} ${s.name}`)
})
if (args.out) { writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n') }
process.exit(unexpected.length || report.roundtrip.diffs.length ? 1 : 0)
