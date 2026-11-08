import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

/**
 * Importing an SVG file must never change the objects already in the drawing.
 * Files are dropped on the work area, as a user does.
 */

const NS = 'http://www.w3.org/2000/svg'
const fixture = (name) => fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/import/scorpio', name), 'utf8')
const BASE = `<svg width="640" height="480" xmlns="${NS}"><g class="layer"><title>Layer 1</title>` +
  '<rect id="exist" class="cls-1" x="10" y="10" width="100" height="50" fill="blue"/></g></svg>'

/** Lets the browser draw a few frames: time for an animation to apply. */
const frames = (page) => page.evaluate(() => new Promise((resolve) => {
  let count = 5
  const next = () => (--count ? requestAnimationFrame(next) : setTimeout(resolve, 50))
  requestAnimationFrame(next)
}))
const openDrawing = (page, markup) => page.evaluate((markup) => window.svgEditor.svgCanvas.setSvgString(markup), markup)

/**
 * What a user can see of some objects: markup, box in the drawing (not on
 * the screen, which scrolls) and paint.
 */
const snapshot = (page, ids) => page.evaluate((ids) => ids.map((id) => {
  const elem = document.getElementById(id)
  const box = elem.getBBox()
  const style = getComputedStyle(elem)
  return {
    markup: elem.outerHTML,
    box: [box.x, box.y, box.width, box.height].map(Math.round),
    paint: [style.fill, style.stroke, style.opacity, style.visibility]
  }
}), ids)

/**
 * Defines window.drawnBox(elem): the box of an object on the screen, from its
 * own geometry. Firefox counts in getBoundingClientRect() of a <use> the
 * viewport of its symbol, scaled a second time by the view box: a symbol of
 * 200 mm with a view box 200 wide measured 2 857 px instead of 756, while the
 * drawing was right.
 */
const installDrawnBox = (page) => page.evaluate(() => {
  window.drawnBox = (elem) => {
    if (elem.tagName !== 'use') return elem.getBoundingClientRect()
    const box = elem.getBBox()
    const matrix = elem.getScreenCTM()
    const points = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix))
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const left = Math.min(...xs)
    const top = Math.min(...ys)
    return { left, top, right: Math.max(...xs), bottom: Math.max(...ys), width: Math.max(...xs) - left, height: Math.max(...ys) - top }
  }
})

/** Drops a file on the work area, as the user does from the file explorer. */
const dropFile = (page, name, text) => page.evaluate(({ name, text }) => {
  const data = new DataTransfer()
  data.items.add(new File([text], name, { type: 'image/svg+xml' }))
  document.getElementById('workarea').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
}, { name, text })

/** Drops a file and waits for the imported <use>. */
const importFile = async (page, name, text) => {
  const before = await page.evaluate(() => document.querySelectorAll('#svgcontent g.layer use').length)
  await dropFile(page, name, text)
  await page.waitForFunction((before) => document.querySelectorAll('#svgcontent g.layer use').length > before, before)
  return page.evaluate(() => {
    const uses = document.querySelectorAll('#svgcontent g.layer use')
    return uses[uses.length - 1].id
  })
}

test.describe('SVG import: integrity of the drawing', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await openDrawing(page, BASE)
  })

  test('a file that cannot be imported changes nothing and says so', async ({ page }) => {
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('exist')])
    })
    const before = await snapshot(page, ['exist'])
    const alerts = await page.evaluate(() => document.querySelectorAll('se-elix-alert-dialog').length)

    await dropFile(page, 'casse.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="5"')
    await page.waitForFunction((alerts) => document.querySelectorAll('se-elix-alert-dialog').length > alerts, alerts)

    const message = await page.evaluate(() => [...document.querySelectorAll('se-elix-alert-dialog')].pop().textContent)
    expect(message).toContain('casse.svg')
    expect(await snapshot(page, ['exist'])).toEqual(before)
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent use, #svgcontent symbol').length)).toBe(0)
  })

  test('an imported SCorp-io representation keeps its binding and its hidden parts', async ({ page }) => {
    const before = await snapshot(page, ['exist'])
    const useId = await importFile(page, 'repr-temp.svg', fixture('repr-temp.svg'))

    const result = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const symbol = document.getElementById(canvas.getHref(document.getElementById(useId)).slice(1))
      const hidden = symbol.querySelector('[visibility]')
      return {
        scorpIds: symbol.querySelectorAll('[scorp_id]').length + (symbol.hasAttribute('scorp_id') ? 1 : 0),
        hidden: hidden && getComputedStyle(hidden).visibility
      }
    }, useId)
    expect(result).toEqual({ scorpIds: 4, hidden: 'hidden' })
    expect(await snapshot(page, ['exist'])).toEqual(before)
  })

  test('select all never selects a <defs>, which kept the moves as useless transforms', async ({ page }) => {
    await openDrawing(page, fixture('repr-pompe.svg'))
    const result = await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectAllInCurrentLayer()
      const selected = canvas.getSelectedElements().filter(Boolean).map((elem) => elem.localName)
      canvas.moveSelectedElements(10, 10)
      return { selected, defsTransform: document.querySelector('#svgcontent g.layer defs').getAttribute('transform') }
    })
    expect(result.selected).not.toContain('defs')
    expect(result.selected.length).toBeGreaterThan(0)
    expect(result.defsTransform).toBeNull()
  })

  test('an imported file is centered on the page, and one undo removes it', async ({ page }) => {
    const before = await snapshot(page, ['exist'])
    const useId = await importFile(page, 'repr-temp.svg', fixture('repr-temp.svg'))
    const center = () => page.evaluate((useId) => {
      const box = window.svgEditor.svgCanvas.getStrokedBBox([document.getElementById(useId)])
      return [box.x + box.width / 2, box.y + box.height / 2].map(Math.round)
    }, useId)
    const imported = () => page.evaluate(() => document.querySelectorAll('#svgcontent use, #svgcontent symbol').length)
    expect(await center()).toEqual([320, 240])

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await imported()).toBe(0)
    expect(await snapshot(page, ['exist'])).toEqual(before)

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await imported()).toBe(2)
    expect(await center()).toEqual([320, 240])
  })

  test('a SCorp-io synoptic opens and saves without any visible change', async ({ page }) => {
    const source = fixture('synoptique-chaufferie.svg')
    await openDrawing(page, source)
    const result = await page.evaluate(async (source) => {
      const saved = window.svgEditor.svgCanvas.getSvgString()
      const pixels = (text) => new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 960
          canvas.height = 540
          const context = canvas.getContext('2d')
          context.drawImage(img, 0, 0, 960, 540)
          resolve(context.getImageData(0, 0, 960, 540).data)
        }
        img.onerror = reject
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)
      })
      const [a, b] = await Promise.all([pixels(source), pixels(saved)])
      let differ = 0
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) differ++
      }
      const doc = new DOMParser().parseFromString(saved, 'image/svg+xml')
      return {
        differ,
        // the texts the platform writes the live values into, by id
        measures: doc.querySelectorAll('[id^="mesure-"], [id^="synthese-"], [id^="etat-"]').length,
        rootClass: doc.documentElement.getAttribute('class')
      }
    }, source)
    expect(result).toEqual({ differ: 0, measures: 30, rootClass: 'synoptique' })
  })

  test('identifiers that are free in the drawing are kept', async ({ page }) => {
    const useId = await importFile(page, 'ids.svg', `<svg xmlns="${NS}" width="10" height="10"><rect id="pompe_1" width="5" height="5"/></svg>`)
    const kept = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const symbol = document.getElementById(canvas.getHref(document.getElementById(useId)).slice(1))
      return Boolean(symbol.querySelector('#pompe_1'))
    }, useId)
    expect(kept).toBe(true)
  })

  test('an imported synoptic keeps the identifiers of its live values, and its hidden measures', async ({ page }) => {
    const useId = await importFile(page, 'synoptique-chaufferie.svg', fixture('synoptique-chaufferie.svg'))
    const result = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const symbol = document.getElementById(canvas.getHref(document.getElementById(useId)).slice(1))
      const detail = symbol.querySelector('#mesures-detail')
      return {
        measures: symbol.querySelectorAll('[id^="mesure-"], [id^="synthese-"], [id^="etat-"]').length,
        detail: detail && getComputedStyle(detail).display
      }
    }, useId)
    expect(result).toEqual({ measures: 30, detail: 'none' })
  })

  test('a synoptic imported twice: the first copy keeps its identifiers, the hidden measures stay hidden in both', async ({ page }) => {
    const first = await importFile(page, 'synoptique-chaufferie.svg', fixture('synoptique-chaufferie.svg'))
    const second = await importFile(page, 'synoptique-chaufferie.svg', fixture('synoptique-chaufferie.svg'))
    const result = await page.evaluate((uses) => {
      const canvas = window.svgEditor.svgCanvas
      const symbols = uses.map((id) => document.getElementById(canvas.getHref(document.getElementById(id)).slice(1)))
      const ids = [...document.querySelectorAll('#svgcontent [id]')].map((elem) => elem.id)
      return {
        twoSymbols: symbols[0] !== symbols[1],
        firstKeeps: Boolean(symbols[0].querySelector('#mesure-depart-constant')),
        // the detail group: parent of the measures of the valves
        hidden: symbols.map((symbol) => getComputedStyle(symbol.querySelector('[class~="mesure-detail"]').parentNode).display),
        duplicates: ids.length - new Set(ids).size
      }
    }, [first, second])
    expect(result).toEqual({ twoSymbols: true, firstKeeps: true, hidden: ['none', 'none'], duplicates: 0 })
  })

  // Defects fixed by the next lots of the plan

  test('a stylesheet in the imported file does not repaint the drawing', async ({ page }) => {
    const before = await snapshot(page, ['exist'])
    await importFile(page, 'style.svg', `<svg xmlns="${NS}" width="10" height="10"><style>rect{fill:red} .cls-1{fill:#f0f}</style><rect class="cls-1" width="5" height="5"/></svg>`)
    expect(await snapshot(page, ['exist'])).toEqual(before)
  })

  test('the style attribute keeps priority over the class rules', async ({ page }) => {
    const useId = await importFile(page, 'cascade.svg', `<svg xmlns="${NS}" width="10" height="10"><style>.a{fill:red}</style><rect class="a" style="fill:blue" width="5" height="5"/></svg>`)
    const fill = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const symbol = document.getElementById(canvas.getHref(document.getElementById(useId)).slice(1))
      return getComputedStyle(symbol.querySelector('rect')).fill
    }, useId)
    expect(fill).toBe('rgb(0, 0, 255)')
  })

  test('an imported file takes the size it declares, before and after ungrouping', async ({ page }) => {
    const useId = await importFile(page, 'mm.svg', `<svg xmlns="${NS}" width="200mm" height="100mm" viewBox="0 0 200 100"><rect width="200" height="100" fill="orange"/></svg>`)
    await installDrawnBox(page)
    const result = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const zoom = canvas.getZoom()
      const use = document.getElementById(useId)
      const shown = window.drawnBox(use).width / zoom
      canvas.selectOnly([use])
      canvas.ungroupSelectedElement()
      const ungrouped = document.querySelector('#svgcontent g.layer rect[fill="orange"]').getBoundingClientRect().width / zoom
      return { shown: Math.round(shown), ungrouped: Math.round(ungrouped) }
    }, useId)
    // 200 mm = 755.9 px
    expect(result).toEqual({ shown: 756, ungrouped: 756 })
  })

  test('a file that declares only a viewBox is imported at that size', async ({ page }) => {
    const useId = await importFile(page, 'synoptique-chaufferie.svg', fixture('synoptique-chaufferie.svg'))
    const width = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      return Math.round(document.getElementById(useId).getBoundingClientRect().width / canvas.getZoom())
    }, useId)
    expect(width).toBe(1920)
  })

  test('the stylesheet of an imported synoptic does not repaint the drawing', async ({ page }) => {
    await openDrawing(page, `<svg width="640" height="480" xmlns="${NS}"><g class="layer"><title>Layer 1</title>` +
      '<rect id="exist" class="fond" x="10" y="10" width="100" height="50" fill="blue"/>' +
      '<text id="exist_text" class="titre" x="10" y="100" font-size="20" fill="black">Existant</text></g></svg>')
    const before = await snapshot(page, ['exist', 'exist_text'])
    await importFile(page, 'synoptique-chaufferie.svg', fixture('synoptique-chaufferie.svg'))
    expect(await snapshot(page, ['exist', 'exist_text'])).toEqual(before)
  })

  test('ungrouping an imported synoptic keeps its look and its live identifiers, and says which styles it removed', async ({ page }) => {
    await openDrawing(page, `<svg width="640" height="480" xmlns="${NS}"><g class="layer"><title>Layer 1</title>` +
      '<rect id="exist" class="fond" x="10" y="10" width="100" height="50" fill="blue"/></g></svg>')
    const before = await snapshot(page, ['exist'])
    const useId = await importFile(page, 'synoptique-chaufferie.svg', fixture('synoptique-chaufferie.svg'))
    const look = () => page.evaluate(() => {
      const paint = (elem) => {
        const style = getComputedStyle(elem)
        return [style.fill, style.stroke, style.fontFamily, style.fontSize, style.fontWeight]
      }
      return {
        band: paint(document.querySelector('#bandeau rect')),
        value: paint(document.getElementById('synthese-temperature-exterieure')),
        boiler: paint(document.querySelector('#chaudiere-1 .corps')),
        hidden: getComputedStyle(document.getElementById('mesures-detail')).display,
        live: document.querySelectorAll('#svgcontent [id^="mesure-"], #svgcontent [id^="synthese-"], #svgcontent [id^="etat-"]').length
      }
    })
    const imported = await look()
    const alerts = await page.evaluate(() => document.querySelectorAll('se-elix-alert-dialog').length)

    await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById(useId)])
      canvas.ungroupSelectedElement()
    }, useId)
    await page.waitForFunction((alerts) => document.querySelectorAll('se-elix-alert-dialog').length > alerts, alerts)

    expect(await look()).toEqual(imported)
    expect(imported.live).toBe(30)
    expect(imported.hidden).toBe('none')
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent style, #svgcontent symbol, #svgcontent use').length)).toBe(0)
    const message = await page.evaluate(() => [...document.querySelectorAll('se-elix-alert-dialog')].pop().textContent)
    expect(message).toContain('@keyframes flux')
    expect(message).toContain('font-variant-numeric')
    expect(await snapshot(page, ['exist'])).toEqual(before)
  })

  test('a drawing saved with an earlier import ungroups at the same place and size', async ({ page }) => {
    const drawings = [
      // A file in millimetres, scaled by the import of the time
      `<svg xmlns="${NS}" width="640" height="480"><defs><symbol id="s1" width="200mm" height="100mm" viewBox="0 0 200 100">` +
        '<rect fill="orange" width="200" height="100"/></symbol></defs>' +
        '<g class="layer"><title>L</title><use id="u1" href="#s1" transform="translate(0) scale(0.8) translate(0)"/></g></svg>',
      // A view box that does not start at 0, then moved
      `<svg xmlns="${NS}" width="640" height="480"><defs><symbol id="s2" viewBox="50 20 1920 1080">` +
        '<rect fill="orange" x="50" y="20" width="1920" height="1080"/></symbol></defs>' +
        '<g class="layer"><title>L</title><use id="u2" href="#s2" transform="translate(30,40) scale(0.5)"/></g></svg>',
      // A size given to the <use>, without keeping the proportions
      `<svg xmlns="${NS}" width="640" height="480"><defs><symbol id="s3" viewBox="0 0 100 100" preserveAspectRatio="none">` +
        '<rect fill="orange" width="100" height="100"/></symbol></defs>' +
        '<g class="layer"><title>L</title><use id="u3" href="#s3" x="10" y="20" width="300" height="100"/></g></svg>'
    ]
    const box = (selector) => page.evaluate((selector) => {
      const zoom = window.svgEditor.svgCanvas.getZoom()
      const rects = [...document.querySelectorAll(selector)].map((elem) => window.drawnBox(elem))
      const left = Math.min(...rects.map((r) => r.left))
      const top = Math.min(...rects.map((r) => r.top))
      return [left, top, Math.max(...rects.map((r) => r.right)) - left, Math.max(...rects.map((r) => r.bottom)) - top]
        .map((n) => Math.round(n / zoom))
    }, selector)
    for (const drawing of drawings) {
      await openDrawing(page, drawing)
      await installDrawnBox(page)
      const before = await box('#svgcontent g.layer use')
      await page.evaluate(() => {
        const canvas = window.svgEditor.svgCanvas
        canvas.selectOnly([document.querySelector('#svgcontent g.layer use')])
        canvas.ungroupSelectedElement()
      })
      expect(await box('#svgcontent g.layer > rect')).toEqual(before)
    }
  })

  test('a file imported into a turned group keeps its own look', async ({ page }) => {
    await openDrawing(page, `<svg xmlns="${NS}" width="640" height="480"><g class="layer"><title>L</title>` +
      '<g id="turned" transform="rotate(30 100 100) scale(2)"><rect width="20" height="20" fill="green"/></g></g></svg>')
    await page.evaluate(() => window.svgEditor.svgCanvas.setContext(document.getElementById('turned')))
    const useId = await importFile(page, 'plain.svg', `<svg xmlns="${NS}" width="100" height="50"><rect width="100" height="50" fill="orange"/></svg>`)
    const result = await page.evaluate((useId) => {
      const use = document.getElementById(useId)
      const zoom = window.svgEditor.svgCanvas.getZoom()
      const rect = use.getBoundingClientRect()
      return { group: use.parentNode.id, size: [rect.width / zoom, rect.height / zoom].map(Math.round) }
    }, useId)
    expect(result).toEqual({ group: 'turned', size: [100, 50] })
  })

  test('a synoptic keeps the id and the accessibility attributes of its root', async ({ page }) => {
    await openDrawing(page, fixture('synoptique-chaufferie.svg'))
    const root = await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.svgEditor.svgCanvas.getSvgString(), 'image/svg+xml')
      return ['id', 'role', 'aria-labelledby'].map((name) => doc.documentElement.getAttribute(name))
    })
    expect(root).toEqual(['synoptique-chaufferie', 'img', 'titre-synoptique desc-synoptique'])
  })

  test('SVG animations are kept, and do not play in the editor', async ({ page }) => {
    const useId = await importFile(page, 'anim.svg', `<svg xmlns="${NS}" width="10" height="10"><rect width="5" height="5">` +
      '<animate attributeName="opacity" from="1" to="0" dur="1s" repeatCount="indefinite"/><set attributeName="width" to="10"/></rect></svg>')
    await frames(page)
    const imported = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const use = document.getElementById(useId)
      const symbol = document.getElementById(canvas.getHref(use).slice(1))
      return [symbol.querySelectorAll('animate, set').length, use.getBBox().width]
    }, useId)
    // The <set> would make the rect 10 wide
    expect(imported).toEqual([2, 5])
  })

  test('the animations of an opened drawing do not play in the editor, and play in the saved file', async ({ page }) => {
    await openDrawing(page, `<svg xmlns="${NS}" width="640" height="480"><g class="layer"><title>L</title>` +
      '<rect id="grows" width="10" height="10" fill="green"><set attributeName="width" to="50" fill="freeze"/></rect>' +
      '<rect id="clicked" x="100" y="100" width="40" height="40" fill="blue"><set attributeName="width" to="80" begin="clicked.click"/></rect></g></svg>')
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.setZoom(1)
      window.svgEditor.updateCanvas()
    })
    // A click to select the rect does not start its animation
    const box = await page.locator('#clicked').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await frames(page)
    const widths = await page.evaluate(() => ['grows', 'clicked'].map((id) => {
      const rect = document.getElementById(id)
      return [rect.width.animVal.value, rect.getBBox().width]
    }))
    expect(widths).toEqual([[10, 10], [40, 40]])
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements()[0]?.id)).toBe('clicked')

    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toContain('<set attributeName="width" to="50" fill="freeze"/>')
    expect(saved).not.toContain('requiredExtensions')
    await page.evaluate((saved) => {
      const played = document.createElement('div')
      played.id = 'played'
      played.innerHTML = saved
      document.body.append(played)
    }, saved)
    await page.waitForFunction(() => document.querySelector('#played [id="grows"]').width.animVal.value === 50)
  })

  test('an import says in one message all it removed, and keeps the rest', async ({ page }) => {
    const before = await snapshot(page, ['exist'])
    const alerts = await page.evaluate(() => document.querySelectorAll('se-elix-alert-dialog').length)
    const useId = await importFile(page, 'mixte.svg', `<svg xmlns="${NS}" width="20" height="20"><script>alert(1)</script>` +
      '<style>body { margin: 0 } .p { fill: orange }</style>' +
      '<animate href="#exist" attributeName="fill" to="red"/>' +
      '<rect class="p" width="20" height="20" onclick="alert(2)"><animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite"/></rect></svg>')
    await page.waitForFunction((alerts) => document.querySelectorAll('se-elix-alert-dialog').length > alerts, alerts)

    const message = await page.evaluate(() => [...document.querySelectorAll('se-elix-alert-dialog')].pop().textContent)
    for (const item of ['onclick', '<script>', '<animate href="#exist">', 'body']) expect(message).toContain(item)
    // One message only
    expect(await page.evaluate(() => document.querySelectorAll('se-elix-alert-dialog').length)).toBe(alerts + 1)
    const kept = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const symbol = document.getElementById(canvas.getHref(document.getElementById(useId)).slice(1))
      return [symbol.querySelectorAll('rect animate').length, symbol.querySelectorAll('script, [onclick]').length]
    }, useId)
    expect(kept).toEqual([1, 0])
    expect(await snapshot(page, ['exist'])).toEqual(before)
  })
})
