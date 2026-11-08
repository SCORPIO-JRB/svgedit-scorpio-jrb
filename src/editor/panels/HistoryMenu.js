/**
 * History of the canvas layout (lot V5, S4; plan v2, section 4.1): the
 * « Historique ▸ » entry of the zoom menu opens the list of the steps, the
 * last one first, down to the opening of the document. Choosing a step
 * undoes or redoes up to it; the steps that would be redone are dimmed.
 * @module HistoryMenu
 */
import { escapeHtml } from './TopBar.js'
import { stepLabel } from '../history-steps.js'

/** Steps listed at most, the most recent ones. */
export const HISTORY_MENU_MAX = 100

export class HistoryMenu {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} stage
   */
  constructor (editor, stage) {
    this.editor = editor
    const template = document.createElement('template')
    template.innerHTML = `<se-popover id="se-history-menu" menu placement="bottom-end"
      aria-label="${escapeHtml(editor.i18next.t('history.title'))}"></se-popover>`
    stage.append(template.content)
    this.$menu = stage.querySelector('#se-history-menu')
    this.$menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-index]')
      if (item) editor.topPanel.goToHistory(Number(item.dataset.index))
    })
    editor.commands.register({
      id: 'show_history',
      label: 'history.title',
      run: () => this.open()
    })
  }

  /**
   * The entries: the steps, the last one first, then the opening.
   * @returns {void}
   */
  render () {
    const { editor } = this
    const t = (key, options) => editor.i18next.t(key, options)
    const { undoMgr } = editor.svgCanvas
    const steps = undoMgr.getSteps()
    const pointer = undoMgr.getUndoStackSize()
    const first = Math.max(0, steps.length - HISTORY_MENU_MAX)
    const entry = (index, label) => {
      const current = index === pointer
      const future = index > pointer
      return `<div role="menuitemradio" data-index="${index}" aria-checked="${current}"
        class="${future ? 'se-history-future' : ''}"><span>${escapeHtml(label)}</span></div>`
    }
    const rows = []
    for (let i = steps.length; i > first; i--) rows.push(entry(i, stepLabel(steps[i - 1], t)))
    if (first > 0) rows.push('<div role="separator"></div>')
    rows.push(entry(first, first > 0 ? stepLabel(steps[first - 1], t) : t('history.initial')))
    this.$menu.innerHTML = rows.join('')
  }

  /**
   * @param {Element} [anchor] - Default: the zoom button
   * @returns {void}
   */
  open (anchor = this.editor.layout?.viewGroup?.$zoomButton) {
    if (!anchor) return
    this.render()
    this.$menu.open(anchor)
    const current = this.$menu.querySelector('[aria-checked="true"]')
    current?.focus()
  }
}
