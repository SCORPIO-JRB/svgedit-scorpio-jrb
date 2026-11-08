/**
 * The grid (plan v2, section 4.3, lot V2).
 *
 * The interaction layer draws it, over the whole view and never in the
 * document: two patterns on the canvas, above the drawing and under the
 * selection, which the view moves with the drawing. Minor lines every step,
 * major lines every `gridSubdivisions` steps. The minor lines go when they
 * would be closer than 8 pixels on the screen; the major ones then space out
 * by the number of subdivisions, so that the grid stays readable at any zoom.
 *
 * Showing the grid (`showGrid`) and snapping to it (`gridSnapping`) are two
 * separate settings. The step (`snappingStep`) is both where the lines are
 * and where the drawing snaps; the colour (`gridColor`) is the one of the
 * theme when empty.
 */

const NS_SVG = 'http://www.w3.org/2000/svg'

// Under this spacing on the screen, in pixels, a line of the grid is not drawn.
export const GRID_MIN_SPACING = 8

/**
 * The spacing of the lines drawn, in units of the drawing.
 * @param {number} step
 * @param {number} subdivisions
 * @param {number} zoom
 * @returns {{minor: number|null, major: number}} `minor` is null when the minor lines are hidden
 */
export const gridSpacing = (step, subdivisions, zoom) => {
  const factor = Math.max(2, Math.round(subdivisions) || 2)
  const minor = step * zoom >= GRID_MIN_SPACING ? step : null
  let major = step * factor
  while (major * zoom < GRID_MIN_SPACING) major *= factor
  return { minor, major }
}

/**
 * @param {*} value
 * @param {number} fallback
 * @returns {number} A positive number
 */
const positive = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export class GridLayer {
  /**
   * @param {object} editor The editor: its svgCanvas, configObj and $container
   */
  constructor (editor) {
    this.editor = editor
    const make = (name, attrs = {}) => {
      const el = document.createElementNS(NS_SVG, name)
      Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value))
      return el
    }
    this.group = make('g', { id: 'se-grid', display: 'none', 'pointer-events': 'none' })
    const defs = make('defs')
    this.patterns = {}
    this.rects = {}
    for (const kind of ['minor', 'major']) {
      const pattern = make('pattern', { id: `se-grid-${kind}`, patternUnits: 'userSpaceOnUse' })
      // One line along the top and one along the left of each cell, a pixel
      // wide, on whole pixels.
      const lines = make('path', { 'shape-rendering': 'crispEdges' })
      pattern.append(lines)
      defs.append(pattern)
      const rect = make('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: `url(#se-grid-${kind})` })
      this.patterns[kind] = { pattern, lines }
      this.rects[kind] = rect
    }
    this.group.append(defs, this.rects.minor, this.rects.major)
    this.place()
    // The view calls update() when it moves the drawing on the canvas or
    // zooms; a scroll moves the grid with the canvas. The colours of the
    // theme apply by themselves.
  }

  /**
   * Keeps the grid right above the drawing, under the selection and the
   * guides: loading a document puts a new drawing in place of the old one.
   * @returns {void}
   */
  place () {
    const content = this.editor.svgCanvas.getSvgContent()
    if (content?.parentNode && content.nextSibling !== this.group) {
      content.after(this.group)
    } else if (!content?.parentNode && !this.group.parentNode) {
      this.editor.svgCanvas.getSvgRoot().append(this.group)
    }
  }

  get config () {
    return this.editor.configObj.curConfig
  }

  get visible () {
    return Boolean(this.config.showGrid)
  }

  /**
   * @param {boolean} on
   * @returns {void}
   */
  setVisible (on) {
    this.config.showGrid = Boolean(on)
    this.update()
    this.editor.$container?.dispatchEvent(new CustomEvent('se-gridchange', { detail: { visible: this.visible } }))
  }

  /**
   * Draws the grid again for the zoom, the place of the drawing on the
   * canvas and the settings.
   * @returns {void}
   */
  update () {
    this.place()
    if (!this.visible) {
      this.group.setAttribute('display', 'none')
      return
    }
    const { svgCanvas } = this.editor
    const zoom = svgCanvas.getZoom()
    const offset = svgCanvas.getOffset()
    // The step is in the base unit, like the snapping (see snapToGrid).
    const unit = svgCanvas.getTypeMap?.()[this.config.baseUnit] || 1
    const step = positive(this.config.snappingStep, 10) * unit
    const { minor, major } = gridSpacing(step, positive(this.config.gridSubdivisions, 10), zoom)
    const color = String(this.config.gridColor || '').trim()
    this.group.setAttribute('display', 'inline')
    for (const kind of ['minor', 'major']) {
      const spacing = kind === 'minor' ? minor : major
      const { pattern, lines } = this.patterns[kind]
      const rect = this.rects[kind]
      if (!spacing) {
        rect.setAttribute('display', 'none')
        continue
      }
      rect.removeAttribute('display')
      const cell = spacing * zoom
      pattern.setAttribute('x', offset.x)
      pattern.setAttribute('y', offset.y)
      pattern.setAttribute('width', cell)
      pattern.setAttribute('height', cell)
      lines.setAttribute('d', `M0 0H${cell}V1H0ZM0 0H1V${cell}H0Z`)
      // A colour of the settings, lighter for the minor lines; else the
      // colours of the theme.
      lines.setAttribute('style', color
        ? `fill: ${color}; fill-opacity: ${kind === 'minor' ? 0.18 : 0.4}`
        : `fill: var(--se-grid-${kind})`)
    }
  }

  /**
   * @returns {void}
   */
  destroy () {
    this.group.remove()
  }
}
