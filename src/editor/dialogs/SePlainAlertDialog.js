import PlainAlertDialog from 'elix/src/plain/PlainAlertDialog.js'
import { template, keydown } from 'elix/src/base/internal.js'
import { fragmentFrom } from 'elix/src/core/htmlLiterals.js'

/**
 * @class SePlainAlertDialog
 */
export default class SePlainAlertDialog extends PlainAlertDialog {
  /**
    * @function get
    * @returns {PlainObject}
  */
  get [template] () {
    const result = super[template]
    // Replace the default slot with a new default slot and a button container.
    const defaultSlot = result.content.querySelector('#frameContent')
    if (defaultSlot) {
      defaultSlot.replaceWith(fragmentFrom.html`
        <div id="alertDialogContent">
          <div id="se-content-alert">
            <slot></slot>
          </div>
          <div id="choiceButtonContainer" part="choice-button-container"></div>
        </div>
      `)
    }
    result.content.append(
      fragmentFrom.html`
        <style>
          [part~="frame"] {
            box-sizing: border-box;
            width: 320px;
            padding: 16px;
            border: 1px solid var(--se-border);
            border-radius: var(--se-radius-float);
            background: var(--se-surface-overlay);
            box-shadow: var(--se-shadow-menu);
            color: var(--se-text);
            font-family: var(--se-font-ui);
            font-size: var(--se-font-size-control);
            line-height: var(--se-line-height-control);
          }

          [part~="backdrop"] {
            background: var(--se-backdrop);
          }

          [part~="choice-button-container"] {
            margin-top: 12px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
          }

          [part~="choice-button"] {
            min-height: var(--se-control-size);
            padding: 0 12px;
            border: 1px solid var(--se-border-control);
            border-radius: var(--se-radius-control);
            background: transparent;
            color: var(--se-text);
            font: inherit;
            cursor: pointer;
          }

          [part~="choice-button"]:first-child {
            border-color: transparent;
            background: var(--se-action);
            color: var(--se-action-text);
            font-weight: 600;
          }

          [part~="choice-button"]:focus-visible {
            outline: 2px solid var(--se-focus-ring);
            outline-offset: 1px;
          }

          #se-content-alert {
            max-height: 200px;
            overflow: auto;
            text-align: left;
          }
        </style>
      `
    )
    return result
  }

  /**
   * Tracks if users wants to cancel (close dialog without any changes) with Esc
   * if null - seConfirm will use responce.choice
   */
  keyChoice = null

  get [keydown] () {
    /**
     * Listens to Esc key to close dialog
     */
    return (e) => {
      if (e.key === 'Escape') {
        this.keyChoice = 'Cancel'
        this.close()
      }
    }
  }
}

customElements.define('se-elix-alert-dialog', SePlainAlertDialog)

/**
 * Opens a dialog inside the root of the editor, which carries the design
 * tokens, rather than at the end of the body where elix would put it (lot V1).
 * The dialog is removed when it closes.
 * @param {SePlainAlertDialog} dialog
 * @returns {void}
 */
export const openInEditor = (dialog) => {
  const root = window.svgEditor?.$container
  if (root && !dialog.isConnected) {
    root.append(dialog)
    dialog.whenClosed().then(() => dialog.remove())
  }
  dialog.open()
}
