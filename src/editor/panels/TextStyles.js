/**
 * Text styles (lot V4, N10; plan v2, section 4.4).
 *
 * As "Heading 1" in Claude Design, a text takes a named style: page title,
 * equipment name, measured value... A style writes only the usual
 * attributes (font-family, font-size, font-weight, fill), in one undo step;
 * it is recognised by these values and adds nothing to the file.
 *
 * The default list follows the typography of the SCorp-io synoptics (the
 * stylesheet of the reference synoptic of the corpus); a host gives its own
 * with the `textStyles` option.
 *
 * The "Style ▾" entry of the contextual bar opens a window with two tabs:
 * Theme, the styles of the list, and Custom: font, weight, size and letter
 * spacing, whose fields are those of the inspector.
 * @module TextStyles
 */
import { escapeHtml } from './TopBar.js'
import { DEFAULT_TEXT_STYLES } from '../text-styles.js'
import { styledAttribute } from './panelValues.js'

export { DEFAULT_TEXT_STYLES }

/** Weights offered in the Custom tab. */
export const WEIGHTS = [300, 400, 500, 600, 700]

/**
 * The first family of a font-family list, to compare two lists.
 * @param {string} family
 * @returns {string}
 */
export const firstFamily = (family) => String(family ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase()

/**
 * @param {string|number} weight
 * @returns {number}
 */
export const numericWeight = (weight) => {
  const value = String(weight ?? '').trim().toLowerCase()
  if (!value || value === 'normal') return 400
  if (value === 'bold') return 700
  const number = Number(value)
  return Number.isFinite(number) ? number : 400
}

/**
 * A colour as #rrggbb, from #rgb, #rrggbb or rgb().
 * @param {string} color
 * @returns {string}
 */
export const hexColor = (color) => {
  const value = String(color ?? '').trim().toLowerCase()
  const rgb = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (rgb) return '#' + rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return value
}

/**
 * The style whose values a text has, if any.
 * @param {{fontFamily: string, fontSize: string|number, fontWeight: string|number, fill: string}} values
 * @param {TextStyle[]} styles
 * @returns {TextStyle|null}
 */
export const styleOf = (values, styles = DEFAULT_TEXT_STYLES) => styles.find((style) =>
  firstFamily(values.fontFamily) === firstFamily(style.fontFamily) &&
  Math.abs(Number.parseFloat(values.fontSize) - style.fontSize) < 0.01 &&
  numericWeight(values.fontWeight) === style.fontWeight &&
  hexColor(values.fill) === hexColor(style.fill)
) ?? null

/**
 * The attributes a style writes.
 * @param {TextStyle} style
 * @returns {Object<string, string>}
 */
export const attributesOf = (style) => ({
  'font-family': style.fontFamily,
  'font-size': String(style.fontSize),
  'font-weight': String(style.fontWeight),
  fill: style.fill
})

/**
 * The values of a text as drawn: attributes, or the rules of a stylesheet.
 * @param {Element} elem
 * @returns {{fontFamily: string, fontSize: string, fontWeight: string, fill: string}}
 */
const valuesOf = (elem) => {
  const style = getComputedStyle(elem)
  return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fill: style.fill }
}

export class TextStyles {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} stage
   */
  constructor (editor, stage) {
    this.editor = editor
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const template = document.createElement('template')
    template.innerHTML = `
      <se-popover id="se-textstyles" placement="bottom-start" role="dialog" aria-label="${t('textstyles.title')}">
        <div class="se-textstyles-tabs" role="tablist">
          <button type="button" role="tab" id="se-textstyles-tab-theme" aria-controls="se-textstyles-theme" aria-selected="true">${t('textstyles.theme')}</button>
          <button type="button" role="tab" id="se-textstyles-tab-custom" aria-controls="se-textstyles-custom" aria-selected="false" tabindex="-1">${t('textstyles.custom')}</button>
        </div>
        <div id="se-textstyles-theme" role="tabpanel" aria-labelledby="se-textstyles-tab-theme"></div>
        <div id="se-textstyles-custom" role="tabpanel" aria-labelledby="se-textstyles-tab-custom" hidden>
          <label class="se-textstyles-row"><span>${t('textstyles.font')}</span><select id="se-textstyles-font"></select></label>
          <label class="se-textstyles-row"><span>${t('textstyles.weight')}</span><select id="se-textstyles-weight">
            ${WEIGHTS.map((weight) => `<option value="${weight}">${t(`textstyles.weight_${weight}`)}</option>`).join('')}
          </select></label>
          <div class="se-textstyles-fields"></div>
        </div>
      </se-popover>`
    stage.append(template.content)
    this.$popover = stage.querySelector('#se-textstyles')
    this.$theme = this.$popover.querySelector('#se-textstyles-theme')
    this.$custom = this.$popover.querySelector('#se-textstyles-custom')
    this.$font = this.$popover.querySelector('#se-textstyles-font')
    this.$weight = this.$popover.querySelector('#se-textstyles-weight')
    this.initEvents()
  }

  /** @returns {TextStyle[]} */
  get styles () {
    const configured = this.editor.configObj.curConfig.textStyles
    return Array.isArray(configured) && configured.length ? configured : DEFAULT_TEXT_STYLES
  }

  t (key) {
    return this.editor.i18next.t(key)
  }

  /** @returns {Element[]} The selected texts */
  texts () {
    return this.editor.svgCanvas.getSelectedElements().filter((elem) => elem?.tagName === 'text')
  }

  /**
   * The style the selected texts share: a style, "custom" when none
   * matches, "mixed" when they differ, null without text.
   * @returns {TextStyle|"custom"|"mixed"|null}
   */
  current () {
    const texts = this.texts()
    if (!texts.length) return null
    const found = texts.map((elem) => styleOf(valuesOf(elem), this.styles))
    if (found.some((style) => style !== found[0])) return 'mixed'
    return found[0] ?? 'custom'
  }

  initEvents () {
    const tabs = this.$popover.querySelector('[role="tablist"]')
    tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]')
      if (tab) this.selectTab(tab.id.endsWith('custom') ? 'custom' : 'theme', true)
    })
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      e.stopPropagation()
      this.selectTab(this.$custom.hidden ? 'custom' : 'theme', true)
    })
    this.$theme.addEventListener('click', (e) => {
      const item = e.target.closest('[data-style]')
      if (item) this.apply(item.dataset.style)
    })
    this.$font.addEventListener('change', () => this.forward('tool_font_family', this.$font.value))
    this.$weight.addEventListener('change', () => {
      const texts = this.texts()
      if (texts.length) this.editor.svgCanvas.changeSelectedAttributes({ 'font-weight': this.$weight.value }, texts)
      this.sync()
    })
    this.$popover.addEventListener('se-popover-close', () => {
      this.button?.setAttribute('aria-expanded', 'false')
    })
  }

  /**
   * @param {"theme"|"custom"} name
   * @param {boolean} [focus]
   * @returns {void}
   */
  selectTab (name, focus = false) {
    const custom = name === 'custom'
    this.$theme.hidden = custom
    this.$custom.hidden = !custom
    for (const tab of this.$popover.querySelectorAll('[role="tab"]')) {
      const selected = tab.id.endsWith(name)
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
      if (selected && focus) tab.focus()
    }
  }

  /**
   * The "Style ▾" entry of the contextual bar.
   * @param {string} entry
   * @returns {HTMLButtonElement}
   */
  buildBarEntry (entry) {
    const label = this.t('textstyles.title')
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'se-text-button se-ctx-textstyle'
    el.dataset.entry = entry
    el.setAttribute('aria-haspopup', 'dialog')
    el.setAttribute('aria-expanded', 'false')
    el.seTooltip = { label }
    el.innerHTML = `<span class="se-ctx-textstyle-name"></span><se-icon src="${escapeHtml(this.editor.configObj.curConfig.imgPath)}/chevron_down.svg"></se-icon>`
    this.syncButton(el)
    return el
  }

  /**
   * The name of the style on the button of the bar.
   * @param {HTMLElement} el
   * @returns {void}
   */
  syncButton (el) {
    const holder = el.querySelector('.se-ctx-textstyle-name')
    // The icon of Typography has no name to write.
    if (!holder) return
    const current = this.current()
    let name
    if (current === 'mixed') name = this.t('properties.mixed')
    else if (current === 'custom' || !current) name = this.t('textstyles.custom')
    else name = this.t(current.label)
    holder.textContent = name
    el.setAttribute('aria-label', `${this.t('textstyles.title')} : ${name}`)
  }

  /**
   * Opens the window under the button of the bar, or at the left of the
   * panel from the icon of Typography (`beside`, lot Texte).
   * @param {HTMLElement} button
   * @param {{beside?: Element}} [options]
   * @returns {void}
   */
  open (button, { beside = null } = {}) {
    if (this.$popover.opened) {
      this.$popover.close({ restoreFocus: true })
      return
    }
    this.button = button
    this.render()
    this.selectTab('theme')
    this.$popover.open(button, beside ? { beside, placement: 'left-start' } : {})
    button.setAttribute('aria-expanded', 'true')
  }

  /**
   * The list of styles, each shown in its own font, and the custom fields.
   * @returns {void}
   */
  render () {
    const current = this.current()
    this.$theme.innerHTML = this.styles.map((style) => {
      const size = Math.max(11, Math.min(20, style.fontSize * 0.6))
      const checked = current && typeof current === 'object' && current.id === style.id
      return `<button type="button" class="se-textstyle-item" role="menuitemradio" data-style="${escapeHtml(style.id)}" aria-checked="${checked}">
        <span class="se-textstyle-sample" style="font-family: ${escapeHtml(style.fontFamily)}; font-size: ${size}px; font-weight: ${Number(style.fontWeight)}">${escapeHtml(this.t(style.label))}</span>
        <span class="se-textstyle-values">${Number(style.fontSize)} · ${Number(style.fontWeight)}</span>
      </button>`
    }).join('')
    // Fonts: those of the styles, then those of the inspector's list.
    const original = document.getElementById('tool_font_family')
    const options = (original?.getAttribute('options') || '').split(',')
    const values = (original?.getAttribute('values') || '').split('::')
    const fonts = [...new Map([
      ...this.styles.map((style) => [style.fontFamily, firstFamily(style.fontFamily).replace(/\b\w/g, (c) => c.toUpperCase())]),
      ...values.filter(Boolean).map((value, i) => [value, this.t(options[i] ?? value)])
    ])]
    this.$font.innerHTML = fonts.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')
    // The size and letter spacing fields: twins of the inspector's.
    const fields = this.$custom.querySelector('.se-textstyles-fields')
    if (!fields.children.length) {
      for (const id of ['font_size', 'tool_letter_spacing']) {
        const field = this.editor.layout?.contextBar?.buildField(id)
        if (field) {
          field.id = `se-textstyles-${id}`
          fields.append(field)
        }
      }
    }
    this.sync()
  }

  /**
   * The values of the custom tab, from the selected text.
   * @returns {void}
   */
  sync () {
    const [text] = this.texts()
    if (this.button?.isConnected) this.syncButton(this.button)
    if (!text) return
    const values = valuesOf(text)
    // A rule of the style sheets wins over the attributes (lot S2)
    const styled = (name) => styledAttribute(this.editor.svgCanvas, text, name)
    const family = firstFamily(styled('font-family') || values.fontFamily)
    const option = [...this.$font.options].find((item) => firstFamily(item.value) === family)
    if (option) this.$font.value = option.value
    this.$weight.value = String(numericWeight(styled('font-weight') ?? values.fontWeight))
    for (const field of this.$custom.querySelectorAll('se-spin-input')) {
      const original = document.getElementById(field.dataset.original)
      if (original) field.value = original.value
    }
    for (const item of this.$theme.querySelectorAll('[data-style]')) {
      const current = this.current()
      item.setAttribute('aria-checked', String(Boolean(current && typeof current === 'object' && current.id === item.dataset.style)))
    }
  }

  /**
   * Gives a style to the selected texts, in one undo step.
   * @param {string} id
   * @returns {void}
   */
  apply (id) {
    const style = this.styles.find((item) => item.id === id)
    const texts = this.texts()
    if (!style || !texts.length) return
    this.editor.svgCanvas.changeSelectedAttributes(attributesOf(style), texts)
    this.$popover.close({ restoreFocus: true })
    this.editor.layout?.contextBar?.refresh()
  }

  /**
   * A change of the custom tab, given to the control of the inspector.
   * @param {string} id
   * @param {string} value
   * @returns {void}
   */
  forward (id, value) {
    const original = document.getElementById(id)
    if (!original) return
    original.value = value
    original.dispatchEvent(new CustomEvent('change', { detail: { value } }))
    this.sync()
  }
}
