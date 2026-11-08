import { gridSpacing, GRID_MIN_SPACING, GridLayer } from '../../src/editor/grid.js'

// Lot V2: the grid of the interaction layer.

describe('grid (V2)', () => {
  it('hides the minor lines under 8 pixels and spaces out the major ones', () => {
    expect(GRID_MIN_SPACING).toBe(8)
    expect(gridSpacing(10, 10, 1)).toEqual({ minor: 10, major: 100 })
    expect(gridSpacing(10, 10, 0.5)).toEqual({ minor: null, major: 100 })
    expect(gridSpacing(10, 10, 0.05)).toEqual({ minor: null, major: 1000 })
    expect(gridSpacing(10, 4, 0.01)).toEqual({ minor: null, major: 2560 })
    // One subdivision would never space out: two at least.
    expect(gridSpacing(10, 1, 0.1)).toEqual({ minor: null, major: 80 })
  })

  /**
   * @param {object} config
   * @returns {object} An editor whose canvas is a bare svg root
   */
  const fakeEditor = (config) => {
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const content = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const selectors = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    selectors.id = 'selectorParentGroup'
    root.append(content, selectors)
    return {
      root,
      content,
      configObj: { curConfig: { snappingStep: 10, gridSubdivisions: 10, gridColor: '', baseUnit: 'px', ...config } },
      $container: document.createElement('div'),
      svgCanvas: {
        getSvgRoot: () => root,
        getSvgContent: () => content,
        getZoom: () => 2,
        getOffset: () => ({ x: 33, y: 44 }),
        getTypeMap: () => ({ px: 1, mm: 3.7795 })
      }
    }
  }

  it('lives above the drawing and under the selection, outside the document', () => {
    const editor = fakeEditor({ showGrid: true })
    const grid = new GridLayer(editor)
    expect(editor.content.nextSibling).toBe(grid.group)
    expect(grid.group.nextSibling.id).toBe('selectorParentGroup')
    expect(editor.content.contains(grid.group)).toBe(false)
    // A new drawing put in place of the old one: the grid follows.
    const next = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    editor.root.insertBefore(next, editor.root.firstChild)
    editor.content.remove()
    editor.content = next
    editor.svgCanvas.getSvgContent = () => next
    grid.update()
    expect(next.nextSibling).toBe(grid.group)
  })

  it('places its lines on the origin of the drawing, at the zoom, in the colours of the theme or the settings', () => {
    const editor = fakeEditor({ showGrid: true })
    const grid = new GridLayer(editor)
    grid.update()
    const minor = grid.patterns.minor.pattern
    expect(grid.group.getAttribute('display')).toBe('inline')
    expect([minor.getAttribute('x'), minor.getAttribute('y'), minor.getAttribute('width')]).toEqual(['33', '44', '20'])
    expect(grid.patterns.major.pattern.getAttribute('width')).toBe('200')
    expect(grid.patterns.minor.lines.getAttribute('style')).toBe('fill: var(--se-grid-minor)')
    editor.configObj.curConfig.gridColor = '#f00'
    editor.configObj.curConfig.baseUnit = 'mm'
    grid.update()
    expect(grid.patterns.minor.lines.getAttribute('style')).toMatch(/^fill: #f00; fill-opacity: 0\.18/)
    // 10 mm at 200 %.
    expect(Number(grid.patterns.minor.pattern.getAttribute('width'))).toBeCloseTo(75.59, 2)
  })

  it('shows and hides apart from the snapping, and says so', () => {
    const editor = fakeEditor({ showGrid: false, gridSnapping: true })
    const grid = new GridLayer(editor)
    const changes = []
    editor.$container.addEventListener('se-gridchange', (e) => changes.push(e.detail.visible))
    grid.update()
    expect(grid.group.getAttribute('display')).toBe('none')
    grid.setVisible(true)
    expect(grid.group.getAttribute('display')).toBe('inline')
    expect(editor.configObj.curConfig.gridSnapping).toBe(true)
    grid.setVisible(false)
    expect(changes).toEqual([true, false])
  })
})
