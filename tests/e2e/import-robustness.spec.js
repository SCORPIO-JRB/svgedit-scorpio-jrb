import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

/**
 * Importing an SVG file must never change the objects already in the drawing.
 * Files are dropped on the work area, as a user does. The tests marked
 * `test.fail` describe defects that later lots of the import plan fix: they
 * are expected to fail until then.
 */

const NS = 'http://www.w3.org/2000/svg'
const fixture = (name) => fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/import/scorpio', name), 'utf8')
const BASE = `<svg width="640" height="480" xmlns="${NS}"><g class="layer"><title>Layer 1</title>` +
  '<rect id="exist" class="cls-1" x="10" y="10" width="100" height="50" fill="blue"/></g></svg>'

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
      // The saved root has width and height instead of the viewBox (see lot 5
      // below), which alone moves a few pixels of antialiasing: the drawing
      // is compared under the same root.
      const sameRoot = (text) => {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
        doc.documentElement.removeAttribute('width')
        doc.documentElement.removeAttribute('height')
        doc.documentElement.setAttribute('viewBox', '0 0 1920 1080')
        return new XMLSerializer().serializeToString(doc)
      }
      const [a, b] = await Promise.all([pixels(source), pixels(sameRoot(saved))])
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

  test('a stylesheet in the imported file does not repaint the drawing (lot 4)', async ({ page }) => {
    test.fail(true, 'The <style> of the imported file still applies to the whole drawing')
    const before = await snapshot(page, ['exist'])
    await importFile(page, 'style.svg', `<svg xmlns="${NS}" width="10" height="10"><style>rect{fill:red} .cls-1{fill:#f0f}</style><rect class="cls-1" width="5" height="5"/></svg>`)
    expect(await snapshot(page, ['exist'])).toEqual(before)
  })

  test('the style attribute keeps priority over the class rules (lot 4)', async ({ page }) => {
    test.fail(true, 'The style attribute is turned into attributes that class rules override')
    const useId = await importFile(page, 'cascade.svg', `<svg xmlns="${NS}" width="10" height="10"><style>.a{fill:red}</style><rect class="a" style="fill:blue" width="5" height="5"/></svg>`)
    const fill = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const symbol = document.getElementById(canvas.getHref(document.getElementById(useId)).slice(1))
      return getComputedStyle(symbol.querySelector('rect')).fill
    }, useId)
    expect(fill).toBe('rgb(0, 0, 255)')
  })

  test('an imported file takes the size it declares, before and after ungrouping (lot 4)', async ({ page }) => {
    test.fail(true, 'The import is scaled to a third of the canvas, and the size changes when ungrouped')
    const useId = await importFile(page, 'mm.svg', `<svg xmlns="${NS}" width="200mm" height="100mm" viewBox="0 0 200 100"><rect width="200" height="100" fill="orange"/></svg>`)
    const result = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const zoom = canvas.getZoom()
      const use = document.getElementById(useId)
      const shown = use.getBoundingClientRect().width / zoom
      canvas.selectOnly([use])
      canvas.ungroupSelectedElement()
      const ungrouped = document.querySelector('#svgcontent g.layer rect[fill="orange"]').getBoundingClientRect().width / zoom
      return { shown: Math.round(shown), ungrouped: Math.round(ungrouped) }
    }, useId)
    // 200 mm = 755.9 px
    expect(result).toEqual({ shown: 756, ungrouped: 756 })
  })

  test('a file that declares only a viewBox is imported at that size (lot 4)', async ({ page }) => {
    test.fail(true, 'The import is scaled for the canvas, then shrunk again: 53 px wide instead of 1920')
    const useId = await importFile(page, 'synoptique-chaufferie.svg', fixture('synoptique-chaufferie.svg'))
    const width = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      return Math.round(document.getElementById(useId).getBoundingClientRect().width / canvas.getZoom())
    }, useId)
    expect(width).toBe(1920)
  })

  test('the stylesheet of an imported synoptic does not repaint the drawing (lot 4)', async ({ page }) => {
    test.fail(true, 'The .fond and .titre rules of the file repaint the objects of the drawing that have these classes')
    await openDrawing(page, `<svg width="640" height="480" xmlns="${NS}"><g class="layer"><title>Layer 1</title>` +
      '<rect id="exist" class="fond" x="10" y="10" width="100" height="50" fill="blue"/>' +
      '<text id="exist_text" class="titre" x="10" y="100" font-size="20" fill="black">Existant</text></g></svg>')
    const before = await snapshot(page, ['exist', 'exist_text'])
    await importFile(page, 'synoptique-chaufferie.svg', fixture('synoptique-chaufferie.svg'))
    expect(await snapshot(page, ['exist', 'exist_text'])).toEqual(before)
  })

  test('a synoptic keeps the id and the accessibility attributes of its root (lot 5)', async ({ page }) => {
    test.fail(true, 'The root is saved without its id, role and aria-labelledby')
    await openDrawing(page, fixture('synoptique-chaufferie.svg'))
    const root = await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.svgEditor.svgCanvas.getSvgString(), 'image/svg+xml')
      return ['id', 'role', 'aria-labelledby'].map((name) => doc.documentElement.getAttribute(name))
    })
    expect(root).toEqual(['synoptique-chaufferie', 'img', 'titre-synoptique desc-synoptique'])
  })

  test('SVG animations are kept (lot 5)', async ({ page }) => {
    test.fail(true, 'Animation elements are removed by the import filter')
    const useId = await importFile(page, 'anim.svg', `<svg xmlns="${NS}" width="10" height="10"><rect width="5" height="5"><animate attributeName="opacity" from="1" to="0" dur="1s" repeatCount="indefinite"/></rect></svg>`)
    const count = await page.evaluate((useId) => {
      const canvas = window.svgEditor.svgCanvas
      const symbol = document.getElementById(canvas.getHref(document.getElementById(useId)).slice(1))
      return symbol.querySelectorAll('animate').length
    }, useId)
    expect(count).toBe(1)
  })
})
