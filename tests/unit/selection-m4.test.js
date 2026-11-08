import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// M4: per-element changes of a multi-selection, as one undo step.
describe('Changes of each element of a multi-selection (M4)', () => {
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
    svgCanvas.setSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>L</title>' +
      '<rect id="a" x="10" y="10" width="20" height="20" stroke-width="2"/>' +
      '<rect id="b" x="50" y="10" width="20" height="20" stroke-width="4"/>' +
      '<rect id="c" x="90" y="10" width="20" height="20"/>' +
      '</g></svg>'
    )
  })

  const byId = (id) => document.getElementById(id)

  it('gives each element its own new value, as one undo step', () => {
    const changed = []
    svgCanvas.bind('changed', (win, elems) => changed.push(elems.map((el) => el.id)))
    const before = svgCanvas.undoMgr.getUndoStackSize()
    svgCanvas.changeSelectedAttributeEach('stroke-width',
      (elem) => Number(elem.getAttribute('stroke-width') ?? 1) + 3, [byId('a'), byId('b'), byId('c')])
    expect(['a', 'b', 'c'].map((id) => byId(id).getAttribute('stroke-width'))).toEqual(['5', '7', '4'])
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    expect(changed).toEqual([['a', 'b', 'c']])
    svgCanvas.undoMgr.undo()
    expect(['a', 'b', 'c'].map((id) => byId(id).getAttribute('stroke-width'))).toEqual(['2', '4', null])
  })

  it('leaves an element unchanged when its new value is null', () => {
    const before = svgCanvas.undoMgr.getUndoStackSize()
    svgCanvas.changeSelectedAttributeEach('stroke-width',
      (elem) => (elem.id === 'b' ? 1 : null), [byId('a'), byId('b')])
    expect(byId('a').getAttribute('stroke-width')).toBe('2')
    expect(byId('b').getAttribute('stroke-width')).toBe('1')
    svgCanvas.changeSelectedAttributeEach('stroke-width', () => undefined, [byId('a')])
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
  })
})
