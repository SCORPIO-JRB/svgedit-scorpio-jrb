import ConfigObj, { regexEscape } from '../../src/editor/ConfigObj.js'

describe('ConfigObj', () => {
  const stubEditor = () => ({
    storage: {
      map: new Map(),
      getItem (k) { return this.map.get(k) },
      setItem (k, v) { this.map.set(k, v) }
    },
    loadFromDataURI: () => { stubEditor.loaded = 'data' },
    loadFromString: () => { stubEditor.loaded = 'string' },
    loadFromURL: () => { stubEditor.loaded = 'url' }
  })

  it('escapes regex characters', () => {
    expect(regexEscape('a+b?')).toBe('a\\+b\\?')
  })

  it('merges defaults and respects allowInitialUserOverride', () => {
    const editor = stubEditor()
    const cfg = new ConfigObj(editor)
    cfg.setConfig({ gridSnapping: true, userExtensions: ['custom'] })
    cfg.setupCurConfig()

    expect(cfg.curConfig.gridSnapping).toBe(true)
    expect(cfg.curConfig.extensions).toContain('ext-grid')
    expect(cfg.curConfig.extensions.includes('custom') || cfg.curConfig.userExtensions.includes('custom')).toBe(true)

    cfg.setConfig({ lang: 'fr' }, { allowInitialUserOverride: true })
    expect(cfg.defaultPrefs.lang).toBe('fr')
  })

  it('prefers existing values when overwrite is false', () => {
    const editor = stubEditor()
    const cfg = new ConfigObj(editor)
    cfg.curConfig.preventAllURLConfig = true
    cfg.curPrefs.lang = 'es'

    cfg.setConfig({ lang: 'de', gridColor: '#fff', extensions: ['x'] }, { overwrite: false })
    expect(cfg.curPrefs.lang).toBe('es')
    expect(cfg.curConfig.gridColor).toBeUndefined()
    expect(cfg.curConfig.extensions).toEqual([])
  })

  // Lot S1 of the simplification audit: the canvas layout no longer loads
  // ext-shapes and ext-layer_view by default; `extensions` still does.
  describe('default extensions of each layout (S1)', () => {
    const setup = (opts) => {
      const cfg = new ConfigObj(stubEditor())
      if (opts) cfg.setConfig(opts)
      cfg.setupCurConfig()
      return cfg.curConfig.extensions
    }

    it('leaves ext-shapes and ext-layer_view out of the canvas layout, the default one', () => {
      const extensions = setup()
      expect(extensions).toContain('ext-polystar')
      expect(extensions).not.toContain('ext-shapes')
      expect(extensions).not.toContain('ext-layer_view')
      expect(setup({ layout: 'canvas' })).toEqual(extensions)
    })

    it('keeps them all in the classic layout', () => {
      const cfg = new ConfigObj(stubEditor())
      expect(setup({ layout: 'classic' })).toEqual(cfg.defaultExtensions)
    })

    it('adds the extensions asked for to the defaults, each once', () => {
      const extensions = setup({ extensions: ['ext-shapes', 'ext-grid', 'ext-shapes'] })
      expect(extensions.filter((name) => name === 'ext-shapes')).toHaveLength(1)
      expect(extensions.filter((name) => name === 'ext-grid')).toHaveLength(1)
      expect(extensions).toContain('ext-connector')
    })

    it('loads only the extensions asked for with noDefaultExtensions', () => {
      expect(setup({ noDefaultExtensions: true, extensions: ['ext-grid'] })).toEqual(['ext-grid'])
    })
  })
})
