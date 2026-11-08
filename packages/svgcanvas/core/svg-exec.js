/**
 * Tools for svg.
 * @module svg
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */

import { jsPDF as JsPDF } from 'jspdf'
import 'svg2pdf.js'
import * as history from './history.js'
import { error } from '../common/logger.js'
import {
  text2xml,
  getDefaultsContext,
  isRemovableDefault,
  findDefs,
  setHref,
  getHref,
  preventClickDefault,
  toXml,
  getStrokedBBoxDefaultVisible,
  getBBox as utilsGetBBox,
  remapTimingIds
} from './utilities.js'
import {
  transformPoint,
  transformListToTransform,
  getTransformList,
  getMatrix,
  isIdentity,
  matrixMultiply
} from './math.js'
import { convertUnit, shortFloat, convertToNum } from './units.js'
import { isGecko, isChrome, isWebkit } from '../common/browser.js'
import * as pathModule from './path.js'
import { NS } from './namespaces.js'
import * as draw from './draw.js'
import { getClosest } from '../common/util.js'
import { parseSvgText, getDeclaredSize, removeOutsideAnimations } from './svg-paste.js'
import { scopeStyleSheet, keyframesNames } from './css-scope.js'
import { ANIMATION_ELEMENTS, isPauseOfAnimation } from './sanitize.js'

const {
  InsertElementCommand,
  RemoveElementCommand,
  ChangeElementCommand,
  BatchCommand
} = history

let svgCanvas = null

/**
 * @function module:svg-exec.init
 * @param {module:svg-exec.SvgCanvas#init} svgContext
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
  svgCanvas.setSvgString = setSvgString
  svgCanvas.importSvgString = importSvgString
  svgCanvas.uniquifyElems = uniquifyElemsMethod
  svgCanvas.setUseData = setUseDataMethod
  svgCanvas.convertGradients = convertGradientsMethod
  svgCanvas.removeUnusedDefElems = removeUnusedDefElemsMethod // remove DOM elements inside the `<defs>` if they are notreferred to,
  svgCanvas.svgCanvasToString = svgCanvasToString // Main function to set up the SVG content for output.
  svgCanvas.svgToString = svgToString // Sub function ran on each SVG element to convert it to a string as desired.
  svgCanvas.embedImage = embedImage // Converts a given image file to a data URL when possibl
  svgCanvas.rasterExport = rasterExport // Generates a PNG (or JPG, BMP, WEBP) Data URL based on the current image
  svgCanvas.exportPDF = exportPDF // Generates a PDF based on the current image, then calls "exportedPDF"
}

/**
 * Main function to set up the SVG content for output.
 * @function module:svgcanvas.SvgCanvas#svgCanvasToString
 * @returns {string} The SVG image for output
 */
const svgCanvasToString = () => {
  // keep calling it until there are none to remove
  while (svgCanvas.removeUnusedDefElems() > 0) {} // eslint-disable-line no-empty

  svgCanvas.pathActions.clear(true)

  // Keep SVG-Edit comment on top
  const childNodesElems = svgCanvas.getSvgContent().childNodes
  childNodesElems.forEach((node, i) => {
    if (i && node.nodeType === 8 && node.data.includes('Created with')) {
      svgCanvas.getSvgContent().firstChild.before(node)
    }
  })

  // Move out of in-group editing mode
  if (svgCanvas.getCurrentGroup()) {
    draw.leaveContext()
    svgCanvas.selectOnly([svgCanvas.getCurrentGroup()])
  }

  const nakedSvgs = []

  // Unwrap gsvg if it has no special attributes (only id and style)
  const gsvgElems = svgCanvas.getSvgContent().querySelectorAll('g[data-gsvg]')
  Array.prototype.forEach.call(gsvgElems, element => {
    const attrs = element.attributes
    let len = attrs.length
    for (let i = 0; i < len; i++) {
      if (attrs[i].nodeName === 'id' || attrs[i].nodeName === 'style') {
        len--
      }
    }
    // No significant attributes, so ungroup
    if (len <= 0) {
      const svg = element.firstChild
      nakedSvgs.push(svg)
      element.replaceWith(svg)
    }
  })
  const output = svgCanvas.svgToString(svgCanvas.getSvgContent(), 0)

  // Rewrap gsvg
  if (nakedSvgs.length) {
    Array.prototype.forEach.call(nakedSvgs, el => {
      svgCanvas.groupSvgElem(el)
    })
  }

  return output
}

// What the outermost svgToString call learnt of the drawing (see
// getDefaultsContext), for the elements it writes.
let defaultsContext = null

/**
 * The prefix under which a namespace is written. A namespace new to the
 * drawing (that of another application, `inkscape:label`) gets the prefix
 * the file gave it when it is free, else `ns1`, `ns2`...
 * @param {PlainObject<string, string>} nsMap - Prefix of each namespace; the
 *   new one is added to it
 * @param {string} uri
 * @param {string|null} wanted
 * @returns {string}
 */
const namespacePrefix = (nsMap, uri, wanted) => {
  if (nsMap[uri]) return nsMap[uri]
  const used = new Set(Object.values(nsMap))
  let prefix = wanted && !/^xml/i.test(wanted) && !used.has(wanted) ? wanted : null
  for (let n = 1; !prefix; n++) {
    if (!used.has(`ns${n}`)) prefix = `ns${n}`
  }
  nsMap[uri] = prefix
  return prefix
}

/**
 * The name of an element or an attribute as written: a namespaced one with
 * the prefix declared on the root.
 * @param {Element|Attr} node
 * @param {PlainObject<string, string>} nsMap
 * @returns {string}
 */
const qualifiedName = (node, nsMap) => {
  const uri = node.namespaceURI
  if (!uri || uri === NS.SVG || uri === NS.XMLNS || (node.nodeType === 1 && !node.prefix)) {
    return node.nodeType === 1 ? node.localName : node.nodeName
  }
  return `${namespacePrefix(nsMap, uri, node.prefix)}:${node.localName}`
}

/**
 * Sub function ran on each SVG element to convert it to a string as desired.
 * An attribute at its initial value is left out where that changes nothing
 * (see isRemovableDefault). The element itself is not changed: the defaults
 * used to be removed from the drawing at each save, so an element took the
 * value its group gives.
 * @function module:svgcanvas.SvgCanvas#svgToString
 * @param {Element} elem - The SVG element to convert
 * @param {Integer} indent - Number of spaces to indent this tag
 * @returns {string} The given element as an SVG tag
 */
const svgToString = (elem, indent) => {
  if (defaultsContext || !elem) { return elementToString(elem, indent) }
  defaultsContext = getDefaultsContext(elem)
  try {
    return elementToString(elem, indent)
  } finally {
    defaultsContext = null
  }
}

/**
 * svgToString, once the drawing is known.
 * @param {Element} elem
 * @param {Integer} indent
 * @returns {string}
 */
const elementToString = (elem, indent) => {
  const curConfig = svgCanvas.getCurConfig()
  const nsMap = svgCanvas.getNsMap()
  const out = []
  const unit = curConfig.baseUnit
  const unitRe = new RegExp(`^-?[\\d\\.]+${unit}$`)

  if (elem) {
    const attrs = [...elem.attributes]
    const childs = elem.childNodes

    for (let i = 0; i < indent; i++) {
      out.push(' ')
    }
    const tagName = qualifiedName(elem, nsMap)
    out.push('<')
    out.push(tagName)
    if (elem.id === 'svgcontent') {
      // Process root element separately
      const res = svgCanvas.getResolution()

      // The identifier the opened file gave its root, unless an element of
      // the drawing took it since
      const rootId = svgCanvas.getDataStorage().get(elem, 'rootId')
      if (rootId && ![...elem.querySelectorAll('[id]')].some((other) => other.id === rootId)) {
        out.push(` id="${toXml(rootId)}"`)
      }

      let vb = ''
      // TODO: Allow this by dividing all values by current baseVal
      // Note that this also means we should properly deal with this on import
      // if (curConfig.baseUnit !== 'px') {
      //   const unit = curConfig.baseUnit;
      //   const unitM = getTypeMap()[unit];
      //   res.w = shortFloat(res.w / unitM);
      //   res.h = shortFloat(res.h / unitM);
      //   vb = ' viewBox="' + [0, 0, res.w, res.h].join(' ') + '"';
      //   res.w += unit;
      //   res.h += unit;
      // }
      if (curConfig.dynamicOutput) {
        vb = elem.getAttribute('viewBox')
        if (!vb) {
          vb = [0, 0, res.w, res.h].join(' ')
        }
        out.push(` viewBox="${vb}" xmlns="${NS.SVG}"`)
      } else {
        // The size attributes the opened file declared: a drawing that scales
        // with its viewBox keeps it (it was replaced by width and height).
        const declared = svgCanvas.getDataStorage().get(elem, 'declaredSize')
        let size = ''
        if (!declared || declared.size) {
          size = !unit || unit === 'px'
            ? ` width="${res.w}" height="${res.h}"`
            : ` width="${convertUnit(res.w, unit) + unit}" height="${convertUnit(res.h, unit) + unit}"`
        }
        if (declared?.viewBox) {
          size += ` viewBox="0 0 ${res.w} ${res.h}"`
        }
        out.push(`${size} xmlns="${NS.SVG}"`)
      }

      const nsuris = {}

      // Check elements for namespaces, add if found
      const csElements = elem.querySelectorAll('*')
      const cElements = Array.prototype.slice.call(csElements)
      cElements.push(elem)
      Array.prototype.forEach.call(cElements, el => {
        // const el = this;
        // for some elements have no attribute
        const uri = el.namespaceURI
        // A namespace new to the drawing gets a prefix, declared here
        if (uri && uri !== NS.SVG && el.prefix) namespacePrefix(nsMap, uri, el.prefix)
        if (
          uri &&
          !nsuris[uri] &&
          nsMap[uri] &&
          nsMap[uri] !== 'xmlns' &&
          nsMap[uri] !== 'xml'
        ) {
          nsuris[uri] = true
          out.push(` xmlns:${nsMap[uri]}="${uri}"`)
        }
        if (el.attributes.length > 0) {
          for (const [, attr] of Object.entries(el.attributes)) {
            const u = attr.namespaceURI
            if (u && u !== NS.XMLNS) namespacePrefix(nsMap, u, attr.prefix)
            if (u && !nsuris[u] && nsMap[u] !== 'xmlns' && nsMap[u] !== 'xml') {
              nsuris[u] = true
              out.push(` xmlns:${nsMap[u]}="${u}"`)
            }
          }
        }
      })

      let i = attrs.length
      const attrNames = [
        'width',
        'height',
        'xmlns',
        'x',
        'y',
        'viewBox',
        'id',
        'overflow'
      ]
      while (i--) {
        const attr = attrs[i]
        const attrVal = toXml(attr.value)

        // Namespaces have already been dealt with, so skip
        if (attr.nodeName.startsWith('xmlns:')) {
          continue
        }

        // only serialize attributes we don't use internally
        if (
          attrVal !== '' &&
          !attrNames.includes(attr.localName) &&
          (!attr.namespaceURI || nsMap[attr.namespaceURI])
        ) {
          out.push(' ')
          out.push(qualifiedName(attr, nsMap))
          out.push('="')
          out.push(attrVal)
          out.push('"')
        }
      }
    } else {
      // Skip empty defs
      if (elem.nodeName === 'defs' && !elem.firstChild) {
        return ''
      }

      const mozAttrs = ['-moz-math-font-style', '_moz-math-font-style']
      // The values of an animation, or of the data of another application,
      // are kept as written
      const round = elem.namespaceURI === NS.SVG && !ANIMATION_ELEMENTS.has(elem.localName)
      // Do not iterate attributes in reverse order!
      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i]
        let attrVal = toXml(attr.value)
        // remove bogus attributes added by Gecko, and the pause of the
        // animations in the editor
        if (mozAttrs.includes(attr.localName) || isPauseOfAnimation(elem, attr)) {
          continue
        }
        if (!attr.namespaceURI && isRemovableDefault(elem, attr.localName, defaultsContext)) {
          continue
        }
        if (attrVal === 'null') {
          const styleName = attr.localName.replace(/-[a-z]/g, s =>
            s[1].toUpperCase()
          )
          if (Object.prototype.hasOwnProperty.call(elem.style, styleName)) {
            continue
          }
        }

        if (attrVal !== '') {
          if (attrVal.startsWith('pointer-events')) {
            continue
          }
          if (attr.localName === 'class' && attrVal.startsWith('se_')) {
            continue
          }
          out.push(' ')
          if (attr.localName === 'd') {
            attrVal = svgCanvas.pathActions.convertPath(elem, true)
          }
          // Properly parse attribute value if it is a number!
          if (round && !isNaN(attrVal) && !isNaN(parseFloat(attrVal))) {
            attrVal = shortFloat(attrVal)
          } else if (round && unitRe.test(attrVal)) {
            attrVal = shortFloat(attrVal) + unit
          }

          // Embed images when saving
          if (
            svgCanvas.getSvgOptionApply() &&
            elem.nodeName === 'image' &&
            attr.localName === 'href' &&
            svgCanvas.getSvgOptionImages() &&
            svgCanvas.getSvgOptionImages() === 'embed'
          ) {
            const img = svgCanvas.getEncodableImages(attrVal)
            if (img) {
              attrVal = img
            }
          }

          // map various namespaces to our fixed namespace prefixes
          // (the default xmlns attribute itself does not get a prefix)
          if (
            !attr.namespaceURI ||
            attr.namespaceURI === NS.SVG ||
            nsMap[attr.namespaceURI]
          ) {
            out.push(qualifiedName(attr, nsMap))
            out.push('="')
            out.push(attrVal)
            out.push('"')
          }
        } else {
          // Do not skip data attribute even they are empty!
          if ((/^data[-]/i).test(attr.localName)) {
            // map various namespaces to our fixed namespace prefixes
            // (the default xmlns attribute itself does not get a prefix)
            if (
              !attr.namespaceURI ||
              attr.namespaceURI === NS.SVG ||
              nsMap[attr.namespaceURI]
            ) {
              out.push(' ')
              out.push(attr.nodeName)
              out.push('="')
              out.push(attrVal)
              out.push('"')
            }
          }
        }
      }
    }

    if (elem.hasChildNodes()) {
      out.push('>')
      indent++
      let bOneLine = false

      for (let i = 0; i < childs.length; i++) {
        const child = childs.item(i)
        switch (child.nodeType) {
          case 1: // element node
            out.push('\n')
            out.push(svgCanvas.svgToString(child, indent))
            break
          case 3: {
            // text node
            let str = child.nodeValue
            // Do not trim the text of a <text>, nor of its <tspan> and <textPath>.
            if (!child.parentElement?.closest('text')) {
              str = child.nodeValue.replace(/^\s+|\s+$/g, '')
            }
            if (str !== '') {
              bOneLine = true
              out.push(String(toXml(str)))
            }
            break
          }
          case 4: // cdata node
            out.push('\n')
            out.push(new Array(indent + 1).join(' '))
            out.push('<![CDATA[')
            out.push(child.nodeValue)
            out.push(']]>')
            break
          case 8: // comment
            out.push('\n')
            out.push(new Array(indent + 1).join(' '))
            out.push('<!--')
            out.push(child.data)
            out.push('-->')
            break
        } // switch on node type
      }
      indent--
      if (!bOneLine) {
        out.push('\n')
        for (let i = 0; i < indent; i++) {
          out.push(' ')
        }
      }
      out.push('</')
      out.push(tagName)
      out.push('>')
    } else {
      out.push('/>')
    }
  }
  return out.join('')
} // end elementToString()

const URL_REFERENCE = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g
// `#id` in a selector: the next brace opens a block, before any `;` or `}`
// (a colour such as `fill: #abc;` is in a declaration).
const SELECTOR_ID = /#([\w\u00A0-\uFFFF-]+)(?=[^{};]*\{)/g

/**
 * Points the references of a subtree to elements that changed identifier:
 * `url(#old)` in any attribute, `href="#old"`, the connectors of SVG-Edit,
 * the start and end of animations (`begin="old.end"`) and the `#old`
 * selectors of the style sheets.
 * @param {Element} root
 * @param {Map<string, string>} ids - New identifier of each old one
 * @returns {void}
 */
const remapReferences = (root, ids) => {
  if (!ids.size) return
  const remapUrl = (match, _quote, id) => ids.has(id) ? `url(#${ids.get(id)})` : match
  ;[root, ...root.querySelectorAll('*')].forEach((elem) => {
    for (const attr of [...elem.attributes]) {
      const value = attr.value
      let next = value
      if (attr.localName === 'href') {
        if (value.startsWith('#') && ids.has(value.slice(1))) next = `#${ids.get(value.slice(1))}`
      } else if (attr.localName === 'connector' && attr.namespaceURI === NS.SE) {
        next = value.split(/\s+/).map((id) => ids.get(id) || id).join(' ')
      } else if ((attr.localName === 'begin' || attr.localName === 'end') && !attr.namespaceURI) {
        next = remapTimingIds(value, (id) => ids.get(id))
      } else if (value.includes('url(')) {
        next = value.replace(URL_REFERENCE, remapUrl)
      }
      if (next !== value) attr.value = next
    }
    if (elem.localName === 'style') {
      const text = elem.textContent.replace(SELECTOR_ID, (match, id) => ids.has(id) ? `#${ids.get(id)}` : match)
      if (text !== elem.textContent) elem.textContent = text
    }
  })
}

/**
 * Gives a new identifier to the duplicates of an identifier, in a document
 * being opened. A reference made inside a `<symbol>` means the element of that
 * same symbol: a representation inserted several times carries the same
 * identifiers in each copy. So the occurrence that keeps the identifier is
 * the one outside any symbol when there is one, and each renamed occurrence
 * takes along the references of its own symbol. The references were left
 * unchanged before: a `<use>` could end up pointing to a `<clipPath>` of
 * another symbol, and draw nothing.
 * @param {Element} content - The `<svg>` being opened
 * @returns {void}
 */
const renameDuplicateIds = (content) => {
  const byId = new Map()
  content.querySelectorAll('[id]').forEach((elem) => {
    if (!elem.id) return
    const list = byId.get(elem.id)
    if (list) list.push(elem)
    else byId.set(elem.id, [elem])
  })
  const scopeOf = (elem) => elem.parentNode.closest('symbol')
  byId.forEach((elems, id) => {
    if (elems.length < 2) return
    const keeper = elems.find((elem) => !scopeOf(elem)) || elems[0]
    elems.forEach((elem) => {
      if (elem === keeper) return
      const scope = scopeOf(elem)
      elem.id = svgCanvas.getNextId()
      // Only the first occurrence of a symbol takes its references along:
      // a second one in the same symbol was already a duplicate there.
      if (scope && scope !== scopeOf(keeper) && elem === elems.find((other) => scopeOf(other) === scope)) {
        remapReferences(scope, new Map([[id, elem.id]]))
      }
    })
  })
}

/**
 * This function sets the current drawing as the input SVG XML.
 * @function module:svgcanvas.SvgCanvas#setSvgString
 * @param {string} xmlString - The SVG as XML text.
 * @param {boolean} [preventUndo=false] - Indicates if we want to do the
 * changes without adding them to the undo stack - e.g. for initializing a
 * drawing on page load.
 * @fires module:svgcanvas.SvgCanvas#event:setnonce
 * @fires module:svgcanvas.SvgCanvas#event:unsetnonce
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @fires module:svgcanvas.SvgCanvas#event:contentRemoved
 * @returns {boolean} This function returns `false` if the set was
 *     unsuccessful, `true` otherwise.
 */
const setSvgString = (xmlString, preventUndo) => {
  const curConfig = svgCanvas.getCurConfig()
  const dataStorage = svgCanvas.getDataStorage()
  let removed
  try {
    // convert string into XML document
    const newDoc = text2xml(xmlString)
    if (
      newDoc.firstElementChild &&
      newDoc.firstElementChild.namespaceURI !== NS.SVG
    ) {
      return false
    }

    removed = svgCanvas.prepareSvg(newDoc)

    const batchCmd = new BatchCommand('Change Source')

    // remove old svg document
    const { nextSibling } = svgCanvas.getSvgContent()

    svgCanvas.getSvgContent().remove()
    const oldzoom = svgCanvas.getSvgContent()
    batchCmd.addSubCommand(
      new RemoveElementCommand(oldzoom, nextSibling, svgCanvas.getSvgRoot())
    )

    // set new svg document
    // If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
    if (svgCanvas.getDOMDocument().adoptNode) {
      svgCanvas.setSvgContent(
        svgCanvas.getDOMDocument().adoptNode(newDoc.documentElement)
      )
    } else {
      svgCanvas.setSvgContent(
        svgCanvas.getDOMDocument().importNode(newDoc.documentElement, true)
      )
    }

    svgCanvas.getSvgRoot().append(svgCanvas.getSvgContent())
    const content = svgCanvas.getSvgContent()

    svgCanvas.current_drawing_ = new draw.Drawing(
      svgCanvas.getSvgContent(),
      svgCanvas.getIdPrefix()
    )

    // retrieve or set the nonce
    const nonce = svgCanvas.getCurrentDrawing().getNonce()
    if (nonce) {
      svgCanvas.call('setnonce', nonce)
    } else {
      svgCanvas.call('unsetnonce')
    }

    // change image href vals if possible
    const elements = content.querySelectorAll('image')
    Array.prototype.forEach.call(elements, image => {
      preventClickDefault(image)
      const val = svgCanvas.getHref(image)
      if (val) {
        if (val.startsWith('data:')) {
          // Check if an SVG-edit data URI
          const m = val.match(/svgedit_url=(.*?);/)
          // const m = val.match(/svgedit_url=(?<url>.*?);/);
          if (m) {
            const url = decodeURIComponent(m[1])
            // const url = decodeURIComponent(m.groups.url);
            const iimg = new Image()
            iimg.addEventListener('load', () => {
              // Set the href attribute to the data URL
              setHref(image, val)
            })
            iimg.src = url
          }
        }
        // Add to encodableImages if it loads
        svgCanvas.embedImage(val)
      }
    })
    renameDuplicateIds(content)

    // Wrap child SVGs in group elements
    const svgElements = content.querySelectorAll('svg')
    Array.prototype.forEach.call(svgElements, element => {
      // Skip if it's in a <defs>
      if (getClosest(element.parentNode, 'defs')) {
        return
      }

      svgCanvas.uniquifyElems(element)

      // Check if it already has a gsvg group
      const pa = element.parentNode
      if (pa.childNodes.length === 1 && pa.nodeName === 'g') {
        dataStorage.put(pa, 'gsvg', element)
        pa.id = pa.id || svgCanvas.getNextId()
      } else {
        svgCanvas.groupSvgElem(element)
      }
    })

    // For Firefox: Put all paint elems in defs
    if (isGecko()) {
      const svgDefs = findDefs()
      const findElems = content.querySelectorAll(
        'linearGradient, radialGradient, pattern'
      )
      Array.prototype.forEach.call(findElems, ele => {
        svgDefs.appendChild(ele)
      })
    }

    // Set ref element for <use> elements

    // TODO: This should also be done if the object is re-added through "redo"
    svgCanvas.setUseData(content)

    svgCanvas.convertGradients(content)

    const attrs = {
      id: 'svgcontent',
      overflow: curConfig.show_outside_canvas ? 'visible' : 'hidden'
    }

    let percs = false

    // Kept for the save, which writes back the identifier of the root (the
    // drawing uses its own), and the size attributes declared
    if (content.id) dataStorage.put(content, 'rootId', content.id)
    dataStorage.put(content, 'declaredSize', {
      viewBox: content.hasAttribute('viewBox'),
      size: content.hasAttribute('width') || content.hasAttribute('height') || !content.hasAttribute('viewBox')
    })

    // determine proper size
    if (content.getAttribute('viewBox')) {
      const viBox = content.getAttribute('viewBox')
      const vb = viBox.split(/[ ,]+/)
      const vbWidth = Number(vb[2])
      const vbHeight = Number(vb[3])
      if (Number.isFinite(vbWidth)) {
        attrs.width = vbWidth
      }
      if (Number.isFinite(vbHeight)) {
        attrs.height = vbHeight
      }
      // handle content that doesn't have a viewBox
    } else {
      ;['width', 'height'].forEach(dim => {
        // Set to 100 if not given
        const val = content.getAttribute(dim) || '100%'
        if (String(val).slice(-1) === '%') {
          // Use user units if percentage given
          percs = true
        } else {
          attrs[dim] = convertToNum(dim, val)
        }
      })
    }

    // identify layers
    draw.identifyLayers()

    // Give ID for any visible layer children missing one
    const chiElems = content.children
    Array.prototype.forEach.call(chiElems, chiElem => {
      const visElems = chiElem.querySelectorAll(svgCanvas.getVisElems())
      Array.prototype.forEach.call(visElems, elem => {
        if (!elem.id) {
          elem.id = svgCanvas.getNextId()
        }
      })
    })

    // Percentage width/height, so let's base it on visible elements
    if (percs) {
      const bb = getStrokedBBoxDefaultVisible()
      if (bb && typeof bb === 'object') {
        attrs.width = bb.width + bb.x
        attrs.height = bb.height + bb.y
      } else {
        if (attrs.width === null || attrs.width === undefined) {
          attrs.width = 100
        }
        if (attrs.height === null || attrs.height === undefined) {
          attrs.height = 100
        }
      }
    }

    // Just in case negative numbers are given or
    // result from the percs calculation
    if (!Number.isFinite(attrs.width) || attrs.width <= 0) {
      attrs.width = 100
    }
    if (!Number.isFinite(attrs.height) || attrs.height <= 0) {
      attrs.height = 100
    }

    for (const [key, value] of Object.entries(attrs)) {
      content.setAttribute(key, value)
    }
    svgCanvas.contentW = attrs.width
    svgCanvas.contentH = attrs.height

    batchCmd.addSubCommand(new InsertElementCommand(svgCanvas.getSvgContent()))
    // update root to the correct size
    const width = content.getAttribute('width')
    const height = content.getAttribute('height')
    const changes = { width, height }
    batchCmd.addSubCommand(
      new ChangeElementCommand(svgCanvas.getSvgRoot(), changes)
    )

    // reset zoom
    svgCanvas.setZoom(1)

    svgCanvas.clearSelection()
    pathModule.clearData()
    svgCanvas.getSvgRoot().append(svgCanvas.selectorManager.selectorParentGroup)

    if (!preventUndo) svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('sourcechanged', [svgCanvas.getSvgContent()])
  } catch (e) {
    error('Error setting SVG string', e, 'svg-exec')
    return false
  }
  if (removed.length) {
    svgCanvas.call('contentRemoved', { action: 'open', items: removed })
  }

  return true
}

/**
 * Confines the stylesheets of an imported `<symbol>` to it: in an SVG shown
 * in a page, a stylesheet applies to the whole drawing.
 * @param {Element} symbol - In the drawing, with its identifier
 * @returns {string[]} What could not be confined, so was removed
 */
const scopeImportedStyles = (symbol) => {
  const styles = [...symbol.querySelectorAll('style')]
  if (!styles.length) return []
  const takenKeyframes = new Set()
  svgCanvas.getSvgContent().querySelectorAll('style').forEach((style) => {
    if (!symbol.contains(style)) keyframesNames(style.textContent).forEach((name) => takenKeyframes.add(name))
  })
  return styles.flatMap((style) => {
    const { css, removed } = scopeStyleSheet(style.textContent, { id: symbol.id, tag: 'symbol', takenKeyframes })
    style.textContent = css
    return removed
  })
}

/**
 * The transform that cancels those of the open group, from the layer: an
 * import into a turned or scaled group keeps its own look.
 * @param {Element} parent - Where the import goes
 * @param {Element} layer
 * @returns {string|null} Null when the group has no transform
 */
const cancelGroupTransform = (parent, layer) => {
  const groups = []
  for (let elem = parent; elem && elem !== layer; elem = elem.parentNode) groups.unshift(elem)
  if (!groups.length) return null
  const matrix = matrixMultiply(...groups.map((group) => getMatrix(group)))
  if (isIdentity(matrix)) return null
  const { a, b, c, d, e, f } = matrix.inverse()
  return `matrix(${[a, b, c, d, e, f].map((n) => Number(n.toFixed(6))).join(',')})`
}

/**
 * This function imports the input SVG XML as a `<symbol>` in the `<defs>`, then adds a
 * `<use>` to the current layer, at the size the file declares. The stylesheets
 * and the animations of the file apply only to it. The import is one undo
 * step; when it fails, the drawing is put back as it was. What the import
 * could not keep is listed in one message (`contentRemoved`).
 * @function module:svgcanvas.SvgCanvas#importSvgString
 * @param {string} xmlString - The SVG as XML text.
 * @param {boolean} [_preserveDimension] - No longer used: the import always
 *   takes the size the file declares
 * @param {boolean} [_doNotUseExisting] - No longer used: each import has its
 *   own `<symbol>` (the same file imported again reused the first one, found
 *   by a 32-bit hash of its text)
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @fires module:svgcanvas.SvgCanvas#event:contentRemoved
 * @returns {null|Element} This function returns null if the import was unsuccessful, or the element otherwise.
 */
const importSvgString = (xmlString, _preserveDimension, _doNotUseExisting) => {
  const dataStorage = svgCanvas.getDataStorage()
  const batchCmd = new BatchCommand('Import Image')
  let useEl
  let removed
  try {
    // Checked before anything changes in the drawing
    const newDoc = parseSvgText(xmlString)
    if (!newDoc) {
      throw new Error('Not an SVG document')
    }
    removed = svgCanvas.prepareSvg(newDoc)

    // import new svg document into our document
    // If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
    const svg = svgCanvas.getDOMDocument().adoptNode
      ? svgCanvas.getDOMDocument().adoptNode(newDoc.documentElement)
      : svgCanvas.getDOMDocument().importNode(newDoc.documentElement, true)

    svgCanvas.uniquifyElems(svg)
    removed.push(...removeOutsideAnimations(svg))
    const { width, height } = getDeclaredSize(svg)

    const symbol = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'symbol')
    const hadDefs = svgCanvas.getSvgContent().getElementsByTagNameNS(NS.SVG, 'defs').length > 0
    const defs = findDefs()
    if (!hadDefs) {
      // A <defs> made for the import goes with it
      batchCmd.addSubCommand(new InsertElementCommand(defs))
    }

    if (isGecko()) {
      // Move all gradients into root for Firefox, workaround for this bug:
      // https://bugzilla.mozilla.org/show_bug.cgi?id=353575
      const elements = svg.querySelectorAll(
        'linearGradient, radialGradient, pattern'
      )
      Array.prototype.forEach.call(elements, el => {
        defs.appendChild(el)
        batchCmd.addSubCommand(new InsertElementCommand(el))
      })
    }

    while (svg.firstChild) {
      const first = svg.firstChild
      symbol.append(first)
    }
    // The size of the root goes to the <use>: the <symbol> keeps its view
    // box, which scales the file to that size. The namespaces are declared
    // on the root of the drawing when it is saved.
    for (const attr of svg.attributes) {
      if (attr.namespaceURI === NS.XMLNS) continue
      if (!attr.namespaceURI && ['x', 'y', 'width', 'height'].includes(attr.localName)) continue
      symbol.setAttributeNS(attr.namespaceURI, attr.nodeName, attr.value)
    }
    // In the drawing before any new identifier is chosen: the identifiers of
    // the file are kept, so a new one must not take one of them.
    defs.append(symbol)
    batchCmd.addSubCommand(new InsertElementCommand(symbol))
    if (!symbol.id) symbol.id = svgCanvas.getNextId()
    removed.push(...scopeImportedStyles(symbol))

    useEl = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'use')
    useEl.id = svgCanvas.getNextId()
    svgCanvas.setHref(useEl, '#' + symbol.id)
    if (width !== null) useEl.setAttribute('width', shortFloat(width))
    if (height !== null) useEl.setAttribute('height', shortFloat(height))
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    const parent = svgCanvas.getCurrentGroup() || layer
    const cancel = cancelGroupTransform(parent, layer)
    if (cancel) useEl.setAttribute('transform', cancel)
    parent.append(useEl)
    batchCmd.addSubCommand(new InsertElementCommand(useEl))
    dataStorage.put(useEl, 'symbol', symbol)
    dataStorage.put(useEl, 'ref', symbol)
  } catch (e) {
    // Nothing of a failed import stays in the drawing
    batchCmd.unapply()
    error('Error importing SVG string', e, 'svg-exec')
    return null
  }
  svgCanvas.addCommandToHistory(batchCmd)
  svgCanvas.clearSelection()
  svgCanvas.addToSelection([useEl])
  // Only the new <use> changed: signalling the whole <svg> made the editor
  // rebuild its layer list, which cleared the selection made just above, so
  // the editor could not center the import on the page.
  svgCanvas.call('changed', [useEl])
  if (removed.length) {
    svgCanvas.call('contentRemoved', { action: 'import', items: removed })
  }

  // we want to return the element so we can automatically select it
  return useEl
}
/**
 * Function to run when image data is found.
 * @callback module:svgcanvas.ImageEmbeddedCallback
 * @param {string|false} result Data URL
 * @returns {void}
 */
/**
 * Converts a given image file to a data URL when possible, then runs a given callback.
 * @function module:svgcanvas.SvgCanvas#embedImage
 * @param {string} src - The path/URL of the image
 * @returns {Promise<string|false>} Resolves to a Data URL (string|false)
 */
const embedImage = src => {
  // Todo: Remove this Promise in favor of making an async/await `Image.load` utility
  return new Promise((resolve, reject) => {
    // load in the image and once it's loaded, get the dimensions
    const imgI = new Image()
    imgI.addEventListener('load', e => {
      // create a canvas the same size as the raster image
      const cvs = document.createElement('canvas')
      cvs.width = e.currentTarget.width
      cvs.height = e.currentTarget.height
      // load the raster image into the canvas
      cvs.getContext('2d').drawImage(e.currentTarget, 0, 0)
      // retrieve the data: URL
      try {
        let urldata = ';svgedit_url=' + encodeURIComponent(src)
        urldata = cvs.toDataURL().replace(';base64', urldata + ';base64')
        svgCanvas.setEncodableImages(src, urldata)
      } catch (e) {
        svgCanvas.setEncodableImages(src, false)
      }
      svgCanvas.setGoodImage(src)
      resolve(svgCanvas.getEncodableImages(src))
    })
    imgI.addEventListener('error', e => {
      reject(
        new Error(
          `error loading image: ${e.currentTarget.attributes.src.value}`
        )
      )
    })
    imgI.setAttribute('src', src)
  })
}

/**
 * @typedef {PlainObject} module:svgcanvas.IssuesAndCodes
 * @property {string[]} issueCodes The locale-independent code names
 * @property {string[]} issues The localized descriptions
 */

/**
 * Codes only is useful for locale-independent detection.
 * @returns {module:svgcanvas.IssuesAndCodes}
 */
const getIssues = () => {
  const uiStrings = svgCanvas.getUIStrings()
  // remove the selected outline before serializing
  svgCanvas.clearSelection()

  // Check for known CanVG issues
  const issues = []
  const issueCodes = []

  // Selector and notice
  const issueList = {
    feGaussianBlur: uiStrings.NoBlur,
    foreignObject: uiStrings.NoforeignObject,
    '[stroke-dasharray]': uiStrings.NoDashArray
  }
  const content = svgCanvas.getSvgContent()

  // Add font/text check if Canvas Text API is not implemented
  if (!('font' in document.querySelector('CANVAS').getContext('2d'))) {
    issueList.text = uiStrings.NoText
  }

  for (const [sel, descr] of Object.entries(issueList)) {
    if (content.querySelectorAll(sel).length) {
      issueCodes.push(sel)
      issues.push(descr)
    }
  }
  return { issues, issueCodes }
}
/**
 * @typedef {PlainObject} module:svgcanvas.ImageedResults
 * @property {string} datauri Contents as a Data URL
 * @property {string} bloburl May be the empty string
 * @property {string} svg The SVG contents as a string
 * @property {string[]} issues The localization messages of `issueCodes`
 * @property {module:svgcanvas.IssueCode[]} issueCodes CanVG issues found with the SVG
 * @property {"PNG"|"JPEG"|"BMP"|"WEBP"|"ICO"} type The chosen image type
 * @property {"image/png"|"image/jpeg"|"image/bmp"|"image/webp"} mimeType The image MIME type
 * @property {Float} quality A decimal between 0 and 1 (for use with JPEG or WEBP)
 * @property {string} WindowName A convenience for passing along a `window.name` to target a window on which the  could be added
 */

/**
 * Utility function to convert all external image links in an SVG element to Base64 data URLs.
 * @param {SVGElement} svgElement - The SVG element to process.
 * @returns {Promise<void>}
 */
const convertImagesToBase64 = async svgElement => {
  const imageElements = svgElement.querySelectorAll('image')
  const promises = Array.from(imageElements).map(async img => {
    const href = img.getAttribute('xlink:href') || img.getAttribute('href')
    if (href && !href.startsWith('data:')) {
      try {
        const response = await fetch(href)
        const blob = await response.blob()
        const reader = new FileReader()
        return new Promise(resolve => {
          reader.onload = () => {
            setHref(img, reader.result)
            resolve()
          }
          reader.readAsDataURL(blob)
        })
      } catch (err) {
        error('Failed to fetch image', err, 'svg-exec')
      }
    }
  })
  await Promise.all(promises)
}

/**
 * Generates a raster image (PNG, JPEG, etc.) from the SVG content.
 * @param {string} [imgType='PNG'] - The image type to generate.
 * @param {number} [quality=1.0] - The image quality (for JPEG).
 * @param {string} [windowName='Exported Image'] - The window name.
 * @param {Object} [opts={}] - Additional options.
 * @returns {Promise<Object>} Resolves to an object containing export data.
 */
const rasterExport = (
  imgType = 'PNG',
  quality = 1.0,
  windowName = 'Exported Image',
  opts = {}
) => {
  return new Promise((resolve, reject) => {
    const type = imgType === 'ICO' ? 'BMP' : imgType
    const mimeType = `image/${type.toLowerCase()}`
    const { issues, issueCodes } = getIssues()
    const svgElement = svgCanvas.getSvgContent()

    const svgClone = svgElement.cloneNode(true)

    convertImagesToBase64(svgClone)
      .then(() => {
        const svgData = new XMLSerializer().serializeToString(svgClone)
        const svgBlob = new Blob([svgData], {
          type: 'image/svg+xml;charset=utf-8'
        })
        const url = URL.createObjectURL(svgBlob)

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'))
          return
        }

        const res = svgCanvas.getResolution()
        const width = res.w
        const height = res.h
        canvas.width = width
        canvas.height = height

        const img = new Image()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height)
          URL.revokeObjectURL(url)

          const datauri = canvas.toDataURL(mimeType, quality)
          let blobUrl

          const onExportComplete = blobUrl => {
            const exportObj = {
              datauri,
              bloburl: blobUrl,
              svg: svgData,
              issues,
              issueCodes,
              type: imgType,
              mimeType,
              quality,
              windowName
            }
            if (!opts.avoidEvent) {
              svgCanvas.call('exported', exportObj)
            }
            resolve(exportObj)
          }

          canvas.toBlob(
            blob => {
              blobUrl = URL.createObjectURL(blob)
              onExportComplete(blobUrl)
            },
            mimeType,
            quality
          )
        }

        img.onerror = err => {
          console.error('Failed to load SVG into image element:', err)
          reject(err)
        }

        img.src = url
      })
      .catch(reject)
  })
}

/**
 * Exports the SVG content as a PDF.
 * @param {string} [windowName='svg.pdf'] - The window name or file name.
 * @param {string} [outputType='save'|'dataurlstring'] - The output type for jsPDF.
 * @returns {Promise<Object>} Resolves to an object containing PDF export data.
 */
const exportPDF = (
  windowName = 'svg.pdf',
  outputType = isChrome() ? 'save' : 'dataurlstring'
) => {
  return new Promise((resolve, reject) => {
    const res = svgCanvas.getResolution()
    const orientation = res.w > res.h ? 'landscape' : 'portrait'
    const unit = 'pt'
    const svgElement = svgCanvas.getSvgContent().cloneNode(true)

    convertImagesToBase64(svgElement)
      .then(() => {
        const svgData = new XMLSerializer().serializeToString(svgElement)
        const svgBlob = new Blob([svgData], {
          type: 'image/svg+xml;charset=utf-8'
        })
        const url = URL.createObjectURL(svgBlob)

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = res.w
        canvas.height = res.h

        const img = new Image()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, res.w, res.h)
          URL.revokeObjectURL(url)

          const imgData = canvas.toDataURL('image/png')
          const doc = new JsPDF({ orientation, unit, format: [res.w, res.h] })

          const docTitle = svgCanvas.getDocumentTitle()
          doc.setProperties({ title: docTitle })
          doc.addImage(imgData, 'PNG', 0, 0, res.w, res.h)

          const { issues, issueCodes } = getIssues()
          const obj = { issues, issueCodes, windowName, outputType }

          obj.output = doc.output(
            outputType,
            outputType === 'save' ? windowName : undefined
          )

          svgCanvas.call('exportedPDF', obj)
          resolve(obj)
        }

        img.onerror = err => {
          error('Failed to load SVG into image element', err, 'svg-exec')
          reject(err)
        }

        img.src = url
      })
      .catch(reject)
  })
}
/**
 * Gives a new identifier to the elements of a subtree whose identifier is
 * already used: in the page (the drawing or the editor itself), or earlier in
 * the subtree. The references of the subtree follow; the other identifiers
 * are kept, since a platform finds its texts and its instances by them.
 * Every identifier was renewed before.
 * @function module:svgcanvas.SvgCanvas#uniquifyElems
 * @param {Element} g - The root of the tree being added
 * @returns {void}
 */
const uniquifyElemsMethod = g => {
  const inside = [g, ...g.querySelectorAll('[id]')].filter((elem) => elem.id)
  const taken = new Set()
  svgCanvas.getDOMDocument().querySelectorAll('[id]').forEach((elem) => {
    if (!g.contains(elem)) taken.add(elem.id)
  })
  // The identifier of the root of the drawing, written back on save
  const rootId = svgCanvas.getDataStorage().get(svgCanvas.getSvgContent(), 'rootId')
  if (rootId) taken.add(rootId)
  const own = new Set(inside.map((elem) => elem.id))
  const seen = new Set()
  const renamed = new Map()
  inside.forEach((elem) => {
    const { id } = elem
    if (!taken.has(id) && !seen.has(id)) {
      seen.add(id)
      return
    }
    let newId
    do {
      newId = svgCanvas.getNextId()
    } while (taken.has(newId) || own.has(newId) || seen.has(newId))
    // A reference of the subtree means its first element of that identifier
    if (!seen.has(id)) renamed.set(id, newId)
    seen.add(id)
    seen.add(newId)
    elem.id = newId
  })
  remapReferences(g, renamed)
}

/**
 * Assigns reference data for each use element.
 * @function module:svgcanvas.SvgCanvas#setUseData
 * @param {Element} parent
 * @returns {void}
 */
const setUseDataMethod = parent => {
  let elems = parent

  if (parent.tagName !== 'use') {
    // elems = elems.find('use');
    elems = elems.querySelectorAll('use')
  }

  Array.prototype.forEach.call(elems, (el, _) => {
    const dataStorage = svgCanvas.getDataStorage()
    const href = svgCanvas.getHref(el)
    if (!href || !href.startsWith('#')) {
      return
    }
    const id = href.substr(1)
    const refElem = svgCanvas.getElement(id)
    if (!refElem) {
      return
    }
    dataStorage.put(el, 'ref', refElem)
    if (refElem.tagName === 'symbol' || refElem.tagName === 'svg') {
      dataStorage.put(el, 'symbol', refElem)
      dataStorage.put(el, 'ref', refElem)
    }
  })
}

/**
 * Looks at DOM elements inside the `<defs>` to see if they are referred to,
 * removes them from the DOM if they are not.
 * @function module:svgcanvas.SvgCanvas#removeUnusedDefElems
 * @returns {Integer} The number of elements that were removed
 */
const removeUnusedDefElemsMethod = () => {
  const defs = svgCanvas.getSvgContent().getElementsByTagNameNS(NS.SVG, 'defs')
  if (!defs || !defs.length) {
    return 0
  }

  // if (!defs.firstChild) { return; }

  const defelemUses = []
  let numRemoved = 0

  const allEls = svgCanvas.getSvgContent().getElementsByTagNameNS(NS.SVG, '*')

  // A reference in any attribute (the values of an animation, a style
  // attribute) or stylesheet keeps its element
  const addReferences = (text) => {
    for (const [, , id] of text.matchAll(URL_REFERENCE)) defelemUses.push(id)
  }
  for (const el of allEls) {
    for (const attr of el.attributes) {
      if (attr.value.includes('url(')) addReferences(attr.value)
    }
    if (el.localName === 'style') addReferences(el.textContent)

    // gradients can refer to other gradients
    const href = getHref(el)
    if (href && href.startsWith('#')) {
      defelemUses.push(href.substr(1))
    }
  }

  Array.prototype.forEach.call(defs, (def, i) => {
    const defelems = def.querySelectorAll(
      'linearGradient, radialGradient, filter, marker, svg, symbol'
    )
    i = defelems.length
    while (i--) {
      const defelem = defelems[i]
      const { id } = defelem
      if (!defelemUses.includes(id)) {
        // Not found, so remove (but remember)
        svgCanvas.setRemovedElements(id, defelem)
        defelem.remove()
        numRemoved++
      }
    }
  })

  return numRemoved
}
/**
 * Converts gradients from userSpaceOnUse to objectBoundingBox.
 * @function module:svgcanvas.SvgCanvas#convertGradients
 * @param {Element} elem
 * @returns {void}
 */
const convertGradientsMethod = elem => {
  let elems = elem.querySelectorAll('linearGradient, radialGradient')
  if (!elems.length && isWebkit()) {
    // Bug in webkit prevents regular *Gradient selector search
    elems = Array.prototype.filter.call(elem.querySelectorAll('*'), curThis => {
      return curThis.tagName.includes('Gradient')
    })
  }
  Array.prototype.forEach.call(elems, grad => {
    if (grad.getAttribute('gradientUnits') === 'userSpaceOnUse') {
      const svgContent = svgCanvas.getSvgContent()
      // TODO: Support more than one element with this ref by duplicating parent grad
      let fillStrokeElems = svgContent.querySelectorAll(
        '[fill="url(#' + grad.id + ')"],[stroke="url(#' + grad.id + ')"]'
      )
      if (!fillStrokeElems.length) {
        const tmpFillStrokeElems = svgContent.querySelectorAll(
          '[*|href="#' + grad.id + '"]'
        )
        if (!tmpFillStrokeElems.length) {
          return
        } else {
          if (
            (tmpFillStrokeElems[0].tagName === 'linearGradient' ||
              tmpFillStrokeElems[0].tagName === 'radialGradient') &&
            tmpFillStrokeElems[0].getAttribute('gradientUnits') ===
            'userSpaceOnUse'
          ) {
            fillStrokeElems = svgContent.querySelectorAll(
              '[fill="url(#' +
              tmpFillStrokeElems[0].id +
              ')"],[stroke="url(#' +
              tmpFillStrokeElems[0].id +
              ')"]'
            )
          } else {
            return
          }
        }
      }
      // get object's bounding box
      const bb = utilsGetBBox(fillStrokeElems[0])

      // This will occur if the element is inside a <defs> or a <symbol>,
      // in which we shouldn't need to convert anyway.
      if (!bb) {
        return
      }
      if (grad.tagName === 'linearGradient') {
        const gCoords = {
          x1: grad.getAttribute('x1'),
          y1: grad.getAttribute('y1'),
          x2: grad.getAttribute('x2'),
          y2: grad.getAttribute('y2')
        }

        // If has transform, convert
        const tlist = getTransformList(grad)
        if (tlist?.numberOfItems > 0) {
          const m = transformListToTransform(tlist).matrix
          const pt1 = transformPoint(gCoords.x1, gCoords.y1, m)
          const pt2 = transformPoint(gCoords.x2, gCoords.y2, m)

          gCoords.x1 = pt1.x
          gCoords.y1 = pt1.y
          gCoords.x2 = pt2.x
          gCoords.y2 = pt2.y
          grad.removeAttribute('gradientTransform')
        }
        grad.setAttribute('x1', (gCoords.x1 - bb.x) / bb.width)
        grad.setAttribute('y1', (gCoords.y1 - bb.y) / bb.height)
        grad.setAttribute('x2', (gCoords.x2 - bb.x) / bb.width)
        grad.setAttribute('y2', (gCoords.y2 - bb.y) / bb.height)
        grad.removeAttribute('gradientUnits')
      } else if (grad.tagName === 'radialGradient') {
        const getNum = (value, fallback) => {
          const num = Number(value)
          return Number.isFinite(num) ? num : fallback
        }
        let cx = getNum(grad.getAttribute('cx'), 0.5)
        let cy = getNum(grad.getAttribute('cy'), 0.5)
        let r = getNum(grad.getAttribute('r'), 0.5)
        let fx = getNum(grad.getAttribute('fx'), cx)
        let fy = getNum(grad.getAttribute('fy'), cy)

        // If has transform, convert
        const tlist = getTransformList(grad)
        if (tlist?.numberOfItems > 0) {
          const m = transformListToTransform(tlist).matrix
          const cpt = transformPoint(cx, cy, m)
          const fpt = transformPoint(fx, fy, m)
          const rpt = transformPoint(cx + r, cy, m)
          cx = cpt.x
          cy = cpt.y
          fx = fpt.x
          fy = fpt.y
          r = Math.hypot(rpt.x - cpt.x, rpt.y - cpt.y)
          grad.removeAttribute('gradientTransform')
        }

        if (!bb.width || !bb.height) {
          return
        }
        grad.setAttribute('cx', (cx - bb.x) / bb.width)
        grad.setAttribute('cy', (cy - bb.y) / bb.height)
        grad.setAttribute('fx', (fx - bb.x) / bb.width)
        grad.setAttribute('fy', (fy - bb.y) / bb.height)
        grad.setAttribute('r', r / Math.max(bb.width, bb.height))
        grad.removeAttribute('gradientUnits')
      }
    }
  })
}
