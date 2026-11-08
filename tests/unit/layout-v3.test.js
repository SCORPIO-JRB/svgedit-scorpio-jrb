import { clampPanelWidth, sizeClasses, layoutOf, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH, PANEL_DEFAULT_WIDTH } from '../../src/editor/layout.js'
import { placeOf, compareTools, insertByRank, rankOf } from '../../src/editor/panels/Toolbar.js'
import { safeHref, breadcrumbOf, escapeHtml } from '../../src/editor/panels/TopBar.js'
import { sectionOfTopGroup, isShown } from '../../src/editor/panels/Inspector.js'
import { flattenTree, nameOf } from '../../src/editor/panels/LayerTree.js'
import { parseSvgSource } from '../../src/editor/panels/CodePanel.js'
import { formatZoom } from '../../src/editor/panels/ViewGroup.js'
import { eventShortcut, readsOwnKeys } from '../../src/editor/shortcuts.js'

// Lot V3: the canvas layout.

const SVG_NS = 'http://www.w3.org/2000/svg'

describe('layout (V3)', () => {
  it('reads the option, keeps the width of the panel between 240 and 420 px', () => {
    expect(layoutOf(undefined)).toBe('canvas')
    expect(layoutOf('classic')).toBe('classic')
    expect(layoutOf('other')).toBe('canvas')
    expect(clampPanelWidth('100')).toBe(PANEL_MIN_WIDTH)
    expect(clampPanelWidth(1000)).toBe(PANEL_MAX_WIDTH)
    expect(clampPanelWidth('333.4')).toBe(333)
    expect(clampPanelWidth('nonsense')).toBe(PANEL_DEFAULT_WIDTH)
  })

  it('a drawer below 1 280 px, folded bars below 1 024 px', () => {
    expect(sizeClasses(1440)).toEqual({ drawer: false, compact: false })
    expect(sizeClasses(1280)).toEqual({ drawer: false, compact: false })
    expect(sizeClasses(1279)).toEqual({ drawer: true, compact: false })
    expect(sizeClasses(1023)).toEqual({ drawer: true, compact: true })
  })
})

describe('toolbar: declared order (V3)', () => {
  const tool = (id, group, rank) => {
    // Any element: the order depends on the declaration only.
    const el = document.createElement('div')
    el.id = id
    if (group) el.setAttribute('data-group', group)
    if (rank !== undefined) el.setAttribute('data-rank', String(rank))
    return el
  }

  it('puts a tool in its group, an undeclared one in More, the insert group in More when folded', () => {
    expect(placeOf(tool('a', 'select'))).toBe('select')
    expect(placeOf(tool('b', 'shapes'))).toBe('shapes')
    expect(placeOf(tool('c'))).toBe('more')
    expect(placeOf(tool('d', 'nowhere'))).toBe('more')
    expect(placeOf(tool('e', 'insert'), true)).toBe('more')
    expect(rankOf(tool('f'))).toBe(Infinity)
  })

  it('gives the same order whatever the order in which the tools arrive, 20 times', () => {
    const specs = [
      ['tool_rect', 'shapes', 10], ['tool_line', 'shapes', 70], ['tool_star', 'shapes', 80],
      ['tool_polygon', 'shapes', 90], ['tool_ellipse', 'shapes', 40], ['hello_world'], ['ext_b'], ['ext_a']
    ]
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const orders = new Set()
    for (let i = 0; i < 20; i++) {
      const container = document.createElement('div')
      const shuffled = [...specs].sort(() => random() - 0.5)
      for (const spec of shuffled) insertByRank(container, tool(...spec))
      orders.add([...container.children].map((el) => el.id).join(' '))
    }
    expect([...orders]).toEqual(['tool_rect tool_ellipse tool_line tool_star tool_polygon ext_a ext_b hello_world'])
    expect(compareTools(tool('x', 'more', 5), tool('y', 'more', 5))).toBeLessThan(0)
  })
})

describe('top bar (V3)', () => {
  it('takes only http(s) links from the host', () => {
    expect(safeHref('https://scorp-io.example/projets', 'https://app.example/')).toBe('https://scorp-io.example/projets')
    expect(safeHref('/synoptiques', 'https://app.example/editor/')).toBe('https://app.example/synoptiques')
    expect(safeHref('javascript:alert(1)')).toBe(null)
    expect(safeHref('data:text/html,x')).toBe(null)
    expect(safeHref('')).toBe(null)
    expect(safeHref(42)).toBe(null)
  })

  it('reads the breadcrumb from labels or {label, href}', () => {
    expect(breadcrumbOf(['Le Perreux', { label: 'Synoptiques', href: 'javascript:x' }, { nope: 1 }, '  '])).toEqual([
      { label: 'Le Perreux', href: null },
      { label: 'Synoptiques', href: null }
    ])
    expect(breadcrumbOf('Le Perreux')).toEqual([])
    expect(escapeHtml('<b title="x">l\'a</b>')).toBe('&lt;b title=&quot;x&quot;&gt;l&#39;a&lt;/b&gt;')
  })

  it('formats the zoom of the menu', () => {
    expect(formatZoom(1, 'fr').replace(/\s/g, ' ')).toBe('100 %')
    expect(formatZoom(64, 'fr').replace(/\s/g, ' ')).toBe('6 400 %')
    expect(formatZoom(0.01, 'en').replace(/\s/g, ' ')).toBe('1 %')
  })
})

describe('inspector (V3)', () => {
  const group = (html) => {
    const template = document.createElement('template')
    template.innerHTML = html
    return template.content.firstElementChild
  }

  it('puts each group of the old top panel in its section', () => {
    expect(sectionOfTopGroup(group('<div id="title_panel"></div>'))).toBe(null)
    expect(sectionOfTopGroup(group('<div id="editor_panel"></div>'))).toBe('editorPanel')
    expect(sectionOfTopGroup(group('<div id="history_panel"></div>'))).toBe('historyPanel')
    expect(sectionOfTopGroup(group('<div class="selected_panel"><se-input id="elem_id"></se-input></div>'))).toBe('identity')
    expect(sectionOfTopGroup(group('<div class="selected_panel"><se-spin-input id="blur"></se-spin-input></div>'))).toBe('effects')
    expect(sectionOfTopGroup(group('<div class="selected_panel"><se-button id="tool_clone"></se-button></div>'))).toBe('actions')
    expect(sectionOfTopGroup(group('<div class="multiselected_panel"></div>'))).toBe('actions')
    expect(sectionOfTopGroup(group('<div class="xy_panel"></div>'))).toBe('geometry')
    expect(sectionOfTopGroup(group('<div class="angle_panel"></div>'))).toBe('geometry')
    expect(sectionOfTopGroup(group('<div class="image_panel"><se-input id="image_url"></se-input></div>'))).toBe('identity')
    expect(sectionOfTopGroup(group('<div class="image_panel"></div>'))).toBe('geometry')
    expect(sectionOfTopGroup(group('<div class="text_panel"></div>'))).toBe('text')
    expect(sectionOfTopGroup(group('<div id="marker_panel"></div>'))).toBe('stroke')
    expect(sectionOfTopGroup(group('<div id="star_panel"></div>'))).toBe('geometry')
    expect(sectionOfTopGroup(group('<div id="some_extension_panel"></div>'))).toBe('extensions')
  })

  it('a group is shown unless hidden or set to display: none', () => {
    const el = document.createElement('div')
    expect(isShown(el)).toBe(true)
    el.style.display = 'none'
    expect(isShown(el)).toBe(false)
    el.style.display = ''
    el.hidden = true
    expect(isShown(el)).toBe(false)
  })
})

describe('layers tree (V3)', () => {
  const svg = (markup) => {
    const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, 'image/svg+xml')
    const root = document.importNode(doc.documentElement, true)
    document.body.append(root)
    // jsdom has no getBBox: what the canvas draws has one.
    for (const el of root.querySelectorAll('*')) el.getBBox = () => ({ x: 0, y: 0, width: 1, height: 1 })
    return root
  }

  it('lists layers top first, their objects top first, groups closed until opened', () => {
    const root = svg(`<g id="L1"><title>Fond</title><rect id="bg"/></g>
      <g id="L2"><title>Equipements</title><rect id="r1"/><g id="pompe"><circle id="c1"/></g><text id="t1">T</text><defs/></g>`)
    const layers = [...root.children].map((group) => ({ name: group.querySelector('title').textContent, group, visible: true }))
    const opened = new Set([layers[0].group, layers[1].group])
    const rows = flattenTree(layers, { isExpanded: (el) => opened.has(el) })
    expect(rows.map((row) => `${row.depth}${row.kind === 'layer' ? row.name : row.name || row.el.localName}`))
      .toEqual(['0Equipements', '1t1', '1pompe', '1r1', '0Fond', '1bg'])
    opened.add(root.querySelector('#pompe'))
    const names = (rows) => rows.map((row) => (row.kind === 'layer' ? row.name : row.el.id))
    expect(names(flattenTree(layers, { isExpanded: (el) => opened.has(el) })))
      .toEqual(['Equipements', 't1', 'pompe', 'c1', 'r1', 'Fond', 'bg'])
    // The search keeps the match and what holds it, opened.
    expect(names(flattenTree(layers, { isExpanded: () => false, query: 'c1' }))).toEqual(['Equipements', 'pompe', 'c1'])
    expect(names(flattenTree(layers, { isExpanded: () => false, query: 'fond' }))).toEqual(['Fond'])
    root.remove()
  })

  it('names an object by its id, else its title', () => {
    const root = svg('<rect id="a"/><rect><title> Pompe 2 </title></rect><rect/>')
    expect([...root.children].map(nameOf)).toEqual(['a', 'Pompe 2', ''])
    root.remove()
  })
})

describe('code tab (V3)', () => {
  it('reads elements and gives the line of a syntax error, as typed', () => {
    const ok = parseSvgSource('<rect x="1"/>\n<circle r="2"/>', { fragment: true })
    expect(ok.error).toBe(null)
    expect(ok.nodes.map((node) => node.localName)).toEqual(['rect', 'circle'])
    const bad = parseSvgSource('<rect\n  x="1"\n  y=2/>', { fragment: true })
    expect(bad.nodes).toEqual([])
    expect(bad.error).not.toBe(null)
    // jsdom does not always give a line; the browser does (E2E).
    if (bad.error.line !== null) expect(bad.error.line).toBe(3)
    expect(parseSvgSource('<html xmlns="http://www.w3.org/1999/xhtml"/>').error).not.toBe(null)
    expect(parseSvgSource(`<svg xmlns="${SVG_NS}"><rect/></svg>`).nodes[0].localName).toBe('svg')
  })
})

describe('keyboard (V3)', () => {
  it('runs no shortcut in a field, a menu or a dialog; does on a button and in the tree', () => {
    const make = (html) => {
      const template = document.createElement('template')
      template.innerHTML = html
      return template.content.firstElementChild
    }
    expect(readsOwnKeys(make('<input type="text">'))).toBe(true)
    expect(readsOwnKeys(make('<input type="checkbox">'))).toBe(false)
    expect(readsOwnKeys(make('<textarea></textarea>'))).toBe(true)
    expect(readsOwnKeys(make('<div role="menu"></div>'))).toBe(true)
    // The tree reads the navigation keys only: Ctrl+Z still undoes there.
    expect(readsOwnKeys(make('<div role="tree"></div>'))).toBe(false)
    expect(readsOwnKeys(make('<button></button>'))).toBe(false)
    expect(readsOwnKeys(make('<div role="toolbar"></div>'))).toBe(false)
    expect(readsOwnKeys(document)).toBe(false)
  })

  it('reads Ctrl+\\ by the key next to Enter, whatever it types', () => {
    expect(eventShortcut({ key: '\\', code: 'Backslash', ctrlKey: true }, false)).toBe('mod+\\')
    // AZERTY: the same key types "*".
    expect(eventShortcut({ key: '*', code: 'Backslash', ctrlKey: true }, false)).toBe('mod+\\')
    expect(eventShortcut({ key: '\\', code: 'Backslash', metaKey: true }, true)).toBe('mod+\\')
  })
})
