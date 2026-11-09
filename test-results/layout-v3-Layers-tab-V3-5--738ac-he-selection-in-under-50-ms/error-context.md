# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: layout-v3.spec.js >> Layers tab (V3) >> 5 000 objects: the tree scrolls and follows the selection in under 50 ms
- Location: tests/e2e/layout-v3.spec.js:486:7

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 50
Received:   69.8999999994412
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic "Document menu" [ref=e7]:
      - button "untitled.svg" [ref=e9]:
        - generic [ref=e11]: untitled.svg
    - generic:
      - status
    - generic [ref=e14]:
      - button "Export" [ref=e15] [cursor=pointer]:
        - generic [ref=e16]: Export
      - button "Save" [ref=e19] [cursor=pointer]
  - generic [ref=e20]:
    - img [ref=e23]:
      - img
      - img [ref=e24]:
        - generic "Layer 1" [ref=e25]
    - toolbar "View" [ref=e5040]:
      - button "Preview" [ref=e5041] [cursor=pointer]
      - button "Hide the panel (Ctrl+\\)" [pressed] [ref=e5044] [cursor=pointer]
      - button "Zoom" [ref=e5047] [cursor=pointer]:
        - generic [ref=e5048]: 100 %
    - toolbar "Selected shape":
      - generic [ref=e5051] [cursor=pointer]:
        - button "Fill" [ref=e5052]:
          - generic [ref=e5053]:
            - generic "Change xxx color"
            - img [ref=e5055]
        - generic [ref=e5057]: Fill
      - generic [ref=e5058] [cursor=pointer]:
        - button "Stroke" [ref=e5059]:
          - generic [ref=e5060]:
            - generic "Change xxx color"
            - img [ref=e5062]
        - generic [ref=e5064]: Stroke
      - generic "properties.stroke_width" [ref=e5065]:
        - generic "Change stroke width by 1, shift-click to change by 0.1" [ref=e5066]:
          - textbox [ref=e5071]: "1"
      - generic "properties.corner_radius" [ref=e5072]:
        - generic "Change Rectangle Corner Radius" [ref=e5073]:
          - textbox [ref=e5078]: "0"
      - separator
      - button "Flip Horizontally (Shift+H)" [ref=e5079] [cursor=pointer]
      - button "Convert to path" [ref=e5082] [cursor=pointer]:
        - generic [ref=e5085]: Convert to path
      - button "More actions" [ref=e5086] [cursor=pointer]
    - toolbar "Tools" [ref=e5089]:
      - 'button "Current layer : Layer 1" [ref=e5090] [cursor=pointer]':
        - generic [ref=e5091]: Layer 1
      - generic [ref=e5095]:
        - button "Select Tool (V)" [pressed] [ref=e5097] [cursor=pointer]
        - button "Scale Tool (K)" [ref=e5101] [cursor=pointer]
        - button "Panning [Space / mouse wheel + drag] (H)" [ref=e5105] [cursor=pointer]
      - generic [ref=e5109]:
        - button "Text Tool (T)" [ref=e5111] [cursor=pointer]
        - button "Export frame tool (Shift+F)" [ref=e5115] [cursor=pointer]
        - button "Shapes" [ref=e5120] [cursor=pointer]
        - button "Paths" [ref=e5126] [cursor=pointer]
      - generic [ref=e5130]:
        - button "Image Tool" [ref=e5132] [cursor=pointer]
        - button "Connect two objects" [ref=e5136] [cursor=pointer]
        - button "Library" [ref=e5140] [cursor=pointer]
      - button "More tools" [ref=e5146] [cursor=pointer]
    - textbox "Change text contents" [ref=e5149]
  - complementary "Right panel" [ref=e5150]:
    - separator "Width of the panel" [ref=e5151]
    - tablist "Right panel" [ref=e5152]:
      - tab "Properties" [ref=e5153] [cursor=pointer]
      - tab "Layers" [active] [selected] [ref=e5154] [cursor=pointer]
      - tab "Code" [ref=e5155] [cursor=pointer]
    - text: ▾ ▾
    - tabpanel "Layers" [ref=e5156]:
      - generic [ref=e5159]:
        - generic [ref=e5160]:
          - searchbox "Search by name or id" [ref=e5164]
          - tree "Layers" [ref=e5165]:
            - 'treeitem "o4944 Rectangle Lock : o4944 Hide : o4944" [level=2] [ref=e5167]':
              - generic [ref=e5171]: o4944
              - generic [ref=e5172]: Rectangle
              - 'button "Lock : o4944" [ref=e5173] [cursor=pointer]'
              - 'button "Hide : o4944" [ref=e5176] [cursor=pointer]'
            - 'treeitem "o4943 Rectangle Lock : o4943 Hide : o4943" [level=2] [ref=e5179]':
              - generic [ref=e5183]: o4943
              - generic [ref=e5184]: Rectangle
              - 'button "Lock : o4943" [ref=e5185] [cursor=pointer]'
              - 'button "Hide : o4943" [ref=e5188] [cursor=pointer]'
            - 'treeitem "o4942 Rectangle Lock : o4942 Hide : o4942" [level=2] [ref=e5191]':
              - generic [ref=e5195]: o4942
              - generic [ref=e5196]: Rectangle
              - 'button "Lock : o4942" [ref=e5197] [cursor=pointer]'
              - 'button "Hide : o4942" [ref=e5200] [cursor=pointer]'
            - 'treeitem "o4941 Rectangle Lock : o4941 Hide : o4941" [level=2] [ref=e5203]':
              - generic [ref=e5207]: o4941
              - generic [ref=e5208]: Rectangle
              - 'button "Lock : o4941" [ref=e5209] [cursor=pointer]'
              - 'button "Hide : o4941" [ref=e5212] [cursor=pointer]'
            - 'treeitem "o4940 Rectangle Lock : o4940 Hide : o4940" [level=2] [ref=e5215]':
              - generic [ref=e5219]: o4940
              - generic [ref=e5220]: Rectangle
              - 'button "Lock : o4940" [ref=e5221] [cursor=pointer]'
              - 'button "Hide : o4940" [ref=e5224] [cursor=pointer]'
            - 'treeitem "o4939 Rectangle Lock : o4939 Hide : o4939" [level=2] [ref=e5227]':
              - generic [ref=e5231]: o4939
              - generic [ref=e5232]: Rectangle
              - 'button "Lock : o4939" [ref=e5233] [cursor=pointer]'
              - 'button "Hide : o4939" [ref=e5236] [cursor=pointer]'
            - 'treeitem "o4938 Rectangle Lock : o4938 Hide : o4938" [level=2] [ref=e5239]':
              - generic [ref=e5243]: o4938
              - generic [ref=e5244]: Rectangle
              - 'button "Lock : o4938" [ref=e5245] [cursor=pointer]'
              - 'button "Hide : o4938" [ref=e5248] [cursor=pointer]'
            - 'treeitem "o4937 Rectangle Lock : o4937 Hide : o4937" [level=2] [ref=e5251]':
              - generic [ref=e5255]: o4937
              - generic [ref=e5256]: Rectangle
              - 'button "Lock : o4937" [ref=e5257] [cursor=pointer]'
              - 'button "Hide : o4937" [ref=e5260] [cursor=pointer]'
            - 'treeitem "o4936 Rectangle Lock : o4936 Hide : o4936" [level=2] [ref=e5263]':
              - generic [ref=e5267]: o4936
              - generic [ref=e5268]: Rectangle
              - 'button "Lock : o4936" [ref=e5269] [cursor=pointer]'
              - 'button "Hide : o4936" [ref=e5272] [cursor=pointer]'
            - 'treeitem "o4935 Rectangle Lock : o4935 Hide : o4935" [level=2] [ref=e5275]':
              - generic [ref=e5279]: o4935
              - generic [ref=e5280]: Rectangle
              - 'button "Lock : o4935" [ref=e5281] [cursor=pointer]'
              - 'button "Hide : o4935" [ref=e5284] [cursor=pointer]'
            - 'treeitem "o4934 Rectangle Lock : o4934 Hide : o4934" [level=2] [ref=e5287]':
              - generic [ref=e5291]: o4934
              - generic [ref=e5292]: Rectangle
              - 'button "Lock : o4934" [ref=e5293] [cursor=pointer]'
              - 'button "Hide : o4934" [ref=e5296] [cursor=pointer]'
            - 'treeitem "o4933 Rectangle Lock : o4933 Hide : o4933" [level=2] [ref=e5299]':
              - generic [ref=e5303]: o4933
              - generic [ref=e5304]: Rectangle
              - 'button "Lock : o4933" [ref=e5305] [cursor=pointer]'
              - 'button "Hide : o4933" [ref=e5308] [cursor=pointer]'
            - 'treeitem "o4932 Rectangle Lock : o4932 Hide : o4932" [level=2] [ref=e5311]':
              - generic [ref=e5315]: o4932
              - generic [ref=e5316]: Rectangle
              - 'button "Lock : o4932" [ref=e5317] [cursor=pointer]'
              - 'button "Hide : o4932" [ref=e5320] [cursor=pointer]'
            - 'treeitem "o4931 Rectangle Lock : o4931 Hide : o4931" [level=2] [ref=e5323]':
              - generic [ref=e5327]: o4931
              - generic [ref=e5328]: Rectangle
              - 'button "Lock : o4931" [ref=e5329] [cursor=pointer]'
              - 'button "Hide : o4931" [ref=e5332] [cursor=pointer]'
            - 'treeitem "o4930 Rectangle Lock : o4930 Hide : o4930" [level=2] [ref=e5335]':
              - generic [ref=e5339]: o4930
              - generic [ref=e5340]: Rectangle
              - 'button "Lock : o4930" [ref=e5341] [cursor=pointer]'
              - 'button "Hide : o4930" [ref=e5344] [cursor=pointer]'
            - 'treeitem "o4929 Rectangle Lock : o4929 Hide : o4929" [level=2] [ref=e5347]':
              - generic [ref=e5351]: o4929
              - generic [ref=e5352]: Rectangle
              - 'button "Lock : o4929" [ref=e5353] [cursor=pointer]'
              - 'button "Hide : o4929" [ref=e5356] [cursor=pointer]'
            - 'treeitem "o4928 Rectangle Lock : o4928 Hide : o4928" [level=2] [ref=e5359]':
              - generic [ref=e5363]: o4928
              - generic [ref=e5364]: Rectangle
              - 'button "Lock : o4928" [ref=e5365] [cursor=pointer]'
              - 'button "Hide : o4928" [ref=e5368] [cursor=pointer]'
            - 'treeitem "o4927 Rectangle Lock : o4927 Hide : o4927" [level=2] [ref=e5371]':
              - generic [ref=e5375]: o4927
              - generic [ref=e5376]: Rectangle
              - 'button "Lock : o4927" [ref=e5377] [cursor=pointer]'
              - 'button "Hide : o4927" [ref=e5380] [cursor=pointer]'
            - 'treeitem "o4926 Rectangle Lock : o4926 Hide : o4926" [level=2] [ref=e5383]':
              - generic [ref=e5387]: o4926
              - generic [ref=e5388]: Rectangle
              - 'button "Lock : o4926" [ref=e5389] [cursor=pointer]'
              - 'button "Hide : o4926" [ref=e5392] [cursor=pointer]'
            - 'treeitem "o4925 Rectangle Lock : o4925 Hide : o4925" [level=2] [ref=e5395]':
              - generic [ref=e5399]: o4925
              - generic [ref=e5400]: Rectangle
              - 'button "Lock : o4925" [ref=e5401] [cursor=pointer]'
              - 'button "Hide : o4925" [ref=e5404] [cursor=pointer]'
            - 'treeitem "o4924 Rectangle Lock : o4924 Hide : o4924" [level=2] [ref=e5407]':
              - generic [ref=e5411]: o4924
              - generic [ref=e5412]: Rectangle
              - 'button "Lock : o4924" [ref=e5413] [cursor=pointer]'
              - 'button "Hide : o4924" [ref=e5416] [cursor=pointer]'
            - 'treeitem "o4923 Rectangle Lock : o4923 Hide : o4923" [level=2] [ref=e5419]':
              - generic [ref=e5423]: o4923
              - generic [ref=e5424]: Rectangle
              - 'button "Lock : o4923" [ref=e5425] [cursor=pointer]'
              - 'button "Hide : o4923" [ref=e5428] [cursor=pointer]'
            - 'treeitem "o4922 Rectangle Lock : o4922 Hide : o4922" [level=2] [ref=e5431]':
              - generic [ref=e5435]: o4922
              - generic [ref=e5436]: Rectangle
              - 'button "Lock : o4922" [ref=e5437] [cursor=pointer]'
              - 'button "Hide : o4922" [ref=e5440] [cursor=pointer]'
            - 'treeitem "o4921 Rectangle Lock : o4921 Hide : o4921" [level=2] [ref=e5443]':
              - generic [ref=e5447]: o4921
              - generic [ref=e5448]: Rectangle
              - 'button "Lock : o4921" [ref=e5449] [cursor=pointer]'
              - 'button "Hide : o4921" [ref=e5452] [cursor=pointer]'
            - 'treeitem "o4920 Rectangle Lock : o4920 Hide : o4920" [level=2] [ref=e5455]':
              - generic [ref=e5459]: o4920
              - generic [ref=e5460]: Rectangle
              - 'button "Lock : o4920" [ref=e5461] [cursor=pointer]'
              - 'button "Hide : o4920" [ref=e5464] [cursor=pointer]'
            - 'treeitem "o4919 Rectangle Lock : o4919 Hide : o4919" [level=2] [ref=e5467]':
              - generic [ref=e5471]: o4919
              - generic [ref=e5472]: Rectangle
              - 'button "Lock : o4919" [ref=e5473] [cursor=pointer]'
              - 'button "Hide : o4919" [ref=e5476] [cursor=pointer]'
            - 'treeitem "o4918 Rectangle Lock : o4918 Hide : o4918" [level=2] [ref=e5479]':
              - generic [ref=e5483]: o4918
              - generic [ref=e5484]: Rectangle
              - 'button "Lock : o4918" [ref=e5485] [cursor=pointer]'
              - 'button "Hide : o4918" [ref=e5488] [cursor=pointer]'
            - 'treeitem "o4917 Rectangle Lock : o4917 Hide : o4917" [level=2] [selected] [ref=e5491]':
              - generic [ref=e5495]: o4917
              - generic [ref=e5496]: Rectangle
              - 'button "Lock : o4917" [ref=e5497] [cursor=pointer]'
              - 'button "Hide : o4917" [ref=e5500] [cursor=pointer]'
            - 'treeitem "o4916 Rectangle Lock : o4916 Hide : o4916" [level=2] [ref=e5503]':
              - generic [ref=e5507]: o4916
              - generic [ref=e5508]: Rectangle
              - 'button "Lock : o4916" [ref=e5509] [cursor=pointer]'
              - 'button "Hide : o4916" [ref=e5512] [cursor=pointer]'
            - 'treeitem "o4915 Rectangle Lock : o4915 Hide : o4915" [level=2] [ref=e5515]':
              - generic [ref=e5519]: o4915
              - generic [ref=e5520]: Rectangle
              - 'button "Lock : o4915" [ref=e5521] [cursor=pointer]'
              - 'button "Hide : o4915" [ref=e5524] [cursor=pointer]'
            - 'treeitem "o4914 Rectangle Lock : o4914 Hide : o4914" [level=2] [ref=e5527]':
              - generic [ref=e5531]: o4914
              - generic [ref=e5532]: Rectangle
              - 'button "Lock : o4914" [ref=e5533] [cursor=pointer]'
              - 'button "Hide : o4914" [ref=e5536] [cursor=pointer]'
            - 'treeitem "o4913 Rectangle Lock : o4913 Hide : o4913" [level=2] [ref=e5539]':
              - generic [ref=e5543]: o4913
              - generic [ref=e5544]: Rectangle
              - 'button "Lock : o4913" [ref=e5545] [cursor=pointer]'
              - 'button "Hide : o4913" [ref=e5548] [cursor=pointer]'
            - 'treeitem "o4912 Rectangle Lock : o4912 Hide : o4912" [level=2] [ref=e5551]':
              - generic [ref=e5555]: o4912
              - generic [ref=e5556]: Rectangle
              - 'button "Lock : o4912" [ref=e5557] [cursor=pointer]'
              - 'button "Hide : o4912" [ref=e5560] [cursor=pointer]'
            - 'treeitem "o4911 Rectangle Lock : o4911 Hide : o4911" [level=2] [ref=e5563]':
              - generic [ref=e5567]: o4911
              - generic [ref=e5568]: Rectangle
              - 'button "Lock : o4911" [ref=e5569] [cursor=pointer]'
              - 'button "Hide : o4911" [ref=e5572] [cursor=pointer]'
            - 'treeitem "o4910 Rectangle Lock : o4910 Hide : o4910" [level=2] [ref=e5575]':
              - generic [ref=e5579]: o4910
              - generic [ref=e5580]: Rectangle
              - 'button "Lock : o4910" [ref=e5581] [cursor=pointer]'
              - 'button "Hide : o4910" [ref=e5584] [cursor=pointer]'
            - 'treeitem "o4909 Rectangle Lock : o4909 Hide : o4909" [level=2] [ref=e5587]':
              - generic [ref=e5591]: o4909
              - generic [ref=e5592]: Rectangle
              - 'button "Lock : o4909" [ref=e5593] [cursor=pointer]'
              - 'button "Hide : o4909" [ref=e5596] [cursor=pointer]'
        - paragraph [ref=e5599]: Drag a row to change its order or its group; double-click to rename.
```

# Test source

```ts
  408 |     expect(await page.evaluate(() => window.svgEditor.grid.visible)).toBe(true)
  409 |     await page.locator('#se-doc-objectsnap').check()
  410 |     expect(await page.evaluate(() => window.svgEditor.configObj.curConfig.objectSnapping)).toBe(true)
  411 |   })
  412 | })
  413 | 
  414 | test.describe('Layers tab (V3)', () => {
  415 |   test.beforeEach(async ({ page }) => {
  416 |     await load(page)
  417 |     await page.locator('#se-tab-layers').click()
  418 |   })
  419 | 
  420 |   const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#se-tree .se-tree-row')]
  421 |     .sort((a, b) => a.offsetTop - b.offsetTop)
  422 |     .map((row) => `${'  '.repeat(Number(row.getAttribute('aria-level')) - 1)}${row.querySelector('.se-tree-name, .se-tree-rename')?.textContent ?? ''}`))
  423 | 
  424 |   test('the tree of the layers and their objects, top first, groups closed', async ({ page }) => {
  425 |     await expect.poll(() => rows(page)).toEqual(['Equipements', '  t1', '  pompe', '  r1', 'Fond', '  cadre'])
  426 |     await page.locator('#se-tree .se-tree-row', { hasText: 'pompe' }).locator('.se-tree-toggle').click()
  427 |     await expect.poll(() => rows(page)).toEqual(['Equipements', '  t1', '  pompe', '    p1', '    c1', '  r1', 'Fond', '  cadre'])
  428 |     await expect(page.locator('#se-tree')).toHaveAttribute('role', 'tree')
  429 |   })
  430 | 
  431 |   test('a click selects in the canvas, the canvas selects in the tree', async ({ page }) => {
  432 |     await page.locator('#se-tree .se-tree-row', { hasText: 'r1' }).click()
  433 |     expect(await selected(page)).toEqual(['r1'])
  434 |     await page.locator('#se-tree .se-tree-row', { hasText: 't1' }).click({ modifiers: ['Shift'] })
  435 |     expect((await selected(page)).sort()).toEqual(['r1', 't1'])
  436 |     // From the canvas: an object in a closed group opens it.
  437 |     await select(page, ['c1'])
  438 |     await expect(page.locator('#se-tree .se-tree-row[aria-selected="true"]', { hasText: 'c1' })).toBeVisible()
  439 |     // An object of another layer: that layer becomes current.
  440 |     await page.locator('#se-tree .se-tree-row', { hasText: 'cadre' }).click()
  441 |     expect(await selected(page)).toEqual(['cadre'])
  442 |     expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getCurrentLayerName())).toBe('Fond')
  443 |   })
  444 | 
  445 |   test('the eye hides an object in one undo step, and a layer', async ({ page }) => {
  446 |     const row = page.locator('#se-tree .se-tree-row', { hasText: 'r1' })
  447 |     await row.hover()
  448 |     await row.locator('.se-tree-eye').click()
  449 |     expect(await page.evaluate(() => document.getElementById('r1').getAttribute('display'))).toBe('none')
  450 |     expect(await undoSize(page)).toBe(1)
  451 |     await page.keyboard.press('Control+z')
  452 |     expect(await page.evaluate(() => document.getElementById('r1').getAttribute('display'))).toBe(null)
  453 |     const layer = page.locator('#se-tree .se-tree-row[data-kind="layer"]', { hasText: 'Fond' })
  454 |     await layer.hover()
  455 |     await layer.locator('.se-tree-eye').click()
  456 |     expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getLayerVisibility('Fond'))).toBe(false)
  457 |   })
  458 | 
  459 |   test('a layer is renamed in place, and moved by a drag', async ({ page }) => {
  460 |     await page.locator('#se-tree .se-tree-row[data-kind="layer"] .se-tree-name', { hasText: 'Fond' }).dblclick()
  461 |     const field = page.locator('#se-tree .se-tree-rename')
  462 |     await expect(field).toBeFocused()
  463 |     await field.fill('Arriere-plan')
  464 |     await field.press('Enter')
  465 |     expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().hasLayer('Arriere-plan'))).toBe(true)
  466 |     // Dragged above Equipements: it is drawn on top.
  467 |     await page.locator('#se-tree .se-tree-row[data-kind="layer"]', { hasText: 'Arriere-plan' })
  468 |       .dragTo(page.locator('#se-tree .se-tree-row[data-kind="layer"]', { hasText: 'Equipements' }), { targetPosition: { x: 40, y: 4 } })
  469 |     expect(await page.evaluate(() => {
  470 |       const drawing = window.svgEditor.svgCanvas.getCurrentDrawing()
  471 |       return [drawing.getLayerName(0), drawing.getLayerName(1)]
  472 |     })).toEqual(['Equipements', 'Arriere-plan'])
  473 |   })
  474 | 
  475 |   test('the search keeps what matches, with its layer and group; the keyboard moves and selects', async ({ page }) => {
  476 |     await page.locator('#se-tree-search').fill('c1')
  477 |     await expect.poll(() => rows(page)).toEqual(['Equipements', '  pompe', '    c1'])
  478 |     await page.locator('#se-tree-search').fill('')
  479 |     await page.locator('#se-tree').focus()
  480 |     await page.keyboard.press('Home')
  481 |     await page.keyboard.press('ArrowDown')
  482 |     await page.keyboard.press('Enter')
  483 |     expect(await selected(page)).toEqual(['t1'])
  484 |   })
  485 | 
  486 |   test('5 000 objects: the tree scrolls and follows the selection in under 50 ms', async ({ page }) => {
  487 |     await page.evaluate(() => {
  488 |       const rects = Array.from({ length: 5000 }, (_, i) =>
  489 |         `<rect id="o${i}" x="${(i % 100) * 6}" y="${Math.floor(i / 100) * 9}" width="5" height="8"/>`).join('')
  490 |       window.svgEditor.svgCanvas.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>${rects}</g></svg>`)
  491 |       window.svgEditor.updateCanvas(true)
  492 |       window.svgEditor.layersPanel.populateLayers()
  493 |     })
  494 |     await frame()
  495 |     // Only the rows in view are drawn.
  496 |     expect(await page.locator('#se-tree .se-tree-row').count()).toBeLessThan(80)
  497 |     const ms = await page.evaluate(async () => {
  498 |       const target = document.getElementById('o4917')
  499 |       const row = () => [...document.querySelectorAll('#se-tree .se-tree-row')].find((el) => el.querySelector('.se-tree-name').textContent === 'o4917')
  500 |       const start = performance.now()
  501 |       window.svgEditor.svgCanvas.selectOnly([target], true)
  502 |       while (row()?.getAttribute('aria-selected') !== 'true' && performance.now() - start < 500) {
  503 |         await new Promise((resolve) => requestAnimationFrame(resolve))
  504 |       }
  505 |       return { ms: performance.now() - start, selected: row()?.getAttribute('aria-selected') }
  506 |     })
  507 |     expect(ms.selected).toBe('true')
> 508 |     expect(ms.ms).toBeLessThan(50)
      |                   ^ Error: expect(received).toBeLessThan(expected)
  509 |   })
  510 | })
  511 | 
  512 | test.describe('Layer menu (V3)', () => {
  513 |   test('a loaded document gives its layer to the menu, which holds the layer commands', async ({ page }) => {
  514 |     // Loaded as a host does (loadFromString, ?url=): the menu follows.
  515 |     await page.evaluate((svg) => window.svgEditor.loadSvgString(svg), DRAWING)
  516 |     await expect(page.locator('#se-layer-button')).toContainText('Equipements')
  517 |     await page.locator('#se-layer-button').click()
  518 |     const action = (name) => page.locator(`#se-layer-menu [data-action="${name}"]`)
  519 |     for (const name of ['new', 'dupe', 'rename', 'delete', 'up', 'down', 'show']) await expect(action(name)).toBeVisible()
  520 |     // Equipements is on top: it cannot go up.
  521 |     await expect(action('up')).toHaveAttribute('aria-disabled', 'true')
  522 |     await action('down').click()
  523 |     expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getLayerName(0))).toBe('Equipements')
  524 |     await page.locator('#se-layer-button').click()
  525 |     await action('dupe').click()
  526 |     const field = page.locator('se-popover.se-ask input')
  527 |     await expect(field).toBeFocused()
  528 |     await field.press('Enter')
  529 |     expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getNumLayers())).toBe(3)
  530 |   })
  531 | 
  532 |   test('the Layers tab shows the search and the tree, with its help, as in the mockups', async ({ page }) => {
  533 |     await load(page)
  534 |     await page.locator('#se-tab-layers').click()
  535 |     await expect(page.locator('#layerbuttons')).toBeHidden()
  536 |     await expect(page.locator('#selLayerNames')).toBeHidden()
  537 |     await expect(page.locator('#se-tree-search')).toBeVisible()
  538 |     await expect(page.locator('.se-tree-help')).toBeVisible()
  539 |   })
  540 | })
  541 | 
  542 | test.describe('Code tab (V3)', () => {
  543 |   test.beforeEach(async ({ page }) => {
  544 |     await load(page)
  545 |     await page.locator('#se-tab-code').click()
  546 |   })
  547 | 
  548 |   const text = (page) => page.locator('#se-code-text')
  549 |   // The tab puts one attribute per line: only the spaces differ from what the
  550 |   // export writes.
  551 |   const spaces = (value) => value.replace(/\s+/g, ' ')
  552 |   const shows = async (page, source) => {
  553 |     await expect.poll(async () => spaces(await text(page).inputValue())).toBe(spaces(source))
  554 |   }
  555 | 
  556 |   test('the code of the selection is the one the export writes; of the document without selection', async ({ page }) => {
  557 |     await shows(page, await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString()))
  558 |     await select(page, ['r1'])
  559 |     await shows(page, await page.evaluate(() => window.svgEditor.svgCanvas.svgToString(document.getElementById('r1'), 0)))
  560 |     await expect(page.locator('#se-tabpanel-code .se-inspector-id')).toHaveText('#r1')
  561 |     // One attribute per line, x and y on one, and in colour.
  562 |     expect(await text(page).inputValue()).toContain('\n  x="100" y="100"\n  width="80"')
  563 |     await expect(page.locator('.se-code-highlight .se-code-attr').first()).toHaveText('id')
  564 |     await expect(page.locator('.se-code-highlight .se-code-value').first()).toHaveText('"r1"')
  565 |   })
  566 | 
  567 |   test('an edit applies with Ctrl+Enter through the import filter, in one undo step', async ({ page }) => {
  568 |     await select(page, ['r1'])
  569 |     await text(page).fill('<rect id="r1" x="120" y="100" width="80" height="60" fill="#c00" onclick="alert(1)"/>')
  570 |     await text(page).press('Control+Enter')
  571 |     const r1 = await page.evaluate(() => {
  572 |       const el = document.getElementById('r1')
  573 |       return { x: el.getAttribute('x'), fill: el.getAttribute('fill'), onclick: el.getAttribute('onclick') }
  574 |     })
  575 |     expect(r1).toEqual({ x: '120', fill: '#c00', onclick: null })
  576 |     expect(await selected(page)).toEqual(['r1'])
  577 |     expect(await undoSize(page)).toBe(1)
  578 |     await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
  579 |     expect(await page.evaluate(() => document.getElementById('r1').getAttribute('x'))).toBe('100')
  580 |   })
  581 | 
  582 |   test('a syntax error is shown with its line, and nothing is applied', async ({ page }) => {
  583 |     await select(page, ['r1'])
  584 |     await text(page).fill('<rect id="r1"\n  x="120"\n  y=100 />')
  585 |     await page.locator('#se-code-apply').click()
  586 |     await expect(page.locator('#se-code-status')).toContainText('line 3')
  587 |     expect(await page.evaluate(() => document.getElementById('r1').getAttribute('x'))).toBe('100')
  588 |     expect(await undoSize(page)).toBe(0)
  589 |     // Escape gives back the code of the drawing.
  590 |     await text(page).press('Escape')
  591 |     await shows(page, await page.evaluate(() => window.svgEditor.svgCanvas.svgToString(document.getElementById('r1'), 0)))
  592 |   })
  593 | })
  594 | 
  595 | test.describe('No window of the browser (V3)', () => {
  596 |   test('a new layer, a renamed layer and a link are asked in place', async ({ page }) => {
  597 |     await load(page)
  598 |     await page.locator('#se-tab-layers').click()
  599 |     // The layer commands are in the layer menu of the toolbar.
  600 |     await page.locator('#se-layer-button').click()
  601 |     await page.locator('#se-layer-menu [data-action="new"]').click()
  602 |     const field = page.locator('se-popover.se-ask input')
  603 |     await expect(field).toBeFocused()
  604 |     await field.fill('Mesures')
  605 |     await field.press('Enter')
  606 |     expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().hasLayer('Mesures'))).toBe(true)
  607 |     // Renamed in its row of the tree.
  608 |     await page.locator('#se-layer-button').click()
```