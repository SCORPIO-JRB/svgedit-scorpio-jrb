import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Lot V4, contextual editing: geometric hover and rubber band (4.3).

const NS = 'http://www.w3.org/2000/svg'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <ellipse id="el" cx="200" cy="150" rx="80" ry="30" fill="#3a6" transform="rotate(30 200 150)"/>
    <line id="ln" x1="400" y1="60" x2="560" y2="220" stroke="#000" stroke-width="2"/>
    <text id="tx" x="80" y="320" font-size="20" font-family="sans-serif"><tspan x="80" y="320">Première ligne</tspan><tspan x="80" y="350">Deuxième</tspan></text>
    <g id="grp"><rect id="ga" x="400" y="320" width="40" height="40" fill="#36a"/><rect id="gb" x="460" y="320" width="40" height="40" fill="#36a"/></g>
    <path id="ring" d="M300,300 h80 v80 h-80 Z M320,320 v40 h40 v-40 Z" fill="#a63" fill-rule="evenodd"/>
  </g>
</svg>`

async function loadDrawing (page, svg = DRAWING) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

// Screen point of a point of the drawing.
const toScreen = (page, x, y) => page.evaluate(({ x, y }) => {
  const m = document.querySelector('#svgcontent g.layer').getScreenCTM()
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
}, { x, y })

const moveTo = async (page, x, y) => {
  const point = await toScreen(page, x, y)
  await page.mouse.move(point.x, point.y)
}

const hover = (page) => page.evaluate(() => {
  const outline = document.getElementById('selectorHover')
  return {
    shown: outline.getAttribute('display') !== 'none',
    target: window.svgEditor.svgCanvas.selectorManager.hoverTarget?.id ?? null,
    d: outline.getAttribute('d'),
    transform: outline.getAttribute('transform') || ''
  }
})

const selection = (page) => page.evaluate(() =>
  window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id).sort())

/** A rubber band from one point of the drawing to another. */
async function band (page, from, to) {
  await moveTo(page, ...from)
  await page.mouse.down()
  await moveTo(page, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
  await moveTo(page, ...to)
  await page.mouse.up()
}

test.describe('Geometric hover (V4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a turned ellipse is outlined by its own outline, in its matrix, and not from the corner of its box', async ({ page }) => {
    const before = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    await moveTo(page, 200, 150)
    const outline = await hover(page)
    expect(outline).toMatchObject({ shown: true, target: 'el' })
    expect(outline.d).toBe('M120,150A80,30 0 1 0 280,150A80,30 0 1 0 120,150Z')
    expect(outline.transform).toMatch(/^matrix\(/)
    // The outline follows the ellipse on the screen.
    const ends = await page.evaluate(() => {
      const outline = document.getElementById('selectorHover')
      const ellipse = document.getElementById('el')
      const a = outline.getBoundingClientRect()
      const b = ellipse.getBoundingClientRect()
      return [a.x - b.x, a.y - b.y, a.width - b.width, a.height - b.height].map((n) => Math.abs(n) < 1.5)
    })
    expect(ends).toEqual([true, true, true, true])
    // 1.5 px on the screen, whatever the zoom
    expect(await page.evaluate(() => {
      const outline = document.getElementById('selectorHover')
      return [outline.getAttribute('stroke-width'), outline.getAttribute('vector-effect'), outline.getAttribute('fill')]
    })).toEqual(['1.5', 'non-scaling-stroke', 'none'])
    // Nothing written in the drawing
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toBe(before)

    // The upper right corner of the box, outside the ellipse: no outline.
    await moveTo(page, 262, 110)
    expect((await hover(page)).shown).toBe(false)
  })

  test('a text is underlined line by line', async ({ page }) => {
    const box = await page.evaluate(() => {
      const b = document.getElementById('tx').getBBox()
      return { x: b.x, y: b.y, width: b.width, height: b.height }
    })
    await moveTo(page, box.x + 10, box.y + 8)
    const outline = await hover(page)
    expect(outline).toMatchObject({ shown: true, target: 'tx' })
    const lines = outline.d.match(/M[^M]+/g)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^M80,320H\d/)
    expect(lines[1]).toMatch(/^M80,350H\d/)
  })

  test('a closed group keeps the frame of its selection', async ({ page }) => {
    await moveTo(page, 420, 340)
    const outline = await hover(page)
    expect(outline).toMatchObject({ shown: true, target: 'grp' })
    const frame = await page.evaluate(() => {
      const selector = window.svgEditor.svgCanvas.selectorManager.requestSelector(document.getElementById('grp'))
      return selector.selectorRect.getAttribute('d')
    })
    expect(outline.d).toBe(frame)
  })

  test('the hole of a path is not the path, the band of the path is', async ({ page }) => {
    await moveTo(page, 340, 340)
    expect((await hover(page)).shown).toBe(false)
    await moveTo(page, 310, 340)
    const d = await page.evaluate(() => document.getElementById('ring').getAttribute('d'))
    expect(await hover(page)).toMatchObject({ shown: true, target: 'ring', d })
  })

  test('with Ctrl, the outline shows the child a Ctrl+click takes', async ({ page }) => {
    await moveTo(page, 470, 340)
    expect((await hover(page)).target).toBe('grp')
    await page.keyboard.down('Control')
    await moveTo(page, 471, 340)
    expect(await hover(page)).toMatchObject({ shown: true, target: 'gb', d: 'M460,320H500V360H460Z' })
    await page.keyboard.up('Control')
  })
})

test.describe('Geometric rubber band (V4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a band over the corner of the box of a turned ellipse does not take it; over the ellipse, it does', async ({ page }) => {
    // The box of the ellipse goes from about (129, 102) to (271, 198); its
    // upper right corner is empty.
    await band(page, [250, 80], [290, 115])
    expect(await selection(page)).toEqual([])
    await band(page, [220, 80], [290, 150])
    expect(await selection(page)).toEqual(['el'])
  })

  test('a line is taken only when the band meets it', async ({ page }) => {
    // A band in the lower left corner of the box of the diagonal line
    await band(page, [395, 160], [440, 225])
    expect(await selection(page)).toEqual([])
    await band(page, [395, 160], [520, 225])
    expect(await selection(page)).toEqual(['ln'])
  })

  test('a band inside the hole of a path does not take it, a band inside its fill does', async ({ page }) => {
    await band(page, [325, 325], [355, 355])
    expect(await selection(page)).toEqual([])
    await band(page, [302, 302], [315, 315])
    expect(await selection(page)).toEqual(['ring'])
  })

  test('a group is taken when the band meets one of its children, not the gap between them', async ({ page }) => {
    await band(page, [445, 300], [455, 380])
    expect(await selection(page)).toEqual([])
    await band(page, [445, 300], [465, 380])
    expect(await selection(page)).toEqual(['grp'])
  })
})

// The contextual bar (4.4): for each row of the table, select, check the
// commands shown, run one, then check the SVG and the undo.

const BAR_DRAWING = `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">
  <defs><symbol id="sym" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c00"/></symbol></defs>
  <g class="layer"><title>Layer 1</title>
    <rect id="r" x="200" y="200" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="2"/>
    <text id="t" x="120" y="140" font-size="20" fill="#000">Titre</text>
    <path id="p" d="M400,200 L500,200 L500,300 Z" fill="#36a" stroke="#000"/>
    <g id="g"><rect id="ga" x="100" y="330" width="40" height="40" fill="#a63"/><rect id="gb" x="160" y="330" width="40" height="40" fill="#a63"/></g>
    <use id="u1" xlink:href="#sym" x="400" y="350" width="40" height="40"/>
    <use id="u2" xlink:href="#sym" x="460" y="350" width="40" height="40"/>
  </g>
</svg>`

const barState = (page) => page.evaluate(() => {
  const el = document.getElementById('se-context-bar')
  return {
    shown: !el.hidden && getComputedStyle(el).display !== 'none',
    kind: window.svgEditor.layout.contextBar.kind,
    entries: [...el.querySelectorAll('[data-entry]')]
      .filter((e) => !e.hidden && !e.closest('.se-ctx-paint')?.hidden).map((e) => e.dataset.entry)
  }
})
const waitBar = (page) => page.waitForFunction(() => {
  const el = document.getElementById('se-context-bar')
  return !el.hidden && getComputedStyle(el).display !== 'none'
})
const selectIds = async (page, ids) => {
  await page.evaluate((ids) => window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true), ids)
  await waitBar(page)
}
const svgOf = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
/** Undoes, then selects again what the test works on. */
const undoAndSelect = async (page, ids) => {
  await undo(page)
  await selectIds(page, ids)
}
const attrOf = (page, id, name) => page.evaluate(({ id, name }) => document.getElementById(id)?.getAttribute(name) ?? null, { id, name })
const entry = (page, name) => page.locator(`#se-context-bar [data-entry="${name}"]`)

/** Types a value in a field of the bar, as a user does. */
async function typeIn (page, name, value) {
  const input = page.locator(`#se-context-bar [data-entry="${name}"] input`)
  await input.click()
  await input.fill(String(value))
  await input.press('Enter')
}

test.describe('Contextual bar (V4): one test for each row of the table', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, BAR_DRAWING)
  })

  test('text: style, colour, bold, italic, underline, anchor and Edit text; bold is one undo step', async ({ page }) => {
    await selectIds(page, ['t'])
    const state = await barState(page)
    expect(state.kind).toBe('text')
    for (const name of ['paint:fill', 'verb:tool_bold', 'verb:tool_italic', 'verb:tool_text_decoration_underline',
      'anchor:start', 'anchor:middle', 'anchor:end', 'command:edit_text', 'more']) {
      expect(state.entries).toContain(name)
    }
    // Never the exact values: they stay in the inspector.
    expect(state.entries.filter((name) => /selected_|angle/.test(name))).toEqual([])
    const before = await svgOf(page)
    await entry(page, 'verb:tool_bold').click()
    expect(await attrOf(page, 't', 'font-weight')).toBe('bold')
    await expect(entry(page, 'verb:tool_bold')).toHaveAttribute('aria-pressed', 'true')
    await undoAndSelect(page, ['t'])
    expect(await svgOf(page)).toBe(before)

    await entry(page, 'anchor:middle').click()
    expect(await attrOf(page, 't', 'text-anchor')).toBe('middle')
    await undoAndSelect(page, ['t'])
    expect(await svgOf(page)).toBe(before)

    await entry(page, 'command:edit_text').click()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('textedit')
  })

  test('shape: fill, stroke and its width, corner radius, symmetry, Convert to path', async ({ page }) => {
    await selectIds(page, ['r'])
    const state = await barState(page)
    expect(state.kind).toBe('shape')
    expect(state.entries).toEqual(['paint:fill', 'paint:stroke', 'field:stroke_width', 'field:rect_rx',
      'verb:tool_flip_h', 'text:tool_topath', 'more'])
    const before = await svgOf(page)
    await typeIn(page, 'field:rect_rx', 8)
    expect(await attrOf(page, 'r', 'rx')).toBe('8')
    // The same command as the field of the inspector, which follows.
    expect(await page.evaluate(() => String(document.getElementById('rect_rx').value))).toBe('8')
    await undoAndSelect(page, ['r'])
    expect(await svgOf(page)).toBe(before)

    await typeIn(page, 'field:stroke_width', 5)
    expect(await attrOf(page, 'r', 'stroke-width')).toBe('5')
    await undoAndSelect(page, ['r'])
    expect(await svgOf(page)).toBe(before)

    await entry(page, 'text:tool_topath').click()
    expect(await page.evaluate(() => document.querySelector('#svgcontent rect#r'))).toBeNull()
    await undo(page)
    expect(await svgOf(page)).toBe(before)
  })

  test('path: Edit nodes, fill and stroke; editing the nodes shows their commands', async ({ page }) => {
    await selectIds(page, ['p'])
    const state = await barState(page)
    expect(state.kind).toBe('path')
    expect(state.entries).toEqual(['command:edit_nodes', 'paint:fill', 'paint:stroke', 'field:stroke_width', 'verb:tool_flip_h', 'more'])
    const before = await svgOf(page)
    await typeIn(page, 'field:stroke_width', 4)
    expect(await attrOf(page, 'p', 'stroke-width')).toBe('4')
    await undoAndSelect(page, ['p'])
    expect(await svgOf(page)).toBe(before)

    await entry(page, 'command:edit_nodes').click()
    await page.waitForFunction(() => window.svgEditor.layout.contextBar.kind === 'nodes')
    const nodes = await barState(page)
    for (const name of ['verb:tool_node_link', 'list:seg_type', 'verb:tool_node_clone', 'verb:tool_node_delete', 'verb:tool_openclose_path']) {
      expect(nodes.entries).toContain(name)
    }
  })

  test('group: Open group, Ungroup, Select children, fill and stroke, hide', async ({ page }) => {
    await selectIds(page, ['g'])
    const state = await barState(page)
    expect(state.kind).toBe('group')
    expect(state.entries).toEqual(['command:open_group', 'text:tool_ungroup', 'command:select_group_children',
      'paint:fill', 'paint:stroke', 'command:hide_selection', 'more'])
    const before = await svgOf(page)
    await entry(page, 'text:tool_ungroup').click()
    expect(await page.evaluate(() => document.getElementById('g'))).toBeNull()
    await undo(page)
    expect(await svgOf(page)).toBe(before)

    await selectIds(page, ['g'])
    await entry(page, 'command:hide_selection').click()
    expect(await attrOf(page, 'g', 'display')).toBe('none')
    await undo(page)
    expect(await svgOf(page)).toBe(before)

    await selectIds(page, ['g'])
    await entry(page, 'command:open_group').click()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentGroup()?.id)).toBe('g')
  })

  test('symbol: Select the same symbol, Replace, Detach', async ({ page }) => {
    await selectIds(page, ['u1'])
    const state = await barState(page)
    expect(state.kind).toBe('use')
    expect(state.entries).toEqual(['command:select_same', 'command:replace_symbol', 'text:tool_unlink_use', 'more'])
    await entry(page, 'command:select_same').click()
    expect(await selection(page)).toEqual(['u1', 'u2'])

    await selectIds(page, ['u1'])
    const before = await svgOf(page)
    const chooser = page.waitForEvent('filechooser')
    await entry(page, 'command:replace_symbol').click()
    await (await chooser).setFiles({
      name: 'pompe.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(`<svg xmlns="${NS}" width="30" height="20" viewBox="0 0 30 20"><circle id="pompe" cx="15" cy="10" r="9" fill="#0a0"/></svg>`)
    })
    await page.waitForFunction(() => document.getElementById('u1').getAttribute('width') === '30')
    const replaced = await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      const use = document.getElementById('u1')
      return { id: use.id, x: use.getAttribute('x'), drawsCircle: Boolean(document.querySelector(canvas.getHref(use) + ' circle')) }
    })
    expect(replaced).toEqual({ id: 'u1', x: '400', drawsCircle: true })
    // The other <use> keeps the old symbol.
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getHref(document.getElementById('u2')))).toBe('#sym')
    await undo(page)
    expect(await svgOf(page)).toBe(before)

    await selectIds(page, ['u1'])
    await entry(page, 'text:tool_unlink_use').click()
    expect(await page.evaluate(() => document.querySelector('#svgcontent use#u1'))).toBeNull()
    await undo(page)
    expect(await svgOf(page)).toBe(before)
  })

  test('multi-selection: Align and distribute, Group, symmetry, fill and stroke shown as Mixed', async ({ page }) => {
    await selectIds(page, ['r', 'p'])
    const state = await barState(page)
    expect(state.kind).toBe('multi')
    expect(state.entries).toEqual(['align', 'text:tool_group_elements', 'verb:tool_flip_h_multi', 'paint:fill', 'paint:stroke', 'more'])
    expect(await page.locator('#se-context-bar [data-paint="fill"] .se-ctx-paint-name').textContent())
      .toBe(await page.evaluate(() => window.svgEditor.i18next.t('properties.mixed')))
    const before = await svgOf(page)

    // The alignment panel of the inspector, lent to the bar.
    await entry(page, 'align').click()
    await expect(page.locator('#se-ctx-align #tool_align_popup')).toBeVisible()
    await page.locator('#se-ctx-align #tool_align_top').click()
    const tops = await page.evaluate(() => ['r', 'p'].map((id) => Math.round(document.getElementById(id).getBBox().y)))
    expect(tops[0]).toBe(tops[1])
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => document.getElementById('tool_align_popup').closest('#se-ctx-align'))).toBeNull()
    await undo(page)
    expect(await svgOf(page)).toBe(before)

    await selectIds(page, ['r', 'p'])
    await entry(page, 'text:tool_group_elements').click()
    expect(await page.evaluate(() => document.getElementById('r').parentNode.tagName)).toBe('g')
    await undo(page)
    expect(await svgOf(page)).toBe(before)
  })

  test('connector: stroke and arrows at the start and at the end', async ({ page }) => {
    await page.click('#tool_connect')
    const a = await page.evaluate(() => { const b = document.getElementById('r').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
    const b = await page.evaluate(() => { const b = document.getElementById('p').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 8 })
    await page.mouse.up()
    const id = await page.evaluate(() => document.querySelector('#svgcontent polyline').id)
    await page.click('#tool_select')
    await selectIds(page, [id])
    const state = await barState(page)
    expect(state.kind).toBe('connector')
    expect(state.entries).toEqual(['paint:stroke', 'field:stroke_width', 'list:start_marker_list_opts', 'list:end_marker_list_opts', 'more'])
    const before = await svgOf(page)
    await entry(page, 'list:end_marker_list_opts').click()
    const choice = page.locator('#se-ctx-list [role="menuitemradio"]').nth(1)
    await choice.click()
    expect(await attrOf(page, id, 'marker-end')).toMatch(/^url\(#/)
    await undo(page)
    expect(await svgOf(page)).toBe(before)
  })

  test('"…" opens the context menu of the selection', async ({ page }) => {
    await selectIds(page, ['r'])
    await entry(page, 'more').click()
    const shown = await page.evaluate(() => {
      const menu = document.getElementById('se-cmenu_canvas')
      return getComputedStyle(menu.shadowRoot.querySelector('.contextMenu')).display
    })
    expect(shown).toBe('block')
  })
})

test.describe('Contextual bar (V4): place, gestures, focus and preference', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, BAR_DRAWING)
  })

  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 700 }]) {
    test(`never covers the frame or its grips, nor the floating bars: 50 places at ${size.width} × ${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.waitForTimeout(200)
      const faults = await page.evaluate(async () => {
        const canvas = window.svgEditor.svgCanvas
        const bar = document.getElementById('se-context-bar')
        const layer = document.querySelector('#svgcontent g.layer')
        const area = document.getElementById('workarea').getBoundingClientRect()
        const m = layer.getScreenCTM().inverse()
        const toDrawing = (x, y) => new DOMPoint(x, y).matrixTransform(m)
        const zoom = canvas.getZoom()
        const rect = document.getElementById('r')
        const meets = (a, b, margin = 0) => a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin
        const faults = []
        let placed = 0
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 10; col++) {
            // From the edges of the view to its middle, under the floating bars too.
            const x = area.left + 20 + col * (area.width - 140) / 9
            const y = area.top + 20 + row * (area.height - 120) / 4
            const p = toDrawing(x, y)
            rect.setAttribute('x', p.x)
            rect.setAttribute('y', p.y)
            rect.setAttribute('width', 80 / zoom)
            rect.setAttribute('height', 50 / zoom)
            canvas.selectOnly([rect], true)
            canvas.selectorManager.requestSelector(rect).resize()
            await new Promise((resolve) => setTimeout(resolve, 0))
            window.svgEditor.layout.contextBar.update()
            if (bar.hidden || getComputedStyle(bar).display === 'none') {
              faults.push(`not shown at ${col},${row}`)
              continue
            }
            placed++
            const b = bar.getBoundingClientRect()
            const frame = document.querySelector('[id^="selectorRect_"]:not([display="none"])')?.getBoundingClientRect() ??
              rect.getBoundingClientRect()
            const grips = [...document.querySelectorAll('#selectorGripsGroup [id^="selectorGrip_"]')]
              .filter((g) => g.getAttribute('display') !== 'none' && g.getBoundingClientRect().width)
              .map((g) => g.getBoundingClientRect())
            if (meets(b, frame)) faults.push(`covers the frame at ${col},${row}`)
            if (grips.some((g) => meets(b, g))) faults.push(`covers a grip at ${col},${row}`)
            if (b.left < area.left || b.right > area.right || b.top < area.top || b.bottom > area.bottom) faults.push(`out of the view at ${col},${row}`)
            for (const id of ['tools_left', 'se-viewgroup']) {
              const ob = document.getElementById(id).getBoundingClientRect()
              if (ob.width && meets(b, ob, 7.5)) faults.push(`under #${id} at ${col},${row}`)
            }
          }
        }
        return { faults, placed }
      })
      expect(faults.faults).toEqual([])
      expect(faults.placed).toBe(50)
    })
  }

  test('a selection taller than the view: the bar goes against the edge that hides fewer objects', async ({ page }) => {
    const side = await page.evaluate(async () => {
      const canvas = window.svgEditor.svgCanvas
      const area = document.getElementById('workarea').getBoundingClientRect()
      const m = document.querySelector('#svgcontent g.layer').getScreenCTM().inverse()
      const top = new DOMPoint(area.left + 300, area.top - 200).matrixTransform(m)
      const bottom = new DOMPoint(area.left + 700, area.bottom + 200).matrixTransform(m)
      const rect = document.getElementById('r')
      rect.setAttribute('x', top.x)
      rect.setAttribute('y', top.y)
      rect.setAttribute('width', bottom.x - top.x)
      rect.setAttribute('height', bottom.y - top.y)
      canvas.selectOnly([rect], true)
      await new Promise((resolve) => setTimeout(resolve, 0))
      window.svgEditor.layout.contextBar.update()
      return document.getElementById('se-context-bar').dataset.side
    })
    expect(side).toBe('edge')
  })

  test('hidden during a drag, without computing its place, and back 150 ms after the release', async ({ page }) => {
    await selectIds(page, ['r'])
    const center = await page.evaluate(() => { const b = document.getElementById('r').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
    const layouts = await page.evaluate(() => window.svgEditor.layout.contextBar.layouts)
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(center.x + i * 10, center.y + i * 5)
    const during = await page.evaluate(() => ({
      hidden: getComputedStyle(document.getElementById('se-context-bar')).display === 'none',
      layouts: window.svgEditor.layout.contextBar.layouts
    }))
    expect(during).toEqual({ hidden: true, layouts })
    // The time the bar takes to come back after the release.
    await page.evaluate(() => {
      const bar = document.getElementById('se-context-bar')
      window.__shownAfter = null
      window.addEventListener('pointerup', () => {
        const start = performance.now()
        const observer = new MutationObserver(() => {
          if (getComputedStyle(bar).display !== 'none') {
            window.__shownAfter = performance.now() - start
            observer.disconnect()
          }
        })
        observer.observe(bar, { attributes: true })
      }, { once: true, capture: true })
    })
    await page.mouse.up()
    await page.waitForFunction(() => window.__shownAfter !== null)
    const after = await page.evaluate(() => ({ ms: window.__shownAfter, layouts: window.svgEditor.layout.contextBar.layouts }))
    expect(after.ms).toBeGreaterThanOrEqual(145)
    expect(after.ms).toBeLessThan(400)
    expect(after.layouts).toBe(layouts + 1)
  })

  test('hidden during a zoom with the wheel, back once it stops', async ({ page }) => {
    await selectIds(page, ['r'])
    const center = await page.evaluate(() => { const b = document.getElementById('r').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
    await page.mouse.move(center.x, center.y)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('se-context-bar')).display)).toBe('none')
    await page.keyboard.up('Control')
    await waitBar(page)
  })

  test('F6 goes from the canvas to the bar, the inspector, the toolbar, and back; Shift+F6 goes back', async ({ page }) => {
    await selectIds(page, ['r'])
    await page.evaluate(() => document.activeElement?.blur?.())
    const region = () => page.evaluate(() => {
      const active = document.activeElement
      if (document.getElementById('se-context-bar').contains(active)) return 'bar'
      if (document.getElementById('se-panel').contains(active)) return 'inspector'
      if (document.getElementById('tools_left').contains(active)) return 'toolbar'
      if (document.getElementById('workarea').contains(active)) return 'canvas'
      return active?.tagName ?? null
    })
    const visited = []
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('F6')
      visited.push(await region())
    }
    expect(visited).toEqual(['bar', 'inspector', 'toolbar', 'canvas'])
    await page.keyboard.press('Shift+F6')
    expect(await region()).toBe('toolbar')
  })

  test('a preference turns the bar off; its actions stay in the menu and on the keyboard', async ({ page }) => {
    await page.click('#se-zoom-button')
    await page.click('#se-zoom-menu [data-command="toggle_context_bar"]')
    await page.evaluate((ids) => window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true), ['g'])
    await page.waitForTimeout(50)
    expect((await barState(page)).shown).toBe(false)
    expect(await page.evaluate(() => window.svgEditor.configObj.pref('context_bar'))).toBe('false')
    // Ungroup is still in the menu of the inspector, and open group in the
    // registry (palette, keyboard).
    expect(await page.evaluate(() => window.svgEditor.commands.execute('open_group'))).toBe(true)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentGroup()?.id)).toBe('g')

    await page.click('#se-zoom-button')
    await expect(page.locator('#se-zoom-menu [data-command="toggle_context_bar"]')).toHaveAttribute('aria-checked', 'false')
    await page.click('#se-zoom-menu [data-command="toggle_context_bar"]')
    await page.evaluate(() => window.svgEditor.svgCanvas.leaveContext())
    await selectIds(page, ['r'])
    expect((await barState(page)).shown).toBe(true)
  })

  test('over an object it covers, the empty parts of the bar fade and let the click through', async ({ page }) => {
    await selectIds(page, ['r'])
    // An object under the bar
    await page.evaluate(() => {
      const bar = document.getElementById('se-context-bar').getBoundingClientRect()
      const m = document.querySelector('#svgcontent g.layer').getScreenCTM().inverse()
      const a = new DOMPoint(bar.left - 20, bar.top - 10).matrixTransform(m)
      const b = new DOMPoint(bar.right + 20, bar.bottom + 4).matrixTransform(m)
      const under = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      Object.entries({ id: 'under', x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, fill: '#999' })
        .forEach(([name, value]) => under.setAttribute(name, value))
      document.querySelector('#svgcontent g.layer').prepend(under)
    })
    const gap = await page.evaluate(() => {
      const bar = document.getElementById('se-context-bar').getBoundingClientRect()
      return { x: bar.left + 2, y: bar.top + bar.height / 2 }
    })
    await page.mouse.move(gap.x, gap.y)
    await expect(page.locator('#se-context-bar')).toHaveClass(/se-ctx-faded/)
    await page.mouse.down()
    await page.mouse.up()
    expect(await selection(page)).toEqual(['under'])
  })
})

test.describe('Text styles (V4, N10)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, BAR_DRAWING)
  })

  test('a style writes only font, size, weight and fill, in one undo step, and the bar names it', async ({ page }) => {
    await selectIds(page, ['t'])
    expect((await barState(page)).entries[0]).toBe('textstyle')
    const custom = await page.evaluate(() => window.svgEditor.i18next.t('textstyles.custom'))
    await expect(page.locator('#se-context-bar .se-ctx-textstyle-name')).toHaveText(custom)
    const before = await svgOf(page)
    const attributesBefore = await page.evaluate(() => [...document.getElementById('t').attributes].map((a) => a.name).sort())

    await entry(page, 'textstyle').click()
    await expect(page.locator('#se-textstyles [data-style]')).toHaveCount(11)
    await page.click('#se-textstyles [data-style="page_title"]')
    const written = await page.evaluate(() => {
      const t = document.getElementById('t')
      return ['font-family', 'font-size', 'font-weight', 'fill'].map((name) => t.getAttribute(name))
    })
    expect(written).toEqual(["'Space Grotesk', sans-serif", '34', '500', '#CEB8FF'])
    // Nothing else in the file: no class, no data-*.
    const attributesAfter = await page.evaluate(() => [...document.getElementById('t').attributes].map((a) => a.name).sort())
    expect(attributesAfter.filter((name) => !attributesBefore.includes(name)).sort()).toEqual(['font-family', 'font-weight'])
    const title = await page.evaluate(() => window.svgEditor.i18next.t('textstyles.page_title'))
    await expect(page.locator('#se-context-bar .se-ctx-textstyle-name')).toHaveText(title)

    await undoAndSelect(page, ['t'])
    expect(await svgOf(page)).toBe(before)
  })

  test('a style is recognised by its values, written as attributes or by a stylesheet', async ({ page }) => {
    await loadDrawing(page, `<svg xmlns="${NS}" width="640" height="480">
      <style>.mesure { font-family: 'Roboto Flex', sans-serif; font-size: 20px; fill: #C9C5D1 }</style>
      <g class="layer"><title>Layer 1</title>
        <text id="a" x="40" y="60" font-family="Space Grotesk" font-size="34" font-weight="500" fill="#ceb8ff">Chaufferie</text>
        <text id="b" x="40" y="160" class="mesure">21,1</text>
        <text id="c" x="40" y="260" font-size="34" fill="#ceb8ff">Autre</text>
      </g></svg>`)
    const names = {}
    for (const id of ['a', 'b', 'c']) {
      await selectIds(page, [id])
      names[id] = await page.locator('#se-context-bar .se-ctx-textstyle-name').textContent()
    }
    const t = (key) => page.evaluate((key) => window.svgEditor.i18next.t(key), key)
    expect(names).toEqual({ a: await t('textstyles.page_title'), b: await t('textstyles.value'), c: await t('textstyles.custom') })
  })

  test('the Custom tab: weight, font and size, through the commands of the inspector', async ({ page }) => {
    await selectIds(page, ['t'])
    await entry(page, 'textstyle').click()
    await page.click('#se-textstyles-tab-custom')
    await page.selectOption('#se-textstyles-weight', '600')
    expect(await attrOf(page, 't', 'font-weight')).toBe('600')
    await page.selectOption('#se-textstyles-font', { index: 1 })
    expect(await attrOf(page, 't', 'font-family')).toBe("'Roboto Flex', sans-serif")
    const size = page.locator('#se-textstyles-font_size input')
    await size.fill('26')
    await size.press('Enter')
    expect(await attrOf(page, 't', 'font-size')).toBe('26')
    expect(await page.evaluate(() => String(document.getElementById('font_size').value))).toBe('26')
  })
})

const menuTargets = (page) => page.evaluate(() => {
  const menu = document.getElementById('se-cmenu_canvas').shadowRoot
  return {
    shown: getComputedStyle(menu.querySelector('.contextMenu')).display === 'block',
    targets: [...menu.querySelectorAll('li.se-target a')].map((a) => a.dataset.target),
    focused: menu.activeElement?.getAttribute('href') ?? null
  }
})

test.describe('Context menu by target, and command palette (V4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, BAR_DRAWING)
  })

  test('the menu starts with the verbs of its target', async ({ page }) => {
    const expected = {
      t: ['edit_text', 'hide_selection'],
      r: ['tool_topath', 'hide_selection'],
      p: ['edit_nodes', 'hide_selection'],
      g: ['open_group', 'select_group_children', 'hide_selection'],
      u1: ['select_same', 'replace_symbol', 'tool_unlink_use', 'hide_selection']
    }
    for (const [id, targets] of Object.entries(expected)) {
      await selectIds(page, [id])
      const box = await page.evaluate((id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }, id)
      await page.mouse.click(box.x, box.y, { button: 'right' })
      expect((await menuTargets(page)).targets).toEqual(targets)
      await page.keyboard.press('Escape')
    }
    await selectIds(page, ['r', 'p'])
    await page.keyboard.press('Shift+F10')
    expect((await menuTargets(page)).targets).toEqual(['align_left', 'align_center', 'align_right', 'align_top',
      'align_middle', 'align_bottom', 'align_distrib_horiz', 'align_distrib_verti', 'hide_selection'])
  })

  test('Shift+F10 opens it from the keyboard; the arrows and Enter choose, in one undo step', async ({ page }) => {
    await selectIds(page, ['g'])
    await page.evaluate(() => document.activeElement?.blur?.())
    await page.keyboard.press('Shift+F10')
    let menu = await menuTargets(page)
    expect(menu).toMatchObject({ shown: true, focused: '#target-open_group' })
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    menu = await menuTargets(page)
    expect(menu.focused).toBe('#target-hide_selection')
    const before = await svgOf(page)
    await page.keyboard.press('Enter')
    expect((await menuTargets(page)).shown).toBe(false)
    expect(await attrOf(page, 'g', 'display')).toBe('none')
    await undo(page)
    expect(await svgOf(page)).toBe(before)
    // Escape closes it.
    await selectIds(page, ['r'])
    await page.keyboard.press('Shift+F10')
    await page.keyboard.press('Escape')
    expect((await menuTargets(page)).shown).toBe(false)
  })

  test('Ctrl+K finds an action by its name and runs it; Escape closes', async ({ page }) => {
    await selectIds(page, ['g'])
    await page.evaluate(() => document.activeElement?.blur?.())
    await page.keyboard.press('Control+k')
    await expect(page.locator('#se-palette')).toBeVisible()
    await expect(page.locator('#se-palette-input')).toBeFocused()
    await page.keyboard.type('ungr')
    const first = page.locator('#se-palette [role="option"][aria-selected="true"]')
    await expect(first).toHaveAttribute('data-command', /ungroup/)
    await page.keyboard.press('Enter')
    await expect(page.locator('#se-palette')).toBeHidden()
    expect(await page.evaluate(() => document.getElementById('g'))).toBeNull()

    await page.keyboard.press('Control+k')
    await page.keyboard.type('zzzz')
    await expect(page.locator('#se-palette .se-palette-empty')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#se-palette')).toBeHidden()
  })

  test('an action that does not apply shows greyed after the others; ? lists the shortcuts', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await page.evaluate(() => document.activeElement?.blur?.())
    await page.keyboard.press('Control+k')
    await page.keyboard.type('open group')
    const option = page.locator('#se-palette [role="option"][data-command="open_group"]')
    await expect(option).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')

    await page.keyboard.press('Shift+?')
    await expect(page.locator('#se-palette-title')).toHaveText(await page.evaluate(() => window.svgEditor.i18next.t('palette.shortcuts')))
    const hints = await page.locator('#se-palette [role="option"] kbd').allTextContents()
    expect(hints.length).toBeGreaterThan(30)
    expect(hints.every((hint) => hint.length > 0)).toBe(true)
  })
})
