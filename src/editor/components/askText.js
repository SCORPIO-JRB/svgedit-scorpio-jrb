/**
 * A question with a text answer, asked in place (lot V3; plan v2, section
 * 4.7): it replaces prompt(), which blocked the page and could not be styled
 * or translated.
 *
 * A se-popover opens under the control that asked, with the field, Cancel and
 * OK. Enter answers, Escape or a press outside cancels. Nothing blocks: the
 * answer comes as a promise.
 *
 * Usage: `const name = await askText(editor, { label, value, anchor })`;
 * `null` when cancelled.
 * @module askText
 */
import './sePopover.js'

let count = 0

/**
 * @param {object} editor The editor, for its container and translations
 * @param {object} options
 * @param {string} options.label The question
 * @param {string} [options.value] The answer offered
 * @param {Element} [options.anchor] The control that asked
 * @param {string} [options.okLabel]
 * @param {string} [options.inputType="text"]
 * @returns {Promise<string|null>}
 */
export const askText = (editor, { label, value = '', anchor, okLabel, inputType = 'text' }) => new Promise((resolve) => {
  const t = (key, fallback) => {
    const text = editor.i18next?.t(key)
    return text && text !== key ? text : fallback
  }
  const id = `se-ask-${++count}`
  const popover = document.createElement('se-popover')
  popover.className = 'se-ask'
  popover.setAttribute('role', 'dialog')
  popover.setAttribute('aria-labelledby', `${id}-label`)
  const form = document.createElement('form')
  const caption = document.createElement('label')
  caption.id = `${id}-label`
  caption.htmlFor = `${id}-input`
  caption.textContent = label
  const input = document.createElement('input')
  input.id = `${id}-input`
  input.type = inputType
  input.value = value ?? ''
  input.autocomplete = 'off'
  const actions = document.createElement('div')
  actions.className = 'se-ask-actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'se-text-button'
  cancel.textContent = t('common.cancel', 'Cancel')
  const ok = document.createElement('button')
  ok.type = 'submit'
  ok.className = 'se-text-button se-primary'
  ok.textContent = okLabel ?? t('common.ok', 'OK')
  actions.append(cancel, ok)
  form.append(caption, input, actions)
  popover.append(form)
  const host = editor.$svgEditor ?? editor.$container ?? document.body
  host.append(popover)

  let answered = false
  const done = (answer) => {
    if (answered) return
    answered = true
    popover.close({ restoreFocus: true })
    popover.remove()
    resolve(answer)
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    done(input.value)
  })
  cancel.addEventListener('click', () => done(null))
  popover.addEventListener('se-popover-close', () => done(null))
  // The shortcuts of the editor do not apply while typing the answer.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') e.stopPropagation()
  })
  const target = anchor?.isConnected ? anchor : (editor.workarea ?? host)
  popover.open(target, { focus: false })
  input.focus()
  input.select()
})
