import { readFileSync } from 'node:fs'
import { resolveTheme, ThemeController, THEME_PREFERENCES } from '../../src/editor/theme.js'
import { isMonochromeIcon } from '../../src/editor/components/seIcon.js'

// Lot V1: the theme of the interface and the monochrome icons.

const mockSystem = (light) => {
  const listeners = new Set()
  const media = {
    matches: light,
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn)
  }
  window.matchMedia = () => media
  return {
    media,
    listeners,
    set (value) {
      media.matches = value
      listeners.forEach((fn) => fn({ matches: value }))
    }
  }
}

describe('theme (V1)', () => {
  const originalMatchMedia = window.matchMedia
  afterEach(() => { window.matchMedia = originalMatchMedia })

  it('resolves a preference against the system', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
    expect(THEME_PREFERENCES).toEqual(['system', 'dark', 'light'])
  })

  it('marks the root of the editor, dark when the system says nothing', () => {
    window.matchMedia = undefined
    const root = document.createElement('div')
    const theme = new ThemeController(root)
    expect(root.classList.contains('se-editor')).toBe(true)
    expect(root.dataset.seTheme).toBe('dark')
    theme.destroy()
  })

  it('follows the system live with the "system" preference, and only then', () => {
    const system = mockSystem(false)
    const root = document.createElement('div')
    const changes = []
    root.addEventListener('se-themechange', (e) => changes.push(e.detail.theme))
    const theme = new ThemeController(root)
    expect(root.dataset.seTheme).toBe('dark')
    system.set(true)
    expect(root.dataset.seTheme).toBe('light')
    theme.set('dark')
    expect(root.dataset.seTheme).toBe('dark')
    system.set(false)
    system.set(true)
    expect(root.dataset.seTheme).toBe('dark')
    theme.set('nonsense')
    expect(theme.preference).toBe('system')
    expect(root.dataset.seTheme).toBe('light')
    expect(changes).toEqual(['light', 'dark', 'light'])
    theme.destroy()
    expect(system.listeners.size).toBe(0)
  })

  it('never sets the tokens on :root, so that they stay inside the editor', () => {
    const css = readFileSync('src/editor/tokens.css', 'utf8')
    const svgeditCss = readFileSync('src/editor/svgedit.css', 'utf8')
    expect(css).not.toMatch(/:root\s*\{/)
    expect(css).toMatch(/^\.se-editor \{/m)
    expect(css).toMatch(/^\.se-editor\[data-se-theme="light"\] \{/m)
    // svgedit.css keeps on :root only sizes used before V1, no colour.
    const rootBlock = svgeditCss.match(/:root\s*\{([^}]*)\}/)[1]
    expect(rootBlock).not.toMatch(/#|rgb|color/i)
  })

  it('defines every token of the dark theme again in the light theme, except constants', () => {
    const css = readFileSync('src/editor/tokens.css', 'utf8')
    const block = (selector) => css.split(selector)[1].split('\n}')[0]
    const names = (text) => [...text.matchAll(/^\s*(--se-[\w-]+):\s*([^;]+);/gm)]
      .filter(([, , value]) => /#|rgb\(|^0 /.test(value.trim()))
      .map(([, name]) => name)
    const dark = names(block('.se-editor {'))
    const light = new Set(names(block('.se-editor[data-se-theme="light"] {')))
    const constant = ['--se-marker-dark', '--se-marker-light', '--se-wireframe-stroke', '--se-wireframe-page']
    expect(dark.filter((name) => !light.has(name) && !constant.includes(name))).toEqual([])
  })
})

describe('se-icon (V1)', () => {
  it('draws SVG files and SVG data as masks, raster images as they are', () => {
    expect(isMonochromeIcon('./images/select.svg')).toBe(true)
    expect(isMonochromeIcon('images/select.svg?v=2')).toBe(true)
    expect(isMonochromeIcon('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true)
    expect(isMonochromeIcon('data:image/svg+xml,%3Csvg%3E')).toBe(true)
    expect(isMonochromeIcon('data:image/png;base64,iVBOR')).toBe(false)
    expect(isMonochromeIcon('./images/openpath.png')).toBe(false)
    expect(isMonochromeIcon('blob:https://x/1')).toBe(false)
    expect(isMonochromeIcon('')).toBe(false)
  })
})
