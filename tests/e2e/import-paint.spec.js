import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

/**
 * The panel shows the fill, the stroke and the stroke width of the shapes of
 * an import, whatever way the file writes them (9 November: a floor plan
 * whose rooms are filled with rgba(255, 255, 255, .1) showed opaque white,
 * once ungrouped).
 */

const NS = 'http://www.w3.org/2000/svg'
// As the floor plan: a stylesheet with colours carrying their alpha, and the
// other ways a file writes a colour or a width.
const FILE = `<svg xmlns="${NS}" viewBox="0 0 800 200"><defs><style>` +
  '.room{fill:rgba(255,255,255,.1);stroke:#fff;stroke-miterlimit:10}.wall{fill:none;stroke:#fff;stroke-width:5px}</style></defs>' +
  '<rect id="room" class="room" x="10" y="10" width="100" height="100"/>' +
  '<rect id="wall" class="wall" x="130" y="10" width="100" height="100"/>' +
  '<rect id="halved" x="250" y="10" width="100" height="100" fill="rgba(0, 0, 255, .3)" fill-opacity=".5" stroke="rgba(255, 255, 255, 0)"/>' +
  '<rect id="styled" x="370" y="10" width="100" height="100" style="fill:#00ff0080;stroke:rgb(0 0 0 / 40%);stroke-width:2.5"/>' +
  '<rect id="current" x="490" y="10" width="100" height="100" color="purple" fill="currentColor" stroke="hsla(120, 100%, 25%, .25)"/>' +
  '<g fill="rgba(10, 20, 30, .6)" stroke="orange" stroke-width="3px"><rect id="inherits" x="610" y="10" width="100" height="100"/></g>' +
  '</svg>'

/** Drops the file on the work area, as the user does, then ungroups it. */
const importAndUngroup = async (page) => {
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.items.add(new File([text], 'plan.svg', { type: 'image/svg+xml' }))
    document.getElementById('workarea').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  }, FILE)
  await page.waitForFunction(() => document.querySelector('#svgcontent g.layer use'))
  await page.evaluate(() => {
    const canvas = window.svgEditor.svgCanvas
    canvas.selectOnly([document.querySelector('#svgcontent g.layer use')])
    canvas.ungroupSelectedElement()
  })
}

/** Selects a shape, as a click on it does, and reads the panel. */
const shown = async (page, id) => {
  await page.evaluate((id) => {
    const canvas = window.svgEditor.svgCanvas
    canvas.clearSelection()
    canvas.selectOnly([document.getElementById(id)])
  }, id)
  return page.evaluate(() => {
    const paint = (id) => {
      const field = document.getElementById(id)
      return `${field.$value.textContent} ${field.$alpha.textContent}`.replace(/\s+/g, ' ').trim()
    }
    return { fill: paint('fill_color'), stroke: paint('stroke_color'), width: document.getElementById('stroke_width').value }
  })
}

test.describe('Paint of an imported shape', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('the panel shows the colours with their transparency, and the widths as numbers', async ({ page }) => {
    await importAndUngroup(page)
    expect(await shown(page, 'room')).toEqual({ fill: 'FFFFFF 10 %', stroke: 'FFFFFF 100 %', width: '1' })
    expect(await shown(page, 'wall')).toEqual({ fill: 'None', stroke: 'FFFFFF 100 %', width: '5' })
    expect(await shown(page, 'halved')).toEqual({ fill: '0000FF 15 %', stroke: 'FFFFFF 0 %', width: '1' })
    expect(await shown(page, 'styled')).toEqual({ fill: '00FF00 50 %', stroke: '000000 40 %', width: '2.5' })
    expect(await shown(page, 'current')).toEqual({ fill: '800080 100 %', stroke: '008000 25 %', width: '1' })
    // Inside the group the first ungrouping leaves, it is drawn with the
    // paint of the group.
    expect(await shown(page, 'inherits')).toEqual({ fill: '0A141E 60 %', stroke: 'FFA500 100 %', width: '3' })
    // The <defs> that held the stylesheet does not stay in the layer.
    expect(await page.locator('#svgcontent g.layer defs').count()).toBe(0)
  })

  test('a new colour keeps the transparency shown', async ({ page }) => {
    await importAndUngroup(page)
    await shown(page, 'room')
    await page.evaluate(() => {
      const box = document.getElementById('fill_color').paintBox
      const Paint = box.paint.constructor
      window.svgEditor.bottomPanel.handleColorPicker('fill', { detail: { paint: new Paint({ solidColor: 'ff0000', alpha: box.paint.alpha }) } })
    })
    const drawn = await page.evaluate(() => {
      const style = getComputedStyle(document.getElementById('room'))
      return [style.fill, Number(style.fillOpacity)]
    })
    expect(drawn).toEqual(['rgb(255, 0, 0)', 0.1])
    expect((await shown(page, 'room')).fill).toBe('FF0000 10 %')
  })
})
