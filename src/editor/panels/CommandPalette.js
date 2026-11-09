/**
 * Command palette (lot V4; plan v2, section 4.7): Ctrl+K finds an action by
 * its name, "?" lists the shortcuts. Both read the command registry: every
 * button, menu entry and shortcut of the editor, with the shortcut that
 * actually runs it.
 *
 * Arrows move in the list, Enter runs the action, Escape closes and gives
 * the focus back. An action that does not apply to the selection shows
 * greyed, after the others.
 * @module CommandPalette
 */
import { escapeHtml } from './TopBar.js'
import { hintOf } from './ContextBar.js'

/**
 * A text without case or accents, for the search.
 * @param {string} text
 * @returns {string}
 */
export const searchable = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * How well a label answers a query: null when it does not, lower is better
 * (the start of the label, then the start of a word, then anywhere).
 * @param {string} label
 * @param {string} query
 * @returns {number|null}
 */
export const matchScore = (label, query) => {
  const words = searchable(query).split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const text = searchable(label)
  let score = 0
  for (const word of words) {
    const index = text.indexOf(word)
    if (index === -1) return null
    score += index === 0 ? 0 : /[\s'’(-]/.test(text[index - 1]) ? 1 : 2
  }
  return score
}

export class CommandPalette {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} root The root of the editor
   */
  constructor (editor, root) {
    this.editor = editor
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const template = document.createElement('template')
    template.innerHTML = `
      <div id="se-palette" class="se-palette" role="dialog" aria-modal="true" aria-labelledby="se-palette-title" hidden>
        <h2 id="se-palette-title" class="se-palette-title"></h2>
        <input id="se-palette-input" type="text" role="combobox" autocomplete="off" spellcheck="false"
          aria-autocomplete="list" aria-expanded="true" aria-controls="se-palette-list" placeholder="${t('palette.placeholder')}">
        <ul id="se-palette-list" role="listbox" aria-labelledby="se-palette-title"></ul>
        <p class="se-palette-empty" hidden>${t('palette.empty')}</p>
      </div>`
    root.append(template.content)
    this.$root = root.querySelector('#se-palette')
    this.$title = this.$root.querySelector('#se-palette-title')
    this.$input = this.$root.querySelector('#se-palette-input')
    this.$list = this.$root.querySelector('#se-palette-list')
    this.$empty = this.$root.querySelector('.se-palette-empty')
    this.items = []
    this.active = 0
    this.shortcutsOnly = false
    this.$input.addEventListener('input', () => this.render())
    this.$input.addEventListener('keydown', (e) => this.keydown(e))
    this.$list.addEventListener('click', (e) => {
      const option = e.target.closest('[role="option"]')
      if (option && option.getAttribute('aria-disabled') !== 'true') this.run(Number(option.dataset.index))
    })
    // A press outside closes it.
    document.addEventListener('pointerdown', (e) => {
      if (!this.$root.hidden && !e.composedPath().includes(this.$root)) this.close()
    }, true)
    editor.commands.register({ id: 'command_palette', label: 'palette.open', shortcuts: 'mod+k', run: () => this.open() })
    editor.commands.register({ id: 'shortcuts_help', label: 'palette.shortcuts', shortcuts: 'shift+?', run: () => this.open({ shortcutsOnly: true }) })
  }

  t (key) {
    return this.editor.i18next.t(key)
  }

  /**
   * The actions of the registry, each once, with a name.
   * @returns {{id: string, label: string, hint: string, enabled: boolean}[]}
   */
  actions () {
    const { commands } = this.editor
    const seen = new Set()
    const list = []
    for (const command of commands.list()) {
      if (!command.label || command.id === 'command_palette') continue
      const label = this.t(command.label)
      if (!label || label === command.id || /^[\w-]+[.:][\w.-]+$/.test(label)) continue
      const hint = hintOf(commands, command.id)
      if (this.shortcutsOnly && !hint) continue
      const key = searchable(label)
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ id: command.id, label, hint, enabled: commands.isEnabled(command.id) })
    }
    return list
  }

  /**
   * @param {object} [options]
   * @param {boolean} [options.shortcutsOnly] The list of the shortcuts (?)
   * @returns {void}
   */
  open ({ shortcutsOnly = false } = {}) {
    this.opener = document.activeElement
    this.shortcutsOnly = shortcutsOnly
    this.$title.textContent = this.t(shortcutsOnly ? 'palette.shortcuts' : 'palette.title')
    this.$input.value = ''
    this.$root.hidden = false
    this.render()
    this.$input.focus()
  }

  /**
   * @param {object} [options]
   * @param {boolean} [options.restoreFocus=true]
   * @returns {void}
   */
  close ({ restoreFocus = true } = {}) {
    if (this.$root.hidden) return
    this.$root.hidden = true
    if (restoreFocus && this.opener?.isConnected && this.opener !== document.body) this.opener.focus?.()
    else this.$input.blur()
  }

  /**
   * The actions that answer the query: those that apply first, the best
   * matches first.
   * @returns {void}
   */
  render () {
    const query = this.$input.value
    const scored = this.actions()
      .map((action) => ({ ...action, score: matchScore(action.label, query) }))
      .filter((action) => action.score !== null)
    scored.sort((a, b) => (Number(b.enabled) - Number(a.enabled)) || (a.score - b.score) || a.label.localeCompare(b.label))
    this.items = scored
    this.active = scored.findIndex((item) => item.enabled)
    this.$list.innerHTML = scored.map((item, i) => `
      <li role="option" id="se-palette-option-${i}" data-index="${i}" data-command="${escapeHtml(item.id)}"
        aria-selected="${i === this.active}" aria-disabled="${!item.enabled}">
        <span>${escapeHtml(item.label)}</span><kbd>${escapeHtml(item.hint)}</kbd></li>`).join('')
    this.$empty.hidden = scored.length > 0
    this.highlight()
  }

  highlight () {
    for (const option of this.$list.children) {
      option.setAttribute('aria-selected', String(Number(option.dataset.index) === this.active))
    }
    const current = this.$list.children[this.active]
    if (current) {
      this.$input.setAttribute('aria-activedescendant', current.id)
      current.scrollIntoView({ block: 'nearest' })
    } else {
      this.$input.removeAttribute('aria-activedescendant')
    }
  }

  /**
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  keydown (e) {
    const enabled = this.items.map((item, i) => (item.enabled ? i : -1)).filter((i) => i >= 0)
    const position = enabled.indexOf(this.active)
    const move = (to) => {
      e.preventDefault()
      if (!enabled.length) return
      this.active = enabled[(to + enabled.length) % enabled.length]
      this.highlight()
    }
    switch (e.key) {
      case 'ArrowDown': move(position + 1); break
      case 'ArrowUp': move(position - 1); break
      case 'Enter':
        e.preventDefault()
        if (this.active >= 0) this.run(this.active)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        this.close()
        break
    }
  }

  /**
   * Runs an action, the palette closed first so that the action finds the
   * focus and the selection as they were.
   * @param {number} index
   * @returns {void}
   */
  run (index) {
    const item = this.items[index]
    if (!item?.enabled) return
    this.close()
    this.editor.commands.execute(item.id)
  }
}
