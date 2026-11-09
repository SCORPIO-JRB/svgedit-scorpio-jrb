/* globals seConfirm */
/**
 * The confirmation of a change that rewrites rules of the style sheets (lot
 * S2 of the simplification audit, docs/audit-simplification.md).
 *
 * On an object styled by a class, the canvas changes the value where it
 * comes from, the rule, in the same step as the rest of the change
 * (style-rules.js of svgcanvas). The rule styles other objects too, so the
 * editor asks, the change already on the drawing: « Cette couleur vient de
 * la règle .fond, qui s'applique à 12 objets. Modifier la règle ? ».
 * Refused, the step is withdrawn, as if never made: nothing is left to redo.
 * Accepted, the same rules are not asked about again while the selection
 * stays, whatever the property, so that a value can be tried several times
 * and the width then the colour of a pipe changed.
 *
 * In the inspector of the canvas layout, the title of a section names the
 * rules that give the values of its fields (« Remplissage ← .fond »). The
 * fields of both layouts show the values of the rules.
 * @module class-styles
 */

/** The fields of the inspector, and the property each one shows. */
const NOTED_FIELDS = [
  ['fill_color', 'fill'],
  ['stroke_color', 'stroke'],
  ['stroke_width', 'stroke-width'],
  ['stroke_style', 'stroke-dasharray'],
  ['stroke_linejoin', 'stroke-linejoin'],
  ['stroke_linecap', 'stroke-linecap'],
  ['opacity', 'opacity'],
  ['tool_font_family', 'font-family'],
  ['font_size', 'font-size'],
  ['tool_bold', 'font-weight'],
  ['tool_italic', 'font-style'],
  ['tool_letter_spacing', 'letter-spacing'],
  ['tool_word_spacing', 'word-spacing']
]

/** What the message calls the value of each property. */
const WHAT = {
  fill: 'color',
  stroke: 'color',
  'stroke-width': 'width',
  'font-family': 'font',
  'font-size': 'size',
  opacity: 'opacity',
  'fill-opacity': 'opacity',
  'stroke-opacity': 'opacity'
}

/**
 * @param {import('./Editor.js').default} editor
 * @returns {{refresh: () => void}} `refresh` names the rules of the
 *   selection in the titles of the sections
 */
export const initClassStyles = (editor) => {
  const { svgCanvas } = editor
  const t = (key, options) => editor.i18next.t(key, { interpolation: { escapeValue: false }, ...options })
  const selected = () => svgCanvas.getSelectedElements().filter(Boolean)
  // The notices of the step being asked about
  let pending = []
  // The selectors of the rules accepted for the selection
  let accepted = new Set()
  let acceptedFor = []

  const message = (notices) => {
    const rules = new Map()
    for (const { property, rules: changed } of notices) {
      for (const { selector, count } of changed) {
        const rule = rules.get(selector) ?? { selector, count: 0, properties: new Set() }
        rule.count = Math.max(rule.count, count)
        rule.properties.add(property)
        rules.set(selector, rule)
      }
    }
    const list = [...rules.values()]
    if (list.length === 1) {
      const [{ selector, count, properties }] = list
      const what = properties.size === 1 ? WHAT[[...properties][0]] ?? 'other' : 'several'
      return {
        text: t('classstyles.one', { what: t(`classstyles.what_${what}`), selector, objects: t('classstyles.objects', { count }) }),
        modify: t('classstyles.modify_one')
      }
    }
    const described = list.map(({ selector, count }) => t('classstyles.rule', { selector, objects: t('classstyles.objects', { count }) }))
    return { text: t('classstyles.several', { rules: described.join(', ') }), modify: t('classstyles.modify_other') }
  }

  const ask = async () => {
    const notices = pending
    pending = []
    if (!notices.length) return
    const { text, modify } = message(notices)
    const choice = await seConfirm(text, [modify, t('common.cancel')])
    if (choice === modify) {
      for (const { rules } of notices) {
        rules.forEach(({ selector }) => accepted.add(selector))
      }
      return
    }
    // The last step holds the rewritten rules: it goes, the selection stays.
    let withdrawn = false
    for (const notice of [...notices].reverse()) {
      if (svgCanvas.undoMgr.withdraw(notice.commands[0])) withdrawn = true
    }
    if (withdrawn) {
      svgCanvas.call('changed', selected())
    } else {
      editor.toast(t('classstyles.kept'), { type: 'info' })
    }
  }

  svgCanvas.bind('styleRulesChanged', (_win, notice) => {
    const selection = selected()
    if (selection.length !== acceptedFor.length || selection.some((elem, i) => elem !== acceptedFor[i])) {
      accepted = new Set()
      acceptedFor = selection
    }
    const rules = notice.rules.filter(({ selector }) => !accepted.has(selector))
    if (!rules.length) return
    pending.push({ ...notice, rules })
    // The step is complete once the change that made it returns.
    if (pending.length === 1) setTimeout(ask, 0)
  })

  // The notes, by section of the inspector
  const notes = new Map()
  const refresh = () => {
    const selection = selected()
    // One object: a group shows the paint of its children, not its own.
    const elem = selection.length === 1 && !['g', 'a', 'use'].includes(selection[0].localName) ? selection[0] : null
    const ruled = elem && svgCanvas.hasStyleRules?.()
    const bySection = new Map()
    for (const [id, prop] of NOTED_FIELDS) {
      const section = ruled && document.getElementById(id)?.closest('.se-inspector [data-section]')
      if (!section) continue
      const source = svgCanvas.findStyleSource(elem, prop)
      if (source?.kind !== 'rule') continue
      if (!bySection.has(section)) bySection.set(section, new Set())
      bySection.get(section).add(source.selector)
    }
    for (const [section, note] of notes) {
      if (!bySection.has(section)) {
        note.remove()
        notes.delete(section)
      }
    }
    for (const [section, selectors] of bySection) {
      let note = notes.get(section)
      if (!note) {
        note = document.createElement('span')
        note.className = 'se-rule-note'
        notes.set(section, note)
      }
      const title = section.querySelector(':scope > .se-section-title')
      if (note.parentNode !== title) title?.append(note)
      const list = [...selectors].join(', ')
      note.textContent = list
      note.title = selectors.size === 1
        ? t('classstyles.from_rule', { selector: list })
        : t('classstyles.from_rules', { selectors: list })
    }
  }
  return { refresh }
}
