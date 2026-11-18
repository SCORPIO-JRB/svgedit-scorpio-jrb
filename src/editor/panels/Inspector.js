/**
 * Properties tab of the right panel, in the canvas layout (lot V3; plan v2,
 * section 4.5): one inspector, with sections at fixed places.
 *
 * Order: actions on the selection, Position and Dimensions (lot Propriétés,
 * as in Figma), Symbol and Connector (lot V7), Appearance, Typography (lot
 * Texte, as in Figma), Fill, Stroke, Effects, Identity, Extensions, Frame,
 * Layer, Document, Frames. The
 * Layer section (lot V7) gives the current layer, without selection: its
 * name, opacity, blend mode, visibility and lock. A section
 * where nothing applies is hidden and the others keep their order. Without
 * selection the tab describes the document and lists its frames to export;
 * Fill and Stroke then give the style of the next objects drawn, as they
 * always did in SVG-Edit. A frame selected (lot V5) shows its own section
 * alone; the frames module fills both.
 *
 * The groups of fields are those of TopPanel and BottomPanel, with their ids
 * and classes: TopPanel.js still shows and hides them and fills their values,
 * and the extensions that add a panel to #tools_top (markers, polystar) find
 * it, here, in its section. The fields look as in the mockups: grey boxes
 * with their label inside, two per row.
 *
 * The verbs (clone, delete, order, flip, group, align…) are in the "…" menu
 * of the head of the tab, each with its name and shortcut, until V4 moves
 * them into the contextual bar. The menu stays inside #tools_top, where
 * TopPanel finds them.
 *
 * Since lot S1 of the simplification audit, the settings rarely made in a
 * synoptic show only when the selection has a value for them
 * (RARE_SETTINGS). The settings of the stroke and of the text open in a
 * window from an icon (lot Texte), which marks a value that is not the
 * usual one (MORE_SETTINGS).
 *
 * Lot Propriétés, after the panel of Figma: Position aligns the selection,
 * gives X and Y, and the rotation with a turn of 90° and the two flips;
 * Dimensions the width and the height, the lock at their right; Appearance
 * has the eye and the blend mode on its title line, the opacity and the
 * radius of the corners side by side; Fill and Stroke have the libraries
 * and + on their title line, the eye and − at the end of the paint; the
 * stroke has its position (centre, inside, outside), its weight, and its
 * settings (dashes, joins, caps, arrows) behind an icon.
 *
 * Lot Texte, after the panel of Figma for a text: Dimensions gives its
 * Resizing (auto width, auto height, fixed size); Typography its font, its
 * style (weight and italic) and size, its line height and letter spacing,
 * its alignments (horizontal, and vertical in a box of fixed size), and its
 * settings in a window; the settings of the stroke open in the window
 * "Stroke settings", the Basic tab of Figma without its width profile.
 * @module Inspector
 */
import SvgCanvas from '@svgedit/svgcanvas'
import { escapeHtml } from './TopBar.js'
import { RETIRED_CONTROLS, SHOWN_SHORTCUTS } from '../simplification.js'
import { scrubInput, SCRUBBING_CLASS } from '../components/scrub.js'
import { shapesOf, styledAttribute, commonValueOf } from './panelValues.js'
import { firstFamily, numericWeight, DEFAULT_TEXT_STYLES } from './TextStyles.js'
import { parseColor, toHex } from '../color/color.js'
import { isAllHidden } from '../structure.js'

const { isValidUnit, Paint } = SvgCanvas

/**
 * The modes where nothing is drawn with the paint of the inspector: without
 * a selection, Appearance, Fill and Stroke do not show there (lot Fond). In
 * the other modes, a drawing tool, they give the paint of the next shape.
 */
export const UNPAINTED_MODES = new Set(['select', 'multiselect', 'zoom', 'ext-panning', 'frame', 'image', 'connector', 'pathedit', 'textedit', 'resize', 'rotate'])

/**
 * The paint the field of the background shows.
 * @param {{color: string, opacity: number}|null} background
 * @returns {object} A Paint: the colour without #, or none
 */
export const backgroundPaint = (background) => {
  const rgb = background ? parseColor(background.color) : null
  if (!rgb) return new Paint({ solidColor: 'none' })
  return new Paint({ solidColor: toHex(rgb), alpha: Math.round((background.opacity ?? 1) * 100) })
}

export const SECTIONS = ['actions', 'geometry', 'size', 'symbol', 'connector', 'appearance', 'text', 'fill', 'stroke', 'effects', 'identity', 'extensions', 'frame', 'layer', 'document', 'frames']

/**
 * Order of the groups of Position (alignment, X and Y, the points of a line
 * or the centre of a circle, then the rotation) and of Dimensions (the size,
 * the radius of a circle, the points of a star, the Scale tool).
 */
const GEOMETRY_ORDER = {
  'se-align-row': 5,
  'se-text-resizing': 15,
  xy_panel: 10,
  wh_panel: 20,
  rect_panel: 30,
  image_panel: 30,
  circle_panel: 30,
  ellipse_panel: 30,
  line_panel: 30,
  star_panel: 40,
  polygon_panel: 40,
  angle_panel: 50,
  scale_panel: 60
}

/** Groups of Dimensions; the other geometry groups go to Position. */
const SIZE_GROUPS = ['wh_panel', 'rect_panel', 'image_panel', 'scale_panel', 'star_panel', 'polygon_panel']

/** Panels of the extensions, and their section. */
const EXTENSION_PANELS = {
  marker_panel: 'stroke',
  star_panel: 'size',
  polygon_panel: 'size'
}

/** Controls of BottomPanel, and their section. */
const BOTTOM_CONTROLS = {
  fill_color: 'fill',
  palette: 'fill',
  stroke_color: 'stroke',
  stroke_width: 'stroke',
  stroke_style: 'stroke',
  stroke_linejoin: 'stroke',
  stroke_linecap: 'stroke',
  opacity: 'appearance'
}

/**
 * The section of a group of TopPanel.
 * @param {Element} el A child of #tools_top
 * @returns {string|null} A section, a zone ("editorPanel", "historyPanel",
 *   "contextPanel"), or null when it has no place in this layout
 */
export const sectionOfTopGroup = (el) => {
  const has = (selector) => Boolean(el.querySelector?.(selector))
  const is = (name) => el.classList?.contains(name)
  switch (el.id) {
    case 'title_panel': return null
    case 'editor_panel': return 'editorPanel'
    case 'history_panel': return 'historyPanel'
    case 'cur_context_panel': return 'contextPanel'
    // The hidden field that receives the typed text: in the canvas, so that
    // it can take the focus whichever tab is open.
    case 'text': return 'contextPanel'
  }
  if (el.id in EXTENSION_PANELS) return EXTENSION_PANELS[el.id]
  if (is('selected_panel')) {
    if (has('#elem_id') || has('#elem_class')) return 'identity'
    if (has('#blur')) return 'effects'
    return 'actions'
  }
  if (is('multiselected_panel') || is('use_panel') || is('g_panel')) return 'actions'
  if (is('image_panel')) return has('#image_url') ? 'identity' : 'size'
  // The radius of a circle, the radii of an ellipse: its size.
  if (has('#circle_r') || has('#ellipse_rx')) return 'size'
  if (SIZE_GROUPS.some(is)) return 'size'
  if (Object.keys(GEOMETRY_ORDER).some(is)) return 'geometry'
  if (is('text_panel')) return 'text'
  if (is('container_panel') || is('a_panel')) return 'identity'
  return 'extensions'
}

const orderOf = (el) => {
  for (const [name, order] of Object.entries(GEOMETRY_ORDER)) {
    if (el.classList?.contains(name) || el.id === name) return order
  }
  return 100
}

/** Most objects whose corners the Corner radius field reads. */
const MAX_RADIUS_READS = 200

/** Names of the dashes of the stroke, by their values (lot Texte). */
const DASH_NAMES = {
  none: 'dash_solid',
  '2,2': 'dash_dotted',
  '5,5': 'dash_dashed',
  '5,2,2,2': 'dash_dash_dot',
  '5,2,2,2,2,2': 'dash_dash_dot_dot'
}

/** The miter limit of SVG when an element gives none. */
const DEFAULT_MITER_LIMIT = 4

/**
 * The miter angle of Figma for a `stroke-miterlimit`: a miter join whose
 * angle is under it is beveled.
 * @param {string|number|null} limit
 * @returns {number} In degrees, with two decimals
 */
export const miterAngleOf = (limit) => {
  let value = Number.parseFloat(limit)
  if (!Number.isFinite(value) || value < 1) value = DEFAULT_MITER_LIMIT
  return Math.round(2 * Math.asin(1 / value) * 180 / Math.PI * 100) / 100
}

/**
 * The `stroke-miterlimit` of a miter angle. The angle shown has two
 * decimals: a limit that close to a whole number is that number (28.96°
 * gives 4, the default of SVG).
 * @param {number} angle In degrees
 * @returns {number} With four decimals, 1 at least
 */
export const miterLimitOf = (angle) => {
  const degrees = Math.min(180, Math.max(1, Number(angle) || 0))
  const limit = 1 / Math.sin(degrees * Math.PI / 360)
  const whole = Math.round(limit)
  return Math.max(1, Math.abs(limit - whole) < 0.002 ? whole : Math.round(limit * 10000) / 10000)
}

/** The commands of the row of alignment of Position, with their icon. */
const ALIGN_ROW = ['align_left', 'align_center', 'align_right', 'align_top', 'align_middle', 'align_bottom']

/**
 * Whether a group of fields is shown: TopPanel hides a group with
 * `display: none`, an extension may use `hidden`.
 * @param {Element} el
 * @returns {boolean}
 */
export const isShown = (el) => !el.hidden && el.style?.display !== 'none' && !el.classList?.contains('se-inspector-off')

/**
 * Settings rarely made in a synoptic (lot S1): each shows only when one of
 * the selected objects already has a value for it, which then stays
 * readable and editable. They are still read, shown and saved; the Code tab
 * gives them to an object that has none.
 * @type {Record<string, (el: Element, canvas: any) => boolean>}
 */
export const RARE_SETTINGS = {
  tool_text_decoration_linethrough: (el) => decorationOf(el).includes('line-through'),
  tool_text_decoration_overline: (el) => decorationOf(el).includes('overline'),
  tool_word_spacing: (el, canvas) => hasValue(el, 'word-spacing', ['0', 'normal'], canvas),
  tool_text_length: (el) => hasValue(el, 'textLength', ['0']),
  tool_length_adjust: (el) => hasValue(el, 'textLength', ['0']) || hasValue(el, 'lengthAdjust'),
  // The group of the blur, in Effects.
  blur: (el, canvas) => Number(canvas?.getBlur?.(el)) > 0
}

/**
 * Settings folded under "More options" (lot S1), by section, with the values
 * that need no mention: the toggle shows a mark when an object has another.
 */
export const MORE_SETTINGS = {
  stroke: { stroke_linejoin: ['stroke-linejoin', ['miter']], stroke_linecap: ['stroke-linecap', ['butt']] },
  text: {
    tool_text_decoration_underline: ['text-decoration', ['none']],
    tool_word_spacing: ['word-spacing', ['0', 'normal']],
    tool_text_length: ['textLength', ['0']]
  }
}

/** Weights of the Style list of Typography, as in Figma (lot Texte). */
export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/** Sizes of the menu of the font size, as in Figma. */
export const FONT_SIZES = [8, 10, 11, 12, 13, 14, 15, 16, 20, 24, 32, 36, 40, 48, 64, 96, 128]

/**
 * The value of the Style list for a text: its weight, then " italic".
 * @param {string|number|null} weight
 * @param {string|null} style
 * @returns {string}
 */
export const fontStyleValue = (weight, style) => {
  const value = numericWeight(weight)
  const near = FONT_WEIGHTS.reduce((best, w) => Math.abs(w - value) < Math.abs(best - value) ? w : best, 400)
  return `${near}${style === 'italic' || style === 'oblique' ? ' italic' : ''}`
}

/**
 * The attributes of a value of the Style list: 400 and 700 are written
 * "normal" and "bold", as SVG-Edit always did.
 * @param {string} value
 * @returns {{weight: string, italic: boolean}}
 */
export const fontStyleAttributes = (value) => {
  const [weight, italic] = String(value).split(' ')
  const number = Number(weight) || 400
  return { weight: number === 400 ? 'normal' : number === 700 ? 'bold' : String(number), italic: italic === 'italic' }
}

const decorationOf = (el) => `${el.getAttribute?.('text-decoration') ?? ''} ${el.style?.textDecoration ?? ''}`

/**
 * @param {Element} el
 * @param {string} name An attribute, or a property of the style attribute
 *   or of a rule of the style sheets (lot S2)
 * @param {string[]} [none] Values that count as none
 * @param {object} [canvas]
 * @returns {boolean}
 */
const hasValue = (el, name, none = [], canvas = null) => {
  const value = (canvas?.getStyledValue?.(el, name)?.value ?? el.getAttribute?.(name) ?? el.style?.getPropertyValue?.(name) ?? '').trim()
  return value !== '' && !none.includes(value) && !none.includes(String(Number.parseFloat(value)))
}

/** Names of the types of element, for the head of the tab. */
const TYPE_KEYS = {
  rect: 'type_rect',
  circle: 'type_circle',
  ellipse: 'type_ellipse',
  line: 'type_line',
  polyline: 'type_polyline',
  polygon: 'type_polygon',
  path: 'type_path',
  text: 'type_text',
  g: 'type_group',
  use: 'type_use',
  image: 'type_image',
  foreignObject: 'type_foreign',
  a: 'type_link'
}

export class Inspector {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} tab The Properties tab
   */
  constructor (editor, tab) {
    this.editor = editor
    this.tab = tab
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    const section = (name) => name === 'actions'
      ? `<se-popover id="se-actions-menu" placement="bottom-end" role="dialog" aria-label="${t('layout.actions')}">
          <div class="se-section se-actions" data-section="actions"><div class="se-section-body"></div></div>
        </se-popover>`
      : `<section class="se-section" data-section="${name}" aria-labelledby="se-section-${name}">
          <h3 id="se-section-${name}" class="se-section-title">${t(`layout.section_${name}`)}</h3>
          <div class="se-section-tools"></div>
          <div class="se-section-body"></div>
        </section>`
    tab.innerHTML = `
      <div class="se-inspector-head">
        <span class="se-inspector-type"></span>
        <span class="se-inspector-id"></span>
        <button type="button" id="se-actions-button" class="se-icon-button" hidden aria-haspopup="dialog"
          aria-expanded="false" aria-controls="se-actions-menu" aria-label="${t('layout.actions')}"
          ><se-icon src="${imgPath}/more_horiz.svg"></se-icon></button>
      </div>
      <div id="tools_top" class="se-inspector">${SECTIONS.map(section).join('')}</div>`
    this.root = tab.querySelector('#tools_top')
    this.initActions()
    this.buildLayerSection()
    this.buildAlignRow()
    this.buildResizing()
    this.buildAppearance()
    this.buildDocumentSection()
    // The panels that extensions append to #tools_top go to their section,
    // and a section shows as soon as one of its groups does, whoever shows
    // it (TopPanel, or an extension such as polystar when its tool is chosen).
    this.observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList' && record.target === this.root)) this.place()
      if (records.some((record) => record.type === 'attributes')) this.refreshSections()
    })
    this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] })
    // A drawing tool chosen without a selection shows the paint of the next
    // shape; the selection tool hides it.
    document.addEventListener('modeChange', () => this.refreshSections())
  }

  /**
   * The "…" menu of the head: the verbs on the selection.
   * @returns {void}
   */
  initActions () {
    this.$actionsButton = this.tab.querySelector('#se-actions-button')
    this.$actionsMenu = this.tab.querySelector('#se-actions-menu')
    const button = this.$actionsButton
    const menu = this.$actionsMenu
    button.addEventListener('click', () => {
      if (menu.opened) menu.close()
      else menu.open(button)
    })
    menu.addEventListener('se-popover-open', () => button.setAttribute('aria-expanded', 'true'))
    menu.addEventListener('se-popover-close', () => button.setAttribute('aria-expanded', 'false'))
    // The alignment panel opens inside the menu, which grows: it is placed
    // again, so as to stay in the window.
    new MutationObserver(() => {
      if (menu.opened) requestAnimationFrame(() => menu.position())
    }).observe(menu, { subtree: true, attributes: true, attributeFilter: ['hidden'] })
    // A verb closes the menu; the alignment keeps it open, with its own
    // panel of buttons and fields.
    menu.addEventListener('click', (e) => {
      const verb = e.target.closest?.('se-button')
      if (!verb || verb.id === 'tool_align_menu' || verb.closest('#tool_align_popup')) return
      queueMicrotask(() => menu.close({ restoreFocus: true }))
    })
  }

  /**
   * The buttons of a group of verbs show their name and shortcut, as the
   * entries of a menu; the buttons of the alignment panel stay icons.
   * @param {Element} el
   * @returns {void}
   */
  labelVerbs (el) {
    const buttons = [...el.querySelectorAll('se-button')].filter((button) => !button.closest('#tool_align_popup'))
    for (const button of buttons) button.setAttribute('labelled', '')
  }

  /**
   * @param {string} name
   * @returns {HTMLElement}
   */
  body (name) {
    return this.root.querySelector(`[data-section="${name}"] > .se-section-body`)
  }

  /**
   * Puts a group in a section; Position and Dimensions keep their groups in
   * the order of GEOMETRY_ORDER. The arrows of a stroke go to its settings.
   * @param {Element} el
   * @param {string} name
   * @returns {void}
   */
  put (el, name) {
    if (el.id === 'marker_panel') {
      const settings = this.root.querySelector('#se-more-stroke [data-row="arrows"] > .se-settings-control')
      if (settings) {
        settings.append(el)
        return
      }
    }
    const body = this.body(name)
    if (name === 'actions') this.labelVerbs(el)
    // The fold of More options stays last (lot S1).
    const more = [...body.children].find((child) => child.classList.contains('se-more'))
    if (more && el !== more) {
      body.insertBefore(el, more)
      return
    }
    if (name === 'geometry' || name === 'size') {
      const order = orderOf(el)
      const next = [...body.children].find((child) => child !== el && orderOf(child) > order)
      if (next) {
        body.insertBefore(el, next)
        return
      }
    }
    body.append(el)
  }

  /**
   * The groups of TopPanel, before they enter the page.
   * @param {DocumentFragment} fragment
   * @param {object} zones
   * @param {(el: HTMLElement) => void} zones.editorPanel
   * @param {(el: HTMLElement) => void} zones.historyPanel
   * @param {(el: HTMLElement) => void} zones.contextPanel
   * @returns {void}
   */
  attachTop (fragment, zones) {
    const top = fragment.querySelector('#tools_top')
    // Lot S1: Reorient path and Align to the page leave the "…" menu; Clone
    // and Group show the shortcut of the command that does the same, now
    // that D, C and G are gone.
    for (const id of RETIRED_CONTROLS) {
      const el = top.querySelector(`#${id}`)
      if (el) this.editor.layout.retire(el)
    }
    for (const [id, shortcut] of Object.entries(SHOWN_SHORTCUTS)) {
      const button = top.querySelector(`#${id}`)
      button?.setAttribute('shortcut', shortcut)
      button?.setAttribute('shortcut-hint-only', '')
    }
    this.buildAlignGroup(top)
    this.buildRotation(top)
    // The radius of the corners: in Appearance, for a rectangle, a polygon
    // or a path (lot Propriétés).
    const radius = top.querySelector('#rect_rx')
    if (radius) {
      radius.setAttribute('title', 'layout.corner_radius')
      radius.setAttribute('src', 'corner_radius.svg')
      this.$appearanceRow.append(radius)
    }
    this.buildTypography(top)
    for (const el of [...top.children]) {
      const section = sectionOfTopGroup(el)
      if (!section) continue
      if (section in zones) zones[section](el)
      else this.put(el, section)
    }
  }

  /**
   * The controls of BottomPanel, before they enter the page. The zoom field
   * gives way to the zoom menu of the view group.
   * @param {DocumentFragment} fragment
   * @returns {void}
   */
  attachBottom (fragment) {
    const bottom = fragment.querySelector('#tools_bottom')
    for (const el of [...bottom.children]) {
      const section = BOTTOM_CONTROLS[el.id]
      // The opacity, beside the radius of the corners.
      if (el.id === 'opacity') this.$appearanceRow.prepend(el)
      else if (section) this.put(el, section)
      // Fill and stroke: the colour and its opacity are typed in the field,
      // the swatch opens the colour window.
      if (el.localName === 'se-colorpicker') el.setAttribute('editable', '')
    }
    this.buildStrokeRow()
  }

  /**
   * The second line of the stroke, as in Figma: its position and its weight
   * under their captions, then the icon of its settings (lot Propriétés).
   * The icon opens the window "Stroke settings", the Basic tab of Figma
   * without its width profile: the style of the dashes, the join and its
   * miter angle, the caps, the arrows (lot Texte).
   * @returns {void}
   */
  buildStrokeRow () {
    const { editor } = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const body = this.body('stroke')
    const width = body.querySelector('#stroke_width')
    if (!width) return
    const row = document.createElement('div')
    row.className = 'se-stroke-row se-captioned'
    row.innerHTML = `<span class="se-caption">${t('layout.stroke_position')}</span>
      <span class="se-caption">${t('layout.stroke_weight')}</span>
      <label class="se-field se-stroke-align" title="${t('layout.stroke_align')}"><select id="stroke_align"
      aria-label="${t('layout.stroke_align')}"><option value="center">${t('layout.stroke_center')}</option>
      <option value="inside">${t('layout.stroke_inside')}</option><option value="outside">${t('layout.stroke_outside')}</option>
      <option value="" hidden>${t('properties.mixed')}</option></select></label>`
    width.after(row)
    row.append(width)
    this.$strokeAlign = row.querySelector('#stroke_align')
    this.$strokeAlign.addEventListener('change', (e) => {
      if (e.target.value) editor.svgCanvas.setStrokeAlign?.(e.target.value)
      this.refreshStroke(editor.svgCanvas.getSelectedElements().filter(Boolean))
    })
    const style = body.querySelector('#stroke_style')
    if (style) {
      // The dashes by their names, as in Figma ("Solid"), in this layout.
      for (const option of style.$select?.options ?? []) {
        const key = DASH_NAMES[option.value]
        if (key) option.textContent = editor.i18next.t(`layout.${key}`)
      }
    }
    const join = body.querySelector('#stroke_linejoin')
    const cap = body.querySelector('#stroke_linecap')
    this.$miterAngle = this.buildMiterAngle()
    this.settingsWindow('stroke', row, [
      ['style', 'layout.stroke_style', [style]],
      ['join', 'layout.stroke_join', join ? [this.choices(join), join] : []],
      ['miter', 'layout.miter_angle', [this.$miterAngle]],
      ['cap', 'layout.stroke_cap', cap ? [this.choices(cap), cap] : []],
      // The arrows of the extension markers come when it starts (put).
      ['arrows', 'layout.stroke_arrows', []]
    ])
  }

  /**
   * Typography, as in Figma (lot Texte): the font on its own row; its style
   * (weight and italic) beside its size, which has a menu of sizes; the
   * line height and the letter spacing under their captions; the
   * alignment, horizontal and vertical, then the icon of its settings
   * (decoration, word spacing, length). Bold and italic leave the panel for
   * the Style list; their buttons stay out of sight, for their shortcuts and
   * the contextual bar. The width of a text goes to Dimensions (Resizing).
   * @param {Element} top #tools_top, before it enters the page
   * @returns {void}
   */
  buildTypography (top) {
    const panel = top.querySelector('.text_panel')
    if (!panel) return
    const { editor } = this
    const { svgCanvas, i18next } = editor
    const t = (key) => escapeHtml(i18next.t(key))
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    const $ = (id) => panel.querySelector(`#${id}`)
    const family = $('tool_font_family')
    const size = $('font_size')
    const anchor = $('tool_text_anchor')
    const letters = $('tool_letter_spacing')
    // The fonts of the text styles first, by their names.
    if (family?.$select) {
      const fonts = [...new Set(DEFAULT_TEXT_STYLES.map((style) => style.fontFamily))].reverse()
      for (const font of fonts) {
        const option = document.createElement('option')
        option.value = font
        option.textContent = font.split(',')[0].replace(/["']/g, '').trim()
        family.$select.prepend(option)
      }
    }
    // Letter spacing may be negative, as in Figma.
    letters?.setAttribute('min', '-100')

    const style = document.createElement('label')
    style.className = 'se-field se-font-style'
    style.title = i18next.t('layout.font_style')
    const options = FONT_WEIGHTS.flatMap((weight) => [false, true].map((italic) => {
      const name = weight === 400 && italic ? t('layout.italic') : `${t(`layout.weight_${weight}`)}${italic ? ` ${t('layout.italic_suffix')}` : ''}`
      return `<option value="${weight}${italic ? ' italic' : ''}">${name}</option>`
    })).join('')
    style.innerHTML = `<select id="tool_font_style" aria-label="${t('layout.font_style')}">${options}
      <option value="" hidden>${t('properties.mixed')}</option></select>`
    this.$fontStyle = style.querySelector('select')
    this.$fontStyle.addEventListener('change', (e) => this.changeFontStyle(e.target.value))

    const sizeBox = document.createElement('div')
    sizeBox.className = 'se-font-size'
    if (size) sizeBox.append(size)
    const sizes = document.createElement('se-popover')
    sizes.id = 'se-font-sizes'
    sizes.setAttribute('menu', '')
    sizes.setAttribute('placement', 'bottom-end')
    sizes.setAttribute('aria-label', i18next.t('layout.font_sizes'))
    sizes.innerHTML = FONT_SIZES.map((n) => `<div role="menuitemradio" aria-checked="false" data-size="${n}">${n}</div>`).join('')
    const sizesButton = document.createElement('button')
    sizesButton.type = 'button'
    sizesButton.className = 'se-icon-button se-font-sizes-button'
    sizesButton.setAttribute('aria-haspopup', 'menu')
    sizesButton.setAttribute('aria-expanded', 'false')
    sizesButton.setAttribute('aria-label', i18next.t('layout.font_sizes'))
    sizesButton.innerHTML = `<se-icon src="${imgPath}/chevron_down.svg"></se-icon>`
    sizesButton.addEventListener('click', () => {
      if (sizes.opened) {
        sizes.close()
        return
      }
      for (const item of sizes.children) item.setAttribute('aria-checked', String(item.dataset.size === String(size?.value)))
      sizes.open(sizesButton)
    })
    sizes.addEventListener('click', (e) => {
      const value = e.target.closest('[data-size]')?.dataset.size
      if (!value || !size) return
      size.value = value
      size.dispatchEvent(new CustomEvent('change', { detail: { value } }))
    })
    sizeBox.append(sizesButton, sizes)

    const styleRow = document.createElement('div')
    styleRow.className = 'se-type-row'
    styleRow.append(style, sizeBox)

    const spacing = document.createElement('div')
    spacing.className = 'se-captioned se-type-spacing'
    spacing.innerHTML = `<span class="se-caption">${t('layout.line_height')}</span><span class="se-caption">${t('layout.letter_spacing')}</span>`
    spacing.append(...[$('tool_line_height'), letters].filter(Boolean))

    const align = document.createElement('div')
    align.className = 'se-captioned se-type-align'
    align.innerHTML = `<span class="se-caption">${t('layout.text_align')}</span>`
    if (anchor) align.append(this.choices(anchor, () => this.refreshText(svgCanvas.getSelectedElements().filter(Boolean))))
    align.append(this.buildVerticalAlign())

    const offstage = document.createElement('div')
    offstage.className = 'se-offstage'
    offstage.append(...[$('tool_bold'), $('tool_italic'), $('tool_text_auto_width'), anchor].filter(Boolean))
    const decoration = document.createElement('div')
    decoration.className = 'se-toggles'
    // The mark of the icon follows a decoration given or taken away.
    decoration.addEventListener('click', () => setTimeout(() => this.refreshRare(svgCanvas.getSelectedElements().filter(Boolean))))
    decoration.append(...['underline', 'linethrough', 'overline'].map((name) => $(`tool_text_decoration_${name}`)).filter(Boolean))
    const rows = [
      ['decoration', 'layout.text_decoration', [decoration]],
      ['words', 'layout.word_spacing', [$('tool_word_spacing')]],
      ['length', 'layout.text_length', [$('tool_text_length')]],
      ['adjust', 'layout.length_adjust', [$('tool_length_adjust')]]
    ]
    panel.replaceChildren(...[family, styleRow, spacing, align, offstage].filter(Boolean))
    this.settingsWindow('text', align, rows, panel)
    // The text styles, as the libraries of Fill and Stroke.
    const tools = this.root.querySelector('[data-section="text"] > .se-section-tools')
    tools.innerHTML = `<button type="button" class="se-section-tool" id="se-text-styles" aria-haspopup="dialog"
      aria-expanded="false" aria-label="${t('textstyles.title')}"><se-icon src="${imgPath}/styles.svg"></se-icon></button>`
    const stylesButton = tools.querySelector('#se-text-styles')
    stylesButton.seTooltip = { label: i18next.t('textstyles.title') }
    stylesButton.addEventListener('click', () => editor.textStyles?.open(stylesButton, { beside: this.tab }))
  }

  /**
   * The vertical alignment of a text in its box, as in Figma: it shows in
   * a text of fixed size, whose box is higher than its lines.
   * @returns {HTMLElement}
   */
  buildVerticalAlign () {
    const { editor } = this
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    const group = document.createElement('div')
    group.className = 'se-choices'
    group.id = 'tool_text_valign'
    group.setAttribute('role', 'radiogroup')
    group.setAttribute('aria-label', editor.i18next.t('layout.text_valign'))
    for (const value of ['top', 'middle', 'bottom']) {
      const button = document.createElement('button')
      const label = editor.i18next.t(`layout.text_valign_${value}`)
      button.type = 'button'
      button.className = 'se-icon-button'
      button.dataset.value = value
      button.setAttribute('role', 'radio')
      button.setAttribute('aria-checked', String(value === 'top'))
      button.setAttribute('aria-label', label)
      button.seTooltip = { label }
      button.innerHTML = `<se-icon src="${imgPath}/text_valign_${value}.svg"></se-icon>`
      group.append(button)
    }
    group.addEventListener('click', (e) => {
      const button = e.target.closest('[data-value]')
      if (!button || button.disabled) return
      editor.svgCanvas.setTextVerticalAlign?.(button.dataset.value)
      this.refreshText(editor.svgCanvas.getSelectedElements().filter(Boolean))
    })
    return group
  }

  /**
   * Writes the weight and the italic of the Style list on the selected
   * texts, in one undo step.
   * @param {string} value "700", "400 italic"…
   * @returns {void}
   */
  changeFontStyle (value) {
    if (!value) return
    const { svgCanvas } = this.editor
    const texts = svgCanvas.getSelectedElements().filter((el) => el?.tagName === 'text')
    if (!texts.length) return
    const { weight, italic } = fontStyleAttributes(value)
    const attrs = { 'font-weight': weight }
    const isItalic = (el) => ['italic', 'oblique'].includes(styledAttribute(svgCanvas, el, 'font-style'))
    if (italic || texts.some(isItalic)) attrs['font-style'] = italic ? 'italic' : 'normal'
    svgCanvas.changeSelectedAttributes(attrs, texts)
    this.refreshText(texts)
  }

  /**
   * What the selected texts share, in Typography: their font, shown by its
   * name even when the list has none such; their style; their alignments;
   * and whether they have a box of fixed size.
   * @param {Element[]} selected
   * @returns {void}
   */
  refreshText (selected) {
    const { svgCanvas } = this.editor
    const texts = selected.filter((el) => el?.tagName === 'text')
    if (this.$resizing) {
      const shown = texts.length > 0 && texts.length === selected.length && svgCanvas.getMode?.() !== 'textedit'
      if (this.$resizing.hidden === shown) this.$resizing.hidden = !shown
      if (shown) {
        const mode = commonValueOf(texts, (el) => svgCanvas.getTextResizing?.(el) ?? 'auto-width')
        for (const button of this.$resizing.querySelectorAll('[data-value]')) {
          button.setAttribute('aria-checked', String(button.dataset.value === mode))
        }
      }
    }
    if (!texts.length) return
    const styled = (name) => (el) => styledAttribute(svgCanvas, el, name)
    const family = document.getElementById('tool_font_family')
    const font = commonValueOf(texts, styled('font-family'))
    if (family?.$select && font) {
      const options = [...family.$select.options]
      let option = options.find((item) => item.value && firstFamily(item.value) === firstFamily(font))
      if (!option) {
        option = document.createElement('option')
        option.value = font
        option.className = 'se-font-other'
        option.textContent = font.split(',')[0].replace(/["']/g, '').trim()
        family.$select.querySelector('.se-font-other')?.remove()
        family.$select.prepend(option)
      }
      family.$select.value = option.value
    } else if (family && font === undefined) {
      family.mixed = true
    }
    if (this.$fontStyle && document.activeElement !== this.$fontStyle) {
      const value = commonValueOf(texts, (el) => fontStyleValue(styled('font-weight')(el), styled('font-style')(el)))
      this.$fontStyle.value = value ?? ''
    }
    const anchors = this.root.querySelector('.se-choices[data-for="tool_text_anchor"]')
    if (anchors) {
      const anchor = commonValueOf(texts, (el) => styled('text-anchor')(el) || 'start')
      anchors.dataset.mixed = String(anchor === undefined)
      const list = document.getElementById('tool_text_anchor')
      if (anchor !== undefined && list.getAttribute('value') !== anchor) list.setAttribute('value', anchor)
      else anchors.syncChoices?.()
    }
    const valign = this.root.querySelector('#tool_text_valign')
    if (valign) {
      const fixed = texts.every((el) => svgCanvas.getTextHeight?.(el))
      const value = commonValueOf(texts, (el) => svgCanvas.getTextVerticalAlign?.(el) ?? 'top')
      for (const button of valign.children) {
        button.disabled = !fixed
        button.setAttribute('aria-checked', String(button.dataset.value === value))
      }
      valign.classList.toggle('se-disabled', !fixed)
    }
  }

  /**
   * The miter angle of Figma: under it, a miter join is cut (beveled). SVG
   * writes it as `stroke-miterlimit`, the length of the miter in stroke
   * widths; 4, its default, is an angle of 28.96°.
   * @returns {HTMLElement}
   */
  buildMiterAngle () {
    const { svgCanvas } = this.editor
    const field = document.createElement('se-spin-input')
    field.id = 'stroke_miter_angle'
    field.setAttribute('min', '1')
    field.setAttribute('max', '180')
    field.setAttribute('step', '1')
    field.setAttribute('title', 'layout.miter_angle')
    field.setAttribute('src', 'angle.svg')
    field.addEventListener('change', (e) => {
      if (e.detail?.relative) {
        // "Mixed": each angle changes by the same amount.
        const { relative } = e.detail
        svgCanvas.changeSelectedAttributeEach('stroke-miterlimit', (elem) =>
          miterLimitOf(relative(miterAngleOf(styledAttribute(svgCanvas, elem, 'stroke-miterlimit')))), this.strokeShapes())
        return
      }
      const angle = Number.parseFloat(e.target.value)
      if (Number.isFinite(angle)) svgCanvas.setStrokeAttr('stroke-miterlimit', miterLimitOf(angle))
    })
    return field
  }

  /**
   * The shapes whose stroke the settings change: the selection, the shapes
   * of its groups included.
   * @returns {Element[]}
   */
  strokeShapes () {
    return shapesOf(this.editor.svgCanvas.getSelectedElements().filter(Boolean))
  }

  /**
   * A row of buttons for the choices of a list (se-list), as the joins of
   * Figma. A click chooses as the list does; the list stays, out of sight,
   * for its handlers and the contextual bar.
   * @param {HTMLElement} list
   * @param {() => void} [changed] After a choice
   * @returns {HTMLElement}
   */
  choices (list, changed = () => this.refreshStroke(this.editor.svgCanvas.getSelectedElements().filter(Boolean))) {
    const { i18next } = this.editor
    const imgPath = escapeHtml(this.editor.configObj.curConfig.imgPath)
    const group = document.createElement('div')
    group.className = 'se-choices'
    group.dataset.for = list.id
    group.setAttribute('role', 'radiogroup')
    const items = [...list.querySelectorAll('se-list-item')]
    for (const item of items) {
      const button = document.createElement('button')
      const label = i18next.t(item.getAttribute('title'))
      button.type = 'button'
      button.className = 'se-icon-button'
      button.dataset.value = item.getAttribute('value')
      button.setAttribute('role', 'radio')
      button.setAttribute('aria-label', label)
      button.seTooltip = { label }
      button.innerHTML = `<se-icon src="${imgPath}/${escapeHtml(item.getAttribute('src'))}"></se-icon>`
      group.append(button)
    }
    // "Mixed": none is chosen.
    const sync = () => {
      const value = group.dataset.mixed === 'true' ? null : list.getAttribute('value') || items[0]?.getAttribute('value')
      for (const button of group.children) button.setAttribute('aria-checked', String(button.dataset.value === value))
    }
    group.syncChoices = sync
    group.addEventListener('click', (e) => {
      const value = e.target.closest('[data-value]')?.dataset.value
      if (!value) return
      group.dataset.mixed = 'false'
      list.setAttribute('value', value)
      list.dispatchEvent(new CustomEvent('change', { detail: { value } }))
      sync()
      changed()
    })
    new MutationObserver(sync).observe(list, { attributes: true, attributeFilter: ['value'] })
    list.classList.add('se-proxied')
    sync()
    return group
  }

  /**
   * A window of settings, as "Stroke settings" in Figma: the icon at the end
   * of a row opens it at the left of the panel, with its title, a button to
   * close it and a row for each setting, its name at the left. Its body
   * keeps the id and the class of the folds of "More options", so that the
   * contextual bar counts its controls as shown.
   * @param {"stroke"|"text"} name
   * @param {Element} host The row that ends with the icon
   * @param {Array<[string, string, Array<Element|null>]>} rows
   *   [name, key of the label, controls]
   * @param {Element} [container] Where the window goes: its section
   * @returns {HTMLElement} The window
   */
  settingsWindow (name, host, rows, container = this.body(name)) {
    const { editor } = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    const label = editor.i18next.t(`layout.${name}_settings`)
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'se-more-toggle se-section-tool se-more-icon'
    toggle.dataset.more = name
    toggle.setAttribute('aria-haspopup', 'dialog')
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-controls', `se-settings-${name}`)
    toggle.setAttribute('aria-label', label)
    toggle.seTooltip = { label }
    toggle.innerHTML = `<se-icon src="${imgPath}/tune.svg"></se-icon>`
    host.append(toggle)
    const popover = document.createElement('se-popover')
    popover.id = `se-settings-${name}`
    popover.className = 'se-settings'
    popover.dataset.more = name
    popover.setAttribute('placement', 'left-start')
    popover.setAttribute('role', 'dialog')
    popover.setAttribute('aria-labelledby', `se-settings-${name}-title`)
    popover.innerHTML = `<div class="se-settings-head"><h4 id="se-settings-${name}-title">${escapeHtml(label)}</h4>
      <button type="button" class="se-icon-button se-settings-close" aria-label="${t('common.close')}"
        ><se-icon src="${imgPath}/xmark.svg"></se-icon></button></div>
      <div class="se-more-body se-settings-body" id="se-more-${name}"></div>`
    const body = popover.querySelector('.se-settings-body')
    for (const [row, key, controls] of rows) {
      const line = document.createElement('div')
      line.className = 'se-settings-row'
      line.dataset.row = row
      line.innerHTML = `<span class="se-settings-label">${t(key)}</span><div class="se-settings-control"></div>`
      line.lastElementChild.append(...controls.filter(Boolean))
      body.append(line)
    }
    toggle.addEventListener('click', () => {
      if (popover.opened) {
        popover.close()
        return
      }
      popover.open(toggle, { beside: this.tab })
    })
    popover.querySelector('.se-settings-close').addEventListener('click', () => popover.close({ restoreFocus: true }))
    // Escape closes the window first, as in Figma, wherever the focus is:
    // the selection stays. A value dragged keeps its own Escape.
    const escape = (e) => {
      if (e.key !== 'Escape' || !popover.opened || document.documentElement.classList.contains(SCRUBBING_CLASS)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      popover.close({ restoreFocus: popover.contains(document.activeElement) })
    }
    popover.addEventListener('se-popover-open', () => window.addEventListener('keydown', escape, true))
    popover.addEventListener('se-popover-close', () => {
      window.removeEventListener('keydown', escape, true)
      toggle.setAttribute('aria-expanded', 'false')
    })
    const holder = document.createElement('div')
    holder.className = 'se-more se-settings-holder'
    holder.dataset.more = name
    holder.append(popover)
    container.append(holder)
    return popover
  }

  /**
   * The row of alignment of Position: one object aligns on the page,
   * several on one another, as the commands of the keyboard do.
   * @returns {void}
   */
  buildAlignRow () {
    const { editor } = this
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    const row = document.createElement('div')
    row.className = 'se-align-row'
    row.setAttribute('role', 'group')
    row.setAttribute('aria-label', editor.i18next.t('layout.align_row'))
    row.hidden = true
    for (const id of ALIGN_ROW) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'se-icon-button'
      button.dataset.command = id
      button.setAttribute('aria-label', editor.i18next.t(`tools.${id}`))
      button.innerHTML = `<se-icon src="${imgPath}/${id}.svg"></se-icon>`
      row.append(button)
    }
    row.addEventListener('click', (e) => {
      const id = e.target.closest('[data-command]')?.dataset.command
      if (id) editor.commands.execute(id, e)
    })
    this.$alignRow = row
    this.put(row, 'geometry')
  }

  /**
   * The Resizing of a text, as in Figma, above its width and height: as wide
   * as its lines, of a fixed width (its lines break in it, its height
   * follows them), or of a fixed size (lot Texte).
   * @returns {void}
   */
  buildResizing () {
    const { editor } = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    const row = document.createElement('div')
    row.className = 'se-text-resizing se-captioned'
    row.hidden = true
    const modes = [['auto-width', 'text_auto_width'], ['auto-height', 'text_auto_height'], ['fixed', 'text_fixed_size']]
    row.innerHTML = `<span class="se-caption">${t('layout.text_resizing')}</span>
      <div class="se-choices" id="se-text-resizing" role="radiogroup" aria-label="${t('layout.text_resizing')}">${modes.map(([mode, key]) =>
        `<button type="button" class="se-icon-button" role="radio" aria-checked="false" data-value="${mode}"
          aria-label="${t(`layout.${key}`)}"><se-icon src="${imgPath}/${key}.svg"></se-icon></button>`).join('')}</div>`
    for (const button of row.querySelectorAll('[data-value]')) button.seTooltip = { label: button.getAttribute('aria-label') }
    row.addEventListener('click', (e) => {
      const mode = e.target.closest('[data-value]')?.dataset.value
      if (!mode) return
      editor.svgCanvas.setTextResizing?.(mode)
      editor.topPanel?.updateContextPanel?.()
      this.refreshText(editor.svgCanvas.getSelectedElements().filter(Boolean))
    })
    this.$resizing = row
    this.put(row, 'size')
  }

  /**
   * The names and shortcuts of the row of alignment, once the commands are
   * registered.
   * @returns {void}
   */
  labelAlignRow () {
    const { commands, i18next } = this.editor
    if (this.alignLabelled || !this.$alignRow || !commands?.hint) return
    this.alignLabelled = true
    for (const button of this.$alignRow.querySelectorAll('[data-command]')) {
      const id = button.dataset.command
      const label = i18next.t(`tools.${id}`)
      const hint = commands.hint(id)
      // The tooltip of the editor, without the native one.
      button.seTooltip = { label, shortcut: hint || undefined }
    }
  }

  /**
   * The rotation, as in Figma: a caption, the angle, then a turn of 90° and
   * the two flips side by side. The flips leave the "…" menu; their
   * shortcuts stay.
   * @param {Element} top #tools_top, before it enters the page
   * @returns {void}
   */
  buildRotation (top) {
    const panel = top.querySelector('.angle_panel')
    if (!panel) return
    const { editor } = this
    const caption = document.createElement('p')
    caption.className = 'se-subhead'
    caption.textContent = editor.i18next.t('layout.rotation')
    panel.prepend(caption)
    const group = document.createElement('div')
    group.className = 'se-segmented'
    const rotate = document.createElement('se-button')
    rotate.id = 'tool_rotate_90'
    rotate.setAttribute('title', 'layout.rotate_90')
    rotate.setAttribute('src', 'rotate_90.svg')
    rotate.addEventListener('click', () => this.rotate90())
    group.append(rotate)
    for (const id of ['tool_flip_h', 'tool_flip_v']) {
      const button = top.querySelector(`#${id}`)
      if (button) group.append(button)
    }
    panel.append(group)
  }

  /**
   * Turns the selection by 90° clockwise: one object about its centre, a
   * selection whose objects share their angle as a whole, the others each
   * about its own centre.
   * @returns {void}
   */
  rotate90 () {
    const { svgCanvas } = this.editor
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.length) return
    const turn = (angle) => {
      let next = (Number(angle) || 0) + 90
      while (next > 180) next -= 360
      return Math.round(next * 100) / 100
    }
    const field = this.root.querySelector('#angle')
    if (selected.length > 1 && field?.mixed) {
      svgCanvas.rotateEachSelectedElement((angle) => turn(angle))
      return
    }
    const current = selected.length > 1 ? Number(field?.value) : svgCanvas.getRotationAngle(selected[0])
    svgCanvas.setRotationAngle(turn(current))
  }

  /**
   * Appearance: the eye and the blend mode on its title line, the opacity
   * and the radius of the corners on one row (lot Propriétés). The lock
   * stays in the Layers tab, the context menu and Ctrl+Shift+L.
   * @returns {void}
   */
  buildAppearance () {
    const { editor } = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    const tools = this.root.querySelector('[data-section="appearance"] > .se-section-tools')
    const modes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference']
    tools.innerHTML = `
      <button type="button" class="se-section-tool" data-command="hide_selection" aria-label="${t('layout.hide')}"
        title="${t('layout.hide')}"><se-icon src="${imgPath}/eye.svg"></se-icon></button>
      <label class="se-section-tool se-blend" title="${t('layout.blend_mode')}"><se-icon src="${imgPath}/blend.svg"></se-icon
        ><select id="se-blend-mode" aria-label="${t('layout.blend_mode')}">${modes.map((mode) =>
          `<option value="${mode}">${t(`structure.blend_${mode}`)}</option>`).join('')}</select></label>`
    tools.addEventListener('click', (e) => {
      const id = e.target.closest('[data-command]')?.dataset.command
      if (id) editor.commands.execute(id, e)
    })
    this.$blend = tools.querySelector('#se-blend-mode')
    this.$blend.addEventListener('change', (e) => {
      editor.svgCanvas.setBlendModes?.(editor.svgCanvas.getSelectedElements().filter(Boolean), e.target.value)
      this.refreshAppearance(editor.svgCanvas.getSelectedElements().filter(Boolean))
    })
    const row = document.createElement('div')
    row.className = 'se-appearance-row'
    this.body('appearance').append(row)
    this.$appearanceRow = row
  }

  /**
   * The blend mode and the radius of the corners of the selection.
   * @param {Element[]} selected
   * @returns {void}
   */
  refreshAppearance (selected) {
    const { svgCanvas } = this.editor
    const tools = this.root.querySelector('[data-section="appearance"] > .se-section-tools')
    if (tools) tools.hidden = !selected.length
    const eye = tools?.querySelector('[data-command="hide_selection"]')
    if (eye) {
      // As in Figma, the eye that hid the selection shows it again.
      const hidden = isAllHidden(selected)
      const label = this.editor.i18next.t(hidden ? 'layout.show' : 'layout.hide')
      const src = `${this.editor.configObj.curConfig.imgPath}/${hidden ? 'eye_off' : 'eye'}.svg`
      eye.setAttribute('aria-pressed', String(hidden))
      eye.setAttribute('aria-label', label)
      eye.title = label
      const icon = eye.querySelector('se-icon')
      if (icon && icon.getAttribute('src') !== src) icon.setAttribute('src', src)
    }
    if (this.$blend) {
      const modes = new Set(selected.map((el) => svgCanvas.getBlendMode?.(el) ?? 'normal'))
      const blend = modes.size === 1 ? [...modes][0] : 'normal'
      if (document.activeElement !== this.$blend) this.$blend.value = blend
      this.$blend.closest('.se-blend')?.classList.toggle('se-set', modes.size > 1 || blend !== 'normal')
      this.$blend.disabled = !selected.length
    }
    const radius = this.root.querySelector('#rect_rx')
    if (!radius) return
    const corners = svgCanvas.cornerActions
    // Each path is read for its corners: not for a selection of thousands.
    const radii = corners && selected.length <= MAX_RADIUS_READS ? selected.map((el) => corners.radiusOf(el)).filter(Boolean) : []
    radius.hidden = !radii.length || svgCanvas.getMode?.() === 'pathedit'
    if (!radii.length) return
    const values = new Set(radii.map((r) => r.radius))
    if (values.size > 1 || radii.some((r) => r.mixed)) radius.mixed = true
    else if (String(radius.value) !== String([...values][0])) radius.value = [...values][0]
  }

  /**
   * The position of the stroke of the selection, and whether it can have one.
   * @param {Element[]} selected
   * @returns {void}
   */
  refreshStroke (selected) {
    const select = this.$strokeAlign
    if (!select) return
    const { svgCanvas, i18next } = this.editor
    const align = svgCanvas.commonStrokeAlign?.(selected) ?? null
    // A shape with a clip or a mask of its own keeps its stroke centred.
    const shapes = selected.flatMap((el) => el.tagName === 'g' || el.tagName === 'a' ? [...el.querySelectorAll('*')] : [el])
      .filter((el) => svgCanvas.takesStrokeAlign?.(el))
    const clipped = shapes.length > 0 && shapes.every((el) => svgCanvas.hasForeignClip?.(el))
    select.disabled = align === null || clipped
    select.closest('label').title = i18next.t(clipped ? 'layout.stroke_align_off' : 'layout.stroke_align')
    if (document.activeElement !== select) select.value = align === 'mixed' ? '' : (align ?? 'center')
    this.refreshStrokeSettings(selected)
  }

  /**
   * The join and the caps the stroked shapes share (none chosen when they
   * differ), and their miter angle, which shows for a miter join only.
   * @param {Element[]} selected
   * @returns {void}
   */
  refreshStrokeSettings (selected) {
    const settings = this.root.querySelector('#se-more-stroke')
    if (!settings) return
    const { svgCanvas } = this.editor
    const shapes = shapesOf(selected)
    const styled = (name, fallback) => (el) => styledAttribute(svgCanvas, el, name) || fallback
    for (const [id, name, fallback] of [['stroke_linejoin', 'stroke-linejoin', 'miter'], ['stroke_linecap', 'stroke-linecap', 'butt']]) {
      const group = settings.querySelector(`.se-choices[data-for="${id}"]`)
      const list = settings.querySelector(`#${id}`)
      if (!group || !list || !shapes.length) continue
      const value = commonValueOf(shapes, styled(name, fallback))
      group.dataset.mixed = String(value === undefined)
      if (value !== undefined && list.getAttribute('value') !== value) list.setAttribute('value', value)
      else group.syncChoices?.()
    }
    const joins = new Set(shapes.map(styled('stroke-linejoin', 'miter')))
    const row = settings.querySelector('[data-row="miter"]')
    if (row) row.hidden = shapes.length > 0 && !joins.has('miter')
    const field = this.$miterAngle
    if (!field || !shapes.length) return
    const angle = commonValueOf(shapes, (el) => miterAngleOf(styledAttribute(svgCanvas, el, 'stroke-miterlimit')))
    if (angle === undefined) field.mixed = true
    else if (field.mixed || String(field.value) !== String(angle)) field.value = angle
  }

  /**
   * Align opens for one object too (lot S1), in place of Align to the page:
   * its group leaves the verbs of a multi-selection and shows for both. One
   * object aligns on the page; the distribution and the reference, which
   * need several, give way to a line that says so.
   * @param {Element} top #tools_top, before it enters the page
   * @returns {void}
   */
  buildAlignGroup (top) {
    const align = top.querySelector('#align_menu')
    const group = align?.closest('.multiselected_panel')
    if (!group) return
    const wrapper = document.createElement('div')
    wrapper.className = 'selected_panel multiselected_panel se-align-group'
    group.after(wrapper)
    wrapper.append(align)
    const note = document.createElement('p')
    note.className = 'se-align-page'
    note.textContent = this.editor.i18next.t('tools.align_to_page')
    align.querySelector('#tool_align_popup')?.append(note)
  }

  /**
   * The rare settings that the selection has, and the mark of the folds that
   * hide a value.
   * @param {Element[]} selected
   * @returns {void}
   */
  refreshRare (selected) {
    const canvas = this.editor.svgCanvas
    // A setting shown for a selection stays while it is selected: removing
    // its value (line-through clicked off) does not take the button away.
    const same = this.rareFor?.length === selected.length && selected.every((el, i) => el === this.rareFor[i])
    if (!same) this.rareShown = new Set()
    this.rareFor = selected
    for (const [id, test] of Object.entries(RARE_SETTINGS)) {
      if (selected.some((el) => test(el, canvas))) this.rareShown.add(id)
      const control = this.root.querySelector(`#${id}`)
      const target = id === 'blur' ? control?.closest('.selected_panel') : control
      target?.classList.toggle('se-inspector-off', !this.rareShown.has(id))
    }
    for (const [name, settings] of Object.entries(MORE_SETTINGS)) {
      const set = selected.some((el) => Object.values(settings).some(([attr, none]) => hasValue(el, attr, none, canvas)))
      this.root.querySelector(`.se-more-toggle[data-more="${name}"], [data-more="${name}"] .se-more-toggle`)?.classList.toggle('se-more-set', set)
    }
    this.root.querySelector('#tool_align_popup')?.toggleAttribute('data-single', selected.length === 1)
  }

  /**
   * Panels added to #tools_top after start (extensions).
   * @returns {void}
   */
  place () {
    for (const el of [...this.root.children]) {
      if (el.classList.contains('se-section') || el === this.$actionsMenu) continue
      const section = sectionOfTopGroup(el)
      this.put(el, section && this.body(section) ? section : 'extensions')
    }
  }

  /**
   * Document fields, shown without selection: title, size, grid and
   * snapping, and since lot S1 what only the Document properties dialog
   * offered: the size of the content, the images included as data or as a
   * reference. The rest is in the preferences.
   * @returns {void}
   */
  buildDocumentSection () {
    const { editor } = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const body = this.body('document')
    body.innerHTML = `
      <label class="se-field se-field-wide">${t('layout.doc_title')}<input type="text" id="se-doc-title"></label>
      <label class="se-field se-field-short"><span class="se-field-letter">${t('properties.w_label')}</span><input type="text" id="se-doc-width" inputmode="decimal" size="5"></label>
      <label class="se-field se-field-short"><span class="se-field-letter">${t('properties.h_label')}</span><input type="text" id="se-doc-height" inputmode="decimal" size="5"></label>
      <div class="se-doc-background se-captioned">
        <span class="se-caption" id="se-doc-background-label">${t('layout.page_background')}</span>
        <div class="se-paint-row">
          <se-colorpicker id="se-doc-background" type="background" src="fill.svg" label="layout.page_background"
            data-title="layout.page_background" data-solid editable></se-colorpicker>
          <button type="button" class="se-paint-icon se-section-tool se-paint-toggle" id="se-doc-background-toggle"></button>
        </div>
      </div>
      <label class="se-check"><input type="checkbox" id="se-doc-grid">${t('layout.grid')}</label>
      <label class="se-check"><input type="checkbox" id="se-doc-gridsnap">${t('layout.grid_snapping')}</label>
      <label class="se-check"><input type="checkbox" id="se-doc-objectsnap">${t('layout.object_snapping')}</label>
      <label class="se-field se-field-wide">${t('config.included_images')}<select id="se-doc-images">
        <option value="embed">${t('config.image_opt_embed')}</option>
        <option value="ref">${t('config.image_opt_ref')}</option></select></label>
      <div class="se-section-links">
        <button type="button" class="se-link-button" id="se-doc-fit">${t('tools.fitToContent')}</button>
        <button type="button" class="se-link-button" data-target="tool_editor_prefs">${t('config.editor_prefs')}…</button>
      </div>`
    const field = (id) => body.querySelector(`#${id}`)
    field('se-doc-title').addEventListener('change', (e) => {
      editor.svgCanvas.setDocumentTitle(e.target.value)
      editor.topPanel.updateTitle?.(e.target.value || undefined)
    })
    const resize = () => {
      const w = field('se-doc-width').value.trim()
      const h = field('se-doc-height').value.trim()
      if (!isValidUnit('width', w) || !isValidUnit('height', h) || !editor.svgCanvas.setResolution(w, h)) {
        editor.toast(editor.i18next.t('notification.invalidAttrValGiven'), { type: 'error' })
        this.refreshDocument()
        return
      }
      editor.updateCanvas()
      this.refreshDocument()
    }
    field('se-doc-width').addEventListener('change', resize)
    field('se-doc-height').addEventListener('change', resize)
    // The letters W and H drag the size (lot Valeurs glissées).
    for (const id of ['se-doc-width', 'se-doc-height']) {
      scrubInput(field(id).previousElementSibling, field(id), { min: 1 })
    }
    // The size of the content, as "Fit to content" of the dialog did.
    field('se-doc-fit').addEventListener('click', () => {
      if (!editor.svgCanvas.setResolution('fit', 'fit')) {
        editor.toast(editor.i18next.t('notification.noContentToFitTo'), { type: 'error' })
        return
      }
      editor.updateCanvas()
      this.refreshDocument()
    })
    // As the dialog saved it: a preference, read when the document is saved.
    field('se-doc-images').addEventListener('change', (e) => {
      editor.configObj.pref('img_save', e.target.value)
      editor.$container.querySelector('#se-img-prop')?.setAttribute('save', e.target.value)
    })
    this.buildBackground(body)
    field('se-doc-grid').addEventListener('change', (e) => editor.grid?.setVisible(e.target.checked))
    const snapping = (key) => (e) => editor.setConfig({ [key]: e.target.checked })
    field('se-doc-gridsnap').addEventListener('change', snapping('gridSnapping'))
    field('se-doc-objectsnap').addEventListener('change', snapping('objectSnapping'))
    body.addEventListener('click', (e) => {
      const target = e.target.closest('[data-target]')?.dataset.target
      if (target) editor.$container.querySelector(`#${target}`)?.click()
    })
    editor.$container.addEventListener('se-gridchange', () => this.refreshDocument())
  }

  /**
   * The current layer, without selection (plan v2, 2.6; lot V7).
   * @returns {void}
   */
  buildLayerSection () {
    const { editor } = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const body = this.body('layer')
    const modes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference']
    body.innerHTML = `
      <label class="se-field se-field-wide">${t('layers.layer')}<input type="text" id="se-layer-name"></label>
      <label class="se-field se-field-short"><span class="se-field-letter">${t('structure.layer_opacity')}</span><input type="text" id="se-layer-opacity" inputmode="decimal" size="4"></label>
      <label class="se-field se-field-short">${t('structure.blend')}<select id="se-layer-blend">${modes.map((mode) =>
        `<option value="${mode}">${t(`structure.blend_${mode}`)}</option>`).join('')}</select></label>
      <label class="se-check"><input type="checkbox" id="se-layer-visible">${t('structure.visible')}</label>
      <label class="se-check"><input type="checkbox" id="se-layer-locked">${t('structure.locked')}</label>`
    const field = (id) => body.querySelector(`#${id}`)
    const layer = () => editor.svgCanvas.getCurrentDrawing().getCurrentLayer()
    const done = () => {
      editor.layersPanel.populateLayers()
      this.refreshLayer()
    }
    field('se-layer-name').addEventListener('change', (e) => {
      const name = e.target.value.trim()
      const drawing = editor.svgCanvas.getCurrentDrawing()
      if (!name || name === drawing.getCurrentLayerName()) {
        this.refreshLayer()
        return
      }
      editor.layersPanel.renameLayerTo(name)
      this.refreshLayer()
    })
    field('se-layer-opacity').addEventListener('change', (e) => {
      // "50", "50 %" or "0.5"
      const text = e.target.value.replace(',', '.').replace('%', '').trim()
      let value = Number.parseFloat(text)
      if (!Number.isFinite(value)) {
        this.refreshLayer()
        return
      }
      if (value > 1 || /%/.test(e.target.value)) value /= 100
      editor.svgCanvas.setLayerStyle(layer(), { opacity: value })
      done()
    })
    // "Opacity" drags it, from 0 to 100 % (lot Valeurs glissées).
    scrubInput(field('se-layer-opacity').previousElementSibling, field('se-layer-opacity'), {
      min: 0, max: 100, format: (value) => `${value} %`
    })
    field('se-layer-blend').addEventListener('change', (e) => {
      editor.svgCanvas.setLayerStyle(layer(), { blend: e.target.value })
      done()
    })
    field('se-layer-visible').addEventListener('change', (e) => {
      const name = editor.svgCanvas.getCurrentDrawing().getCurrentLayerName()
      editor.svgCanvas.setLayerVisibility(name, e.target.checked)
      editor.svgCanvas.runExtensions('layerVisChanged')
      done()
    })
    field('se-layer-locked').addEventListener('change', (e) => {
      editor.svgCanvas.setLocked([layer()], e.target.checked)
      done()
    })
  }

  /**
   * @returns {void}
   */
  refreshLayer () {
    const { svgCanvas } = this.editor
    if (!svgCanvas) return
    const body = this.body('layer')
    const drawing = svgCanvas.getCurrentDrawing()
    const group = drawing.getCurrentLayer()
    if (!group) return
    const set = (id, value) => {
      const input = body.querySelector(`#${id}`)
      if (input && document.activeElement !== input) input.value = value
    }
    set('se-layer-name', drawing.getCurrentLayerName() ?? '')
    const opacity = Number.parseFloat(group.getAttribute('opacity') ?? '1')
    set('se-layer-opacity', `${Math.round((Number.isFinite(opacity) ? opacity : 1) * 100)} %`)
    body.querySelector('#se-layer-blend').value = svgCanvas.getBlendMode(group)
    body.querySelector('#se-layer-visible').checked = group.getAttribute('display') !== 'none'
    body.querySelector('#se-layer-locked').checked = svgCanvas.isLockedSelf(group)
  }

  /**
   * The background of the page, as in the Page section of Figma (lot Fond):
   * a colour and its opacity, typed or chosen in the colour window, + to
   * give one, − to remove it. It is a rectangle in a locked layer under the
   * others, in the file (canvas: page-background.js).
   * @param {HTMLElement} body
   * @returns {void}
   */
  buildBackground (body) {
    const { editor } = this
    const picker = body.querySelector('#se-doc-background')
    const toggle = body.querySelector('#se-doc-background-toggle')
    const imgPath = editor.configObj.curConfig.imgPath
    const layerName = () => editor.i18next.t('templates.layer_background')
    const solid = (paint) => paint?.type === 'solidColor' && paint.solidColor && paint.solidColor !== 'none'
    const changed = () => {
      editor.layersPanel?.populateLayers?.()
      editor.layout?.layersChanged?.()
      this.refreshDocument()
    }
    queueMicrotask(() => picker.init?.(editor.i18next))
    picker.addEventListener('input', (e) => {
      const paint = e.detail?.paint
      if (solid(paint)) editor.svgCanvas.previewPageBackground(`#${paint.solidColor}`, paint.alpha / 100)
    })
    picker.addEventListener('change', (e) => {
      const paint = e.detail?.paint
      editor.svgCanvas.setPageBackground(solid(paint) ? `#${paint.solidColor}` : null, (paint?.alpha ?? 100) / 100, layerName())
      changed()
    })
    toggle.addEventListener('click', () => {
      if (editor.svgCanvas.getPageBackground()) editor.svgCanvas.setPageBackground(null)
      else editor.svgCanvas.setPageBackground(editor.configObj.curConfig.pageBackground, 1, layerName())
      changed()
    })
    this.$background = { picker, toggle, imgPath }
  }

  /**
   * @returns {void}
   */
  refreshBackground () {
    const { picker, toggle, imgPath } = this.$background ?? {}
    if (!picker) return
    const background = this.editor.svgCanvas.getPageBackgroundColor?.() ?? null
    const paint = backgroundPaint(background)
    const shown = picker.paintBox?.paint
    if (picker.paintBox && (shown?.solidColor !== paint.solidColor || shown?.alpha !== paint.alpha)) picker.setPaint(paint)
    const key = background ? 'layout.page_background_remove' : 'layout.page_background_add'
    if (toggle.dataset.state !== key) {
      const label = this.editor.i18next.t(key)
      toggle.dataset.state = key
      toggle.title = label
      toggle.setAttribute('aria-label', label)
      toggle.innerHTML = `<se-icon src="${escapeHtml(imgPath)}/${background ? 'minus' : 'plus'}.svg"></se-icon>`
    }
  }

  /**
   * @returns {void}
   */
  refreshDocument () {
    const { editor } = this
    const { svgCanvas } = editor
    if (!svgCanvas) return
    const body = this.body('document')
    const set = (id, value) => {
      const input = body.querySelector(`#${id}`)
      if (input && document.activeElement !== input) input.value = value
    }
    const res = svgCanvas.getResolution()
    set('se-doc-title', svgCanvas.getDocumentTitle() ?? '')
    set('se-doc-width', String(Math.round(res.w * 100) / 100))
    set('se-doc-height', String(Math.round(res.h * 100) / 100))
    const { curConfig } = editor.configObj
    body.querySelector('#se-doc-grid').checked = Boolean(editor.grid?.visible)
    body.querySelector('#se-doc-gridsnap').checked = Boolean(curConfig.gridSnapping)
    body.querySelector('#se-doc-objectsnap').checked = curConfig.objectSnapping !== false
    body.querySelector('#se-doc-images').value = editor.configObj.pref('img_save') === 'ref' ? 'ref' : 'embed'
    this.refreshBackground()
  }

  /**
   * Sections and head of the tab, after TopPanel has shown and hidden its
   * groups.
   * @returns {void}
   */
  /**
   * Shows the sections where something applies, hides the others.
   * @returns {boolean} Whether nothing is selected
   */
  refreshSections () {
    const selected = this.editor.svgCanvas?.getSelectedElements().filter(Boolean) ?? []
    const none = selected.length === 0
    const frame = none && Boolean(this.editor.frames?.selected)
    for (const section of this.root.querySelectorAll('.se-section')) {
      const name = section.dataset.section
      let shown
      if (frame) shown = name === 'frame'
      else if (name === 'frame') shown = false
      else if (name === 'document' || name === 'frames' || name === 'layer') shown = none && Boolean(section.querySelector('.se-section-body').children.length)
      // Without a selection, they give the paint of the next shape: only
      // with a drawing tool (lot Fond). The page has its background.
      else if (['fill', 'stroke', 'appearance'].includes(name)) shown = !none || !UNPAINTED_MODES.has(this.editor.svgCanvas?.getMode?.())
      else shown = [...section.querySelector('.se-section-body').children].some(isShown)
      if (name === 'actions') {
        // The verbs are in the "…" menu: its button shows when one applies.
        if (this.$actionsButton.hidden === shown) this.$actionsButton.hidden = !shown
        if (!shown && this.$actionsMenu.opened) this.$actionsMenu.close()
        continue
      }
      if (section.hidden === shown) section.hidden = !shown
    }
    return none
  }

  refresh () {
    const { editor } = this
    const selected = editor.svgCanvas?.getSelectedElements().filter(Boolean) ?? []
    this.refreshRare(selected)
    this.labelAlignRow()
    if (this.$alignRow) this.$alignRow.hidden = !selected.length || editor.svgCanvas?.getMode?.() === 'pathedit'
    this.refreshAppearance(selected)
    this.refreshStroke(selected)
    this.refreshText(selected)
    const none = this.refreshSections()
    // A window of settings whose icon is no longer there closes.
    for (const popover of this.root.querySelectorAll('se-popover.se-settings')) {
      if (popover.opened && !popover.anchor?.getClientRects().length) popover.close()
    }
    if (none) {
      this.refreshLayer()
      this.refreshDocument()
      editor.frames?.refreshInspector()
    }
    this.root.dataset.empty = String(none)
    // The head: the type and the id of the selection.
    const type = this.tab.querySelector('.se-inspector-type')
    const id = this.tab.querySelector('.se-inspector-id')
    const frame = none && editor.frames?.selected
    if (frame) {
      type.textContent = editor.i18next.t('layout.section_frame')
      id.textContent = frame.getAttribute('name') || ''
    } else if (none) {
      type.textContent = editor.i18next.t('layout.section_document')
      id.textContent = ''
    } else if (selected.length > 1) {
      type.textContent = editor.i18next.t('layout.objects', { count: selected.length })
      id.textContent = ''
    } else {
      const el = selected[0]
      const key = TYPE_KEYS[el.nodeName]
      type.textContent = key ? editor.i18next.t(`layout.${key}`) : el.nodeName
      id.textContent = el.id ? `#${el.id}` : ''
    }
  }
}
