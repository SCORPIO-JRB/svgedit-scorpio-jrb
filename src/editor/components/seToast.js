/**
 * se-toast: a message that does not block (plan v2, section 4.7, lot V1).
 *
 * Messages stack at the bottom of the editor, above the canvas, and go away
 * by themselves after a few seconds, or at once with their close button.
 * They are announced to screen readers (role="status", or role="alert" for
 * an error). They replace alert() for what needs no answer; prompt() and the
 * dialogs that ask a question are replaced in V3.
 *
 * Usage: `svgEditor.toast('Saved')`, or
 * `svgEditor.toast(text, { type: 'error', duration: 8000 })`.
 */
const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    position: fixed;
    left: 50%;
    bottom: 56px;
    z-index: 100001;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: min(480px, calc(100vw - 32px));
    padding: 8px 8px 8px 12px;
    border: 1px solid var(--se-border);
    border-radius: var(--se-radius-float);
    background: var(--se-surface-raised);
    box-shadow: var(--se-shadow-menu);
    color: var(--se-text);
    font-family: var(--se-font-ui);
    font-size: var(--se-font-size-control);
    line-height: var(--se-line-height-control);
    pointer-events: auto;
    animation: enter var(--se-duration-state) var(--se-ease-out);
  }
  .toast.error {
    border-color: var(--se-danger);
  }
  .toast.warning {
    border-color: var(--se-warning);
  }
  .text {
    flex: 1;
  }
  button {
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: var(--se-radius-field);
    background: transparent;
    color: var(--se-text-secondary);
    font: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  button:hover {
    background: var(--se-control-hover);
    color: var(--se-text);
  }
  button:focus-visible {
    outline: 2px solid var(--se-focus-ring);
    outline-offset: 1px;
  }
  @keyframes enter {
    from { opacity: 0; transform: translateY(8px); }
  }
  </style>
`

export const TOAST_DURATION = 4000

export class SeToast extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true))
  }

  /**
   * @param {string} text
   * @param {object} [options]
   * @param {"info"|"warning"|"error"} [options.type="info"]
   * @param {number} [options.duration] In milliseconds; 0 keeps it until closed
   * @param {string} [options.closeLabel] Accessible name of the close button
   * @returns {HTMLElement} The message, which has a close() method
   */
  show (text, { type = 'info', duration = TOAST_DURATION, closeLabel = 'Close' } = {}) {
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
    const label = document.createElement('span')
    label.className = 'text'
    label.textContent = text
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = '×'
    close.setAttribute('aria-label', closeLabel)
    toast.append(label, close)
    let timer = null
    toast.close = () => {
      clearTimeout(timer)
      toast.remove()
    }
    close.addEventListener('click', toast.close)
    this.shadowRoot.append(toast)
    if (duration > 0) timer = setTimeout(toast.close, duration)
    return toast
  }

  /**
   * @returns {string[]} The texts shown
   */
  get messages () {
    return [...this.shadowRoot.querySelectorAll('.toast .text')].map((el) => el.textContent)
  }
}

customElements.define('se-toast', SeToast)
