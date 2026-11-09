import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { sanitizeSvg } from '../../packages/svgcanvas/core/sanitize.js'
import { FIDELITY_CORRECTIONS } from '../../packages/svgcanvas/core/fidelity.js'
import { setStyleProperty, withoutStyleProperty, styleDeclarations } from '../../packages/svgcanvas/core/utilities.js'

// Lot V6 (plan v2, section 7): the corrections of the rewrites of a file,
// each behind the option fidelity; the identity and the binding of an object.
const NS = 'http://www.w3.org/2000/svg'
const ALL_OFF = Object.fromEntries(FIDELITY_CORRECTIONS.map((name) => [name, false]))

describe('file fidelity (V6)', () => {
  let svgCanvas

  const load = (svg) => {
    svgCanvas.setSvgString(svg)
    svgCanvas.undoMgr.resetUndoStack()
  }
  const drawing = (content, attrs = '') =>
    `<svg xmlns="${NS}" width="640" height="480"${attrs}><g class="layer"><title>Layer 1</title>${content}</g></svg>`
  const saved = (content, attrs) => {
    load(drawing(content, attrs))
    return svgCanvas.getSvgString()
  }

  beforeEach(() => {
    document.body.textContent = ''
    const editor = document.createElement('div')
    editor.id = 'svg_editor'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    const canvas = document.createElement('div')
    canvas.id = 'svgcanvas'
    workarea.append(canvas)
    editor.append(workarea)
    document.body.append(editor)
    svgCanvas = new SvgCanvas(canvas, {
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
  })

  describe('raw values (rawValues)', () => {
    const RECT = '<rect id="007" class="2" data-point="007" data-scale="0.125" scorp_id="0.50" x="10.125" y="20" width="60" height="40"/>'

    it('writes data-*, id, class and the SCorp-io binding as they are', () => {
      const out = saved(RECT)
      expect(out).toContain('id="007" class="2" data-point="007" data-scale="0.125" scorp_id="0.50"')
      // The geometry is still rounded
      expect(out).toContain('x="10.13"')
    })

    it('rounds them as before when the correction is off', () => {
      svgCanvas.setConfig({ fidelity: { rawValues: false } })
      expect(saved(RECT)).toContain('data-point="7" data-scale="0.13"')
    })
  })

  describe('style properties (styleProperties)', () => {
    const CIRCLE = '<circle id="v" cx="10" cy="10" r="5" style="animation: blink 1s infinite; transform-origin: 10px 10px; fill: #d33"/>'

    it('keeps in the style what has no attribute, as written', () => {
      const out = saved(CIRCLE)
      expect(out).toContain('style="animation: blink 1s infinite; transform-origin: 10px 10px"')
      expect(out).toContain('fill="#d33"')
    })

    it('leaves a style without anything to convert as the file wrote it', () => {
      expect(saved('<rect id="r" width="5" height="5" style="animation: blink 1s infinite;  transform-box: fill-box"/>'))
        .toContain('style="animation: blink 1s infinite;  transform-box: fill-box"')
    })

    it('does not save the pointer-events of the editor, and keeps the rest', () => {
      load(drawing(CIRCLE))
      const circle = document.getElementById('v')
      expect(circle.getAttribute('style')).toContain('pointer-events:inherit')
      expect(svgCanvas.getSvgString()).toContain('style="animation: blink 1s infinite; transform-origin: 10px 10px"')
    })

    it('refuses an unsafe value', () => {
      const out = saved('<rect id="r" width="5" height="5" style="cursor: url(http://evil.example/c.cur), auto; animation: blink 1s"/>')
      expect(out).not.toContain('evil.example')
      expect(out).toContain('style="animation: blink 1s"')
    })

    it('drops them as before when the correction is off', () => {
      svgCanvas.setConfig({ fidelity: { styleProperties: false } })
      const out = saved(CIRCLE)
      expect(out).not.toContain('animation')
      expect(out).not.toContain('transform-origin')
    })
  })

  describe('attributes outside the former whitelist (attributes)', () => {
    const CASES = [
      ['paint-order', '<text id="t" x="1" y="10" paint-order="stroke">a</text>'],
      ['vector-effect', '<rect id="r" width="5" height="5" vector-effect="non-scaling-stroke"/>'],
      ['pointer-events', '<rect id="r" width="5" height="5" pointer-events="none"/>'],
      ['mix-blend-mode', '<rect id="r" width="5" height="5" mix-blend-mode="multiply"/>'],
      ['isolation', '<g id="g" isolation="isolate"><rect width="5" height="5"/></g>'],
      ['pathLength', '<path id="p" d="M0,0L10,0" pathLength="100"/>'],
      ['dx', '<text id="t" x="1" y="10" dx="3">a</text>'],
      ['dy', '<text id="t" x="1" y="10" dy="2">a</text>'],
      ['target', '<a id="l" href="https://scorp-io.com" target="_blank"><rect width="5" height="5"/></a>'],
      ['role', '<rect id="r" width="5" height="5" role="img"/>'],
      ['aria-label', '<rect id="r" width="5" height="5" aria-label="Pompe"/>'],
      ['visibility', '<rect id="r" width="5" height="5" visibility="hidden"/>']
    ]

    it.each(CASES)('keeps %s', (name, content) => {
      expect(saved(content)).toMatch(new RegExp(` ${name}="`))
    })

    it('removes the new ones as before when the correction is off', () => {
      svgCanvas.setConfig({ fidelity: { attributes: false } })
      expect(saved(CASES[0][1])).not.toContain('paint-order')
      expect(saved(CASES[5][1])).not.toContain('pathLength')
    })
  })

  describe('gradients (gradientUnits)', () => {
    const SHARED = '<defs><linearGradient id="hot" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">' +
      '<stop offset="0" stop-color="#f60"/><stop offset="1" stop-color="#fc0"/></linearGradient></defs>' +
      '<rect id="a" x="10" y="10" width="60" height="40" fill="url(#hot)"/>' +
      '<rect id="b" x="100" y="10" width="60" height="40" fill="url(#hot)"/>'

    it('keeps the units of a gradient that several objects use', () => {
      expect(saved(SHARED)).toContain('gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0"')
    })

    it('keeps the units of a gradient that one object alone uses', () => {
      const out = saved(SHARED.replace('fill="url(#hot)"/>', 'fill="#000"/>'))
      expect(out).toContain('gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0"')
    })

    it('converts them as before when the correction is off', () => {
      svgCanvas.setConfig({ fidelity: { gradientUnits: false } })
      expect(saved(SHARED)).not.toContain('userSpaceOnUse')
    })
  })

  describe('objects outside the layers (layerOrder)', () => {
    const FILE = `<svg xmlns="${NS}" width="640" height="480">` +
      '<rect id="before" width="5" height="5"/>' +
      '<g class="layer"><title>Layer 1</title><rect id="inside" width="5" height="5"/></g>' +
      '<rect id="after" width="5" height="5"/></svg>'

    it('puts them in a layer at their place', () => {
      load(FILE)
      const order = [...document.querySelectorAll('#svgcontent rect')].map((rect) => rect.id)
      expect(order).toEqual(['before', 'inside', 'after'])
      const layers = [...document.querySelectorAll('#svgcontent > g.layer')]
      expect(layers.map((layer) => [...layer.querySelectorAll('rect')].map((rect) => rect.id)))
        .toEqual([['before'], ['inside'], ['after']])
      // The current layer is the top-most one
      expect(svgCanvas.getCurrentDrawing().getCurrentLayer()).toBe(layers[2])
    })

    it('gathers them at the end as before when the correction is off', () => {
      svgCanvas.setConfig({ fidelity: { layerOrder: false } })
      load(FILE)
      const order = [...document.querySelectorAll('#svgcontent rect')].map((rect) => rect.id)
      expect(order).toEqual(['inside', 'before', 'after'])
    })
  })

  describe('data of other applications (emptyValues)', () => {
    it('writes an empty attribute of another namespace', () => {
      const out = saved('<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""/></rdf:RDF></metadata><rect width="5" height="5"/>')
      expect(out).toContain('rdf:about=""')
    })
  })

  describe('nested <svg> (nestedSvg)', () => {
    const NESTED = '<svg id="n" x="20" y="20" width="50" height="50" viewBox="0 0 10 10"><rect id="in" width="10" height="10"/></svg>'

    it('saves the nested <svg> without the group the editor put around it', () => {
      const out = saved(NESTED)
      expect(out).toMatch(/<\/title>\s*<svg id="n"/)
      // In the editor, the group is still there
      expect(document.getElementById('n').parentNode.localName).toBe('g')
    })

    it('keeps a group that comes from the file, as SVG-Edit saved it', () => {
      const out = saved(`<g id="svg_9">${NESTED}</g>`)
      expect(out).toMatch(/<g id="svg_9">\s*<svg id="n"/)
    })

    it('keeps the group once it carries something of its own', () => {
      load(drawing(NESTED))
      document.getElementById('n').parentNode.setAttribute('transform', 'translate(5,5)')
      expect(svgCanvas.getSvgString()).toMatch(/<g id="svg_\d+" transform="translate\(5,5\)">/)
    })
  })

  describe('a saved file saved again (stableSave)', () => {
    const FILE = `<svg xmlns="${NS}" width="640" height="480" class="synoptique" role="img" aria-label="Chaufferie">` +
      '<defs id="d"/><g class="layer"><title>L</title><rect id="r" width="5" height="5"/></g></svg>'

    it('keeps the order of the attributes of the root, and leaves no blank line', () => {
      load(FILE)
      const first = svgCanvas.getSvgString()
      expect(first).toMatch(/ class="synoptique" role="img" aria-label="Chaufferie"/)
      expect(first).not.toMatch(/\n\s*\n/)
      load(first)
      expect(svgCanvas.getSvgString()).toBe(first)
    })

    it('reversed them, with a blank line, when the correction is off', () => {
      svgCanvas.setConfig({ fidelity: { stableSave: false } })
      load(FILE)
      const first = svgCanvas.getSvgString()
      expect(first).toMatch(/ aria-label="Chaufferie" role="img" class="synoptique"/)
      expect(first).toMatch(/\n\s*\n/)
    })
  })

  describe('a file SVG-Edit saved before V6 stays the same', () => {
    const FILES = [
      drawing('<rect id="pompe-1" class="pompe" data-point="007" x="10.125" y="20" width="60" height="40" style="animation: blink 1s; fill: #d33"/>' +
        '<text id="t" x="1" y="10" paint-order="stroke">a</text>'),
      `<svg xmlns="${NS}" width="640" height="480"><rect id="out" width="5" height="5"/><g class="layer"><title>L</title><rect id="in" width="5" height="5"/></g></svg>`,
      drawing('<defs><linearGradient id="hot" gradientUnits="userSpaceOnUse" x2="200"><stop offset="0"/></linearGradient></defs>' +
        '<rect id="a" width="60" height="40" fill="url(#hot)"/><rect id="b" x="100" width="60" height="40" fill="url(#hot)"/>'),
      drawing('<svg id="n" x="20" y="20" width="50" height="50" viewBox="0 0 10 10"><rect id="in" width="10" height="10"/></svg>')
    ]

    it.each(FILES.map((file, i) => [i, file]))('file %i', (_i, file) => {
      // What the editor wrote before the corrections...
      svgCanvas.setConfig({ fidelity: ALL_OFF })
      load(file)
      const before = svgCanvas.getSvgString()
      // ...opened and saved with them gives the same text
      svgCanvas.setConfig({ fidelity: {} })
      load(before)
      expect(svgCanvas.getSvgString()).toBe(before)
    })
  })

  describe('the style helpers', () => {
    it('set and remove a property without touching the rest of the text', () => {
      const el = document.createElementNS(NS, 'rect')
      for (const style of ['a: x; b: y', 'a: x;', "fill: url('a;b'); c: d"]) {
        el.setAttribute('style', style)
        setStyleProperty(el, 'pointer-events', 'inherit')
        setStyleProperty(el, 'pointer-events', 'none')
        expect(styleDeclarations(el.getAttribute('style')).filter((d) => d.name === 'pointer-events')).toHaveLength(1)
        expect(withoutStyleProperty(el.getAttribute('style'), 'pointer-events')).toBe(style)
      }
      el.removeAttribute('style')
      setStyleProperty(el, 'pointer-events', 'inherit')
      expect(el.getAttribute('style')).toBe('pointer-events:inherit')
      setStyleProperty(el, 'pointer-events', null)
      expect(el.hasAttribute('style')).toBe(false)
    })
  })

  describe('the sanitizer alone', () => {
    it('follows the options it is given', () => {
      const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}"><rect paint-order="stroke" width="1" height="1"/></svg>`, 'image/svg+xml')
      const rect = doc.documentElement.firstChild
      sanitizeSvg(doc.documentElement, [], { attributes: false })
      expect(rect.hasAttribute('paint-order')).toBe(false)
    })
  })

  describe('identity and binding', () => {
    const BOUND = '<g id="ligne" data-tag="L-01" scorp_id="7"><rect id="a" width="50" height="50" fill="url(#grad)"/></g>' +
      '<use id="u" href="#ligne" x="100"/>' +
      '<animate id="blink" href="#ligne" attributeName="opacity" to="0" dur="1s" begin="ligne.click"/>' +
      '<style>#ligne { stroke: blue } .x { fill: #ligne }</style>' +
      '<rect id="free" width="5" height="5"/>' +
      '<defs><linearGradient id="grad"><stop offset="0"/></linearGradient></defs>'

    it('tells what binds an object', () => {
      load(drawing(BOUND))
      const binding = svgCanvas.getBinding(document.getElementById('ligne'))
      expect(binding.attributes).toEqual([{ name: 'data-tag', value: 'L-01' }, { name: 'scorp_id', value: '7' }])
      expect(binding.references.map((el) => el.id || el.localName).sort()).toEqual(['blink', 'style', 'u'])
      expect(binding.bound).toBe(true)
      expect(svgCanvas.getBinding(document.getElementById('free')).bound).toBe(false)
    })

    it('renames an identifier, its references following, in one undo step', () => {
      load(drawing(BOUND))
      const g = document.getElementById('ligne')
      expect(svgCanvas.renameElementId(g, 'ligne-2')).toEqual({ ok: true, references: 3 })
      expect(g.id).toBe('ligne-2')
      expect(document.getElementById('u').getAttribute('href')).toBe('#ligne-2')
      expect(document.getElementById('blink').getAttribute('href')).toBe('#ligne-2')
      // A "-" in the identifier of a timing is escaped (SMIL)
      expect(document.getElementById('blink').getAttribute('begin')).toBe('ligne\\-2.click')
      // A selector follows, not a colour that looks like it
      expect(document.querySelector('#svgcontent style').textContent).toBe('#ligne-2 { stroke: blue } .x { fill: #ligne }')
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(1)
      expect(svgCanvas.undoMgr.getUndoStackCommandText?.() ?? 'Change id').toBe('Change id')
      svgCanvas.undoMgr.undo()
      expect(document.getElementById('ligne')).toBe(g)
      expect(document.getElementById('u').getAttribute('href')).toBe('#ligne')
      expect(document.getElementById('blink').getAttribute('begin')).toBe('ligne.click')
      expect(document.querySelector('#svgcontent style').textContent).toBe('#ligne { stroke: blue } .x { fill: #ligne }')
    })

    it('refuses a taken or invalid identifier', () => {
      load(drawing(BOUND))
      const free = document.getElementById('free')
      expect(svgCanvas.renameElementId(free, 'a')).toEqual({ ok: false, reason: 'taken' })
      expect(svgCanvas.renameElementId(free, 'svgcontent')).toEqual({ ok: false, reason: 'taken' })
      expect(svgCanvas.renameElementId(free, '2pompes')).toEqual({ ok: false, reason: 'invalid' })
      expect(svgCanvas.renameElementId(free, 'a b')).toEqual({ ok: false, reason: 'invalid' })
      expect(svgCanvas.renameElementId(document.getElementById('ligne'), '')).toEqual({ ok: false, reason: 'invalid' })
      expect(free.id).toBe('free')
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(0)
      expect(svgCanvas.renameElementId(free, 'Pompe_1.é')).toEqual({ ok: true, references: 0 })
    })

    it('sets, changes and removes data in one undo step each', () => {
      load(drawing(BOUND))
      const free = document.getElementById('free')
      expect(svgCanvas.setElementData(free, 'data-tag', 'P-101')).toBe(true)
      expect(svgCanvas.setElementData(free, 'data-tag', 'P-102')).toBe(true)
      expect(svgCanvas.setElementData(free, 'data-tag', null)).toBe(true)
      expect(free.hasAttribute('data-tag')).toBe(false)
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(3)
      svgCanvas.undoMgr.undo()
      expect(free.getAttribute('data-tag')).toBe('P-102')
      expect(svgCanvas.setElementData(free, 'onclick', 'x')).toBe(false)
      expect(svgCanvas.setElementData(free, 'data-a b', 'x')).toBe(false)
    })
  })
})
