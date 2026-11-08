/**
 * se-icon: a monochrome icon in the colour of the text around it (plan v2,
 * section 4.7, lot V1).
 *
 * The icons of the editor are SVG files drawn as a CSS mask over
 * `currentColor`: a button changes the colour of its icon by changing its own
 * `color`, in both themes, with no coloured file. SVG data URLs (the shape
 * library) are drawn the same way; raster images are shown as is.
 *
 * Attributes:
 * - `src`: the URL of the image, already resolved against `imgPath`;
 * - `size`: the side in pixels, 16 by default.
 * The icon is decorative (`aria-hidden`): the control that holds it carries
 * the accessible name.
 */
const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: inline-block;
    flex: none;
    width: var(--se-icon-box, var(--se-icon-size, 16px));
    height: var(--se-icon-box, var(--se-icon-size, 16px));
    line-height: 0;
    vertical-align: middle;
  }
  span, img {
    display: block;
    width: 100%;
    height: 100%;
  }
  span {
    background-color: currentColor;
    -webkit-mask: var(--se-icon-url) center / contain no-repeat;
    mask: var(--se-icon-url) center / contain no-repeat;
  }
  img {
    object-fit: contain;
  }
  [hidden] {
    display: none;
  }
  </style>
  <span part="glyph" hidden></span><img part="image" alt="" hidden>
`

/**
 * Whether an image is drawn as a monochrome mask, rather than shown as is.
 * @param {string} src
 * @returns {boolean}
 */
export const isMonochromeIcon = (src) => {
  if (!src || src.startsWith('blob:')) return false
  if (src.startsWith('data:')) return /^data:image\/svg\+xml[;,]/i.test(src)
  return /\.svg(?:[?#].*)?$/i.test(src)
}

export class SeIcon extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true))
    this.$glyph = this.shadowRoot.querySelector('span')
    this.$image = this.shadowRoot.querySelector('img')
  }

  static get observedAttributes () {
    return ['src', 'size']
  }

  connectedCallback () {
    if (!this.hasAttribute('aria-hidden')) this.setAttribute('aria-hidden', 'true')
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    if (name === 'size') {
      if (newValue) {
        this.style.setProperty('--se-icon-box', `${Number.parseFloat(newValue)}px`)
      } else {
        this.style.removeProperty('--se-icon-box')
      }
      return
    }
    const src = newValue || ''
    const mask = isMonochromeIcon(src)
    this.$glyph.hidden = !mask || !src
    this.$image.hidden = mask || !src
    if (mask) {
      this.$glyph.style.setProperty('--se-icon-url', `url("${src.replace(/["\\]/g, '\\$&')}")`)
      this.$image.removeAttribute('src')
    } else if (src) {
      this.$image.setAttribute('src', src)
    } else {
      this.$image.removeAttribute('src')
    }
  }

  get src () {
    return this.getAttribute('src')
  }

  set src (value) {
    this.setAttribute('src', value)
  }
}

customElements.define('se-icon', SeIcon)
