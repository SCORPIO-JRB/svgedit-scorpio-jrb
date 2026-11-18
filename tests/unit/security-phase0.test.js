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

  it('sanitizeSvg() removes an external url() however the attribute writes it', () => {
    const values = [
      ' url(https://evil.example/a.svg#x)',
      'URL(https://evil.example/a.png)',
      'url(#local), url(https://evil.example/a.png)',
      'blur(0) url(https://evil.example/a.svg#f)',
      // Not closed: a browser reads the address up to the end of the value
      'url(https://evil.example/a.png',
      'u\\72l(https://evil.example/a.png)'
    ]
    for (const value of values) {
      const rect = createSvgElement('rect')
      rect.setAttribute('mask', value)
      svg.append(rect)

      const removed = sanitize.sanitizeSvg(rect)

      expect(rect.hasAttribute('mask')).toBe(false)
      expect(removed).toHaveLength(1)
    }
  })

  it('sanitizeSvg() keeps a local url(), also when written with spaces or quotes', () => {
    for (const value of ['url(#grad)', 'url( #grad )', "url('#grad')", 'url("#grad") #000']) {
      const rect = createSvgElement('rect')
      rect.setAttribute('fill', value)
      svg.append(rect)

      const removed = sanitize.sanitizeSvg(rect)

      expect(rect.getAttribute('fill')).toBe(value)
      expect(removed).toEqual([])
    }
  })

  it('sanitizeSvg() removes an external url() from a style property that a rule also sets', () => {
    // Such a property stays in the style attribute instead of becoming an
    // attribute: the check on the attributes does not see it.
    const doc = document.implementation.createDocument(NS.SVG, 'svg')
    const style = doc.createElementNS(NS.SVG, 'style')
    style.textContent = 'rect{mask:none;fill:red}'
    const rect = doc.createElementNS(NS.SVG, 'rect')
    rect.setAttribute('style', 'mask:url(https://evil.example/a.png);fill:url(#grad)')
    doc.documentElement.append(style, rect)

    const removed = sanitize.sanitizeSvg(rect)

    expect(rect.hasAttribute('mask')).toBe(false)
    expect(rect.getAttribute('style')).toBe('fill:url(#grad)')
    expect(removed).toEqual(['mask'])
  })

  it('sanitizeCss() removes an external url() that the stylesheet does not close', () => {
    // A browser reads such an address up to the end of the stylesheet
    expect(sanitize.sanitizeCss('rect{mask-image:url(https://evil.example/a.png')).toBe('rect{mask-image:none')
    expect(sanitize.sanitizeCss('rect{mask-image:url("https://evil.example/a.png')).toBe('rect{mask-image:none')
    expect(sanitize.sanitizeCss('rect{fill:url(#grad')).toBe('rect{fill:url(#grad')
  })

  it('sanitizeCss() removes an image-set() that holds an external address', () => {
    // image-set() takes its images as url() or as bare strings, which load
    // just the same
    const cases = [
      'image-set("https://evil.example/a.png" 1x)',
      '-webkit-image-set("https://evil.example/a.png" 1x)',
      "image-set(url(#a) 1x, /* ; */ 'https://evil.example/a.png' 2x)",
      'image-set(linear-gradient(rgb(calc(1*2),0,0),blue) 1x, "https://evil.example/a.png" 2x)',
      'image-set("\\68ttps://evil.example/a.png" 1x)'
    ]
    for (const value of cases) {
      expect(sanitize.sanitizeCss(`rect{mask-image:${value};fill:red}`)).toBe('rect{mask-image:none;fill:red}')
    }
    // Not closed: a browser reads it up to the end of the stylesheet
    expect(sanitize.sanitizeCss('rect{mask-image:image-set("https://evil.example/a.png')).toBe('rect{mask-image:none')
  })

  it('sanitizeCss() keeps an image-set() of local references and image data', () => {
    const css = 'rect{mask-image:image-set(url(#a) 1x, "data:image/png;base64,AA" type("image/png") 2x)}'
    expect(sanitize.sanitizeCss(css)).toBe(css)
  })

  it('sanitizeSvg() removes an image-set() with an external address from an attribute and a style', () => {
    const masked = createSvgElement('rect')
    masked.setAttribute('mask', "image-set('https://evil.example/a.png' 1x)")
    const styled = createSvgElement('rect')
    styled.setAttribute('style', "cursor:image-set('https://evil.example/a.png' 1x), auto")
    svg.append(masked, styled)

    sanitize.sanitizeSvg(masked)
    sanitize.sanitizeSvg(styled)

    expect(masked.hasAttribute('mask')).toBe(false)
    expect(styled.hasAttribute('style')).toBe(false)
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
