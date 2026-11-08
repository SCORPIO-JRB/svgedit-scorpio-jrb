/**
 * Theme of the editor interface (plan v2, section 6, lot V1).
 *
 * Dark by default, light available. With the "system" preference the editor
 * follows prefers-color-scheme, and switches live when the system does. The
 * theme only changes the workspace: never the document, nor the background
 * saved in the SVG.
 *
 * The root of the editor receives the class `se-editor`, which carries the
 * design tokens (tokens.css), and `data-se-theme`, the resolved theme ("dark"
 * or "light"). A `se-themechange` event is sent on the root after each change,
 * for what is drawn in a canvas (the rulers).
 * @module theme
 */

export const THEME_PREFERENCES = ['system', 'dark', 'light']

/**
 * @param {string} preference "system", "dark" or "light"
 * @param {boolean} systemLight Whether the system asks for a light theme
 * @returns {"dark"|"light"}
 */
export const resolveTheme = (preference, systemLight) => {
  if (preference === 'light' || preference === 'dark') return preference
  return systemLight ? 'light' : 'dark'
}

export class ThemeController {
  /**
   * @param {HTMLElement} root The element given to the editor
   */
  constructor (root) {
    this.root = root
    this.preference = 'system'
    this.media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: light)')
      : null
    this.onSystemChange = () => {
      if (this.preference === 'system') this.apply()
    }
    this.media?.addEventListener?.('change', this.onSystemChange)
    root.classList.add('se-editor')
    this.apply()
  }

  /**
   * @returns {"dark"|"light"} The theme shown
   */
  get resolved () {
    return resolveTheme(this.preference, Boolean(this.media?.matches))
  }

  /**
   * @param {string} preference "system", "dark" or "light"; anything else is "system"
   * @returns {void}
   */
  set (preference) {
    this.preference = THEME_PREFERENCES.includes(preference) ? preference : 'system'
    this.apply()
  }

  /**
   * @returns {void}
   */
  apply () {
    const theme = this.resolved
    const previous = this.root.dataset.seTheme
    this.root.dataset.seTheme = theme
    // No event for the first theme: nothing has been drawn with another one.
    if (previous && previous !== theme) {
      this.root.dispatchEvent(new CustomEvent('se-themechange', { detail: { theme } }))
    }
  }

  /**
   * Stops following the system.
   * @returns {void}
   */
  destroy () {
    this.media?.removeEventListener?.('change', this.onSystemChange)
  }
}
