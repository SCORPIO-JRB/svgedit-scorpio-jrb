import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

const waitForEditor = (page) => page.waitForFunction(
  () => window.svgEditor?.isReady === true && window.svgEditor.svgCanvas?.getMode?.(),
  null,
  { timeout: 20000 }
)

test.describe('Phase 0 security hardening', () => {
  test('S1: extPath cannot be set from the URL', async ({ page }) => {
    const externalRequests = []
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'evil.invalid') externalRequests.push(request.url())
    })

    await page.goto('/index.html?extPath=https://evil.invalid/x')
    await waitForEditor(page)

    const extPath = await page.evaluate(() => window.svgEditor.configObj.curConfig.extPath)
    expect(extPath).not.toContain('evil.invalid')
    expect(externalRequests).toEqual([])
  })

  test('S2: layer names are shown as text in the context breadcrumb', async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      const markup = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
        '<g class="layer"><title>Calque &lt;img src=x onerror="window.__phase0Xss=1"&gt;</title>' +
        '<g id="grp"><rect x="10" y="10" width="50" height="50"/></g></g></svg>'
      window.svgEditor.svgCanvas.setSvgString(markup)
      window.svgEditor.svgCanvas.setContext(document.getElementById('grp'))
    })

    const panel = page.locator('#cur_context_panel')
    await expect(panel).toContainText('<img src=x')
    await expect(panel).toContainText('grp')
    expect(await panel.locator('img').count()).toBe(0)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__phase0Xss)).toBeUndefined()
  })

  test('S3/S4: exported SVG keeps no javascript: link and no external CSS', async ({ page }) => {
    await visitAndApproveStorage(page)
    const exported = await page.evaluate(() => {
      const markup = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
        '<g class="layer"><title>Layer 1</title>' +
        '<a href="javascript:void(window.__phase0Link=1)"><rect id="r1" x="10" y="10" width="50" height="50"/></a>' +
        '<style>@import url(https://evil.invalid/a.css); rect{fill:url(https://evil.invalid/t)}</style>' +
        '</g></svg>'
      window.svgEditor.svgCanvas.setSvgString(markup)
      return window.svgEditor.svgCanvas.getSvgString()
    })

    expect(exported).not.toContain('javascript:')
    expect(exported).not.toContain('evil.invalid')
    expect(exported).toContain('id="r1"')
    expect(exported).toContain('rect{fill:none}')
  })

  test('S6: initTool from the URL cannot click elements outside the tools panel', async ({ page }) => {
    await page.goto('/index.html?initTool=wireframe')
    await waitForEditor(page)
    await page.waitForFunction(() => window.svgEditor.svgCanvas.getMode() === 'select')

    expect(await page.locator('#workarea.wireframe').count()).toBe(0)
  })

  test('initTool from the URL still selects a drawing tool', async ({ page }) => {
    await page.goto('/index.html?initTool=rect')
    await waitForEditor(page)
    await page.waitForFunction(() => window.svgEditor.svgCanvas.getMode() === 'rect', null, { timeout: 10000 })
  })

  test('the dimensions URL parameter cannot inject markup', async ({ page }) => {
    // The value was written as is into the markup of the canvas root
    const payload = '1"><img xmlns="http://www.w3.org/1999/xhtml" src="x" onerror="window.__dimensionsXss = 1"/>,1'
    await page.goto('/index.html?dimensions=' + encodeURIComponent(payload))
    await waitForEditor(page)

    expect(await page.evaluate(() => window.__dimensionsXss)).toBeUndefined()
    expect(await page.locator('#svgroot img').count()).toBe(0)
    expect(await page.evaluate(() => window.svgEditor.configObj.curConfig.dimensions)).toEqual([640, 480])
  })

  test('the dimensions URL parameter still sets the size of a new drawing', async ({ page }) => {
    await page.goto('/index.html?dimensions=800,600')
    await waitForEditor(page)

    expect(await page.evaluate(() => window.svgEditor.configObj.curConfig.dimensions)).toEqual([800, 600])
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getResolution())).toMatchObject({ w: 800, h: 600 })
  })

  test('an opened file cannot load an external resource through CSS', async ({ page }) => {
    const requests = []
    await page.route(/evil\.invalid/, (route) => {
      requests.push(route.request().url())
      route.abort()
    })
    await visitAndApproveStorage(page)

    const E = 'https://evil.invalid/'
    const rect = (attrs = '') => `<rect x="10" y="10" width="200" height="200" ${attrs}/>`
    const sheet = (css) => `<style>${css}</style>`
    // [what the file holds, where it holds it]: each one made a request
    // when the file was opened
    const drawings = [
      [sheet(`rect{mask-image:image-set("${E}a.png" 1x)}`), rect()],
      [sheet(`rect{mask-image:-webkit-image-set(/* ; */ "${E}b.png" 1x)}`), rect()],
      [sheet(`rect{mask-image:image-set("${E}c.png`), rect()],
      [sheet(`rect{mask-image:url(${E}d.png`), rect()],
      [sheet('rect{mask:none}'), rect(`style="mask:url(${E}e.png)"`)],
      ['', rect(`style="cursor:image-set('${E}f.png' 1x), auto"`)],
      ['', rect(`mask="image-set('${E}g.png' 1x)"`)],
      ['', rect(`mask="URL(${E}h.png)"`)],
      ['', rect(`mask="url(${E}i.png"`)],
      ['', rect(`mask="url(#m), url(${E}j.png)"`)],
      ['', rect(`fill=" url(${E}k.svg#a)"`)]
    ]
    for (const [defs, body] of drawings) {
      const saved = await page.evaluate((markup) => {
        window.svgEditor.svgCanvas.setSvgString(markup)
        window.svgEditor.updateCanvas()
        return window.svgEditor.svgCanvas.getSvgString()
      }, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">${defs}<g class="layer"><title>Layer 1</title>${body}</g></svg>`)
      // The time for a request to leave
      await page.waitForTimeout(250)
      expect(saved).not.toContain('evil.invalid')
      expect(saved).toContain('<rect')
    }
    expect(requests).toEqual([])
  })

  test('an opened file keeps its local references written with spaces', async ({ page }) => {
    await visitAndApproveStorage(page)
    const saved = await page.evaluate(() => {
      const markup = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
        '<defs><linearGradient id="grad"><stop offset="0" stop-color="#f00"/></linearGradient></defs>' +
        '<g class="layer"><title>Layer 1</title><rect id="r1" x="10" y="10" width="50" height="50" fill="url( #grad )"/></g></svg>'
      window.svgEditor.svgCanvas.setSvgString(markup)
      return window.svgEditor.svgCanvas.getSvgString()
    })

    expect(saved).toMatch(/fill="url\( ?#grad ?\)"/)
  })

  test('a library symbol goes through the import filter when it is inserted', async ({ page }) => {
    await visitAndApproveStorage(page)
    const saved = await page.evaluate(() => {
      const { svgCanvas } = window.svgEditor
      svgCanvas.insertSymbol({
        id: 'test-hostile',
        version: 1,
        name: 'Hostile',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        ports: [],
        body: '<circle cx="20" cy="20" r="18" onclick="window.__symbolXss = 1"/>' +
          '<script>window.__symbolXss = 1</script>' +
          '<a href="javascript:void(window.__symbolXss = 1)"><rect width="4" height="4"/></a>'
      }, { x: 300, y: 200 })
      return svgCanvas.getSvgString()
    })

    expect(saved).toContain('<symbol')
    expect(saved).toContain('<circle')
    expect(saved).not.toContain('onclick')
    expect(saved).not.toContain('<script')
    expect(saved).not.toContain('javascript:')
  })
})
