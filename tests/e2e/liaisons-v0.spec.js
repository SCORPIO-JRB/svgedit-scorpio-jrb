import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// V0: survival of the attributes SCorp-io may bind live data to (id, class,
// data-*), through the editing operations. The first group guards what
// already survives. The second one records what is lost today (section 7 of
// the plan "Interface et expérience (v2)"): those tests describe the current
// behaviour and change on purpose when V6 corrects it.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="pompe-1" class="pompe" data-tag="P-101" data-point="007" data-scale="0.125" x="100" y="100" width="60" height="40" fill="#3a6"/>
    <ellipse id="vanne-1" class="vanne" data-tag="V-12" cx="300" cy="120" rx="30" ry="20" fill="#36a"/>
    <g id="cta-1" class="cta" data-tag="CTA-01"><rect id="cta-caisson" class="caisson" data-tag="CTA-01-C" x="400" y="80" width="80" height="60" fill="#999"/></g>
    <text id="t-soufflage" class="valeur" data-tag="T-SOUF" x="100" y="300" font-size="16">21,1</text>
  </g>
</svg>`

const BINDINGS = {
  'pompe-1': { class: 'pompe', 'data-tag': 'P-101' },
  'vanne-1': { class: 'vanne', 'data-tag': 'V-12' },
  'cta-caisson': { class: 'caisson', 'data-tag': 'CTA-01-C' },
  't-soufflage': { class: 'valeur', 'data-tag': 'T-SOUF' }
}

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
}

// Runs canvas commands, then reads the bindings in the open document and in
// the exported SVG.
const run = (page, commands) => page.evaluate(async ({ commands }) => {
  const c = window.svgEditor.svgCanvas
  const byId = (...ids) => ids.map((id) => document.getElementById(id))
  // eslint-disable-next-line no-new-func
  await new Function('c', 'byId', commands)(c, byId)
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
  const read = (root) => Object.fromEntries([...root.querySelectorAll('[data-tag]')].map((el) => [
    el.getAttribute('data-tag'),
    { id: el.getAttribute('id'), class: el.getAttribute('class'), point: el.getAttribute('data-point'), scale: el.getAttribute('data-scale') }
  ]))
  const exported = new DOMParser().parseFromString(c.getSvgString(), 'image/svg+xml')
  return { open: read(document.getElementById('svgcontent')), exported: read(exported) }
}, { commands })

const expectAllBindings = (bindings) => {
  for (const [id, { class: cls, 'data-tag': tag }] of Object.entries(BINDINGS)) {
    expect(bindings[tag], tag).toMatchObject({ id, class: cls })
  }
}

test.describe('Bindings that survive (V0)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('opening then exporting keeps ids, classes and data-*', async ({ page }) => {
    const { open, exported } = await run(page, '')
    expectAllBindings(open)
    expectAllBindings(exported)
    expect(exported['CTA-01']).toMatchObject({ id: 'cta-1', class: 'cta' })
  })

  test('moving, resizing and rotating keep them', async ({ page }) => {
    const { exported } = await run(page, `
      c.selectOnly(byId('pompe-1', 'vanne-1', 't-soufflage'), true)
      c.moveSelectedElements(25, -10)
      c.selectOnly(byId('pompe-1'), true)
      c.changeSelectedAttribute('width', 90)
      c.selectOnly(byId('vanne-1'), true)
      c.setRotationAngle(30)`)
    expectAllBindings(exported)
  })

  test('grouping then ungrouping keeps the bindings of the objects', async ({ page }) => {
    const { exported } = await run(page, `
      c.selectOnly(byId('pompe-1', 'vanne-1'), true)
      c.groupSelectedElements()
      c.moveSelectedElements(10, 10)
      c.ungroupSelectedElement()`)
    expectAllBindings(exported)
  })

  test('converting a shape to a path keeps its id, class and data-*', async ({ page }) => {
    const { exported } = await run(page, `
      c.selectOnly(byId('vanne-1'), true)
      c.convertToPath()`)
    expectAllBindings(exported)
  })

  test('a pasted copy gets a new id; the original keeps its own', async ({ page }) => {
    await run(page, `
      c.selectOnly(byId('pompe-1'), true)
      c.copySelectedElements()
      c.pasteElements('in_place')`)
    const ids = await page.evaluate(() => [...document.querySelectorAll('#svgcontent [data-tag="P-101"]')].map((el) => el.id))
    expect(ids).toHaveLength(2)
    expect(ids).toContain('pompe-1')
    expect(new Set(ids).size).toBe(2)
  })

  test('undoing a group and an ungroup brings every id back', async ({ page }) => {
    const { exported } = await run(page, `
      c.selectOnly(byId('cta-1'), true)
      c.ungroupSelectedElement()
      c.selectOnly(byId('pompe-1', 'vanne-1'), true)
      c.groupSelectedElements()
      c.undoMgr.undo()
      c.undoMgr.undo()`)
    expectAllBindings(exported)
    expect(exported['CTA-01']).toMatchObject({ id: 'cta-1', class: 'cta' })
  })
})

test.describe('Bindings lost today (section 7, to correct in V6)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('numeric data-* values are rounded on export', async ({ page }) => {
    const { open, exported } = await run(page, '')
    expect(open['P-101']).toMatchObject({ point: '007', scale: '0.125' })
    // svg-exec.js writes every numeric value through shortFloat.
    expect(exported['P-101']).toMatchObject({ point: '7', scale: '0.13' })
  })

  test('ungrouping a bound group drops its binding without warning', async ({ page }) => {
    const { exported } = await run(page, `
      c.selectOnly(byId('cta-1'), true)
      c.ungroupSelectedElement()`)
    expect(exported['CTA-01']).toBeUndefined()
    expect(exported['CTA-01-C']).toMatchObject({ id: 'cta-caisson' })
  })

  test('a duplicate id in an opened file is renamed', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g class="layer"><title>L</title>
        <rect id="pompe" data-tag="A" width="10" height="10"/>
        <rect id="pompe" data-tag="B" x="20" width="10" height="10"/>
      </g></svg>`))
    const { exported } = await run(page, '')
    expect(exported.A.id).toBe('pompe')
    expect(exported.B.id).not.toBe('pompe')
  })
})
