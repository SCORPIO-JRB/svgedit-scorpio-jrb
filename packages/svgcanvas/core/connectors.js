/**
 * Orthogonal connectors (lot V7; plan v2, section 2.11): networks at right
 * angles between the ports of two equipments, whose route follows them.
 *
 * A connector is a `<polyline>`, as those of the connector extension, with
 * what the editor needs to keep it joined, in its namespace:
 *
 *   <polyline id="conn_svg_12" points="…" fill="none" stroke="#F08A62"
 *     stroke-width="3" marker-end="url(#se-arrow-F08A62)" class="tuyau chaud depart"
 *     se:connector="svg_5 svg_9" se:start-port="out" se:end-port="in"
 *     se:route="auto" se:fluid="chaud-depart"/>
 *
 * - `se:connector` names the two equipments by their id, as before, so that
 *   a copy or an import renames them with the objects (IDsUpdated).
 * - `se:route` is `auto` (the router draws the route) or `manual` (the user
 *   moved a segment: the shape is kept, its ends follow). Without it, the
 *   connector is a straight one of the extension, which keeps its own ways.
 * - `se:fluid` names the style: colour, width, dashes, arrow of direction.
 *
 * The route is a function of the ports and of the shape kept: it is drawn
 * again after every change of an equipment, the undo and redo included, so
 * the history does not record it; a change of shape or of fluid is one step.
 * @module connectors
 */
import { NS } from './namespaces.js'
import { BatchCommand, ChangeElementCommand, InsertElementCommand } from './history.js'
import { findDefs } from './utilities.js'
import { portsOf, portOf, hasDeclaredPorts } from './ports.js'
import { drawingBoxOf } from './multi-transform.js'
import { route, followEnds, simplify, parsePoints, formatPoints, movableSegments, moveSegment } from './orthogonal.js'

let svgCanvas = null

/**
 * @param {Element} elem
 * @param {string} name Without prefix
 * @returns {string|null} An attribute of the editor namespace
 */
const seAttr = (elem, name) => elem?.getAttributeNS?.(NS.SE, name) ?? elem?.getAttribute?.(`se:${name}`) ?? null

/**
 * @param {Element} elem
 * @returns {boolean} An orthogonal connector
 */
export const isOrthogonalConnector = (elem) => Boolean(elem?.nodeType === 1 && seAttr(elem, 'connector') && seAttr(elem, 'route'))

/**
 * @returns {Element[]} The orthogonal connectors of the drawing
 */
export const orthogonalConnectors = () => [...svgCanvas.getSvgContent().querySelectorAll('polyline, path')]
  .filter(isOrthogonalConnector)

/**
 * @param {Element} conn
 * @returns {{start: Element|null, end: Element|null, startPort: string|null, endPort: string|null}}
 */
export const connectorEnds = (conn) => {
  const [startId, endId] = (seAttr(conn, 'connector') ?? '').split(' ')
  const get = (id) => (id ? svgCanvas.getSvgContent().querySelector(`[id="${CSS.escape(id)}"]`) : null)
  return { start: get(startId), end: get(endId), startPort: seAttr(conn, 'start-port'), endPort: seAttr(conn, 'end-port') }
}

/**
 * The port of an end, with the box of its equipment.
 * @param {Element} elem
 * @param {string|null} id
 * @param {{x: number, y: number}} [toward] For a missing port: the one of the
 *   sides nearest this point
 * @returns {import('./orthogonal.js').End|null}
 */
export const endOf = (elem, id, toward) => {
  if (!elem?.isConnected) return null
  let port = id ? portOf(elem, id) : null
  if (!port) {
    const ports = portsOf(elem)
    if (!ports.length) return null
    port = toward
      ? ports.reduce((best, p) => (Math.hypot(p.x - toward.x, p.y - toward.y) < Math.hypot(best.x - toward.x, best.y - toward.y) ? p : best))
      : ports[0]
  }
  let box = null
  try {
    box = drawingBoxOf([elem])
  } catch (_e) {
    box = null
  }
  return { x: port.x, y: port.y, dir: port.dir, box, id: port.id }
}

/**
 * @returns {number} The step of the grid when it snaps, else 0
 */
const gridStep = () => {
  const config = svgCanvas.getCurConfig()
  return config.gridSnapping ? Number(config.snappingStep) || 0 : 0
}

/**
 * The route a connector should have now, and whether a manual shape had to
 * be given up.
 * @param {Element} conn
 * @param {Map<Element, {dx: number, dy: number}>|null} moved Offsets of ends
 *   being dragged
 * @returns {{points: {x: number, y: number}[], demoted: boolean}|null}
 */
/**
 * The boxes of the symbols of the drawing, read once per pass: the other
 * equipments a route goes round.
 * @returns {Map<Element, {x: number, y: number, width: number, height: number}>}
 */
const symbolBoxes = () => {
  const boxes = new Map()
  for (const use of svgCanvas.getSvgContent().querySelectorAll('use')) {
    if (use.getAttribute('display') === 'none' || !hasDeclaredPorts(use)) continue
    try {
      const box = drawingBoxOf([use])
      if (box) boxes.set(use, box)
    } catch (_e) { /* not drawn */ }
  }
  return boxes
}

/**
 * The other equipments in the way of a route: those whose box meets the
 * region of its two ends, widened.
 * @param {Map<Element, object>} boxes
 * @param {Element[]} ends
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {object[]}
 */
const obstaclesBetween = (boxes, ends, a, b) => {
  const pad = 80
  const left = Math.min(a.x, b.x) - pad
  const right = Math.max(a.x, b.x) + pad
  const top = Math.min(a.y, b.y) - pad
  const bottom = Math.max(a.y, b.y) + pad
  const out = []
  for (const [elem, box] of boxes) {
    if (ends.some((end) => end === elem || elem.contains?.(end) || end?.contains?.(elem))) continue
    if (box.x > right || box.x + box.width < left || box.y > bottom || box.y + box.height < top) continue
    out.push(box)
  }
  return out
}

const compute = (conn, moved, boxes = null) => {
  const { start, end, startPort, endPort } = connectorEnds(conn)
  const a = endOf(start, startPort)
  const b = endOf(end, endPort)
  if (!a || !b) return null
  const shift = (endInfo, elem) => {
    const offset = moved && [...moved.keys()].find((m) => m === elem || m.contains?.(elem))
    if (!offset) return endInfo
    const { dx, dy } = moved.get(offset)
    return {
      ...endInfo,
      x: endInfo.x + dx,
      y: endInfo.y + dy,
      box: endInfo.box && { ...endInfo.box, x: endInfo.box.x + dx, y: endInfo.box.y + dy }
    }
  }
  const s = shift(a, start)
  const e = shift(b, end)
  const manual = seAttr(conn, 'route') === 'manual'
  if (manual) {
    const kept = followEnds(parsePoints(conn.getAttribute('points')), s, e)
    if (kept) return { points: kept, demoted: false }
  }
  const obstacles = obstaclesBetween(boxes ?? symbolBoxes(), [start, end], s, e)
  return { points: route(s, e, { grid: gridStep(), obstacles }), demoted: manual }
}

/**
 * The route a connector should have now.
 * @param {Element} conn
 * @param {Map<Element, {dx: number, dy: number}>|null} [moved] Offsets of
 *   ends being dragged
 * @returns {{x: number, y: number}[]|null}
 */
export const routeOf = (conn, moved = null) => compute(conn, moved)?.points ?? null

/**
 * Draws again the route of connectors, outside the history (see the head of
 * the module). A manual route whose shape can no more be kept (an equipment
 * turned a quarter) becomes automatic.
 * @param {Element[]} conns
 * @param {Map<Element, {dx: number, dy: number}>|null} [moved] See routeOf
 * @returns {Element[]} The connectors whose points changed
 */
export const reroute = (conns, moved = null) => {
  const changed = []
  const boxes = conns.length ? symbolBoxes() : null
  for (const conn of conns) {
    const result = compute(conn, moved, boxes)
    if (!result) continue
    const text = formatPoints(result.points)
    if (conn.getAttribute('points') !== text) {
      conn.setAttribute('points', text)
      changed.push(conn)
    }
    if (result.demoted && !moved) conn.setAttributeNS(NS.SE, 'se:route', 'auto')
  }
  return changed
}

/**
 * The connectors joined to some objects, or to what they hold: a connector
 * whose end lies in a group that moves follows it.
 * @param {Element[]} elems
 * @returns {Element[]}
 */
export const connectorsOf = (elems) => {
  const set = new Set(elems.filter(Boolean))
  if (!set.size) return []
  const content = svgCanvas.getSvgContent()
  const reached = (elem) => {
    for (let node = elem; node && node !== content; node = node.parentNode) {
      if (set.has(node)) return true
    }
    return false
  }
  return orthogonalConnectors().filter((conn) => {
    if (set.has(conn)) return true
    const { start, end } = connectorEnds(conn)
    return (start && reached(start)) || (end && reached(end))
  })
}

/**
 * @typedef {object} Fluid A style of network
 * @property {string} id
 * @property {string} [name]
 * @property {string} stroke
 * @property {number} width
 * @property {string} [dash] stroke-dasharray
 * @property {boolean} [arrow] An arrow of direction at the end
 * @property {string} [className] Classes of the pipe, as in the synoptics
 */

/**
 * The marker of an arrow of a colour, in the defs (created once).
 * @param {string} color
 * @param {BatchCommand} batch
 * @returns {string} Its id
 */
const arrowMarker = (color, batch) => {
  const id = `se-arrow-${String(color).replace(/[^\w]/g, '')}`
  if (svgCanvas.getSvgContent().querySelector(`marker[id="${id}"]`)) return id
  const marker = document.createElementNS(NS.SVG, 'marker')
  marker.id = id
  for (const [name, value] of Object.entries({
    viewBox: '0 0 10 10', refX: '10', refY: '5', markerWidth: '4', markerHeight: '4', orient: 'auto', markerUnits: 'strokeWidth'
  })) marker.setAttribute(name, value)
  const tip = document.createElementNS(NS.SVG, 'path')
  tip.setAttribute('d', 'M0,0L10,5L0,10z')
  tip.setAttribute('fill', color)
  marker.append(tip)
  findDefs().append(marker)
  // As an opening would leave it (see symbols.js)
  svgCanvas.normalizeAsOpened?.(marker)
  batch.addSubCommand(new InsertElementCommand(marker))
  return id
}

/**
 * The attributes a fluid gives a connector.
 * @param {Fluid} fluid
 * @param {BatchCommand} batch Receives the marker, when one is created
 * @param {boolean} [arrow] Overrides the arrow of the fluid
 * @returns {Object<string, string|null>}
 */
const fluidAttributes = (fluid, batch, arrow = fluid.arrow) => ({
  stroke: fluid.stroke,
  'stroke-width': String(fluid.width),
  'stroke-dasharray': fluid.dash || null,
  'marker-end': arrow ? `url(#${arrowMarker(fluid.stroke, batch)})` : null,
  class: fluid.className || null
})

/**
 * Joins two equipments by a connector: one undo step; it goes under the
 * objects of the layer, as the pipes of a synoptic.
 * @param {object} spec
 * @param {Element} spec.start
 * @param {string} spec.startPort
 * @param {Element} spec.end
 * @param {string} spec.endPort
 * @param {Fluid} spec.fluid
 * @returns {Element|null}
 */
export const addConnector = ({ start, startPort, end, endPort, fluid }) => {
  if (!start?.id || !end?.id || start === end) return null
  if (svgCanvas.lockedDrawingTarget?.()) {
    svgCanvas.call('locked', svgCanvas.lockedDrawingTarget())
    return null
  }
  const batch = new BatchCommand('Add connector')
  const conn = document.createElementNS(NS.SVG, 'polyline')
  conn.id = `conn_${svgCanvas.getNextId()}`
  conn.setAttribute('fill', 'none')
  for (const [name, value] of Object.entries(fluidAttributes(fluid, batch))) {
    if (value !== null && value !== undefined) conn.setAttribute(name, value)
  }
  conn.setAttribute('stroke-linejoin', 'round')
  conn.setAttributeNS(NS.SE, 'se:connector', `${start.id} ${end.id}`)
  conn.setAttributeNS(NS.SE, 'se:start-port', startPort)
  conn.setAttributeNS(NS.SE, 'se:end-port', endPort)
  conn.setAttributeNS(NS.SE, 'se:route', 'auto')
  conn.setAttributeNS(NS.SE, 'se:fluid', fluid.id)
  const parent = svgCanvas.getCurrentGroup?.() || svgCanvas.getCurrentDrawing().getCurrentLayer()
  // Under the objects, after the title of the layer
  let first = parent.firstElementChild
  while (first && first.localName === 'title') first = first.nextElementSibling
  parent.insertBefore(conn, first)
  const points = routeOf(conn)
  if (!points) {
    conn.remove()
    return null
  }
  conn.setAttribute('points', formatPoints(points))
  batch.addSubCommand(new InsertElementCommand(conn))
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', [conn])
  return conn
}

/**
 * Gives connectors the style of a fluid: one undo step.
 * @param {Element[]} conns
 * @param {Fluid} fluid
 * @param {object} [options]
 * @param {boolean} [options.arrow] Overrides the arrow of the fluid
 * @returns {BatchCommand|null}
 */
export const setFluid = (conns, fluid, { arrow } = {}) => {
  const list = conns.filter(isOrthogonalConnector)
  if (!list.length) return null
  const batch = new BatchCommand('Change fluid')
  for (const conn of list) {
    const attrs = { ...fluidAttributes(fluid, batch, arrow ?? fluid.arrow), 'se:fluid': fluid.id }
    const old = {}
    for (const [name, value] of Object.entries(attrs)) {
      old[name] = conn.getAttribute(name)
      if (value === null) conn.removeAttribute(name)
      else if (name.startsWith('se:')) conn.setAttributeNS(NS.SE, name, value)
      else conn.setAttribute(name, value)
    }
    batch.addSubCommand(new ChangeElementCommand(conn, old))
  }
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', list)
  return batch
}

/**
 * Shows or hides the arrow of direction of connectors: one undo step.
 * @param {Element[]} conns
 * @param {boolean} on
 * @returns {BatchCommand|null}
 */
export const setArrow = (conns, on) => {
  const list = conns.filter(isOrthogonalConnector)
  if (!list.length) return null
  const batch = new BatchCommand('Change fluid')
  for (const conn of list) {
    const old = conn.getAttribute('marker-end')
    if (on) conn.setAttribute('marker-end', `url(#${arrowMarker(conn.getAttribute('stroke') || '#000000', batch)})`)
    else conn.removeAttribute('marker-end')
    if (conn.getAttribute('marker-end') !== old) batch.addSubCommand(new ChangeElementCommand(conn, { 'marker-end': old }))
  }
  if (batch.isEmpty()) return null
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', list)
  return batch
}

/**
 * Gives a connector the route the user shaped (a segment dragged): it
 * becomes manual. One undo step.
 * @param {Element} conn
 * @param {{x: number, y: number}[]} points
 * @returns {BatchCommand|null}
 */
export const setManualRoute = (conn, points) => {
  const text = formatPoints(simplify(points))
  const old = { points: conn.getAttribute('points'), 'se:route': conn.getAttribute('se:route') }
  if (old.points === text && old['se:route'] === 'manual') return null
  conn.setAttribute('points', text)
  conn.setAttributeNS(NS.SE, 'se:route', 'manual')
  const batch = new BatchCommand('Change route')
  batch.addSubCommand(new ChangeElementCommand(conn, old))
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', [conn])
  return batch
}

/**
 * Gives back their automatic route to connectors: one undo step.
 * @param {Element[]} conns
 * @returns {BatchCommand|null}
 */
export const resetRoute = (conns) => {
  const list = conns.filter(isOrthogonalConnector)
  const batch = new BatchCommand('Change route')
  for (const conn of list) {
    const old = { points: conn.getAttribute('points'), 'se:route': conn.getAttribute('se:route') }
    conn.setAttributeNS(NS.SE, 'se:route', 'auto')
    const points = routeOf(conn)
    if (points) conn.setAttribute('points', formatPoints(points))
    if (conn.getAttribute('points') !== old.points || old['se:route'] !== 'auto') {
      batch.addSubCommand(new ChangeElementCommand(conn, old))
    }
  }
  if (batch.isEmpty()) return null
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', list)
  return batch
}

/**
 * The port of an object nearest a point, within a distance: declared ports
 * first. For an object without declared ports, the middle of its side
 * nearest the point.
 * @param {Element[]} elems
 * @param {{x: number, y: number}} point
 * @param {number} radius
 * @returns {{elem: Element, port: object}|null}
 */
export const portNear = (elems, point, radius) => {
  let best = null
  for (const elem of elems) {
    for (const port of portsOf(elem)) {
      const d = Math.hypot(port.x - point.x, port.y - point.y) * (port.implicit ? 1 : 0.5)
      if (Math.hypot(port.x - point.x, port.y - point.y) <= radius && (!best || d < best.d)) best = { elem, port, d }
    }
  }
  return best && { elem: best.elem, port: best.port }
}

/**
 * @function module:connectors.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.isOrthogonalConnector = isOrthogonalConnector
  canvas.orthogonalConnectors = orthogonalConnectors
  canvas.connectorEnds = connectorEnds
  canvas.connectorsOf = connectorsOf
  canvas.rerouteConnectors = reroute
  canvas.routeOfConnector = routeOf
  canvas.addConnector = addConnector
  canvas.setConnectorFluid = setFluid
  canvas.setConnectorArrow = setArrow
  canvas.setManualRoute = setManualRoute
  canvas.resetConnectorRoute = resetRoute
  canvas.portNear = portNear
  // The router itself, for what the editor draws while a connector is drawn
  // or shaped
  canvas.routeOrthogonal = route
  canvas.movableSegments = movableSegments
  canvas.moveSegment = moveSegment
  canvas.parseRoutePoints = parsePoints
}
