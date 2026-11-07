import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { inlineStyleSheets, parseStyleRules, parseSvgText } from '../../packages/svgcanvas/core/svg-paste.js'
import { normalizeClipboardData } from '../../packages/svgcanvas/core/clipboard.js'
import { eventShortcut } from '../../src/editor/shortcuts.js'

// M7: Mod+D that repeats its offset, SVG from outside pasted through the
// import filter, copy and paste of properties.

const DRAWING = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
  '<defs><linearGradient id="grad"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
  '<g class="layer"><title>L</title>' +
  '<rect id="r1" x="10" y="10" width="20" height="20" fill="red" stroke="blue" stroke-width="3"/>' +
  '<rect id="r2" x="100" y="10" width="20" height="20"/>' +
  '<line id="l1" x1="0" y1="0" x2="50" y2="50" stroke="green" stroke-width="2"/>' +
  '<text id="t1" x="10" y="100" font-family="serif" font-size="20" fill="#333">T</text>' +
  '<g id="paint" fill="green" opacity="0.5"><rect id="inner" x="0" y="200" width="5" height="5"/></g>' +
  '<g id="group2"><rect id="g2a" x="0" y="300" width="5" height="5"/><text id="g2t" x="0" y="320">u</text></g>' +
  '<rect id="withgrad" x="200" y="200" width="5" height="5" fill="url(#grad)"/>' +
  '</g></svg>'

describe('Clipboard and duplication (M7)', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    sessionStorage.clear()
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.style.visibility = 'hidden'
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    svgEditor.append(workarea)
    document.body.append(svgEditor)
    svgCanvas = new SvgCanvas(document.getElementById('svgcanvas'), {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
    svgCanvas.setSvgString(DRAWING)
  })

  const byId = (id) => document.getElementById(id)
  const selected = () => svgCanvas.getSelectedElements().filter(Boolean)
  const xOf = (elem) => Number(elem.getAttribute('x'))
  const yOf = (elem) => Number(elem.getAttribute('y'))

  describe('Mod+D', () => {
    it('makes a first copy 20 to the right and 20 down, as before', () => {
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.duplicateSelectedElements()
      const [copy] = selected()
      expect(copy).not.toBe(byId('r1'))
      expect([xOf(copy), yOf(copy)]).toEqual([30, 30])
    })

    it('repeats an unmoved offset exactly, as before', () => {
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.duplicateSelectedElements()
      svgCanvas.duplicateSelectedElements()
      const [copy] = selected()
      expect(copy.getAttribute('x')).toBe('50')
      expect(copy.getAttribute('y')).toBe('50')
    })

    it('repeats the offset of a copy that was moved: a regular series', () => {
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.duplicateSelectedElements()
      const [copy] = selected()
      svgCanvas.moveSelectedElements(40, -20, true)
      expect([xOf(copy), yOf(copy)]).toEqual([70, 10])
      expect(svgCanvas.getDuplicateOffset()).toEqual({ x: 60, y: 0 })
      svgCanvas.duplicateSelectedElements()
      expect(xOf(selected()[0])).toBe(130)
      svgCanvas.duplicateSelectedElements()
      expect([xOf(selected()[0]), yOf(selected()[0])]).toEqual([190, 10])
    })

    it('keeps the series of several objects', () => {
      svgCanvas.selectOnly([byId('r1'), byId('r2')])
      svgCanvas.duplicateSelectedElements()
      // Copies at y 30, moved to 40: offset 0, 30.
      svgCanvas.moveSelectedElements([-20, -20], [10, 10], true)
      svgCanvas.duplicateSelectedElements()
      expect(selected().map(xOf).sort((a, b) => a - b)).toEqual([10, 100])
      expect(selected().map(yOf)).toEqual([70, 70])
    })

    it('goes back to 20 for another selection, or a copy moved back onto its original', () => {
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.duplicateSelectedElements()
      svgCanvas.moveSelectedElements(20, 0, true)
      svgCanvas.selectOnly([byId('r2')])
      expect(svgCanvas.getDuplicateOffset()).toEqual({ x: 20, y: 20 })

      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.duplicateSelectedElements()
      svgCanvas.moveSelectedElements(-20, -20, true)
      expect(svgCanvas.getDuplicateOffset()).toEqual({ x: 20, y: 20 })
    })

    it('forgets copies that an undo removed', () => {
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.duplicateSelectedElements()
      const copies = selected()
      svgCanvas.moveSelectedElements(50, 0, true)
      svgCanvas.undoMgr.undo()
      svgCanvas.undoMgr.undo()
      expect(copies[0].isConnected).toBe(false)
      expect(svgCanvas.getDuplicateOffset(copies)).toEqual({ x: 20, y: 20 })
    })

    it('repeats a fixed offset (Alt+arrows) and the offset of an Alt+drag', () => {
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.duplicateSelectedElements({ x: 10, y: 0 })
      expect(xOf(selected()[0])).toBe(20)
      expect(svgCanvas.getDuplicateOffset()).toEqual({ x: 10, y: 0 })

      // Alt+drag: copies made in place, then moved; the offset is measured.
      svgCanvas.selectOnly([byId('r2')])
      svgCanvas.cloneSelectedElements(0, 0)
      svgCanvas.moveSelectedElements(0, 35, true)
      svgCanvas.rememberDuplicate(svgCanvas.getSelectedElements(), [byId('r2')])
      expect(svgCanvas.getDuplicateOffset()).toEqual({ x: 0, y: 35 })
    })

    it('makes one undo step', () => {
      svgCanvas.selectOnly([byId('r1')])
      const before = svgCanvas.undoMgr.getUndoStackSize()
      svgCanvas.duplicateSelectedElements()
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    })
  })

  describe('copy for the system clipboard', () => {
    it('keeps the SVG text in the clipboard data, and reads older data without it', () => {
      expect(normalizeClipboardData([{ element: 'rect' }]).svg).toBe(null)
      expect(normalizeClipboardData({ version: 2, elements: [], svg: '<svg/>' }).svg).toBe('<svg/>')
      expect(normalizeClipboardData({ version: 2, elements: [], svg: 3 }).svg).toBe(null)
    })

    it('writes the copied objects and their definitions, without changing the document', () => {
      svgCanvas.selectOnly([byId('withgrad')])
      const before = byId('withgrad').outerHTML
      svgCanvas.copySelectedElements()
      const svg = svgCanvas.getClipboardSvg()
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      expect(svg).toContain('<linearGradient id="grad"')
      expect(svg).toContain('id="withgrad"')
      expect(svg).toContain('fill="url(#grad)"')
      expect(byId('withgrad').outerHTML).toBe(before)
      // It is SVG that the paste filter accepts.
      expect(parseSvgText(svg)).not.toBe(null)
    })
  })

  describe('SVG from outside', () => {
    it('accepts SVG without namespace or with an undeclared xlink prefix, rejects the rest', () => {
      expect(parseSvgText('<svg><rect/></svg>')).not.toBe(null)
      expect(parseSvgText('<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="#a"/></svg>')).not.toBe(null)
      expect(parseSvgText('hello')).toBe(null)
      expect(parseSvgText('<svg><rect></svg>')).toBe(null)
      expect(parseSvgText('<html><svg/></html>')).toBe(null)
      expect(parseSvgText(null)).toBe(null)
    })

    it('reads style rules, skipping at-rules and comments', () => {
      const rules = parseStyleRules('/* c */ @import url(x.css); @media print { .a { fill: red } } .b, rect.c { fill: blue !important; stroke : #000 }')
      expect(rules).toHaveLength(1)
      expect(rules[0].selectors.map((s) => s.text)).toEqual(['.b', 'rect.c'])
      expect(rules[0].selectors[1].specificity).toEqual([0, 1, 1])
      expect(rules[0].declarations).toEqual([['fill', 'blue', true], ['stroke', '#000', false]])
    })

    it('turns class styles into attributes by specificity, then removes the stylesheet', () => {
      const doc = parseSvgText('<svg xmlns="http://www.w3.org/2000/svg"><style>' +
        'rect { fill: red; stroke-width: 9 } .a { fill: green } #x { fill: blue } .b { transform: rotate(9deg) }' +
        '</style><rect class="a" fill="black"/><rect id="x" class="a"/><rect class="b"/></svg>')
      inlineStyleSheets(doc.documentElement)
      const [first, second, third] = [...doc.documentElement.children]
      expect(doc.querySelector('style')).toBe(null)
      expect(first.getAttribute('fill')).toBe('green')
      expect(first.getAttribute('stroke-width')).toBe('9')
      expect(second.getAttribute('fill')).toBe('blue')
      // A CSS transform has another syntax than the attribute: not copied.
      expect(third.hasAttribute('transform')).toBe(false)
    })

    it('pastes editable objects through the import filter, as one undo step', () => {
      const before = svgCanvas.undoMgr.getUndoStackSize()
      const pasted = svgCanvas.pasteSvgString(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
        '<rect id="r1" x="5" y="6" width="7" height="8" onclick="alert(1)" style="fill:#0f0"/>' +
        '<script>alert(2)</script><a href="javascript:alert(3)"><circle r="4"/></a></svg>',
        'in_place'
      )
      expect(pasted).toHaveLength(2)
      const [rect, link] = pasted
      expect(rect.localName).toBe('rect')
      // New identifiers: the existing r1 is untouched.
      expect(rect.id).not.toBe('r1')
      expect(byId('r1').getAttribute('x')).toBe('10')
      expect(rect.getAttribute('x')).toBe('5')
      expect(rect.getAttribute('fill')).toBe('#0f0')
      expect(rect.hasAttribute('onclick')).toBe(false)
      expect(document.querySelector('#svgcontent script')).toBe(null)
      expect(link.getAttribute('href')).toBe(null)
      // Each object gets an identifier, as objects drawn in the editor.
      expect(link.querySelector('circle').id).toMatch(/^svg_/)
      // A link around a single object is selected as that object.
      expect(selected()).toHaveLength(2)
      expect(selected()).toContain(rect)
      expect(selected()).toContain(link.firstElementChild)
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
      svgCanvas.undoMgr.undo()
      expect(rect.isConnected).toBe(false)
    })

    it('moves definitions to the drawing with new identifiers, and opens layers', () => {
      const pasted = svgCanvas.pasteSvgString(
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="grad"><stop offset="1"/></linearGradient></defs>' +
        '<g class="layer"><title>Layer 1</title><rect width="1" height="1" fill="url(#grad)"/></g></svg>',
        'in_place'
      )
      expect(pasted.map((el) => el.localName)).toEqual(['rect'])
      const ref = /url\(#(.+)\)/.exec(pasted[0].getAttribute('fill'))[1]
      expect(ref).not.toBe('grad')
      expect(svgCanvas.findDefs().querySelector(`#${ref}`).localName).toBe('linearGradient')
      // The gradient of the drawing is kept.
      expect(byId('grad').querySelector('stop').getAttribute('stop-color')).toBe('red')
    })

    it('keeps the size the SVG declares, in a group', () => {
      const [group] = svgCanvas.pasteSvgString(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 100 50"><rect width="10" height="10"/></svg>',
        'in_place'
      )
      expect(group.localName).toBe('g')
      expect(group.getAttribute('transform')).toBe('scale(2)')
      expect(group.firstElementChild.localName).toBe('rect')
    })

    it('pastes nothing from text that is not SVG, or SVG with no object', () => {
      expect(svgCanvas.pasteSvgString('hello', 'in_place')).toBe(null)
      expect(svgCanvas.pasteSvgString('<svg xmlns="http://www.w3.org/2000/svg"><title>t</title></svg>', 'in_place')).toEqual([])
    })
  })

  describe('copy and paste properties', () => {
    it('copies fill, stroke and opacity, and gives them to a rectangle', () => {
      svgCanvas.selectOnly([byId('r1')])
      expect(svgCanvas.copySelectedProperties()).toBe(true)
      expect(svgCanvas.hasCopiedProperties()).toBe(true)
      svgCanvas.selectOnly([byId('r2')])
      const before = svgCanvas.undoMgr.getUndoStackSize()
      svgCanvas.pasteProperties()
      const r2 = byId('r2')
      expect(r2.getAttribute('fill')).toBe('red')
      expect(r2.getAttribute('stroke')).toBe('blue')
      expect(r2.getAttribute('stroke-width')).toBe('3')
      expect(r2.getAttribute('x')).toBe('100')
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
      svgCanvas.undoMgr.undo()
      expect(r2.hasAttribute('fill')).toBe(false)
      expect(r2.hasAttribute('stroke')).toBe(false)
    })

    it('keeps the font of a text when the properties come from a shape', () => {
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.copySelectedProperties()
      svgCanvas.selectOnly([byId('t1')])
      svgCanvas.pasteProperties()
      const t1 = byId('t1')
      expect(t1.getAttribute('fill')).toBe('red')
      expect(t1.getAttribute('font-family')).toBe('serif')
      expect(t1.getAttribute('font-size')).toBe('20')
    })

    it('gives a text its font, and a line only its stroke', () => {
      svgCanvas.selectOnly([byId('t1')])
      svgCanvas.copySelectedProperties()
      svgCanvas.selectOnly([byId('g2t')])
      svgCanvas.pasteProperties()
      expect(byId('g2t').getAttribute('font-family')).toBe('serif')
      expect(byId('g2t').getAttribute('font-size')).toBe('20')

      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.copySelectedProperties()
      svgCanvas.selectOnly([byId('l1')])
      svgCanvas.pasteProperties()
      expect(byId('l1').hasAttribute('fill')).toBe(false)
      expect(byId('l1').getAttribute('stroke')).toBe('blue')
    })

    it('reads a fill given by a group, and removes what the source does not set', () => {
      svgCanvas.selectOnly([byId('inner')])
      svgCanvas.copySelectedProperties()
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.pasteProperties()
      const r1 = byId('r1')
      expect(r1.getAttribute('fill')).toBe('green')
      // The stroke of r1 goes, as the source has none; the opacity of the
      // group is not the object's own.
      expect(r1.hasAttribute('stroke')).toBe(false)
      expect(r1.hasAttribute('stroke-width')).toBe(false)
      expect(r1.hasAttribute('opacity')).toBe(false)
    })

    it('applies to the objects of a selected group', () => {
      svgCanvas.selectOnly([byId('r1')])
      svgCanvas.copySelectedProperties()
      svgCanvas.selectOnly([byId('group2')])
      svgCanvas.pasteProperties()
      expect(byId('g2a').getAttribute('fill')).toBe('red')
      expect(byId('g2t').getAttribute('fill')).toBe('red')
      expect(byId('group2').hasAttribute('fill')).toBe(false)
    })

    it('leaves out a gradient this drawing does not have', () => {
      svgCanvas.selectOnly([byId('withgrad')])
      svgCanvas.copySelectedProperties()
      byId('grad').remove()
      svgCanvas.selectOnly([byId('r2')])
      svgCanvas.pasteProperties()
      expect(byId('r2').hasAttribute('fill')).toBe(false)
    })

    it('does nothing without copied properties', () => {
      svgCanvas.selectOnly([byId('r2')])
      expect(svgCanvas.hasCopiedProperties()).toBe(false)
      expect(svgCanvas.pasteProperties()).toBe(null)
    })
  })

  it('reads Mod+Alt+letter by physical key', () => {
    // Option+Cmd+C types "ç" on macOS; AltGr is Ctrl+Alt on Windows.
    expect(eventShortcut({ key: 'ç', code: 'KeyC', altKey: true, metaKey: true }, true)).toBe('alt+mod+c')
    expect(eventShortcut({ key: '√', code: 'KeyV', altKey: true, ctrlKey: true }, false)).toBe('alt+mod+v')
    expect(eventShortcut({ key: 'ArrowUp', code: 'ArrowUp', altKey: true }, false)).toBe('alt+arrowup')
    expect(eventShortcut({ key: 'c', code: 'KeyC', ctrlKey: true }, false)).toBe('mod+c')
  })
})
