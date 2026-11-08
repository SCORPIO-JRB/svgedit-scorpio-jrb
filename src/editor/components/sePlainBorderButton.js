import { template } from 'elix/src/base/internal.js'
import { fragmentFrom } from 'elix/src/core/htmlLiterals.js'
import PlainButton from 'elix/src/plain/PlainButton.js'

/**
 * @class SePlainBorderButton
 * Button with a border in the Plain reference design system
 *
 */
class SePlainBorderButton extends PlainButton {
  /**
    * @function get
    * @returns {PlainObject}
  */
  get [template] () {
    const result = super[template]
    result.content.append(
      fragmentFrom.html`
        <style>
          [part~="button"] {
            min-height: var(--se-control-size);
            border: 1px solid transparent;
            border-radius: var(--se-radius-control);
            background: transparent;
            color: var(--se-text);
            font-family: var(--se-font-display);
            font-size: var(--se-font-size-control);
            font-weight: 600;
          }
          [part~="button"]:hover {
            background: var(--se-control-hover);
          }
          [part~="button"]:focus-visible {
            outline: 2px solid var(--se-focus-ring);
            outline-offset: 2px;
          }
        </style>
      `
    )
    return result
  }
}

export default SePlainBorderButton
