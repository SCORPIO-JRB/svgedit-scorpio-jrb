import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Decisions of 8 November: clip paths follow their object, X and Y of a path
// alone without the stroke, one alignment menu, objects that look the same
// in the whole page, Ctrl+S to save.

async function loadDrawing (page, svg) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

async function settle (page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))))
  await page.waitForFunction(() => !window.svgEditor.topPanel.selectionFieldsPending)
}

async function select (page, ids) {
  await page.evaluate((ids) => {
    window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true)
  }, ids)
  await settle(page)
}

const attr = (page, id, name) => page.evaluate(({ id, name }) =>
  document.getElementById(id).getAttribute(name), { id, name })

const layers = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#svgcontent > g, #svgcontent > defs')].map((el) => el.outerHTML).join(''))

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

// Screen box of an element's shape: its box through its screen matrix.
// getBoundingClientRect cannot be used in Firefox: it gives a <use> the box
// of its viewport, and widens a clipped shape by half a pixel on each side.
// The function is passed to the page as text, so that it is written once.
const SCREEN_BOX = `(el) => {
  const b = el.getBBox()
  const m = el.getScreenCTM()
  const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
    .map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}`

const screenBoxes = (page, ids) => page.evaluate(({ ids, source }) => {
  const box = new Function(`return ${source}`)() // eslint-disable-line no-new-func
  return ids.map((id) => box(document.getElementById(id)))
}, { ids, source: SCREEN_BOX })

const close = (a, b) => Math.abs(a - b) < 0.5

const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  await visitAndApproveStorage(page)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

test.describe('Clip paths follow their object (decision 1)', () => {
  const CLIPPED = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <defs>
    <clipPath id="cp"><circle cx="140" cy="130" r="30"/></clipPath>
    <clipPath id="shared"><rect x="300" y="300" width="40" height="40"/></clipPath>
  </defs>
  <g class="layer"><title>Layer 1</title>
    <rect id="a" x="100" y="100" width="80" height="60" fill="#3a6" clip-path="url(#cp)"/>
    <rect id="b" x="300" y="100" width="80" height="60" fill="#36a"/>
    <rect id="s1" x="300" y="300" width="60" height="60" fill="#a63" clip-path="url(#shared)"/>
    <rect id="s2" x="300" y="300" width="60" height="60" fill="#963" clip-path="url(#shared)"/>
  </g>
</svg>`

  // Screen box of the clip of an element: its shape, through the clip's
  // transform and the element's own (the content of a clip path is not
  // drawn, so it is not measured on screen).
  const clippedBox = (page, id) => page.evaluate((id) => {
    const elem = document.getElementById(id)
    const clip = document.getElementById(elem.getAttribute('clip-path').slice(5, -1))
    const shape = clip.firstElementChild
    const n = (name) => Number(shape.getAttribute(name))
    const local = shape.tagName === 'circle'
      ? [[n('cx') - n('r'), n('cy') - n('r')], [n('cx') + n('r'), n('cy') + n('r')]]
      : [[n('x'), n('y')], [n('x') + n('width'), n('y') + n('height')]]
    const tlist = clip.transform.baseVal
    const own = tlist.numberOfItems ? tlist.consolidate().matrix : new DOMMatrix()
    const m = new DOMMatrix([...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => elem.getScreenCTM()[k])])
      .multiply(new DOMMatrix([own.a, own.b, own.c, own.d, own.e, own.f]))
    const corners = [[local[0][0], local[0][1]], [local[1][0], local[0][1]], [local[0][0], local[1][1]], [local[1][0], local[1][1]]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m))
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  }, id)

  test.beforeEach(async ({ page }) => {
    await loadDrawing(page, CLIPPED)
  })

  test('the clip moves, scales and flips with its object, in one undo step', async ({ page }) => {
    const before = await layers(page)
    const start = await clippedBox(page, 'a')
    await select(page, ['a'])
    await page.evaluate(() => window.svgEditor.svgCanvas.moveSelectedElements(20, 10))
    const moved = await clippedBox(page, 'a')
    expect(close(moved.x, start.x + 20) && close(moved.y, start.y + 10)).toBe(true)
    expect(await undoSize(page)).toBe(1)
    // Twice as large, from the top left corner of the object: the clip keeps
    // its place in the object, at twice the distance.
    const movedRect = (await screenBoxes(page, ['a']))[0]
    await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(2, 2, 120, 110))
    const scaled = await clippedBox(page, 'a')
    const rect = (await screenBoxes(page, ['a']))[0]
    expect(close(scaled.width, start.width * 2)).toBe(true)
    expect(close(scaled.x - rect.x, (moved.x - movedRect.x) * 2)).toBe(true)
    expect(close(scaled.y - rect.y, (moved.y - movedRect.y) * 2)).toBe(true)
    // A flip mirrors the clip inside the object.
    await page.evaluate(() => window.svgEditor.svgCanvas.flipSelectedElements(-1, 1))
    const flipped = await clippedBox(page, 'a')
    expect(close((rect.x + rect.width) - (flipped.x + flipped.width), scaled.x - rect.x)).toBe(true)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.undoMgr.undo()
      window.svgEditor.svgCanvas.undoMgr.undo()
    })
    expect(await layers(page)).toBe(before)
  })

  test('a resize by a grip, alone or with another object, takes the clip along', async ({ page }) => {
    for (const ids of [['a'], ['a', 'b']]) {
      await loadDrawing(page, CLIPPED)
      await select(page, ids)
      const start = await clippedBox(page, 'a')
      const rectStart = (await screenBoxes(page, ['a']))[0]
      const grip = await page.locator('#selectorGrip_resize_se').boundingBox()
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
      await page.mouse.down()
      await page.mouse.move(grip.x + grip.width / 2 + 60, grip.y + grip.height / 2 + 40, { steps: 5 })
      await page.mouse.up()
      const end = await clippedBox(page, 'a')
      const rectEnd = (await screenBoxes(page, ['a']))[0]
      const kx = rectEnd.width / rectStart.width
      // The clip keeps its place and its size relative to the object.
      expect(Math.abs(end.width - start.width * kx)).toBeLessThan(1)
      expect(Math.abs((end.x - rectEnd.x) - (start.x - rectStart.x) * kx)).toBeLessThan(1)
    }
  })

  test('a clip shared with another object is copied, so that the other keeps it', async ({ page }) => {
    await select(page, ['s1'])
    await page.evaluate(() => window.svgEditor.svgCanvas.moveSelectedElements(30, 0))
    expect(await attr(page, 's2', 'clip-path')).toBe('url(#shared)')
    expect(await attr(page, 's1', 'clip-path')).not.toBe('url(#shared)')
    expect(await attr(page, 'shared', 'transform')).toBeNull()
    const s1 = await clippedBox(page, 's1')
    const s2 = await clippedBox(page, 's2')
    expect(close(s1.x, s2.x + 30)).toBe(true)
    // Ids stay unique in the copy.
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#svgcontent [id]')].map((el) => el.id)
      return ids.filter((id, i) => ids.indexOf(id) !== i)
    })
    expect(duplicates).toEqual([])
  })
})

test.describe('X and Y of a path alone, without the stroke (decision 3)', () => {
  test('a group alone shows and moves the box without the stroke', async ({ page }) => {
    await loadDrawing(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <g id="grp"><rect id="g1" x="100" y="100" width="40" height="40" stroke="#000" stroke-width="10"/></g>
  </g>
</svg>`)
    await select(page, ['grp'])
    const field = (id) => page.locator(`#${id}`).evaluate((el) => el.value)
    expect(await field('selected_x')).toBe('100')
    expect(await field('selected_y')).toBe('100')
    const input = page.locator('#selected_y').locator('#input')
    await input.click()
    await input.press('Control+a')
    await input.pressSequentially('150')
    await input.press('Enter')
    await settle(page)
    const box = await page.evaluate(() => window.svgEditor.svgCanvas.getSelectionBox())
    expect(Math.round(box.y)).toBe(150)
    expect(Math.round(box.x)).toBe(100)
  })
})

test.describe('One alignment menu (decision 4)', () => {
  const ROW = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="40" height="40"/>
    <rect id="r2" x="200" y="130" width="40" height="60"/>
  </g>
</svg>`

  test.beforeEach(async ({ page }) => {
    await loadDrawing(page, ROW)
    await select(page, ['r1', 'r2'])
  })

  test('the bar fits one line at 1366 pixels, the menu opens and closes', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await settle(page)
    const rows = await page.evaluate(() => new Set([...document.getElementById('tools_top').children]
      .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 &&
        getComputedStyle(el).position !== 'absolute')
      .map((el) => Math.round(el.getBoundingClientRect().top))).size)
    expect(rows).toBe(1)
    const popup = page.locator('#tool_align_popup')
    await expect(popup).toBeHidden()
    await page.locator('#tool_align_menu').click()
    await expect(popup).toBeVisible()
    await expect(page.locator('#tool_align_menu')).toHaveAttribute('aria-expanded', 'true')
    await page.locator('#tool_align_left').click()
    expect(await attr(page, 'r2', 'x')).toBe('100')
    // It stays open for a second alignment, and closes on Escape.
    await page.locator('#tool_align_top').click()
    expect(await attr(page, 'r2', 'y')).toBe('100')
    await page.keyboard.press('Escape')
    await expect(popup).toBeHidden()
    // A click outside closes it too, without other effect.
    await page.locator('#tool_align_menu').click()
    await expect(popup).toBeVisible()
    await page.mouse.click(700, 20)
    await expect(popup).toBeHidden()
  })

  test('the keyboard opens the menu, presses its buttons and closes it', async ({ page }) => {
    await page.locator('#tool_align_menu').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#tool_align_popup')).toBeVisible()
    await expect(page.locator('#tool_align_left')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#tool_align_center')).toBeFocused()
    await page.keyboard.press('Enter')
    // Centres on the selection's centre: (100 + 240) / 2 = 170.
    expect(await attr(page, 'r1', 'x')).toBe('150')
    await page.keyboard.press('Escape')
    await expect(page.locator('#tool_align_popup')).toBeHidden()
    await expect(page.locator('#tool_align_menu')).toBeFocused()
  })

  test('the reference of the menu is used', async ({ page }) => {
    await page.locator('#tool_align_menu').click()
    await page.locator('#tool_align_relative').evaluate((el) => {
      el.value = 'page'
      el.dispatchEvent(new Event('change'))
    })
    await page.locator('#tool_align_right').click()
    expect(await attr(page, 'r1', 'x')).toBe('600')
    expect(await attr(page, 'r2', 'x')).toBe('600')
  })
})

test.describe('Objects that look the same, in the whole page (decision 5)', () => {
  const PAGE = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">
  <defs><symbol id="pump" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#39f" stroke="#000"/></symbol></defs>
  <g class="layer"><title>Layer 1</title>
    <use id="u1" xlink:href="#pump" x="40" y="40" width="40" height="40"/>
    <g id="G" transform="translate(150 20) scale(2)" fill="#f00" opacity="0.5">
      <use id="u2" xlink:href="#pump" x="10" y="10" width="20" height="20"/>
      <text id="lbl" x="10" y="45" font-size="8">P2</text>
    </g>
    <g id="R" transform="rotate(90 400 100)"><use id="u3" xlink:href="#pump" x="380" y="80" width="40" height="40"/></g>
    <g id="H" display="none"><use id="hidden" xlink:href="#pump" x="500" y="300" width="40" height="40"/></g>
  </g>
  <g class="layer"><title>Layer 2</title><use id="u4" xlink:href="#pump" x="40" y="300" width="40" height="40"/></g>
</svg>`
  const PUMPS = ['u1', 'u2', 'u3', 'u4']

  const selectPumps = (page) => page.evaluate(() => {
    const canvas = window.svgEditor.svgCanvas
    canvas.setCurrentLayer('Layer 1')
    canvas.selectOnly([document.getElementById('u1')], true)
    return canvas.selectSimilar('symbol').map((el) => el.id).sort()
  })

  const moves = (a, b) => a.map((box, i) => [Math.round(b[i].x - box.x), Math.round(b[i].y - box.y)])

  test.beforeEach(async ({ page }) => {
    await loadDrawing(page, PAGE)
  })

  test('takes the objects inside groups and in every visible layer', async ({ page }) => {
    expect(await selectPumps(page)).toEqual(PUMPS)
    // Each selection box surrounds its object, whatever its group does.
    const offsets = await page.evaluate((source) => {
      const screenBox = new Function(`return ${source}`)() // eslint-disable-line no-new-func
      return window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => {
        const r = screenBox(el)
        const box = screenBox(window.svgEditor.svgCanvas.selectorManager.requestSelector(el).selectorRect)
        return [Math.round(r.x - box.x), Math.round(r.width - box.width)]
      })
    }, SCREEN_BOX)
    offsets.forEach(([dx, dw]) => {
      expect(Math.abs(dx)).toBeLessThanOrEqual(2)
      expect(Math.abs(dw)).toBeLessThanOrEqual(4)
    })
  })

  test('arrows and a drag move every object by the same distance on screen', async ({ page }) => {
    await selectPumps(page)
    const start = await screenBoxes(page, PUMPS)
    await page.locator('body').press('Shift+ArrowRight')
    const arrowed = await screenBoxes(page, PUMPS)
    expect(moves(start, arrowed)).toEqual(PUMPS.map(() => [10, 0]))
    // A drag that starts on the object inside the scaled group.
    const from = (await screenBoxes(page, ['u2']))[0]
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2 + 20, { steps: 5 })
    await page.mouse.up()
    const dragged = await screenBoxes(page, PUMPS)
    expect(moves(arrowed, dragged)).toEqual(PUMPS.map(() => [30, 20]))
    expect((await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).length))).toBe(4)
  })

  test('align and flip work on the drawing, group keeps every look and place', async ({ page }) => {
    await selectPumps(page)
    const before = await layers(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.alignSelectedElements('l', 'selected'))
    const aligned = await screenBoxes(page, PUMPS)
    aligned.forEach((box) => expect(close(box.x, aligned[0].x)).toBe(true))
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await layers(page)).toBe(before)

    await selectPumps(page)
    const start = await screenBoxes(page, PUMPS)
    const left = Math.min(...start.map((b) => b.x))
    const right = Math.max(...start.map((b) => b.x + b.width))
    await page.evaluate(() => window.svgEditor.svgCanvas.flipSelectedElements(-1, 1))
    const flipped = await screenBoxes(page, PUMPS)
    flipped.forEach((box, i) => expect(close(box.x, left + right - (start[i].x + start[i].width))).toBe(true))
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())

    await selectPumps(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.groupSelectedElements())
    const grouped = await screenBoxes(page, PUMPS)
    grouped.forEach((box, i) => {
      expect(close(box.x, start[i].x) && close(box.y, start[i].y) && close(box.width, start[i].width)).toBe(true)
    })
    // The pump of the red, half transparent group keeps that look.
    expect(await attr(page, 'u2', 'fill')).toBe('#f00')
    expect(await attr(page, 'u2', 'opacity')).toBe('0.5')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await layers(page)).toBe(before)
  })

  test('a copy stays in the group of its object', async ({ page }) => {
    await selectPumps(page)
    const start = await screenBoxes(page, PUMPS)
    await page.evaluate(() => window.svgEditor.svgCanvas.cloneSelectedElements(0, 50))
    const copies = await page.evaluate((source) => {
      const screenBox = new Function(`return ${source}`)() // eslint-disable-line no-new-func
      return window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => {
        const { x, y, width } = screenBox(el)
        return { parent: el.parentNode.id || el.parentNode.querySelector('title')?.textContent, x, y, width }
      })
    }, SCREEN_BOX)
    expect(copies.map((c) => c.parent).sort()).toEqual(['G', 'Layer 1', 'Layer 2', 'R'])
    // Each copy is its original moved 50 down, at the same size.
    copies.forEach((copy) => {
      const original = start.find((b) => close(b.x, copy.x) && close(b.y + 50, copy.y))
      expect(original).toBeTruthy()
      expect(close(copy.width, original.width)).toBe(true)
    })
  })
})

test.describe('Ctrl+S saves (decision 9)', () => {
  test('Ctrl+S presses Save, S alone does not', async ({ page }) => {
    await loadDrawing(page, '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>L</title></g></svg>')
    await page.evaluate(() => {
      window.saveClicks = 0
      document.getElementById('tool_save').addEventListener('click', (e) => {
        window.saveClicks++
        e.stopImmediatePropagation()
      }, true)
    })
    await page.locator('body').press('s')
    expect(await page.evaluate(() => window.saveClicks)).toBe(0)
    await page.locator('body').press('Control+s')
    expect(await page.evaluate(() => window.saveClicks)).toBe(1)
  })
})
