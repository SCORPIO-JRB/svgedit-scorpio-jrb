import SvgCanvas from '@svgedit/svgcanvas'
import LayersPanelHtml from './LayersPanel.html'
import { askText } from '../components/askText.js'

const { $id, $click } = SvgCanvas

/**
 *
 */
class LayersPanel {
  /**
   * @param {PlainObject} editor
   */
  constructor (editor) {
    this.updateContextPanel = editor.topPanel.updateContextPanel.bind(editor.topPanel)
    this.editor = editor
  }

  /**
   * @param {PlainObject} e event
   * @returns {void}
   */
  lmenuFunc (e) {
    const action = e?.detail?.trigger
    switch (action) {
      case 'dupe':
        this.cloneLayer()
        break
      case 'delete':
        this.deleteLayer()
        break
      case 'merge_down':
        this.mergeLayer()
        break
      case 'merge_all':
        this.editor.svgCanvas.mergeAllLayers()
        this.updateContextPanel()
        this.populateLayers()
        break
    }
  }

  /**
   * @returns {void}
   */
  init () {
    const template = document.createElement('template')
    const { i18next } = this.editor

    template.innerHTML = LayersPanelHtml
    // Each control in its zone of the layout (lot V3).
    if (this.editor.layout) this.editor.layout.attach(template.content.cloneNode(true), 'layers')
    else this.editor.$svgEditor.append(template.content.cloneNode(true))
    // layer menu added to DOM
    const menuMore = document.createElement('se-cmenu-layers')
    menuMore.setAttribute('id', 'se-cmenu-layers-more')
    menuMore.value = 'layer_moreopts'
    menuMore.setAttribute('leftclick', true)
    this.editor.$container.append(menuMore)
    menuMore.init(i18next)
    const menuLayerBox = document.createElement('se-cmenu-layers')
    menuLayerBox.setAttribute('id', 'se-cmenu-layers-list')
    menuLayerBox.value = 'layerlist'
    menuLayerBox.setAttribute('leftclick', false)
    this.editor.$container.append(menuLayerBox)
    menuLayerBox.init(i18next)
    $click($id('layer_new'), this.newLayer.bind(this))
    $click($id('layer_delete'), this.deleteLayer.bind(this))
    $click($id('layer_up'), () => this.moveLayer.bind(this)(-1))
    $click($id('layer_down'), () => this.moveLayer.bind(this)(1))
    $click($id('layer_rename'), this.layerRename.bind(this))
    $id('se-cmenu-layers-more').addEventListener('change', this.lmenuFunc.bind(this))
    $id('se-cmenu-layers-list').addEventListener('change', (e) => { this.lmenuFunc(e) })
    if ($id('sidepanel_handle')) $click($id('sidepanel_handle'), () => this.toggleSidePanel())
    this.toggleSidePanel(this.editor.configObj.curConfig.showlayers)
  }

  /**
   * Shows or hides the layers: the side panel of the classic layout, the
   * Layers tab of the right panel in the canvas layout.
   * @param {boolean} [displayFlag] Toggles when left out
   * @returns {void}
   */
  toggleSidePanel (displayFlag) {
    const { layout } = this.editor
    if (layout?.canvas) {
      if (displayFlag) {
        layout.setPanelOpen(true)
        layout.selectTab('layers')
      } else if (displayFlag === undefined) {
        layout.setPanelOpen()
      }
      return
    }
    if (displayFlag === undefined) {
      this.editor.$svgEditor.classList.toggle('open')
    } else if (displayFlag) {
      this.editor.$svgEditor.classList.add('open')
    } else {
      this.editor.$svgEditor.classList.remove('open')
    }
  }

  /**
   * A unique name for a new layer: "Layer 2", "Layer 3"…
   * @param {string} [base]
   * @returns {string}
   */
  uniqueLayerName (base) {
    const drawing = this.editor.svgCanvas.getCurrentDrawing()
    if (base && !drawing.hasLayer(base)) return base
    let i = drawing.getNumLayers()
    let name
    do {
      name = base ? `${base} ${++i}` : this.editor.i18next.t('layers.layer') + ' ' + ++i
    } while (drawing.hasLayer(name))
    return name
  }

  /**
   * Asks for the name of a layer in place (lot V3: no more prompt()).
   * @param {string} label
   * @param {string} value
   * @param {Element} [anchor]
   * @returns {Promise<string|null>} A name no layer has, or null
   */
  async askLayerName (label, value, anchor) {
    const name = (await askText(this.editor, { label, value, anchor }))?.trim()
    if (!name) return null
    if (this.editor.svgCanvas.getCurrentDrawing().hasLayer(name)) {
      this.editor.toast(this.editor.i18next.t('notification.dupeLayerName'), { type: 'error' })
      return null
    }
    return name
  }

  /**
   * @param {Element} [anchor] The control that asked
   * @returns {Promise<void>}
   */
  async newLayer (anchor) {
    const newName = await this.askLayerName(
      this.editor.i18next.t('notification.enterUniqueLayerName'),
      this.uniqueLayerName(),
      anchor instanceof Element ? anchor : $id('layer_new')
    )
    if (!newName) {
      return
    }
    this.editor.svgCanvas.createLayer(newName)
    this.updateContextPanel()
    this.populateLayers()
  }

  /**
   *
   * @returns {void}
   */
  deleteLayer () {
    if (this.editor.svgCanvas.deleteCurrentLayer()) {
      this.updateContextPanel()
      this.populateLayers()
      // This matches what this.editor.svgCanvas does
      // TODO: make this behavior less brittle (svg-editor should get which
      // layer is selected from the canvas and then select that one in the UI)
      const elements = document.querySelectorAll('#layerlist tr.layer')
      Array.prototype.forEach.call(elements, function (el) {
        el.classList.remove('layersel')
      })
      document.querySelector('#layerlist tr.layer').classList.add('layersel')
    }
  }

  /**
   *
   * @returns {void}
   */
  async cloneLayer (anchor) {
    const name =
      this.editor.svgCanvas.getCurrentDrawing().getCurrentLayerName() + ' copy'
    const newName = await this.askLayerName(
      this.editor.i18next.t('notification.enterUniqueLayerName'),
      this.uniqueLayerName(name),
      anchor instanceof Element ? anchor : $id('layer_moreopts')
    )
    if (!newName) {
      return
    }
    this.editor.svgCanvas.cloneLayer(newName)
    this.updateContextPanel()
    this.populateLayers()
  }

  index (el) {
    if (!el) return -1
    return Array.from(document.querySelector('#layerlist tbody').children).indexOf(el)
  }

  /**
   *
   * @returns {void}
   */
  mergeLayer () {
    if (
      (this.index(document.querySelector('#layerlist tr.layersel')) - 1) ===
      this.editor.svgCanvas.getCurrentDrawing().getNumLayers() - 1
    ) {
      return
    }
    this.editor.svgCanvas.mergeLayer()
    this.updateContextPanel()
    this.populateLayers()
  }

  /**
   * @param {Integer} pos
   * @returns {void}
   */
  moveLayer (pos) {
    const curPos = this.editor.svgCanvas.indexCurrentLayer()
    if (curPos !== -1) {
      this.editor.svgCanvas.setCurrentLayerPosition(curPos - pos)
      this.populateLayers()
    }
  }

  /**
   * @param {Element} [anchor] The control that asked
   * @returns {Promise<void>}
   */
  async layerRename (anchor) {
    // In the canvas layout, the name is edited in its row of the tree.
    const tree = this.editor.layout?.layerTree
    if (tree?.renameCurrent()) return
    const oldName = this.editor.svgCanvas.getCurrentDrawing().getCurrentLayerName()
    const newName = (await askText(this.editor, {
      label: this.editor.i18next.t('notification.enterNewLayerName'),
      value: oldName,
      anchor: anchor instanceof Element ? anchor : $id('layer_rename')
    }))?.trim()
    if (!newName || newName === oldName) {
      return
    }
    this.renameLayerTo(newName)
  }

  /**
   * Gives a layer a new name, unless another layer has it: the dialog of the
   * classic layout, the row of the tree and the field of the inspector.
   * @param {string} name
   * @param {string} [layer] The layer to rename, which becomes the current
   *   one; the current one when not given
   * @returns {boolean} Whether the layer has the name
   */
  renameLayerTo (name, layer) {
    const { svgCanvas } = this.editor
    if (svgCanvas.getCurrentDrawing().hasLayer(name)) {
      this.editor.toast(this.editor.i18next.t('notification.layerHasThatName'), { type: 'error' })
      return false
    }
    if (layer !== undefined) svgCanvas.setCurrentLayer(layer)
    svgCanvas.renameCurrentLayer(name)
    this.populateLayers()
    return true
  }

  /**
   * Makes a layer the current one, with nothing selected: the menu of the
   * toolbar and the row of the tree.
   * @param {string} name
   * @returns {void}
   */
  selectLayer (name) {
    const { svgCanvas } = this.editor
    svgCanvas.setCurrentLayer(name)
    svgCanvas.clearSelection()
    svgCanvas.runExtensions('layersChanged')
    this.populateLayers()
  }

  /**
   * This function highlights the layer passed in (by fading out the other layers).
   * If no layer is passed in, this function restores the other layers.
   * @param {string} [layerNameToHighlight]
   * @returns {void}
   */
  toggleHighlightLayer (layerNameToHighlight) {
    let i
    const curNames = []
    const numLayers = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    for (i = 0; i < numLayers; i++) {
      curNames[i] = this.editor.svgCanvas.getCurrentDrawing().getLayerName(i)
    }

    if (layerNameToHighlight) {
      curNames.forEach((curName) => {
        if (curName !== layerNameToHighlight) {
          this.editor.svgCanvas
            .getCurrentDrawing()
            .setLayerOpacity(curName, 0.5)
        }
      })
    } else {
      curNames.forEach((curName) => {
        this.editor.svgCanvas.getCurrentDrawing().setLayerOpacity(curName, 1.0)
      })
    }
  }

  /**
   * @returns {void}
   */
  populateLayers () {
    this.editor.svgCanvas.clearSelection()
    const self = this
    const layerlist = $id('layerlist').querySelector('tbody')
    while (layerlist.firstChild) { layerlist.removeChild(layerlist.firstChild) }

    $id('selLayerNames').setAttribute('options', '')
    const drawing = this.editor.svgCanvas.getCurrentDrawing()
    const currentLayerName = drawing.getCurrentLayerName()
    let layer = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    // we get the layers in the reverse z-order (the layer rendered on top is listed first)
    let values = ''
    let text = ''
    while (layer--) {
      const name = drawing.getLayerName(layer)
      const layerTr = document.createElement('tr')
      layerTr.className = (name === currentLayerName) ? 'layer layersel' : 'layer'
      const layerVis = document.createElement('td')
      layerVis.className = (!drawing.getLayerVisibility(name)) ? 'layerinvis layervis' : 'layervis'

      // fix the eye icon lost at right layers
      const _eye = document.createElement('img')
      _eye.src = './images/eye.svg'
      _eye.style.width = '14px'
      _eye.style.width = '14px'
      layerVis.appendChild(_eye)

      const layerName = document.createElement('td')
      layerName.className = 'layername'
      layerName.textContent = name
      layerTr.appendChild(layerVis)
      layerTr.appendChild(layerName)
      layerlist.appendChild(layerTr)
      values = (values) ? values + '::' + name : name
      text = (text) ? text + ',' + name : name
    }
    $id('selLayerNames').setAttribute('options', text)
    $id('selLayerNames').setAttribute('values', values)
    // handle selection of layer
    const nelements = $id('layerlist').querySelectorAll('td.layername')
    Array.from(nelements).forEach(function (element) {
      element.addEventListener('mouseup', function (evt) {
        const trElements = $id('layerlist').querySelectorAll('tr.layer')
        Array.from(trElements).forEach(function (element) {
          element.classList.remove('layersel')
        })
        evt.currentTarget.parentNode.classList.add('layersel')
        self.editor.svgCanvas.setCurrentLayer(evt.currentTarget.textContent)
        self.editor.layout?.layersChanged()
        // run extension when different layer is selected from listener
        self.editor.svgCanvas.runExtensions(
          'layersChanged'
        )
        evt.preventDefault()
      })
      element.addEventListener('mouseup', (evt) => {
        self.toggleHighlightLayer(evt.currentTarget.textContent)
      })
      element.addEventListener('mouseout', (_evt) => {
        self.toggleHighlightLayer()
      })
    })
    const elements = $id('layerlist').querySelectorAll('td.layervis')
    Array.from(elements).forEach(function (element) {
      $click(element, function (evt) {
        const ele = evt.currentTarget.parentNode.querySelector('td.layername')
        const name = (ele) ? ele.textContent : ''
        const vis = evt.currentTarget.classList.contains('layerinvis')
        self.editor.svgCanvas.setLayerVisibility(name, vis)
        evt.currentTarget.classList.toggle('layerinvis')
        // run extension if layer visibility is changed from listener
        self.editor.svgCanvas.runExtensions(
          'layerVisChanged'
        )
      })
    })

    // if there were too few rows, let's add a few to make it not so lonely
    let num = 5 - $id('layerlist').querySelectorAll('tr.layer').length
    while (num-- > 0) {
      // TODO: there must a better way to do this
      const tlayer = document.createElement('tr')
      tlayer.innerHTML = '<td style="visibility:hidden">_</td><td/>'
      layerlist.append(tlayer)
    }
    // run extension when layer panel is populated
    self.editor.svgCanvas.runExtensions(
      'layersChanged'
    )
    // The current layer in the toolbar, the tree of the Layers tab (lot V3).
    self.editor.layout?.layersChanged()
  }
}

export default LayersPanel
