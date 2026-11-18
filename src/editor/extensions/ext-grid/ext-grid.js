/**
 * @file ext-grid.js
 *
 * @license Apache-2.0
 *
 * @copyright 2010 Redou Mine, 2010 Alexis Deveria
 *
 */

const name = 'grid'

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    console.warn(`Missing translation (${lang}) for ${name} - using 'en'`)
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

export default {
  name,
  async init () {
    const svgEditor = this
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas
    if (svgEditor.grid) {
      // Since V2 the interaction layer of the editor draws the grid, over
      // the whole view (see grid.js): the extension keeps its button.
      return {
        name: svgEditor.i18next.t(`${name}:name`),
        zoomChanged () {},
        callback () {
          const buttonTemplate = document.createElement('template')
          buttonTemplate.innerHTML = `
            <se-button id="view_grid" title="${name}:buttons.0.title" src="grid.svg" shortcut="mod+'"></se-button>
          `
          $id('editor_panel').append(buttonTemplate.content.cloneNode(true))
          const button = $id('view_grid')
          const sync = () => { button.pressed = svgEditor.grid.visible }
          $click(button, () => {
            svgEditor.grid.setVisible(!svgEditor.grid.visible)
            sync()
          })
          svgEditor.$container?.addEventListener('se-gridchange', sync)
          svgEditor.grid.update()
          sync()
        }
      }
    }
  }
}
