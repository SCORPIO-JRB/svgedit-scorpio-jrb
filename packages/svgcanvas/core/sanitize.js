/**
 * Tools for SVG sanitization.
 * @module sanitize
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { getReverseNS, NS } from './namespaces.js'
import { getHref, setHref, getUrlFromAttr } from './utilities.js'
import { warn } from '../common/logger.js'

const REVERSE_NS = getReverseNS()
const FONT_ATTRIBUTES = ['font-family', 'font-size', 'font-stretch', 'font-style', 'font-weight']

// Todo: Split out into core attributes, presentation attributes, etc. so consistent
/**
 * This defines which elements and attributes that we support (or at least
 * don't remove).
 * @type {PlainObject}
 */
/* eslint-disable max-len */
const svgGenericWhiteList = ['class', 'id', 'display', 'transform', 'style', 'visibility']

/**
 * Attributes by which SCorp-io binds a drawing to its real-time data
 * (`scorp_id`, `scorp_name`, `instanceId`, `representationId`...). They only
 * hold identifiers and names, so they are kept on every element the filter keeps.
 * @param {string} name - Attribute name, without namespace
 * @returns {boolean}
 */
const isScorpioAttribute = (name) => name.startsWith('scorp_') || name === 'instanceId' || name === 'representationId'

/**
 * Accessibility attributes (`role`, `aria-labelledby`...): they only name
 * and describe, so they are kept on every element the filter keeps.
 * @param {string} name - Attribute name, without namespace
 * @returns {boolean}
 */
const isAccessibilityAttribute = (name) => name === 'role' || /^aria-[a-z]+$/.test(name)

/**
 * Namespaces whose elements and attributes the browser interprets. The
 * attributes of any other namespace are data of another application
 * (`inkscape:label`, `sodipodi:nodetypes`...): the browser ignores them.
 */
const INTERPRETED_NS = new Set([NS.SVG, NS.HTML, NS.MATH, NS.XLINK, NS.XML, NS.XMLNS])
const isForeignNamespace = (uri) => Boolean(uri) && !INTERPRETED_NS.has(uri)

/**
 * Attributes that the browser ignores, or that only describe: those of
 * another application (`inkscape:label`), the XLink ones other than `href`
 * (`xlink:type`, `xlink:show`...) and the language (`xml:lang`, `lang`).
 * `xml:base`, which changes where links lead, is not one of them.
 * @param {Attr} attr
 * @returns {boolean}
 */
const isInertAttribute = ({ namespaceURI, localName }) => {
  if (namespaceURI === NS.XLINK) return localName !== 'href'
  if (namespaceURI === NS.XML) return localName === 'lang' || localName === 'space'
  return namespaceURI ? isForeignNamespace(namespaceURI) : localName === 'lang'
}

/** SVG animation elements (SMIL). */
export const ANIMATION_ELEMENTS = new Set(['animate', 'animateMotion', 'animateTransform', 'set'])

// The animations do not play in the editor: the drawing shows the values it
// saves, and a click to select an object does not start one. A conditional
// processing attribute that only the editor writes (a file cannot carry it,
// it is not in the whitelist) turns them off; the save leaves it out.
const PAUSED = 'urn:svgedit:paused'

/**
 * Turns off the animations of a document about to enter the editor.
 * @function module:sanitize.pauseAnimations
 * @param {Element} root
 * @returns {void}
 */
export const pauseAnimations = (root) => {
  root.querySelectorAll([...ANIMATION_ELEMENTS].join(',')).forEach((animation) => {
    if (animation.namespaceURI === NS.SVG) animation.setAttribute('requiredExtensions', PAUSED)
  })
}

/**
 * @function module:sanitize.isPauseOfAnimation
 * @param {Element} elem
 * @param {Attr} attr - An attribute of `elem`
 * @returns {boolean} Whether `attr` is the pause the editor put on an animation, not saved
 */
export const isPauseOfAnimation = (elem, attr) =>
  attr.localName === 'requiredExtensions' && !attr.namespaceURI && attr.value === PAUSED &&
  elem.namespaceURI === NS.SVG && ANIMATION_ELEMENTS.has(elem.localName)

const ANIMATION_TIMING = ['begin', 'dur', 'end', 'min', 'max', 'restart', 'repeatCount', 'repeatDur', 'fill', 'href', 'xlink:href', 'requiredFeatures', 'systemLanguage']
const ANIMATION_VALUES = ['from', 'to', 'by', 'values', 'calcMode', 'keyTimes', 'keySplines', 'additive', 'accumulate']
const PRESENTATION = ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'mask', 'opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width']

const svgWhiteList_ = {
  // SVG Elements
  animate: ['attributeName', 'attributeType', ...ANIMATION_TIMING, ...ANIMATION_VALUES],
  animateMotion: [...ANIMATION_TIMING, ...ANIMATION_VALUES, 'keyPoints', 'origin', 'path', 'rotate'],
  animateTransform: ['attributeName', 'attributeType', ...ANIMATION_TIMING, ...ANIMATION_VALUES, 'type'],
  mpath: ['href', 'xlink:href'],
  set: ['attributeName', 'attributeType', ...ANIMATION_TIMING, 'to'],
  a: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'href', 'mask', 'opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage', 'xlink:href', 'xlink:title'],
  circle: ['clip-path', 'clip-rule', 'cx', 'cy', 'enable-background', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'mask', 'opacity', 'r', 'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage'],
  clipPath: ['clipPathUnits'],
  defs: [],
  desc: [],
  ellipse: ['clip-path', 'clip-rule', 'cx', 'cy', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'mask', 'opacity', 'requiredFeatures', 'rx', 'ry', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage'],
  feBlend: ['in', 'in2'],
  feColorMatrix: ['in', 'type', 'value', 'result', 'values'],
  feComposite: ['in', 'operator', 'result', 'in2'],
  feFlood: ['flood-color', 'in', 'result', 'flood-opacity'],
  feGaussianBlur: ['color-interpolation-filters', 'in', 'requiredFeatures', 'stdDeviation', 'result'],
  feMerge: [],
  feMergeNode: ['in'],
  feMorphology: ['in', 'operator', 'radius'],
  feOffset: ['dx', 'in', 'dy', 'result'],
  filter: ['color-interpolation-filters', 'filterRes', 'filterUnits', 'height', 'href', 'primitiveUnits', 'requiredFeatures', 'width', 'x', 'xlink:href', 'y'],
  foreignObject: ['font-size', 'height', 'opacity', 'requiredFeatures', 'width', 'x', 'y'],
  g: [...FONT_ATTRIBUTES, 'clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'mask', 'opacity', 'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage', 'text-anchor'],
  image: [
    'clip-path', 'clip-rule', 'filter', 'height', 'mask', 'opacity',
    'preserveAspectRatio', 'requiredFeatures', 'systemLanguage', 'viewBox',
    'width', 'x', 'href', 'xlink:href', 'xlink:title', 'y'
  ],
  line: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'opacity', 'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage', 'x1', 'x2', 'y1', 'y2'],
  linearGradient: ['gradientTransform', 'gradientUnits', 'requiredFeatures', 'spreadMethod', 'systemLanguage', 'x1', 'x2', 'href', 'xlink:href', 'y1', 'y2'],
  marker: ['markerHeight', 'markerUnits', 'markerWidth', 'orient', 'preserveAspectRatio', 'refX', 'refY', 'se_type', 'systemLanguage', 'viewBox'],
  mask: ['height', 'maskContentUnits', 'maskUnits', 'width', 'x', 'y'],
  metadata: [],
  path: ['clip-path', 'clip-rule', 'd', 'enable-background', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'opacity', 'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage'],
  pattern: ['height', 'patternContentUnits', 'patternTransform', 'patternUnits', 'requiredFeatures', 'systemLanguage', 'viewBox', 'width', 'x', 'href', 'xlink:href', 'y'],
  polygon: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'opacity', 'points', 'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage', 'sides', 'shape', 'edge', 'point', 'starRadiusMultiplier', 'r', 'radialshift', 'r2', 'orient', 'cx', 'cy'],
  polyline: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'opacity', 'points', 'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage', 'se:connector'],
  radialGradient: ['cx', 'cy', 'fx', 'fy', 'gradientTransform', 'gradientUnits', 'r', 'requiredFeatures', 'spreadMethod', 'systemLanguage', 'href', 'xlink:href'],
  rect: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'height', 'mask', 'opacity', 'requiredFeatures', 'rx', 'ry', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage', 'width', 'x', 'y'],
  stop: ['offset', 'requiredFeatures', 'stop-opacity', 'systemLanguage', 'stop-color', 'gradientUnits', 'gradientTransform'],
  style: ['type'],
  // The presentation attributes of the root apply to the whole file
  // (`fill="none"` of the files exported by Figma)
  svg: [...FONT_ATTRIBUTES, ...PRESENTATION, 'enable-background', 'height', 'preserveAspectRatio', 'requiredFeatures', 'systemLanguage', 'text-anchor', 'version', 'viewBox', 'width', 'x', 'xmlns', 'xmlns:se', 'xmlns:xlink', 'xmlns:oi', 'oi:animations', 'y', 'xml:space'],
  switch: ['requiredFeatures', 'systemLanguage'],
  // An import puts the attributes of the file's root on its <symbol>: they
  // must survive the next opening of the drawing.
  symbol: [...FONT_ATTRIBUTES, ...PRESENTATION, 'overflow', 'preserveAspectRatio', 'requiredFeatures', 'systemLanguage', 'text-anchor', 'viewBox', 'width', 'height'],
  text: [...FONT_ATTRIBUTES, 'clip-path', 'clip-rule', 'alignment-baseline', 'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'mask', 'opacity', 'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage', 'text-anchor', 'letter-spacing', 'word-spacing', 'text-decoration', 'textLength', 'lengthAdjust', 'x', 'xml:space', 'y'],
  textPath: ['dominant-baseline', 'href', 'method', 'requiredFeatures', 'spacing', 'startOffset', 'systemLanguage', 'xlink:href'],
  title: [],
  tspan: [...FONT_ATTRIBUTES, 'clip-path', 'clip-rule', 'dx', 'dy', 'alignment-baseline', 'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'mask', 'opacity', 'requiredFeatures', 'rotate', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage', 'text-anchor', 'textLength', 'x', 'xml:space', 'y'],
  use: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'height', 'href', 'mask', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'width', 'x', 'xlink:href', 'y', 'overflow'],
  // Filter Primitives
  feComponentTransfer: ['in', 'result'],
  feFuncR: ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncG: ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncB: ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncA: ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feConvolveMatrix: ['in', 'order', 'kernelMatrix', 'divisor', 'bias', 'targetX', 'targetY', 'edgeMode', 'kernelUnitLength', 'preserveAlpha'],
  feDiffuseLighting: ['in', 'surfaceScale', 'diffuseConstant', 'kernelUnitLength', 'lighting-color'],
  feSpecularLighting: ['in', 'surfaceScale', 'specularConstant', 'specularExponent', 'kernelUnitLength', 'lighting-color'],
  feDisplacementMap: ['in', 'in2', 'scale', 'xChannelSelector', 'yChannelSelector'],
  feTurbulence: ['baseFrequency', 'numOctaves', 'result', 'seed', 'stitchTiles', 'type'],
  feTile: ['in'],
  feDropShadow: ['dx', 'dy', 'flood-color', 'flood-opacity', 'in', 'result', 'stdDeviation'],
  feDistantLight: ['azimuth', 'elevation'],
  fePointLight: ['x', 'y', 'z'],
  feSpotLight: ['x', 'y', 'z', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'specularExponent', 'limitingConeAngle'],

  // MathML Elements
  annotation: ['encoding'],
  'annotation-xml': ['encoding'],
  maction: ['actiontype', 'other', 'selection'],
  math: ['xmlns'],
  menclose: ['notation'],
  merror: [],
  mfrac: ['linethickness'],
  mi: ['mathvariant'],
  mmultiscripts: [],
  mn: [],
  mo: ['fence', 'lspace', 'maxsize', 'minsize', 'rspace', 'stretchy'],
  mover: [],
  mpadded: ['lspace', 'width', 'height', 'depth', 'voffset'],
  mphantom: [],
  mprescripts: [],
  mroot: [],
  mrow: ['href', 'xlink:href', 'xlink:type', 'xmlns:xlink'],
  mspace: ['depth', 'height', 'width'],
  msqrt: [],
  mstyle: ['displaystyle', 'mathbackground', 'mathcolor', 'mathvariant', 'scriptlevel'],
  msub: [],
  msubsup: [],
  msup: [],
  mtable: ['align', 'columnalign', 'columnlines', 'columnspacing', 'displaystyle', 'equalcolumns', 'equalrows', 'frame', 'rowalign', 'rowlines', 'rowspacing', 'width'],
  mtd: ['columnalign', 'columnspan', 'rowalign', 'rowspan'],
  mtext: [],
  mtr: ['columnalign', 'rowalign'],
  munder: [],
  munderover: [],
  none: [],
  semantics: [],

  // HTML Elements for use in a foreignObject
  div: [],
  p: [],
  li: [],
  pre: [],
  ol: [],
  ul: [],
  span: [],
  hr: [],
  br: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: []
}

// add generic attributes to all elements of the whitelist
for (const [element, attrs] of Object.entries(svgWhiteList_)) {
  svgWhiteList_[element] = [...attrs, ...svgGenericWhiteList]
}

/**
 * Attributes the filter also keeps since V6 (section 7 of the plan, option
 * `fidelity.attributes`): presentation attributes of SVG 2 on every element,
 * `pathLength` on the shapes, `dx`, `dy` and `rotate` on a text, `target` on
 * a link. Lot V7 adds `color`, the colour of `currentColor`: the marks of a
 * GTB symbol take it from their instance.
 */
const WIDER_GENERIC = ['paint-order', 'vector-effect', 'pointer-events', 'mix-blend-mode', 'isolation', 'color']
const WIDER = {
  path: ['pathLength'],
  rect: ['pathLength'],
  circle: ['pathLength'],
  ellipse: ['pathLength'],
  line: ['pathLength'],
  polyline: ['pathLength'],
  polygon: ['pathLength'],
  text: ['dx', 'dy', 'rotate'],
  a: ['target']
}
const svgWideWhiteList_ = {}
for (const [element, attrs] of Object.entries(svgWhiteList_)) {
  svgWideWhiteList_[element] = [...attrs, ...WIDER_GENERIC, ...(WIDER[element] ?? [])]
}

/**
 * A namespace-aware version of a whitelist.
 * @param {Object<string, string[]>} list
 * @returns {Object<string, Object<string, string|null>>}
 */
const byNamespace = (list) => {
  const result = {}
  for (const [elt, atts] of Object.entries(list)) {
    const attNS = {}
    for (const att of atts) {
      if (att.includes(':')) {
        const [prefix, localName] = att.split(':')
        attNS[localName] = NS[prefix.toUpperCase()]
      } else {
        attNS[att] = att === 'xmlns' ? NS.XMLNS : null
      }
    }
    result[elt] = attNS
  }
  return result
}
const svgWhiteListNS_ = byNamespace(svgWhiteList_)
const svgWideWhiteListNS_ = byNamespace(svgWideWhiteList_)

/**
 * The corrections of section 7 in force for the current run of the filter
 * (option `fidelity` of the canvas; each is on unless set to false).
 * @type {object}
 */
let fidelity = {}
const isOn = (name) => fidelity?.[name] !== false

/**
 * Properties of a `style` attribute that have no attribute: they stay in it
 * (V6, option `fidelity.styleProperties`). The geometry (`x`, `r`, `d`...)
 * and `transform` are not among them: the editor writes those as attributes,
 * which a style would override.
 */
const STYLE_ONLY = new Set([
  'animation', 'transform-origin', 'transform-box', 'transition', 'mix-blend-mode', 'isolation',
  'paint-order', 'vector-effect', 'white-space', 'font-variant', 'font-feature-settings',
  'font-kerning', 'font-variation-settings', 'text-shadow', 'cursor', 'will-change',
  'shape-rendering', 'text-rendering', 'image-rendering', 'color-rendering',
  'color-interpolation', 'color-interpolation-filters', 'dominant-baseline', 'alignment-baseline',
  'baseline-shift', 'direction', 'unicode-bidi', 'writing-mode', 'color', 'marker',
  'marker-start', 'marker-mid', 'marker-end', 'overflow', 'clip', 'letter-spacing',
  'word-spacing', 'text-decoration', 'text-anchor', 'font', 'font-family', 'font-size',
  'font-size-adjust', 'font-stretch', 'font-style', 'font-weight', 'stop-color', 'stop-opacity',
  'flood-color', 'flood-opacity', 'lighting-color'
])
const isStyleOnly = (name) => STYLE_ONLY.has(name) || /^(?:animation|transition)-[a-z-]+$/.test(name)

/**
 * Properties of a `style` attribute that must never be turned into attributes.
 * @type {string[]}
 */
const STYLE_FORBIDDEN_PROPS = ['href', 'xlink:href', 'id', 'class', 'style']

/**
 * Properties that the stylesheets of a document set, by document.
 * @type {WeakMap<Document, Set<string>>}
 */
const ruleProperties = new WeakMap()

/**
 * Properties that the stylesheets of a document set (a rough reading: a name
 * followed by a colon at the start of a declaration).
 * @param {Document} doc
 * @returns {Set<string>}
 */
const getRuleProperties = (doc) => {
  if (!ruleProperties.has(doc)) {
    const names = new Set()
    for (const style of doc.getElementsByTagNameNS(NS.SVG, 'style')) {
      const css = style.textContent.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const [, name] of css.matchAll(/[{;]\s*([\w-]+)\s*:/g)) names.add(name.toLowerCase())
    }
    ruleProperties.set(doc, names)
  }
  return ruleProperties.get(doc)
}

/**
 * Tells whether a link or resource URL is safe to keep in the document.
 * Script-capable schemes (`javascript:`, `vbscript:`) are always rejected;
 * `data:` URLs are only kept for images (`<image href="data:image/...">`).
 * @function module:sanitize.isSafeHref
 * @param {string} nodeName - Name of the element that carries the URL
 * @param {string} href - URL to check
 * @returns {boolean}
 */
export const isSafeHref = (nodeName, href) => {
  if (typeof href !== 'string') return true
  // Browsers ignore whitespace and control characters inside a scheme ("java\tscript:")
  // eslint-disable-next-line no-control-regex
  const value = href.replace(/[\u0000- \u007F]/g, '').toLowerCase()
  if (value.startsWith('javascript:') || value.startsWith('vbscript:')) return false
  if (value.startsWith('data:')) return nodeName === 'image' && value.startsWith('data:image/')
  return true
}

const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/gis
const CSS_IMPORT = /@import\b[^;]*;?/gi
const CSS_SCRIPTING = /expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:/gi
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})\s?|(.))/gis

const isSafeCssUrl = (url) => {
  const value = url.trim().toLowerCase()
  return value.startsWith('#') || value.startsWith('data:image/')
}

const decodeCssEscapes = (css) => css.replace(CSS_ESCAPE, (match, hex, char) => {
  if (!hex) return char
  const codePoint = parseInt(hex, 16)
  return codePoint > 0 && codePoint <= 0x10FFFF ? String.fromCodePoint(codePoint) : '�'
})

const hasUnsafeCss = (css) => {
  if (/@import\b/i.test(css) || new RegExp(CSS_SCRIPTING.source, 'i').test(css)) return true
  return [...css.matchAll(CSS_URL)].some(([, , url]) => !isSafeCssUrl(url))
}

/**
 * Neutralizes the parts of a stylesheet that can load external resources or run code:
 * `@import` rules, `url()` references that are neither local (`#id`) nor image data,
 * and legacy scripting constructs. The rest of the stylesheet is kept as is.
 * When CSS escapes hide such a construct, the whole stylesheet is dropped.
 * @function module:sanitize.sanitizeCss
 * @param {string} css
 * @param {string[]} [removed] - What is removed is added to it
 * @returns {string}
 */
export const sanitizeCss = (css, removed = []) => {
  const cleaned = String(css)
    .replace(CSS_IMPORT, (match) => { report(removed, shorten(match.trim())); return '' })
    .replace(CSS_URL, (match, quote, url) => {
      if (isSafeCssUrl(url)) return match
      report(removed, `url(${shorten(url)})`)
      return 'none'
    })
    .replace(CSS_SCRIPTING, (match) => { report(removed, match.trim()); return '' })
  if (hasUnsafeCss(decodeCssEscapes(cleaned))) {
    report(removed, '<style>')
    return ''
  }
  return cleaned
}

/**
 * Adds an item, once, to the list of what the filter removed.
 * @param {string[]} removed
 * @param {string} item
 * @returns {void}
 */
const report = (removed, item) => {
  if (!removed.includes(item)) removed.push(item)
}

/**
 * A value as shown in that list: a long one (a data URL) is cut.
 * @param {string} value
 * @returns {string}
 */
const shorten = (value) => value.length > 40 ? `${value.slice(0, 39)}…` : value

/**
 * Why an animation element cannot be kept, if so: it would animate an
 * element of another document, change a link (`href`) or an event handler,
 * or set a script or an external resource.
 * @param {Element} node - `<animate>`, `<set>`...
 * @returns {string|null} The offending attribute, as the file wrote it
 */
const unsafeAnimation = (node) => {
  // Without its target, it would animate its parent instead
  const href = getHref(node)
  if (href && href[0] !== '#') return `href="${shorten(href)}"`
  const target = node.getAttribute('attributeName') || ''
  const name = target.replace(/^[^:]*:/, '').trim().toLowerCase()
  if (name === 'href' || name.startsWith('on')) return `attributeName="${target}"`
  for (const attr of ['from', 'to', 'by', 'values']) {
    const value = node.getAttribute(attr)
    if (!value) continue
    // eslint-disable-next-line no-control-regex
    const plain = value.replace(/[\u0000- \u007F]/g, '').toLowerCase()
    if (/(?:java|vb)script:/.test(plain) || [...value.matchAll(CSS_URL)].some(([, , url]) => !isSafeCssUrl(url))) {
      return `${attr}="${shorten(value)}"`
    }
  }
  return null
}

/**
 * Sanitizes the input node and its children: only what the whitelist above
 * allows is kept. What is removed is listed, for the user.
 * @function module:sanitize.sanitizeSvg
 * @param {Text|Element} node - The DOM element to be checked (we'll also check its children) or text node to be cleaned up
 * @param {string[]} [removed] - What is removed is added to it: elements
 *   (`<script>`), attributes (`onclick`), unsafe values (`href="javascript:…"`)
 * @param {object} [options] - The option `fidelity` of the canvas: the
 *   corrections of section 7 (`attributes`, `styleProperties`) are on unless
 *   set to false
 * @returns {string[]} `removed`
 */
export const sanitizeSvg = (node, removed = [], options = {}) => {
  const previous = fidelity
  fidelity = options ?? {}
  try {
    sanitizeNode(node, removed)
  } finally {
    fidelity = previous
  }
  return removed
}

/**
 * @param {Text|Element} node
 * @param {string[]} removed
 * @returns {void}
 */
const sanitizeNode = (node, removed) => {
  // Cleanup text nodes
  if (node.nodeType === 3) { // 3 === TEXT_NODE
    // Trim whitespace, except inside a <text>: the spaces of its <tspan> and
    // <textPath> are part of the text ("Hello <tspan>world</tspan>").
    if (!node.parentElement?.closest('text')) {
      node.nodeValue = node.nodeValue.trim()
    }
    // Remove if empty
    if (!node.nodeValue.length) {
      node.remove()
    }
  }

  // We only care about element nodes.
  // Automatically return for all non-element nodes, such as comments, etc.
  if (node.nodeType !== 1) { // 1 == ELEMENT_NODE
    return
  }

  const doc = node.ownerDocument
  const parent = node.parentNode
  // can parent ever be null here?  I think the root node's parent is the document...
  if (!doc || !parent) {
    return
  }

  // The metadata of another application (RDF, Dublin Core...) is kept: the
  // browser neither shows nor runs it.
  if (isForeignNamespace(node.namespaceURI) && parent.nodeType === 1 && parent.closest('metadata')) {
    let i = node.childNodes.length
    while (i--) { sanitizeNode(node.childNodes.item(i), removed) }
    return
  }

  // Own properties only: element names such as "constructor" must not match Object.prototype
  const wide = isOn('attributes')
  const list = wide ? svgWideWhiteList_ : svgWhiteList_
  const allowedAttrs = {}.hasOwnProperty.call(list, node.nodeName) ? list[node.nodeName] : undefined
  const allowedAttrsNS = (wide ? svgWideWhiteListNS_ : svgWhiteListNS_)[node.nodeName]
  // if this element is supported, sanitize it
  if (typeof allowedAttrs !== 'undefined') {
    const seAttrs = []
    let i = node.attributes.length
    while (i--) {
      // if the attribute is not in our whitelist, then remove it
      const attr = node.attributes.item(i)
      const attrName = attr.nodeName
      const attrLocalName = attr.localName
      const attrNsURI = attr.namespaceURI
      // Check that an attribute with the correct localName in the correct namespace is on
      // our whitelist or is a namespace declaration for one of our allowed namespaces
      if (attrNsURI !== allowedAttrsNS[attrLocalName] && attrNsURI !== NS.XMLNS &&
       !(attrNsURI === NS.XMLNS && REVERSE_NS[attr.value])) {
        // Special cases: href without namespace when it is in the whitelist,
        // the SCorp-io binding, accessibility, and the attributes of another
        // application, which the browser ignores
        const isHrefAttribute = (attrLocalName === 'href' && allowedAttrs.includes('href'))
        const isKept = isHrefAttribute || isInertAttribute(attr) ||
          (!attrNsURI && (isScorpioAttribute(attrName) || isAccessibilityAttribute(attrName)))
        if (!isKept) {
          // Bypassing the whitelist to allow se: and oi: prefixes
          // We can add specific namepaces on demand for now.
          // Is there a more appropriate way to do this?
          if (attrName.startsWith('se:') || attrName.startsWith('oi:') || attrName.startsWith('data-')) {
            // We should bypass the namespace aswell
            const seAttrNS = (attrName.startsWith('se:')) ? NS.SE : ((attrName.startsWith('oi:')) ? NS.OI : null)
            seAttrs.push([attrName, attr.value, seAttrNS])
          } else {
            warn(`attribute ${attrName} in element ${node.nodeName} not in whitelist is removed: ${node.outerHTML}`, null, 'sanitize')
            node.removeAttributeNS(attrNsURI, attrLocalName)
            report(removed, attrName)
          }
        }
      }

      // For the style attribute, rewrite it in terms of XML presentational
      // attributes. A property that a rule of the stylesheets also sets stays
      // in it: as an attribute, it would lose to that rule.
      if (attrName === 'style') {
        const ruled = getRuleProperties(doc)
        const kept = []
        let declarations = 0
        attr.value.split(';').forEach((declaration) => {
          if (!declaration.trim()) return
          declarations++
          const colon = declaration.indexOf(':')
          const styleAttrName = declaration.slice(0, colon).trim()
          const styleAttrVal = declaration.slice(colon + 1).trim()
          // Now check that this attribute is supported
          if (colon === -1 || STYLE_FORBIDDEN_PROPS.includes(styleAttrName)) return
          // The pointer-events the editor itself writes (a file saved by an
          // older version may hold it): inherited anyway
          if (styleAttrName === 'pointer-events' && styleAttrVal === 'inherit') return
          if (!allowedAttrs.includes(styleAttrName) && isOn('styleProperties') &&
            isStyleOnly(styleAttrName.toLowerCase())) {
            // A property without an attribute stays in the style, if safe
            if (hasUnsafeCss(decodeCssEscapes(`${styleAttrName}:${styleAttrVal}`))) {
              report(removed, styleAttrName)
            } else {
              kept.push(declaration.trim())
            }
            return
          }
          if (!allowedAttrs.includes(styleAttrName)) {
            // The properties of another application (-inkscape-...) do not show
            if (!styleAttrName.startsWith('-')) report(removed, styleAttrName)
            return
          }
          if (ruled.has(styleAttrName)) {
            // As written since V6 (option fidelity.styleProperties)
            kept.push(isOn('styleProperties') ? declaration.trim() : `${styleAttrName}:${styleAttrVal}`)
          } else {
            node.setAttribute(styleAttrName, styleAttrVal)
          }
        })
        if (kept.length && kept.length === declarations && isOn('styleProperties')) {
          // Nothing left the style: it stays as the file wrote it
        } else if (kept.length) {
          node.setAttribute('style', kept.join(isOn('styleProperties') ? '; ' : ';'))
        } else {
          node.removeAttribute('style')
        }
      }
    }

    // If legacy xlink:href is present but href is missing, mirror it to href for modern browsers
    const xlinkHref = node.getAttributeNS(NS.XLINK, 'href')
    if (xlinkHref) {
      node.setAttribute('href', xlinkHref)
      node.removeAttributeNS(NS.XLINK, 'href')
    }

    Object.values(seAttrs).forEach(([att, val, ns]) => {
      node.setAttributeNS(ns, att, val)
    })

    // An animation must not change a link or an event handler, nor set a
    // script or an external resource: it is removed with what it holds.
    if (ANIMATION_ELEMENTS.has(node.nodeName)) {
      const reason = unsafeAnimation(node)
      if (reason) {
        warn(`unsafe animation removed: ${node.outerHTML}`, null, 'sanitize')
        node.remove()
        report(removed, `<${node.nodeName} ${reason}>`)
        return
      }
    }

    // Never keep script-capable URLs (javascript:, vbscript:, non-image data:)
    const rawHref = getHref(node)
    if (rawHref && !isSafeHref(node.nodeName, rawHref)) {
      warn(`unsafe href removed from element ${node.nodeName}`, null, 'sanitize')
      node.removeAttribute('href')
      node.removeAttributeNS(NS.XLINK, 'href')
      report(removed, `href="${shorten(rawHref)}"`)
    }

    // Stylesheets must not load external resources or run code
    if (node.nodeName === 'style') {
      const css = node.textContent
      const safeCss = sanitizeCss(css, removed)
      if (safeCss !== css) {
        warn('unsafe CSS removed from a style element', null, 'sanitize')
        node.textContent = safeCss
      }
    }

    // for some elements that have a xlink:href or href, ensure the URI refers to a local element
    // (but not for links and other elements where external hrefs are allowed)
    const href = getHref(node)
    if (href &&
      ['filter', 'linearGradient', 'pattern', 'radialGradient', 'textPath', 'use', 'mpath'].includes(node.nodeName) &&
      href[0] !== '#') {
      // remove the attribute (but keep the element)
      setHref(node, '')
      warn(`attribute href in element ${node.nodeName} pointing to a non-local reference (${href}) is removed: ${node.outerHTML}`, null, 'sanitize')
      node.removeAttributeNS(NS.XLINK, 'href')
      node.removeAttribute('href')
      report(removed, `href="${shorten(href)}"`)
    }

    // Safari crashes on a <use> without a xlink:href, so we just remove the node here
    if (node.nodeName === 'use' && !getHref(node)) {
      warn(`element ${node.nodeName} without a xlink:href or href is removed: ${node.outerHTML}`, null, 'sanitize')
      node.remove()
      report(removed, '<use>')
      return
    }
    // if the element has attributes pointing to a non-local reference,
    // need to remove the attribute
    ['clip-path', 'fill', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'stroke'].forEach((attr) => {
      let val = node.getAttribute(attr)
      if (val) {
        val = getUrlFromAttr(val)
        // simply check for first character being a '#'
        if (val && val[0] !== '#') {
          node.setAttribute(attr, '')
          warn(`attribute ${attr} in element ${node.nodeName} pointing to a non-local reference (${val}) is removed: ${node.outerHTML}`, null, 'sanitize')
          node.removeAttribute(attr)
          report(removed, `${attr}="url(${shorten(val)})"`)
        }
      }
    })

    // recurse to children
    i = node.childNodes.length
    while (i--) { sanitizeNode(node.childNodes.item(i), removed) }
  // else (element not supported), remove it
  } else {
    // remove all children from this node and insert them before this node
    warn(`element ${node.nodeName} not supported is removed: ${node.outerHTML}`, null, 'sanitize')
    report(removed, `<${node.nodeName}>`)
    const children = []
    while (node.hasChildNodes()) {
      children.push(parent.insertBefore(node.firstChild, node))
    }

    // remove this node from the document altogether
    node.remove()

    // call sanitizeSvg on each of those children
    let i = children.length
    while (i--) { sanitizeNode(children[i], removed) }
  }
}
