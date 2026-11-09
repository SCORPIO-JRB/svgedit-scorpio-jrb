/**
 * Lock and visibility of objects in the editor (lot V7; plan v2, section 2.6):
 * the commands that the shortcuts, the command palette and the menus share.
 *
 * - Ctrl+Shift+H hides the selection, Ctrl+Shift+L locks it; both take it
 *   out of the selection, since a hidden or locked object cannot be selected.
 * - "Show all" and "Unlock all" bring back every hidden or locked object,
 *   in one undo step each.
 * - A tool that would draw into a locked layer says why it does nothing.
 *
 * The canvas does the work (core/structure.js); this module names it.
 * @module structure
 */

/**
 * @param {import('./Editor.js').default} editor
 * @returns {void}
 */
export const initStructure = (editor) => {
  const { svgCanvas, i18next } = editor
  const t = (key, options) => i18next.t(key, options)
  const selection = () => svgCanvas.getSelectedElements().filter(Boolean)

  svgCanvas.bind('locked', (_win, target) => {
    const drawing = svgCanvas.getCurrentDrawing()
    const layer = drawing.all_layers.find((candidate) => candidate.getGroup() === target)
    editor.toast(layer
      ? t('structure.layer_locked', { name: layer.getName() })
      : t('structure.group_locked'), { type: 'info' })
  })

  const commands = [
    {
      id: 'hide_selection',
      label: 'structure.hide',
      // Before the layer view of ext-layer_view, which shares no key, and
      // the lock, which shares Ctrl+Shift+L with it: with a selection, the
      // lock runs; without, the layer view.
      shortcuts: 'mod+shift+h',
      when: () => selection().length > 0,
      run: () => svgCanvas.setVisible(selection(), false)
    },
    {
      id: 'lock_selection',
      label: 'structure.lock',
      shortcuts: 'mod+shift+l',
      when: () => selection().length > 0,
      run: () => svgCanvas.setLocked(selection(), true)
    },
    {
      id: 'show_all',
      label: 'structure.show_all',
      when: () => svgCanvas.findMarked('hidden').length > 0,
      run: () => svgCanvas.setVisible(svgCanvas.findMarked('hidden'), true)
    },
    {
      id: 'unlock_all',
      label: 'structure.unlock_all',
      when: () => svgCanvas.findMarked('locked').length > 0,
      run: () => svgCanvas.setLocked(svgCanvas.findMarked('locked'), false)
    }
  ]
  commands.forEach((command) => editor.commands.register(command))
}
