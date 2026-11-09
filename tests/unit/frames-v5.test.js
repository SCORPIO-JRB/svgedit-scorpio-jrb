import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { FRAME_PRESETS } from '../../packages/svgcanvas/core/frames.js'

// Lot V5 (plan v2, 4.3, D7): frames to export, kept in the editor namespace.
describe('export frames (V5)', () => {
  let svgCanvas

  const load = (svg) => {
    svgCanvas.setSvgString(svg)
    svgCanvas.undoMgr.resetUndoStack()
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
    load('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
      '<g class="layer"><title>Layer 1</title>' +
      '<rect id="a" x="10" y="10" width="50" height="50" fill="#160f23"/>' +
      '<rect id="b" x="2000" y="10" width="50" height="50" fill="#4cc38a"/>' +
      '</g></svg>')
  })

  it('adds, changes and removes a frame, each in one undo step', () => {
    expect(svgCanvas.getFrames()).toEqual([])
    const frame = svgCanvas.addFrame({ name: 'Chaufferie', x: 0, y: 0, width: 1920, height: 1080 })
    expect(svgCanvas.getFrames().map(({ name, x, y, width, height }) => ({ name, x, y, width, height })))
      .toEqual([{ name: 'Chaufferie', x: 0, y: 0, width: 1920, height: 1080 }])
    expect(frame.element.namespaceURI).toBe(NS.SE)
    expect(frame.element.parentNode.localName).toBe('metadata')
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(1)

    svgCanvas.changeFrame(frame.element, { name: 'Sous-station', x: 100, width: 1280 })
    expect(svgCanvas.getFrames()[0]).toMatchObject({ name: 'Sous-station', x: 100, width: 1280 })
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(2)
    svgCanvas.undoMgr.undo()
    expect(svgCanvas.getFrames()[0]).toMatchObject({ name: 'Chaufferie', x: 0, width: 1920 })

    svgCanvas.removeFrame(frame.element)
    expect(svgCanvas.getFrames()).toEqual([])
    // The metadata it opened goes with the last frame.
    expect(svgCanvas.getSvgContent().querySelector('metadata')).toBeNull()
    svgCanvas.undoMgr.undo()
    expect(svgCanvas.getFrames()).toHaveLength(1)
    svgCanvas.undoMgr.undo()
    svgCanvas.undoMgr.undo()
    expect(svgCanvas.getFrames()).toEqual([])
  })

  it('names new frames apart', () => {
    svgCanvas.addFrame({ x: 0, y: 0, width: 10, height: 10 })
    svgCanvas.addFrame({ x: 0, y: 0, width: 10, height: 10 })
    expect(svgCanvas.getFrames().map((frame) => frame.name)).toEqual(['Frame 1', 'Frame 2'])
    expect(svgCanvas.getSvgContent().querySelectorAll('metadata')).toHaveLength(1)
  })

  it('keeps the frames through a save and an opening', () => {
    svgCanvas.addFrame({ name: 'Écran 1', x: 0, y: 0, width: 1920, height: 1080 })
    svgCanvas.addFrame({ name: 'Écran 2', x: 1920, y: 0, width: 1920, height: 1080 })
    const saved = svgCanvas.getSvgString()
    expect(saved).toContain('xmlns:se="http://svg-edit.googlecode.com"')
    expect(saved).toMatch(/<se:frame name="Écran 1" x="0" y="0" width="1920" height="1080"\s*\/>/)
    load(saved)
    expect(svgCanvas.getFrames().map((frame) => frame.name)).toEqual(['Écran 1', 'Écran 2'])
    // Saved again without a change: the same text.
    expect(svgCanvas.getSvgString()).toBe(saved)
  })

  it('leaves a document without frames as it was', () => {
    const before = svgCanvas.getSvgString()
    const frame = svgCanvas.addFrame({ x: 0, y: 0, width: 10, height: 10 })
    svgCanvas.removeFrame(frame.element)
    expect(svgCanvas.getSvgString()).toBe(before)
    expect(before).not.toContain('se:frame')
  })

  it('exports a frame: its viewBox, without the frames nor what lies outside', () => {
    const [w, h] = FRAME_PRESETS.hd
    svgCanvas.addFrame({ name: 'Écran 1', x: 0, y: 0, width: w, height: h })
    const frame = svgCanvas.getFrames()[0]
    const svg = svgCanvas.getFrameSvgString(frame.element)
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement
    expect(root.getAttribute('viewBox')).toBe('0 0 1920 1080')
    expect(root.getAttribute('width')).toBe('1920')
    expect(root.getAttribute('height')).toBe('1080')
    expect(doc.getElementById('a')).not.toBeNull()
    // b is at x=2000: wholly outside.
    expect(doc.getElementById('b')).toBeNull()
    expect(svg).not.toContain('se:frame')
    expect(svg).not.toContain('xmlns:se')
    expect(svg).not.toContain('<metadata')
    expect(svg).not.toContain('data-se-export-outside')
    // The document itself is untouched.
    expect(document.getElementById('b').hasAttribute('data-se-export-outside')).toBe(false)
    expect(svgCanvas.getFrames()).toHaveLength(1)
  })

  it('exports the content and a margin without frames', () => {
    const svg = svgCanvas.getContentSvgString(20)
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
    expect(root.getAttribute('viewBox')).toBe('-10 -10 2080 90')
  })

  describe('origin of the viewBox (V5)', () => {
    const FILE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 50 800 600">' +
      '<g class="layer"><title>Layer 1</title>' +
      '<rect id="r" x="150" y="80" width="40" height="30" fill="#160f23"/></g></svg>'

    it('keeps the origin through an opening and a save', () => {
      load(FILE)
      expect(svgCanvas.getPageOrigin()).toEqual({ x: 100, y: 50 })
      expect(svgCanvas.getResolution()).toMatchObject({ w: 800, h: 600 })
      const saved = svgCanvas.getSvgString()
      expect(saved).toContain('viewBox="100 50 800 600"')
      // Nothing moved.
      expect(saved).toContain('<rect id="r" x="150" y="80"')
      load(saved)
      expect(svgCanvas.getSvgString()).toBe(saved)
    })

    it('aligns to the page where it starts', () => {
      load(FILE)
      svgCanvas.clearSelection()
      svgCanvas.addToSelection([document.getElementById('r')])
      svgCanvas.alignSelectedElements('l', 'page')
      expect(document.getElementById('r').getAttribute('x')).toBe('100')
      svgCanvas.alignSelectedElements('t', 'page')
      expect(document.getElementById('r').getAttribute('y')).toBe('50')
    })

    it('starts at 0, 0 for a file without an origin', () => {
      expect(svgCanvas.getPageOrigin()).toEqual({ x: 0, y: 0 })
    })
  })
})
