import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { isDeepClick, paintKey, selectableChildren } from '../../packages/svgcanvas/core/selection-nav.js'

// M6: advanced selection. The deepest object under the pointer, the children
// and the parent of the selection, the objects that look the same.

const DRAWING = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">' +
  '<defs><symbol id="pump"><circle r="5"/></symbol><symbol id="valve"><rect width="5" height="5"/></symbol></defs>' +
  '<g class="layer"><title>L</title>' +
  '<rect id="top" x="0" y="0" width="10" height="10" fill="red"/>' +
  '<g id="outer"><title>group title</title><rect id="o1" x="20" y="0" width="10" height="10" fill="red"/>' +
  '<g id="inner"><rect id="i1" x="40" y="0" width="10" height="10" fill="red" stroke="blue"/>' +
  '<text id="it" x="60" y="10">T<tspan id="ts">s</tspan></text></g></g>' +
  '<g id="paint" fill="green" stroke="black"><rect id="pa" width="5" height="5"/><circle id="pb" r="2" fill-opacity="0.5"/></g>' +
  '<use id="u1" xlink:href="#pump"/><use id="u2" xlink:href="#pump"/><use id="u3" xlink:href="#valve"/>' +
  '<a id="link"><rect id="inlink" x="80" y="0" width="5" height="5" fill="red"/></a>' +
  '</g></svg>'

describe('Advanced selection (M6)', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
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
    // jsdom computes no SVG style (every fill reads black): the declared
    // values are read instead. Browsers are covered by the E2E tests.
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ getPropertyValue: () => '' }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const byId = (id) => document.getElementById(id)
  const ids = (elems) => elems.filter(Boolean).map((el) => el.id).sort()
  const selected = () => ids(svgCanvas.getSelectedElements())

  it('takes Ctrl for the deepest object, and Cmd on macOS', () => {
    expect(isDeepClick({ ctrlKey: true }, false)).toBe(true)
    expect(isDeepClick({ metaKey: true }, false)).toBe(false)
    expect(isDeepClick({ metaKey: true }, true)).toBe(true)
    // On macOS, Ctrl+click opens the context menu.
    expect(isDeepClick({ ctrlKey: true }, true)).toBe(false)
    expect(isDeepClick(null, false)).toBe(false)
  })

  it('finds the deepest object under the pointer and the group that holds it', () => {
    const deep = (id) => {
      const target = svgCanvas.getDeepTarget({ target: byId(id) })
      return target && [target.elem.id, target.context.id || target.context.getAttribute('class')]
    }
    expect(deep('i1')).toEqual(['i1', 'inner'])
    // A tspan belongs to its text.
    expect(deep('ts')).toEqual(['it', 'inner'])
    expect(deep('top')).toEqual(['top', 'layer'])
    // A link around a single object stands for that object.
    expect(deep('inlink')).toEqual(['inlink', 'layer'])
    // Nothing outside the current layer.
    expect(svgCanvas.getDeepTarget({ target: svgCanvas.getSvgRoot() })).toBe(null)
    expect(svgCanvas.getDeepTarget({ target: byId('pump').firstChild })).toBe(null)
  })

  it('opens the groups of the deepest object without writing in the document', () => {
    const before = svgCanvas.undoMgr.getUndoStackSize()
    expect(svgCanvas.openDeepTarget({ target: byId('i1') })).toBe(byId('i1'))
    expect(svgCanvas.getCurrentGroup()).toBe(byId('inner'))
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before)
    // An object of the layer closes the group.
    expect(svgCanvas.openDeepTarget({ target: byId('top') })).toBe(byId('top'))
    expect(svgCanvas.getCurrentGroup()).toBe(null)
  })

  it('opening a group dims the other objects and closing it restores them', () => {
    const top = byId('top')
    svgCanvas.setContext(byId('inner'))
    expect(top.getAttribute('opacity')).toBe('0.33')
    expect(top.style.pointerEvents).toBe('none')
    svgCanvas.leaveContext()
    expect(top.getAttribute('opacity')).toBe(null)
    expect(top.style.pointerEvents).toBe('inherit')
  })

  it('keeps the rest of the style of the objects a group dims', () => {
    const top = byId('top')
    top.style.cursor = 'pointer'
    svgCanvas.setContext(byId('outer'))
    expect(top.style.cursor).toBe('pointer')
    svgCanvas.leaveContext()
    expect(top.style.cursor).toBe('pointer')
  })

  it('lists the objects of a group, not its title, a link standing for its object', () => {
    expect(ids(selectableChildren(byId('outer')))).toEqual(['inner', 'o1'])
    expect(ids(selectableChildren(byId('link').parentNode)).includes('inlink')).toBe(true)
  })

  it('Enter selects the children of a group, Shift+Enter the group again', () => {
    svgCanvas.selectOnly([byId('outer')])
    expect(svgCanvas.selectChildren()).toBe(true)
    expect(svgCanvas.getCurrentGroup()).toBe(byId('outer'))
    expect(selected()).toEqual(['inner', 'o1'])
    // Two objects: nothing.
    expect(svgCanvas.selectChildren()).toBe(false)
    svgCanvas.selectOnly([byId('inner')])
    expect(svgCanvas.selectChildren()).toBe(true)
    expect(selected()).toEqual(['i1', 'it'])
    expect(svgCanvas.selectParent()).toBe(true)
    expect(svgCanvas.getCurrentGroup()).toBe(byId('outer'))
    expect(selected()).toEqual(['inner'])
    expect(svgCanvas.selectParent()).toBe(true)
    expect(svgCanvas.getCurrentGroup()).toBe(null)
    expect(selected()).toEqual(['outer'])
    expect(svgCanvas.selectParent()).toBe(false)
    // A shape has no children; another tool than the selection does nothing.
    svgCanvas.selectOnly([byId('top')])
    expect(svgCanvas.selectChildren()).toBe(false)
    svgCanvas.selectOnly([byId('outer')])
    svgCanvas.setMode('rect')
    expect(svgCanvas.selectChildren()).toBe(false)
  })

  it('reads a fill or a stroke as the groups give it', () => {
    expect(paintKey(byId('top'), 'fill')).toBe('red|1')
    expect(paintKey(byId('top'), 'stroke')).toBe('none')
    expect(paintKey(byId('pa'), 'fill')).toBe('green|1')
    expect(paintKey(byId('pb'), 'fill')).toBe('green|0.5')
    expect(paintKey(byId('pa'), 'stroke')).toBe('black|1')
  })

  it('tells which criteria the selection gives a reference for', () => {
    expect(svgCanvas.canSelectSimilar('symbol', [byId('u1')])).toBe(true)
    expect(svgCanvas.canSelectSimilar('fill', [byId('u1')])).toBe(false)
    expect(svgCanvas.canSelectSimilar('fill', [byId('outer'), byId('top')])).toBe(true)
    expect(svgCanvas.canSelectSimilar('stroke', [byId('outer')])).toBe(false)
    expect(svgCanvas.canSelectSimilar('size', [byId('top')])).toBe(false)
    expect(svgCanvas.canSelectSimilar('fill', [])).toBe(false)
  })

  it('selects the objects of the open group, or of the layer, that look the same', () => {
    svgCanvas.selectOnly([byId('u1')])
    expect(ids(svgCanvas.selectSimilar('symbol'))).toEqual(['u1', 'u2'])
    expect(selected()).toEqual(['u1', 'u2'])
    // Fill: the red objects of the layer, not those inside the groups.
    svgCanvas.selectOnly([byId('top')])
    expect(ids(svgCanvas.selectSimilar('fill'))).toEqual(['inlink', 'top'])
    // In an open group, only its objects.
    svgCanvas.setContext(byId('inner'))
    svgCanvas.selectOnly([byId('i1')])
    expect(ids(svgCanvas.selectSimilar('fill'))).toEqual(['i1'])
    // No reference: the selection is kept.
    svgCanvas.leaveContext()
    svgCanvas.selectOnly([byId('outer')])
    expect(svgCanvas.selectSimilar('fill')).toEqual([])
    expect(selected()).toEqual(['outer'])
    expect(svgCanvas.selectSimilar('unknown')).toEqual([])
  })
})
