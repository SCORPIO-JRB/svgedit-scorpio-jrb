/**
 * Orthogonal connectors in the editor (lot V7; plan v2, section 2.11): the
 * ports shown on hover, the connector tool that joins two ports, the route
 * that follows the equipments, the elbows that the user drags, and the
 * fluids.
 *
 * - Ports: on hover, in the selection and connector tools, the ports of a
 *   symbol show as small circles; while a connector is drawn, the port
 *   nearest the pointer (declared ports first) is a magnet.
 * - The tool (button of ext-connector): from a port of a symbol, the
 *   connector is orthogonal; between two plain objects it stays the
 *   straight connector of the extension (option `connectorRouting`: "auto",
 *   "orthogonal" for always, "straight" for never). Drag from port to port,
 *   or click one then the other.
 * - The route follows the equipments while they move, and after every
 *   change, undo and redo included.
 * - A selected connector shows a handle in the middle of each segment that
 *   can move: dragging it shapes the route (one undo step), which keeps its
 *   shape when the equipments move. "Automatic route" gives it back.
 * - Each connector has a fluid: colour, width, dashes, arrow of direction.
 *   The one chosen last goes to the next connectors.
 *
 * The overlay is drawn in the root of the canvas, beside the frames: it is
 * never part of the document.
 * @module connectors
 */
import { DEFAULT_FLUIDS } from './fluids.js'
import { escapeHtml } from './panels/TopBar.js'

const NS_SVG = 'http://www.w3.org/2000/svg'
const NS_SE = 'http://svg-edit.googlecode.com'

/** Distance at which a port catches the pointer, in pixels of the screen. */
const MAGNET = 14
/** Radius of a port on the screen. */
const PORT_RADIUS = 4
/** Half side of an elbow handle on the screen. */
const HANDLE = 5

export class ConnectorTool {
  /**
   * @param {import('./Editor.js').default} editor
   */
  constructor (editor) {
    this.editor = editor
    const given = editor.configObj.curConfig.fluids
    this.fluids = Array.isArray(given) && given.length ? given : DEFAULT_FLUIDS
    this.fluidId = this.fluids[0].id
    /** The connector being drawn: {start: {elem, port}, end, points} */
    this.drawing = null
    this.hoverElem = null
    this.frame = null
    this.group = document.createElementNS(NS_SVG, 'g')
    this.group.id = 'se-connector-overlay'
    this.group.addEventListener('pointerdown', (e) => this.handleDown(e))
    editor.workarea?.addEventListener('mousemove', (e) => this.hover(e))
    editor.workarea?.addEventListener('mouseleave', () => this.setHover(null))
    document.addEventListener('modeChange', () => this.modeChanged())
    editor.commands.register({
      id: 'connector_route_auto',
      label: 'connectors.route_auto',
      when: () => this.selectedConnectors().some((conn) => conn.getAttribute('se:route') === 'manual'),
      run: () => this.canvas.resetConnectorRoute(this.selectedConnectors())
    })
    this.place()
  }

  get canvas () {
    return this.editor.svgCanvas
  }

  /**
   * @returns {"auto"|"orthogonal"|"straight"}
   */
  get routing () {
    return this.editor.configObj.curConfig.connectorRouting ?? 'auto'
  }

  /**
   * @param {string} id
   * @returns {object} A fluid, the first one when unknown
   */
  fluid (id) {
    return this.fluids.find((fluid) => fluid.id === id) ?? this.fluids[0]
  }

  /**
   * @param {Element} conn
   * @returns {string} The name of the fluid of a connector
   */
  fluidLabelOf (conn) {
    const id = conn.getAttributeNS(NS_SE, 'fluid') || conn.getAttribute('se:fluid')
    const fluid = id && this.fluids.find((candidate) => candidate.id === id)
    return fluid ? this.editor.i18next.t(fluid.name, { defaultValue: fluid.name }) : ''
  }

  /**
   * @returns {Element[]} The orthogonal connectors of the selection
   */
  selectedConnectors () {
    return this.canvas.getSelectedElements().filter((el) => el && this.canvas.isOrthogonalConnector(el))
  }

  // ---------------------------------------------------------------------
  // The route follows the equipments.

  /**
   * After a change of the document (the undo and redo included): the
   * connectors joined to what changed take their route again.
   * @param {Element[]} elems
   * @returns {void}
   */
  elementsChanged (elems) {
    const content = this.canvas.getSvgContent()
    // The root and the layers change for reasons of their own (size, name):
    // opening a file changes nothing of its connectors.
    const list = (elems ?? []).filter((el) => el && el !== content && el.localName !== 'svg' &&
      !this.canvas.isLayer?.(el) && content.contains(el))
    if (list.length) {
      const conns = this.canvas.connectorsOf(list)
      if (conns.length) this.canvas.rerouteConnectors(conns)
    }
    this.scheduleOverlay()
  }

  /**
   * During a move of the selection: once per frame, the connectors follow.
   * @param {Element[]} elems
   * @returns {void}
   */
  transition (elems) {
    this.pending = elems
    if (this.transitionFrame) return
    this.transitionFrame = requestAnimationFrame(() => {
      this.transitionFrame = null
      const conns = this.canvas.connectorsOf(this.pending ?? [])
      if (conns.length) this.canvas.rerouteConnectors(conns)
      this.scheduleOverlay()
    })
  }

  // ---------------------------------------------------------------------
  // The overlay: ports, elbows, connector being drawn.

  /**
   * Over everything in the root of the canvas: the drawing (which an opening
   * builds again), the grid, the frames and the selection. The group takes
   * no pointer, only its elbow handles do.
   * @returns {void}
   */
  place () {
    const root = this.canvas.getSvgRoot?.()
    if (root && root.lastElementChild !== this.group) root.append(this.group)
  }

  /**
   * @returns {void}
   */
  scheduleOverlay () {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.updateOverlay()
    })
  }

  /**
   * Draws the ports of the object under the pointer, the elbows of the
   * selected connector and the connector being drawn.
   * @returns {void}
   */
  updateOverlay () {
    this.place()
    const zoom = this.canvas.getZoom()
    const offset = this.canvas.getOffset()
    this.group.setAttribute('transform', `translate(${offset.x},${offset.y})`)
    const parts = []
    const ports = []
    if (this.drawing) {
      ports.push(...this.portsToShow(this.drawing.start.elem))
      if (this.drawing.end?.elem) ports.push(...this.portsToShow(this.drawing.end.elem))
    } else if (this.hoverElem?.isConnected) {
      ports.push(...this.portsToShow(this.hoverElem))
    }
    const target = this.drawing?.end?.port
    for (const port of ports) {
      const on = target && Math.abs(port.x - target.x) < 0.01 && Math.abs(port.y - target.y) < 0.01
      parts.push(`<circle class="se-port se-port-${escapeHtml(port.kind)}${port.implicit ? ' se-port-implicit' : ''}${on ? ' se-port-target' : ''}"
        cx="${port.x * zoom}" cy="${port.y * zoom}" r="${PORT_RADIUS}"/>`)
    }
    if (this.drawing?.points) {
      const points = this.drawing.points.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ')
      parts.unshift(`<polyline class="se-connector-preview" points="${points}"/>`)
    }
    const selected = this.selectedConnectors()
    if (!this.drawing && selected.length === 1 && this.canvas.getMode() === 'select') {
      const conn = selected[0]
      const points = this.canvas.parseRoutePoints(conn.getAttribute('points'))
      for (const seg of this.canvas.movableSegments(points)) {
        parts.push(`<rect class="se-elbow se-elbow-${seg.vertical ? 'v' : 'h'}" data-index="${seg.index}"
          x="${seg.x * zoom - HANDLE}" y="${seg.y * zoom - HANDLE}" width="${HANDLE * 2}" height="${HANDLE * 2}" rx="2"/>`)
      }
    }
    this.group.innerHTML = parts.join('')
  }

  /**
   * @param {Element} elem
   * @returns {object[]} Its ports, those it declares, else the middle of
   *   its sides (only while drawing a connector)
   */
  portsToShow (elem) {
    const ports = this.canvas.portsOf(elem)
    const declared = ports.filter((port) => !port.implicit)
    if (declared.length) return declared
    return this.drawing ? ports : []
  }

  /**
   * @param {Element|null} elem
   * @returns {void}
   */
  setHover (elem) {
    if (elem === this.hoverElem) return
    this.hoverElem = elem
    this.scheduleOverlay()
  }

  /**
   * The object of the drawing under the pointer, as a click would take it;
   * null over anything else (the overlay, the rulers, the selection).
   * @param {MouseEvent} e
   * @returns {Element|null}
   */
  mouseTarget (e) {
    const content = this.canvas.getSvgContent()
    if (!content?.contains(e.target) || e.target === content) return null
    try {
      const target = this.canvas.getMouseTarget(e)
      return target && target !== this.canvas.getSvgRoot() && content.contains(target) ? target : null
    } catch (_err) {
      return null
    }
  }

  /**
   * The pointer over the canvas: the ports of the symbol under it show.
   * @param {MouseEvent} e
   * @returns {void}
   */
  hover (e) {
    const mode = this.canvas.getMode()
    if (this.drawing || e.buttons || (mode !== 'select' && mode !== 'connector')) {
      if (!this.drawing) this.setHover(null)
      return
    }
    const target = this.mouseTarget(e)
    const elem = target && !this.canvas.isOrthogonalConnector(target) ? target : null
    const near = elem ?? this.symbolNear(this.editor.view.screenToDoc(e.clientX, e.clientY))
    this.setHover(near && this.canvas.hasDeclaredPorts(near) ? near : null)
  }

  /**
   * The symbol with a port within reach of a point (the pointer may be just
   * outside the drawing of the symbol).
   * @param {{x: number, y: number}} point
   * @returns {Element|null}
   */
  symbolNear (point) {
    const found = this.canvas.portNear(this.candidates(), point, MAGNET / this.canvas.getZoom())
    return found && !found.port.implicit ? found.elem : null
  }

  /**
   * The symbols of the visible layers, whose ports are magnets: a connector
   * may go in a layer of its own (the networks of a synoptic) and join the
   * equipments of another. A locked or hidden symbol takes none.
   * @returns {Element[]}
   */
  candidates () {
    const drawing = this.canvas.getCurrentDrawing()
    const layers = drawing.all_layers.map((layer) => layer.getGroup())
      .filter((group) => group.getAttribute('display') !== 'none')
    return layers.flatMap((group) => [...group.querySelectorAll('use')]).filter((use) =>
      this.canvas.hasDeclaredPorts(use) && !this.canvas.isLocked?.(use) && use.getAttribute('display') !== 'none' &&
      !use.closest('[display="none"]'))
  }

  /**
   * Where the pointer starts or ends a connector: the port within reach
   * (declared first), else the object under the pointer and its side nearest
   * a point.
   * @param {MouseEvent} evt
   * @param {{x: number, y: number}} point
   * @param {{x: number, y: number}} [toward]
   * @param {Element} [exclude]
   * @returns {{elem: Element, port: object}|null}
   */
  endAt (evt, point, toward = point, exclude = null) {
    const radius = MAGNET / this.canvas.getZoom()
    const candidates = this.candidates().filter((el) => el !== exclude)
    const found = this.canvas.portNear(candidates, point, radius)
    if (found && !found.port.implicit) return found
    const target = this.mouseTarget(evt)
    if (!target || target === exclude || this.canvas.isOrthogonalConnector(target)) return null
    const ports = this.canvas.portsOf(target)
    if (!ports.length) return null
    const declared = ports.filter((port) => !port.implicit)
    const pool = declared.length ? declared : ports
    const port = pool.reduce((best, p) => (Math.hypot(p.x - toward.x, p.y - toward.y) < Math.hypot(best.x - toward.x, best.y - toward.y) ? p : best))
    return { elem: target, port }
  }

  // ---------------------------------------------------------------------
  // The tool, called by ext-connector.

  /**
   * @param {{event: MouseEvent}} opts
   * @returns {{started: boolean}|undefined} Undefined: the straight
   *   connector of the extension takes the gesture
   */
  toolDown (opts) {
    if (this.drawing) return { started: true }
    if (this.routing === 'straight') return undefined
    const evt = opts.event
    const point = this.editor.view.screenToDoc(evt.clientX, evt.clientY)
    const start = this.endAt(evt, point)
    if (!start) return undefined
    if (this.routing === 'auto' && start.port.implicit) return undefined
    this.drawing = { start, end: null, points: null, from: { x: evt.clientX, y: evt.clientY } }
    this.toolMove(opts)
    return { started: true }
  }

  /**
   * @param {{event: MouseEvent}} opts
   * @returns {void}
   */
  toolMove (opts) {
    if (!this.drawing) return
    const evt = opts.event
    const point = this.editor.view.screenToDoc(evt.clientX, evt.clientY)
    const { start } = this.drawing
    const away = Math.hypot(evt.clientX - this.drawing.from.x, evt.clientY - this.drawing.from.y) > 4
    const end = away ? this.endAt(evt, point, start.port, start.elem) : null
    this.drawing.end = end
    const to = end
      ? { x: end.port.x, y: end.port.y, dir: end.port.dir }
      : { x: point.x, y: point.y, dir: oppositeDir(start.port, point) }
    this.drawing.points = this.canvas.routeOrthogonal(
      { x: start.port.x, y: start.port.y, dir: start.port.dir },
      to,
      { grid: this.gridStep() }
    )
    this.scheduleOverlay()
  }

  /**
   * @param {{event: MouseEvent}} opts
   * @returns {{keep: boolean, element: null, started: boolean}|undefined}
   */
  toolUp (opts) {
    if (!this.drawing) return undefined
    const evt = opts.event
    const moved = Math.hypot(evt.clientX - this.drawing.from.x, evt.clientY - this.drawing.from.y) > 4
    const { start, end } = this.drawing
    // A click on the start: the end is the next click.
    if (!moved && !this.drawing.clicked) {
      this.drawing.clicked = true
      return { keep: true, element: null, started: true }
    }
    if (!end) {
      this.cancel()
      return { keep: false, element: null, started: false }
    }
    this.drawing = null
    const conn = this.canvas.addConnector({
      start: start.elem,
      startPort: start.port.id,
      end: end.elem,
      endPort: end.port.id,
      fluid: this.fluid(this.fluidId)
    })
    this.scheduleOverlay()
    if (conn) {
      this.canvas.setMode('select')
      this.editor.leftPanel?.clickSelect?.()
      this.canvas.selectOnly([conn], true)
    }
    return { keep: true, element: null, started: false }
  }

  /**
   * @returns {void}
   */
  cancel () {
    this.drawing = null
    this.scheduleOverlay()
  }

  /**
   * @returns {void}
   */
  modeChanged () {
    if (this.drawing && this.canvas.getMode() !== 'connector') this.cancel()
    this.panel?.refresh()
    this.scheduleOverlay()
  }

  /**
   * @returns {number}
   */
  gridStep () {
    const config = this.editor.configObj.curConfig
    return config.gridSnapping ? Number(config.snappingStep) || 0 : 0
  }

  // ---------------------------------------------------------------------
  // Elbows

  /**
   * A press on an elbow handle: the segment follows the pointer across its
   * direction; the release shapes the route, in one undo step.
   * @param {PointerEvent} e
   * @returns {void}
   */
  handleDown (e) {
    const handle = e.target.closest?.('.se-elbow')
    const [conn] = this.selectedConnectors()
    if (!handle || !conn) return
    // The canvas does not see this press.
    e.preventDefault()
    e.stopPropagation()
    const index = Number(handle.dataset.index)
    const original = conn.getAttribute('points')
    const points = this.canvas.parseRoutePoints(original)
    const a = points[index]
    const b = points[index + 1]
    if (!a || !b) return
    const vertical = Math.abs(a.x - b.x) < 1e-6
    const startValue = vertical ? a.x : a.y
    const zoom = this.canvas.getZoom()
    const step = this.gridStep()
    let shaped = null
    const move = (ev) => {
      const delta = vertical ? (ev.clientX - e.clientX) / zoom : (ev.clientY - e.clientY) / zoom
      let value = startValue + delta
      value = step > 0 ? Math.round(value / step) * step : Math.round(value * 2) / 2
      shaped = this.canvas.moveSegment(points, index, value)
      if (shaped) {
        conn.setAttribute('points', shaped.map((p) => `${p.x},${p.y}`).join(' '))
        this.updateOverlay()
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      // The history records the change from the route before the drag.
      conn.setAttribute('points', original)
      if (shaped) this.canvas.setManualRoute(conn, shaped)
      this.scheduleOverlay()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
}

/**
 * The direction a route arrives at a free point from: against the side of
 * the start it lies on.
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} point
 * @returns {"left"|"right"|"up"|"down"}
 */
const oppositeDir = (from, point) => {
  const dx = from.x - point.x
  const dy = from.y - point.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'down' : 'up'
}

/**
 * The Connector section of the inspector: the fluid of the selected
 * connectors (or of the next ones, while the tool is on), the arrow of
 * direction, the automatic route, and the two ends.
 */
export class ConnectorPanel {
  /**
   * @param {import('./Editor.js').default} editor
   * @param {ConnectorTool} tool
   * @param {HTMLElement} body
   */
  constructor (editor, tool, body) {
    this.editor = editor
    this.tool = tool
    tool.panel = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const options = tool.fluids.map((fluid) =>
      `<option value="${escapeHtml(fluid.id)}">${escapeHtml(editor.i18next.t(fluid.name, { defaultValue: fluid.name }))}</option>`).join('')
    body.innerHTML = `<div class="se-connector-panel" hidden>
      <label class="se-field se-field-wide">${t('connectors.fluid')}<select id="se-connector-fluid">${options}</select></label>
      <label class="se-check se-connector-only"><input type="checkbox" id="se-connector-arrow">${t('connectors.arrow')}</label>
      <p class="se-connector-ends se-connector-only"></p>
      <div class="se-symbol-actions se-connector-only">
        <button type="button" class="se-text-button" id="se-connector-auto">${t('connectors.route_auto')}</button>
      </div></div>`
    this.$panel = body.querySelector('.se-connector-panel')
    this.$fluid = body.querySelector('#se-connector-fluid')
    this.$arrow = body.querySelector('#se-connector-arrow')
    this.$auto = body.querySelector('#se-connector-auto')
    this.$fluid.addEventListener('change', () => {
      tool.fluidId = this.$fluid.value
      const conns = tool.selectedConnectors()
      if (conns.length) editor.svgCanvas.setConnectorFluid(conns, tool.fluid(this.$fluid.value))
      this.refresh()
    })
    this.$arrow.addEventListener('change', () => {
      editor.svgCanvas.setConnectorArrow(tool.selectedConnectors(), this.$arrow.checked)
      this.refresh()
    })
    this.$auto.addEventListener('click', () => {
      editor.svgCanvas.resetConnectorRoute(tool.selectedConnectors())
      this.refresh()
    })
  }

  /**
   * @returns {void}
   */
  refresh () {
    const { editor, tool } = this
    const conns = tool.selectedConnectors()
    const drawingTool = editor.svgCanvas.getMode() === 'connector' && !editor.svgCanvas.getSelectedElements().filter(Boolean).length
    this.$panel.hidden = !conns.length && !drawingTool
    if (this.$panel.hidden) return
    for (const el of this.$panel.querySelectorAll('.se-connector-only')) el.hidden = !conns.length
    if (!conns.length) {
      this.$fluid.value = tool.fluidId
      return
    }
    const first = conns[0]
    const fluid = first.getAttributeNS(NS_SE, 'fluid')
    if (fluid && document.activeElement !== this.$fluid) this.$fluid.value = fluid
    this.$arrow.checked = conns.every((conn) => conn.hasAttribute('marker-end'))
    this.$auto.disabled = !conns.some((conn) => conn.getAttributeNS(NS_SE, 'route') === 'manual')
    const t = (key, options) => editor.i18next.t(key, options)
    if (conns.length === 1) {
      const { start, end, startPort, endPort } = editor.svgCanvas.connectorEnds(first)
      const name = (elem) => (elem ? (elem.querySelector(':scope > title')?.textContent.trim() || elem.id) : t('connectors.missing'))
      this.$panel.querySelector('.se-connector-ends').textContent = t('connectors.ends', {
        start: name(start), startPort, end: name(end), endPort
      })
    } else {
      this.$panel.querySelector('.se-connector-ends').textContent = t('connectors.count', { count: conns.length })
    }
  }
}
