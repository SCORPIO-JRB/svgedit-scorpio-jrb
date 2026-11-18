import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import * as sanitize from '../../packages/svgcanvas/core/sanitize.js'
import * as utilities from '../../packages/svgcanvas/core/utilities.js'
import ConfigObj, {
  URL_FORBIDDEN_CONFIG,
  isForbiddenUrlConfig,
  isValidLangParam
} from '../../src/editor/ConfigObj.js'

const stubEditor = () => ({
  storage: {
    map: new Map(),
    getItem (k) { return this.map.get(k) },
    setItem (k, v) { this.map.set(k, v) }
  },
  loadFromDataURI () {},
  loadFromString () {},
  loadFromURL () {}
})

describe('Phase 0 security: URL configuration (S1, S6, S7)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('treats paths and consent options as forbidden URL configuration', () => {
    for (const key of URL_FORBIDDEN_CONFIG) {
      expect(isForbiddenUrlConfig(key)).toBe(true)
    }
    expect(isForbiddenUrlConfig('extPath')).toBe(true)
    expect(isForbiddenUrlConfig('somefuturePath')).toBe(true)
    expect(isForbiddenUrlConfig('lang')).toBe(false)
    expect(isForbiddenUrlConfig('dimensions')).toBe(false)
    expect(isForbiddenUrlConfig('initTool')).toBe(false)
  })

  it('accepts language codes and rejects path-like values', () => {
    for (const lang of ['en', 'fr', 'pt-BR', 'zh-CN', 'test']) {
      expect(isValidLangParam(lang)).toBe(true)
    }
    for (const lang of ['../../evil', 'fr/../x', 'fr.js', 'https://evil.example/x', '', 'a', undefined, 42]) {
      expect(isValidLangParam(lang)).toBe(false)
    }
  })

  it('ignores extPath, imgPath and forceStorage from the URL but keeps legitimate parameters', () => {
    const editor = stubEditor()
    const cfg = new ConfigObj(editor)
    const defaultExtPath = cfg.defaultConfig.extPath
    const defaultImgPath = cfg.defaultConfig.imgPath

    window.history.replaceState(null, '', '/?extPath=https://evil.example/x&imgPath=https://evil.example/img&forceStorage=true&dimensions=100,200&gridSnapping=true')
    cfg.loadFromURL()

    expect(cfg.curConfig.extPath).toBe(defaultExtPath)
    expect(cfg.curConfig.imgPath).toBe(defaultImgPath)
    expect(cfg.curConfig.forceStorage).toBe(false)
    expect(cfg.curConfig.dimensions).toEqual([100, 200])
    expect(cfg.curConfig.gridSnapping).toBe('true')
  })

  it('ignores a dimensions URL parameter that is not two positive numbers', () => {
    // The value ends up in the markup of the canvas root: only numbers may
    // get there, or a crafted link runs script when the editor starts.
    const values = [
      '1"><img xmlns="http://www.w3.org/1999/xhtml" src="x" onerror="alert(1)"/>,1',
      '800',
      '800,600,400',
      '800,',
      '0,600',
      '-800,600',
      'abc,def',
      'Infinity,600'
    ]
    for (const value of values) {
      const cfg = new ConfigObj(stubEditor())
      window.history.replaceState(null, '', '/?dimensions=' + encodeURIComponent(value))
      cfg.loadFromURL()
      expect(cfg.curConfig.dimensions).toEqual([640, 480])
    }
  })

  it('drops an invalid language code from the URL and keeps a valid one', () => {
    const invalid = new ConfigObj(stubEditor())
    window.history.replaceState(null, '', '/?lang=../../evil')
    invalid.loadFromURL()
    expect(invalid.curPrefs.lang).toBeUndefined()

    const valid = new ConfigObj(stubEditor())
    window.history.replaceState(null, '', '/?lang=fr')
    valid.loadFromURL()
    expect(valid.curPrefs.lang).toBe('fr')
  })
})

describe('Phase 0 security: import filter (S3, S4, S5)', () => {
  /** @type {HTMLDivElement} */
  let container
  /** @type {SVGSVGElement} */
  let svg
  let originalWarn

  const createSvgElement = (name) => document.createElementNS(NS.SVG, name)

  beforeEach(() => {
    originalWarn = console.warn
    console.warn = () => {}
    container = document.createElement('div')
    svg = /** @type {SVGSVGElement} */ (createSvgElement('svg'))
    container.append(svg)
    document.body.append(container)
    utilities.init({ getSvgRoot: () => svg })
  })

  afterEach(() => {
    container.remove()
    console.warn = originalWarn
  })

  it('isSafeHref() rejects script-capable schemes, even obfuscated', () => {
    expect(sanitize.isSafeHref('a', 'javascript:alert(1)')).toBe(false)
    expect(sanitize.isSafeHref('a', ' JaVa\tScRiPt:alert(1)')).toBe(false)
    expect(sanitize.isSafeHref('a', 'vbscript:msgbox(1)')).toBe(false)
    expect(sanitize.isSafeHref('a', 'data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(sanitize.isSafeHref('a', 'https://www.scorp-io.com/')).toBe(true)
    expect(sanitize.isSafeHref('a', 'mailto:contact@example.com')).toBe(true)
    expect(sanitize.isSafeHref('a', '#section')).toBe(true)
    expect(sanitize.isSafeHref('a', 'page.html')).toBe(true)
    expect(sanitize.isSafeHref('image', 'data:image/png;base64,AAAA')).toBe(true)
    expect(sanitize.isSafeHref('image', 'data:text/html,x')).toBe(false)
  })

  it('sanitizeSvg() removes javascript: links but keeps the link element and safe links', () => {
    const evil = createSvgElement('a')
    evil.setAttribute('href', 'javascript:alert(1)')
    const evilXlink = createSvgElement('a')
    evilXlink.setAttributeNS(NS.XLINK, 'xlink:href', 'java\tscript:alert(1)')
    const safe = createSvgElement('a')
    safe.setAttribute('href', 'https://www.scorp-io.com/')
    svg.append(evil, evilXlink, safe)

    sanitize.sanitizeSvg(evil)
    sanitize.sanitizeSvg(evilXlink)
    sanitize.sanitizeSvg(safe)

    expect(evil.isConnected).toBe(true)
    expect(evil.hasAttribute('href')).toBe(false)
    expect(evilXlink.hasAttribute('href')).toBe(false)
    expect(evilXlink.hasAttributeNS(NS.XLINK, 'href')).toBe(false)
    expect(safe.getAttribute('href')).toBe('https://www.scorp-io.com/')
  })

  it('sanitizeSvg() keeps image data URLs and drops non-image data URLs', () => {
    const okImage = createSvgElement('image')
    okImage.setAttribute('href', 'data:image/png;base64,AAAA')
    const badImage = createSvgElement('image')
    badImage.setAttribute('href', 'data:text/html,x')
    svg.append(okImage, badImage)

    sanitize.sanitizeSvg(okImage)
    sanitize.sanitizeSvg(badImage)

    expect(okImage.getAttribute('href')).toBe('data:image/png;base64,AAAA')
    expect(badImage.hasAttribute('href')).toBe(false)
  })

  it('sanitizeSvg() does not turn a style property into an href', () => {
    const link = createSvgElement('a')
    link.setAttribute('style', 'href: javascript:alert(1); fill: red')
    svg.append(link)

    sanitize.sanitizeSvg(link)

    expect(link.hasAttribute('href')).toBe(false)
    expect(link.getAttribute('fill')).toBe('red')
  })

  it('sanitizeCss() removes @import and external url() but keeps local and image references', () => {
    const css = "@import url(https://evil.example/a.css); rect{fill:url(https://evil.example/t?x=1);stroke:url(#grad)} .b{background:url('data:image/png;base64,AA')}"
    const result = sanitize.sanitizeCss(css)

    expect(result).not.toContain('@import')
    expect(result).not.toContain('evil.example')
    expect(result).toContain('url(#grad)')
    expect(result).toContain("url('data:image/png;base64,AA')")
    expect(result).toContain('fill:none')
  })

  it('sanitizeCss() leaves a harmless stylesheet byte for byte', () => {
    const css = '.a { fill: url(#g); stroke: #000 } .b::before { content: "\\201C" }'
    expect(sanitize.sanitizeCss(css)).toBe(css)
  })

  it('sanitizeCss() drops a stylesheet that hides @import behind CSS escapes', () => {
    expect(sanitize.sanitizeCss("@\\69mport 'https://evil.example/a.css';")).toBe('')
    expect(sanitize.sanitizeCss('rect{fill:u\\72l(https://evil.example/t)}')).toBe('')
  })

  it('sanitizeSvg() cleans the content of <style> elements', () => {
    const style = createSvgElement('style')
    style.textContent = '@import url(https://evil.example/a.css); rect { fill: blue }'
    svg.append(style)

    sanitize.sanitizeSvg(style)

    expect(style.textContent).not.toContain('@import')
    expect(style.textContent).toContain('rect { fill: blue }')
  })

  it('sanitizeSvg() does not treat Object.prototype names as allowed elements', () => {
    const fake = createSvgElement('constructor')
    fake.setAttribute('href', '#x')
    const rect = createSvgElement('rect')
    fake.append(rect)
    svg.append(fake)

    expect(() => sanitize.sanitizeSvg(fake)).not.toThrow()
    expect(fake.isConnected).toBe(false)
    expect(rect.parentNode).toBe(svg)
  })
})

describe('Phase 0 security: id lookups (B9)', () => {
  /** @type {SVGSVGElement} */
  let svg

  beforeEach(() => {
    svg = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svg)
    utilities.init({ getSvgRoot: () => svg })
  })

  afterEach(() => {
    svg.remove()
  })

  it('escapeCssIdent() escapes ids that are not valid CSS identifiers', () => {
    expect(utilities.escapeCssIdent('svg_1')).toBe('svg_1')
    expect(utilities.escapeCssIdent('1abc')).toBe('\\31 abc')
    expect(utilities.escapeCssIdent('a"b')).toBe('a\\"b')
  })

  it('getElement() finds elements whose id starts with a digit or contains quotes', () => {
    const digit = document.createElementNS(NS.SVG, 'rect')
    digit.id = '1abc'
    const quoted = document.createElementNS(NS.SVG, 'rect')
    quoted.id = 'a"b'
    svg.append(digit, quoted)

    expect(utilities.getElement('1abc')).toBe(digit)
    expect(utilities.getElement('a"b')).toBe(quoted)
  })
})
