import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, screenPoint } from './helpers.js'

// Texts of several lines (ticket "Gestion des textes multilignes"): Enter
// makes a line, the lines are <tspan> at an absolute x and y, a side grip sets
// a fixed width that breaks the lines, the font, the line height and the
// alignment apply to the whole block, and the file keeps it all.

const NS = 'http://www.w3.org/2000/svg'
const SE = 'http://svg-edit.googlecode.com'

async function load (page, body) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, `<svg xmlns="${NS}" xmlns:se="${SE}" width="640" height="480"><g class="layer"><title>Layer 1</title>${body}</g></svg>`)
}

// The lines of a text: [x, y, characters] each, or its characters alone.
const lines = (page, selector = '#svgcontent text') => page.evaluate((selector) => {
  const text = document.querySelector(selector)
  const spans = [...text.children].filter((el) => el.localName === 'tspan')
  return spans.length
    ? spans.map((t) => [t.getAttribute('x'), t.getAttribute('y'), t.textContent])
    : text.textContent
}, selector)
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const mode = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getMode())
const field = (page) => page.evaluate(() => {
  const input = document.getElementById('text')
  return { value: input.value, start: input.selectionStart, end: input.selectionEnd }
})
const grip = (page, dir) => page.evaluate((dir) => {
  const b = document.getElementById(`selectorGrip_resize_${dir}`).getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}, dir)
const centerOf = (page, selector) => page.evaluate((selector) => {
  const b = document.querySelector(selector).getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}, selector)

test.describe('Texts of several lines', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('Enter makes a line, an empty line keeps its place, the typing is one step', async ({ page }) => {
    await load(page, '')
    await page.locator('#tool_text').click()
    const at = await screenPoint(page, 200, 200)
    await page.mouse.click(at.x, at.y)
    await page.keyboard.type('Chaufferie')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Sous-sol')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Niveau -1')
    const typed = await lines(page)
    expect(typed.map(([, , s]) => s)).toEqual(['Chaufferie', 'Sous-sol', '', 'Niveau -1'])
    // Same x, y one line height apart, the empty line included
    expect(new Set(typed.map(([x]) => x)).size).toBe(1)
    const ys = typed.map(([, y]) => Number(y))
    const step = ys[1] - ys[0]
    expect(step).toBeGreaterThan(0)
    expect(ys[3] - ys[2]).toBeCloseTo(step, 3)
    await page.keyboard.press('Escape')
    expect(await mode(page)).toBe('select')
    await page.waitForTimeout(400)
    expect(await steps(page)).toBe(1)
    await page.keyboard.press('ControlOrMeta+z')
    expect(await page.locator('#svgcontent text').count()).toBe(0)
  })

  test('Backspace at the start of a line joins it to the previous one; Up and Down go from line to line', async ({ page }) => {
    await load(page, '<text id="t1" x="100" y="100" font-size="24" font-family="sans-serif" se:line-height="1.2">' +
      '<tspan x="100" y="100">Pompe</tspan><tspan x="100" y="128.8">de charge</tspan></text>')
    await page.locator('#t1').dblclick()
    expect(await mode(page)).toBe('textedit')
    // To the start of the second line, from the end of the text
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.press('Home')
    expect((await field(page)).start).toBe(6)
    await page.keyboard.press('ArrowUp')
    expect((await field(page)).start).toBe(0)
    await page.keyboard.press('ArrowDown')
    expect((await field(page)).start).toBe(6)
    await page.keyboard.press('Backspace')
    expect(await lines(page, '#t1')).toBe('Pompede charge')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Shift+ArrowUp')
    expect(await field(page)).toMatchObject({ start: 0, end: 6 })
    await page.keyboard.press('Escape')
    expect((await lines(page, '#t1')).map(([, , s]) => s)).toEqual(['Pompe', 'de charge'])
    // Undo goes back to the text as it was, exactly
    expect(await steps(page)).toBe(1)
    await page.keyboard.press('ControlOrMeta+z')
    expect(await lines(page, '#t1')).toEqual([['100', '100', 'Pompe'], ['100', '128.8', 'de charge']])
  })

  test('a click away from the text ends the editing', async ({ page }) => {
    await load(page, '<text id="t1" x="100" y="100" font-size="24">Pompe</text>')
    await page.locator('#t1').dblclick()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('12')
    const away = await screenPoint(page, 500, 400)
    await page.mouse.click(away.x, away.y)
    expect(await mode(page)).toBe('select')
    expect((await lines(page, '#t1')).map(([, , s]) => s)).toEqual(['Pompe', '12'])
  })

  test('a text of several lines pasted keeps its lines', async ({ page, browserName, context }) => {
    test.skip(browserName !== 'chromium', 'reading the clipboard is granted to Chromium only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await load(page, '<text id="t1" x="100" y="100" font-size="24">Pompe</text>')
    await page.locator('#t1').dblclick()
    await page.keyboard.press('End')
    await page.evaluate(() => navigator.clipboard.writeText(' 1\nDépart\n\nRetour'))
    await page.keyboard.press('ControlOrMeta+v')
    await page.keyboard.press('Escape')
    expect((await lines(page, '#t1')).map(([, , s]) => s)).toEqual(['Pompe 1', 'Départ', '', 'Retour'])
    // And copied back from the field, line by line; the space between the
    // lines (here an empty line, at the middle of the block) is the text too
    await page.locator('#t1').dblclick({ force: true })
    expect(await mode(page)).toBe('textedit')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ControlOrMeta+c')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Pompe 1\nDépart\n\nRetour')
  })

  test('a side grip sets a fixed width: the lines break, those typed stay, one step', async ({ page }) => {
    await load(page, '<text id="t1" x="100" y="100" font-size="20" font-family="sans-serif">' +
      'Vanne trois voies du circuit radiateurs</text>')
    await page.locator('#t1').click()
    const e = await grip(page, 'e')
    await page.mouse.move(e.x, e.y)
    await page.mouse.down()
    await page.mouse.move(e.x - 180, e.y + 20, { steps: 6 })
    await page.mouse.up()
    const width = Number(await page.locator('#t1').getAttribute('se:width'))
    expect(width).toBeGreaterThan(50)
    const broken = await lines(page, '#t1')
    expect(broken.length).toBeGreaterThan(1)
    expect(broken.map(([, , s]) => s).join(' ')).toBe('Vanne trois voies du circuit radiateurs')
    // Every line fits in the width, the font did not change
    const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('#t1 tspan')].map((t) => t.getComputedTextLength())))
    expect(widest).toBeLessThanOrEqual(width + 0.5)
    expect(await page.locator('#t1').getAttribute('font-size')).toBe('20')
    expect(await page.locator('#t1').getAttribute('transform')).toBeNull()
    // The selection box is as wide as the width
    const box = await page.evaluate(() => window.svgEditor.svgCanvas.getStrokedBBox([document.getElementById('t1')]))
    expect(box.width).toBeCloseTo(width, 0)
    expect(await steps(page)).toBe(1)

    // A line typed stays a line when the width changes
    await page.locator('#t1').dblclick()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('C1')
    // Escape ends the editing, the text selected
    await page.keyboard.press('Escape')
    const w = await grip(page, 'w')
    await page.mouse.move(w.x, w.y)
    await page.mouse.down()
    await page.mouse.move(w.x - 400, w.y, { steps: 6 })
    await page.mouse.up()
    expect((await lines(page, '#t1')).map(([, , s]) => s)).toEqual(['Vanne trois voies du circuit radiateurs', 'C1'])

    // Undone: as wide as its lines again, its characters alone
    await page.keyboard.press('ControlOrMeta+z')
    await page.keyboard.press('ControlOrMeta+z')
    await page.keyboard.press('ControlOrMeta+z')
    // (as saved: the style of the editing is not)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toContain(
      '<text id="t1" x="100" y="100" font-size="20" font-family="sans-serif">Vanne trois voies du circuit radiateurs</text>')
  })

  test('the font, the line height and the alignment apply to the whole block', async ({ page }) => {
    await load(page, '<text id="t1" x="100" y="100" font-size="20" font-family="sans-serif" se:line-height="1.2">' +
      '<tspan x="100" y="100">Départ</tspan><tspan x="100" y="124">chaudière 1</tspan></text>')
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('t1')])
      canvas.setFontSize(30)
    })
    expect(await lines(page, '#t1')).toEqual([['100', '100', 'Départ'], ['100', '136', 'chaudière 1']])
    // The line height, from the field of the text section
    const input = page.locator('#tool_line_height').locator('#input')
    await input.click()
    await input.press('ControlOrMeta+a')
    await input.pressSequentially('1.5')
    await input.press('Enter')
    expect(await page.locator('#t1').getAttribute('se:line-height')).toBe('1.5')
    expect(await lines(page, '#t1')).toEqual([['100', '100', 'Départ'], ['100', '145', 'chaudière 1']])
    // Centered, the block stays where it is: the lines center in it
    const before = await page.evaluate(() => window.svgEditor.svgCanvas.getStrokedBBox([document.getElementById('t1')]))
    await page.evaluate(() => window.svgEditor.svgCanvas.setTextAnchor('middle'))
    const after = await page.evaluate(() => window.svgEditor.svgCanvas.getStrokedBBox([document.getElementById('t1')]))
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.width).toBeCloseTo(before.width, 0)
    const xs = await page.evaluate(() => [...document.querySelectorAll('#t1 tspan')].map((t) => t.getAttribute('x')))
    expect(xs[0]).toBe(xs[1])
    expect(Number(xs[0])).toBeCloseTo(before.x + before.width / 2, 0)
    // Each change is one step, undone exactly (from the drawing: the field
    // keeps its own Undo)
    expect(await steps(page)).toBe(3)
    await page.evaluate(() => document.activeElement?.blur())
    for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+z')
    expect(await lines(page, '#t1')).toEqual([['100', '100', 'Départ'], ['100', '124', 'chaudière 1']])
    expect(await page.locator('#t1').getAttribute('font-size')).toBe('20')
  })

  test('moved, duplicated and selected with others, a text keeps its lines', async ({ page }) => {
    await load(page, '<text id="t1" x="100" y="100" font-size="20" se:line-height="1.2">' +
      '<tspan x="100" y="100">A</tspan><tspan x="100" y="124">B</tspan></text>' +
      '<rect id="r1" x="300" y="300" width="40" height="40"/>')
    const c = await centerOf(page, '#t1')
    await page.mouse.move(c.x, c.y)
    await page.mouse.down()
    await page.mouse.move(c.x + 50, c.y + 30, { steps: 5 })
    await page.mouse.up()
    expect(await lines(page, '#t1')).toEqual([['100', '100', 'A'], ['100', '124', 'B']])
    await page.keyboard.press('ControlOrMeta+d')
    const copies = await page.evaluate(() => [...document.querySelectorAll('#svgcontent text')].map((t) => [...t.children].map((s) => s.textContent)))
    expect(copies).toEqual([['A', 'B'], ['A', 'B']])
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([...document.querySelectorAll('#svgcontent text, #r1')]))
    await page.keyboard.press('ArrowRight')
    expect(await lines(page, '#t1')).toEqual([['100', '100', 'A'], ['100', '124', 'B']])
    await page.keyboard.press('ControlOrMeta+z')
    await page.keyboard.press('ControlOrMeta+z')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await page.locator('#svgcontent text').count()).toBe(1)
    expect(await page.locator('#t1').getAttribute('transform')).toBeNull()
  })

  test('saved, opened and saved again, a text is the same; a text of one line is untouched', async ({ page }) => {
    await load(page, '<text id="one" x="50" y="50" font-size="16">Une ligne</text>' +
      '<text id="t1" x="100" y="100" font-size="20" text-anchor="middle" se:width="120" se:line-height="1.2">' +
      '<tspan x="100" y="100">Vanne trois</tspan><tspan x="100" y="124" se:wrapped="true">voies</tspan><tspan x="100" y="148"></tspan><tspan x="100" y="172">C1</tspan></text>')
    const first = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(first).toContain('<text id="one" x="50" y="50" font-size="16">Une ligne</text>')
    // No space added between the lines: a centered line does not move
    expect(first).toContain('<tspan x="100" y="100">Vanne trois</tspan><tspan x="100" y="124" se:wrapped="true">voies</tspan>')
    const second = await page.evaluate((svg) => {
      window.svgEditor.svgCanvas.setSvgString(svg)
      return window.svgEditor.svgCanvas.getSvgString()
    }, first)
    expect(second).toBe(first)
    // Edited again, the lines are read back from the file
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('t1')]))
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getText())).toBe('Vanne trois voies\n\nC1')
  })

  test('the export draws the lines where the editor does', async ({ page }) => {
    await load(page, '<text id="t1" x="320" y="100" font-size="20" font-family="sans-serif" text-anchor="middle" se:line-height="1.2">' +
      '<tspan x="320" y="100">Départ</tspan><tspan x="320" y="124"></tspan><tspan x="320" y="148">chaudière</tspan></text>')
    const exported = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    // Read by a plain document, as another reader would: the same places
    const places = await page.evaluate((svg) => {
      const host = document.createElement('div')
      host.innerHTML = svg
      document.body.append(host)
      const text = host.querySelector('text')
      const out = [0, 1].map((line) => {
        const index = line === 0 ? 0 : 6
        const p = text.getStartPositionOfChar(index)
        return [Math.round(p.x), Math.round(p.y)]
      })
      host.remove()
      return out
    }, exported)
    const inEditor = await page.evaluate(() => {
      const text = document.getElementById('t1')
      return [0, 6].map((index) => {
        const p = text.getStartPositionOfChar(index)
        return [Math.round(p.x), Math.round(p.y)]
      })
    })
    expect(places).toEqual(inEditor)
    expect(places[1][1] - places[0][1]).toBe(48)
  })
})
