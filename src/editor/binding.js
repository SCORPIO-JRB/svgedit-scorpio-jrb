/* globals seConfirm */
/**
 * Identity and binding of an object (plan v2, section 4.5 and G3; lot V6).
 *
 * SCorp-io binds a drawing to its real-time data through the file: its
 * Designer names the bound elements by their identifier (`g#svg_12`), and
 * attributes carry the binding (`scorp_*`, `instanceId`, `representationId`,
 * `data-*`). Its format is not fixed yet (decision D4): until then, an object
 * that carries such an attribute, or that another element of the drawing
 * refers to, is bound, and the editor asks before it loses its binding:
 * ungrouping a bound group, renaming a bound identifier.
 *
 * In the canvas layout, the Identity section of the inspector also shows the
 * binding of the selected object and its data (`data-*`), which it edits.
 * @module binding
 */
import { escapeHtml } from './panels/TopBar.js'

/** Attributes of the SCorp-io binding, as opposed to data. */
const isScorpio = (name) => name.startsWith('scorp_') || name === 'instanceId' || name === 'representationId'

/**
 * What the binding of an element holds, as a sentence.
 * @param {import('./Editor.js').default} editor
 * @param {{attributes: Array<{name: string}>, references: Element[]}} binding
 * @returns {string}
 */
const describe = (editor, binding) => {
  const t = (key, options) => editor.i18next.t(key, { ...options, interpolation: { escapeValue: false } })
  const parts = []
  if (binding.attributes.length) parts.push(t('binding.carries', { names: binding.attributes.map((a) => a.name).join(', ') }))
  if (binding.references.length) parts.push(t('binding.referenced', { count: binding.references.length }))
  return parts.join(' ')
}

/**
 * Asks before ungrouping a group, a link or a reference that is bound: its
 * identifier and its attributes go with it.
 * @param {import('./Editor.js').default} editor
 * @param {Element} elem
 * @returns {Promise<boolean>} Whether to ungroup
 */
export const confirmUngroup = async (editor, elem) => {
  const binding = editor.svgCanvas.getBinding?.(elem)
  if (!binding?.bound) return true
  const t = (key, options) => editor.i18next.t(key, { ...options, interpolation: { escapeValue: false } })
  const go = t('binding.ungroup_go')
  const choice = await seConfirm(`${t(elem.id ? 'binding.ungroup_bound' : 'binding.ungroup_bound_anonymous', { id: elem.id })} ${describe(editor, binding)} ${t('binding.ungroup_loses')}`,
    [go, t('common.cancel')])
  return choice === go
}

/**
 * Ungroups the selected group, after asking when it is bound.
 * @param {import('./Editor.js').default} editor
 * @returns {Promise<void>}
 */
export const ungroupSelected = async (editor) => {
  const elem = editor.svgCanvas.getSelectedElements().filter(Boolean)
  if (elem.length !== 1) return
  if (!(await confirmUngroup(editor, elem[0]))) return
  // The selection may have changed while the question was open
  if (editor.svgCanvas.getSelectedElements()[0] !== elem[0]) return
  editor.svgCanvas.ungroupSelectedElement()
}

/**
 * Gives an element a new identifier, the references of the drawing
 * following it, after asking when it is bound; says why a name is refused.
 * @param {import('./Editor.js').default} editor
 * @param {Element} elem
 * @param {string} newId
 * @returns {Promise<boolean>} Whether it was renamed
 */
export const renameId = async (editor, elem, newId) => {
  const t = (key, options) => editor.i18next.t(key, { ...options, interpolation: { escapeValue: false } })
  const id = String(newId ?? '').trim()
  if (id === elem.id) return true
  const binding = editor.svgCanvas.getBinding(elem)
  if (elem.id && binding.bound) {
    const go = t('binding.rename_go')
    const choice = await seConfirm(`${t('binding.rename_bound', { id: elem.id })} ${describe(editor, binding)} ${t('binding.rename_follows')}`,
      [go, t('common.cancel')])
    if (choice !== go) return false
  }
  const result = editor.svgCanvas.renameElementId(elem, id)
  if (!result.ok) {
    editor.toast(t(result.reason === 'taken' ? 'binding.id_taken' : 'binding.id_invalid', { id }), { type: 'error' })
    return false
  }
  return true
}

/**
 * The binding and the data of the selected object, in the Identity section
 * of the inspector (canvas layout).
 */
export class BindingPanel {
  /**
   * @param {import('./Editor.js').default} editor
   * @param {HTMLElement} body - The body of the Identity section
   */
  constructor (editor, body) {
    this.editor = editor
    this.canvas = editor.svgCanvas
    const t = (key, options) => escapeHtml(editor.i18next.t(key, options))
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    this.icon = `<se-icon src="${imgPath}/minus.svg"></se-icon>`
    this.root = document.createElement('div')
    this.root.id = 'se-binding'
    this.root.className = 'se-binding'
    this.root.innerHTML = `
      <div class="se-binding-link">
        <span class="se-binding-label" id="se-binding-label">${t('binding.title')}</span>
        <span class="se-binding-value" id="se-binding-value" aria-labelledby="se-binding-label"></span>
      </div>
      <ul class="se-binding-data" aria-label="${t('binding.data')}"></ul>
      <div class="se-binding-new" hidden>
        <label class="se-field se-field-wide"><span>${t('binding.data_name')}</span><input type="text" id="se-binding-new-name" spellcheck="false"></label>
        <label class="se-field se-field-wide"><span>${t('binding.data_value')}</span><input type="text" id="se-binding-new-value" spellcheck="false"></label>
      </div>
      <div class="se-section-links">
        <button type="button" class="se-link-button" id="se-binding-add">${t('binding.data_add')}</button>
      </div>`
    body.append(this.root)
    this.$value = this.root.querySelector('#se-binding-value')
    this.$list = this.root.querySelector('.se-binding-data')
    this.$new = this.root.querySelector('.se-binding-new')
    this.$newName = this.root.querySelector('#se-binding-new-name')
    this.$newValue = this.root.querySelector('#se-binding-new-value')

    this.root.querySelector('#se-binding-add').addEventListener('click', () => {
      this.$new.hidden = false
      this.$newName.value = 'data-'
      this.$newValue.value = ''
      this.$newName.focus()
      this.$newName.setSelectionRange(5, 5)
    })
    const add = () => {
      const elem = this.element()
      const name = this.$newName.value.trim()
      if (!elem || name === 'data-' || !name) {
        this.$new.hidden = true
        return
      }
      if (!this.canvas.setElementData(elem, name, this.$newValue.value)) {
        this.editor.toast(this.editor.i18next.t('binding.data_invalid', { name, interpolation: { escapeValue: false } }), { type: 'error' })
        this.$newName.focus()
        return
      }
      this.$new.hidden = true
      this.refresh({ force: true })
    }
    for (const input of [this.$newName, this.$newValue]) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); add() }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.$new.hidden = true }
      })
    }
    this.$newValue.addEventListener('change', add)

    this.$list.addEventListener('change', (e) => {
      const input = e.target.closest('input[data-name]')
      const elem = this.element()
      if (!input || !elem) return
      this.canvas.setElementData(elem, input.dataset.name, input.value)
      this.refresh()
    })
    this.$list.addEventListener('keydown', (e) => {
      const input = e.target.closest('input[data-name]')
      if (!input) return
      if (e.key === 'Enter') input.dispatchEvent(new Event('change', { bubbles: true }))
      if (e.key === 'Escape') this.refresh({ force: true })
    })
    this.$list.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-remove]')
      const elem = this.element()
      if (!button || !elem) return
      this.canvas.setElementData(elem, button.dataset.remove, null)
      this.refresh({ force: true })
    })
    this.refresh()
  }

  /**
   * The object whose identity the section shows: the only one selected.
   * @returns {Element|null}
   */
  element () {
    const selected = this.canvas.getSelectedElements().filter(Boolean)
    return selected.length === 1 ? selected[0] : null
  }

  /**
   * The values, from the object.
   * @param {{force?: boolean}} [options] - Also the field being typed in
   * @returns {void}
   */
  refresh ({ force = false } = {}) {
    const elem = this.element()
    this.root.hidden = !elem
    if (!elem) {
      this.$new.hidden = true
      return
    }
    const t = (key, options) => this.editor.i18next.t(key, { ...options, interpolation: { escapeValue: false } })
    const binding = this.canvas.getBinding(elem)
    const scorpio = binding.attributes.filter((a) => isScorpio(a.name))
    const parts = scorpio.map((a) => `${a.name} ${a.value}`)
    if (binding.references.length) parts.push(t('binding.referenced_short', { count: binding.references.length }))
    this.$value.textContent = parts.length ? parts.join(' · ') : t('binding.none')
    this.$value.classList.toggle('se-binding-none', !parts.length)

    const data = binding.attributes.filter((a) => !isScorpio(a.name))
    const editing = force ? null : this.$list.querySelector('input:focus')?.dataset.name
    if (editing && data.some((a) => a.name === editing)) return
    const label = (key, name) => escapeHtml(t(key, { name }))
    this.$list.innerHTML = data.map(({ name, value }) => `<li class="se-binding-row">
      <label class="se-field se-field-wide"><span class="se-binding-name">${escapeHtml(name)}</span>
        <input type="text" data-name="${escapeHtml(name)}" value="${escapeHtml(value)}" spellcheck="false"></label>
      <button type="button" class="se-icon-button" data-remove="${escapeHtml(name)}" aria-label="${label('binding.data_remove', name)}"
        title="${label('binding.data_remove', name)}">${this.icon}</button>
    </li>`).join('')
    this.$list.hidden = !data.length
  }
}
