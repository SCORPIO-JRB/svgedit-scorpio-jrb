import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import Paint from '../../packages/svgcanvas/core/paint.js'
import { BatchCommand, ChangeElementCommand, InsertElementCommand, MERGE_DELAY } from '../../packages/svgcanvas/core/history.js'
import { describeStep, stepLabel, actionLabel, stepTargets, STEP_TEXTS } from '../../src/editor/history-steps.js'
import fr from '../../src/editor/locale/lang.fr.js'

// Lot V5, S4: the steps are grouped and named.
describe('history (V5)', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const editor = document.createElement('div')
    editor.id = 'svg_editor'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    const canvas = document.createElement('div')
    canvas.id = 'svgcanvas'
    workarea.append(canvas)
    editor.append(workarea)
    document.body.append(editor)
    svgCanvas = new SvgCanvas(canvas, {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
    svgCanvas.setSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
      '<rect id="r1" x="10" y="10" width="50" height="50" fill="#160f23"/>' +
      '<rect id="r2" x="100" y="10" width="50" height="50"/>' +
      '<g id="g1"><rect id="r3"/><text id="t1">Pompe</text></g></svg>'
    )
  })

  const $ = (id) => document.getElementById(id)
  const select = (...ids) => {
    svgCanvas.clearSelection()
    svgCanvas.addToSelection(ids.map($))
  }
  // A plain translation function that reads the French file.
  const t = (key, options = {}) => {
    const [ns, name] = key.split('.')
    const table = fr[ns] ?? {}
    let text = table[name]
    if (options.count !== undefined && table[`${name}_${options.count === 1 ? 'one' : 'other'}`] !== undefined) {
      text = table[`${name}_${options.count === 1 ? 'one' : 'other'}`]
    }
    // As i18next: the values are escaped for HTML unless told otherwise.
    const escape = options.interpolation?.escapeValue !== false
    return String(text ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) => {
      const value = String(options[k] ?? '')
      return escape ? value.replace(/'/g, '&#39;') : value
    })
  }
  const lastStep = () => {
    const { undoMgr } = svgCanvas
    return undoMgr.getSteps()[undoMgr.getUndoStackSize() - 1]
  }

  it('names a move by its number of objects', () => {
    select('r1', 'r2')
    svgCanvas.moveSelectedElements(5, 5)
    expect(describeStep(lastStep())).toEqual({ key: 'move', count: 2 })
    expect(stepLabel(lastStep(), t)).toBe('Déplacer 2 objets')
    expect(actionLabel('undo', lastStep(), t, 'fr')).toBe('Annuler : déplacer 2 objets')
    expect(actionLabel('redo', undefined, t, 'fr')).toBe('Rétablir')
  })

  it('names a change by its attribute', () => {
    select('r1')
    svgCanvas.changeSelectedAttribute('stroke-width', 3)
    expect(stepLabel(lastStep(), t)).toBe("Modifier l'épaisseur du contour")
    expect(actionLabel('undo', lastStep(), t, 'fr')).toBe("Annuler : modifier l'épaisseur du contour")
    svgCanvas.setPaint('fill', new Paint({ solidColor: '00ff00' }))
    expect(stepLabel(lastStep(), t)).toBe('Modifier le remplissage')
  })

  it('names a creation by its shape, a deletion by its count', () => {
    const rect = svgCanvas.addSVGElementsFromJson({ element: 'rect', attr: { id: 'r9', x: 1, y: 1, width: 5, height: 5 } })
    svgCanvas.addCommandToHistory(new InsertElementCommand(rect))
    expect(stepLabel(lastStep(), t)).toBe('Tracer un rectangle')
    select('r1', 'r2', 'g1')
    svgCanvas.deleteSelectedElements()
    expect(stepLabel(lastStep(), t)).toBe('Supprimer 3 objets')
  })

  it('counts an object once, not its children', () => {
    const batch = new BatchCommand('position')
    batch.addSubCommand(new ChangeElementCommand($('g1'), { transform: '' }))
    batch.addSubCommand(new ChangeElementCommand($('r3'), { x: '0' }))
    expect(describeStep(batch).count).toBe(1)
  })

  it('names every step text of the canvas', () => {
    // Every literal label given to a batch in the canvas and the editor is
    // known: a new one must be named here.
    const files = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['dist', 'locale', 'node_modules'].includes(entry.name)) walk(path)
        } else if (entry.name.endsWith('.js')) {
          files.push(path)
        }
      }
    }
    walk('packages/svgcanvas/core')
    files.push('packages/svgcanvas/svgcanvas.js')
    walk('src/editor')
    const labels = new Set()
    const patterns = [
      /new (?:\w+\.)*BatchCommand\('([^']+)'\)/g,
      /startBatchCommand\('([^']+)'\)/g,
      /reorderSelected\('([^']+)'/g,
      /applyToElements\([^)]*'([^']+)'\)/g,
      /cmdStr = '([^']+)'/g
    ]
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const re of patterns) {
        for (const [, label] of source.matchAll(re)) labels.add(label)
      }
    }
    labels.delete('create two elements') // a JSDoc example
    expect(labels.size).toBeGreaterThan(30)
    const unknown = [...labels].filter((label) => !STEP_TEXTS[label.toLowerCase()])
    expect(unknown).toEqual([])
    // And each name has a translation.
    for (const key of new Set(Object.values(STEP_TEXTS))) {
      expect(fr.history[key] ?? fr.history[`${key}_one`], key).toBeTruthy()
    }
  })

  it('merges nudges in a row into one step', () => {
    let clock = 1000
    svgCanvas.undoMgr.now = () => clock
    select('r1')
    const before = svgCanvas.undoMgr.getUndoStackSize()
    for (let i = 0; i < 5; i++) {
      svgCanvas.undoMgr.merging('nudge', () => svgCanvas.moveSelectedElements(1, 0))
      clock += 100
    }
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    expect($('r1').getAttribute('x')).toBe('15')
    svgCanvas.undoMgr.undo()
    expect($('r1').getAttribute('x')).toBe('10')
    svgCanvas.undoMgr.redo()
    expect($('r1').getAttribute('x')).toBe('15')
    // After a pause, a new step.
    select('r1')
    clock += MERGE_DELAY + 1
    svgCanvas.undoMgr.merging('nudge', () => svgCanvas.moveSelectedElements(1, 0))
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 2)
    // Another selection: a new step.
    select('r2')
    svgCanvas.undoMgr.merging('nudge', () => svgCanvas.moveSelectedElements(1, 0))
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 3)
  })

  it('merges the characters typed in a text', () => {
    let clock = 0
    svgCanvas.undoMgr.now = () => clock
    select('t1')
    const before = svgCanvas.undoMgr.getUndoStackSize()
    for (const text of ['Pompe ', 'Pompe 1', 'Pompe 12']) {
      clock += 5000
      svgCanvas.undoMgr.merging('text', () => svgCanvas.changeSelectedAttribute('#text', text), Infinity)
    }
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    expect(stepLabel(lastStep(), t)).toBe('Modifier le texte')
    // The editing ends: what is typed next is another step.
    svgCanvas.undoMgr.endMerge()
    svgCanvas.undoMgr.merging('text', () => svgCanvas.changeSelectedAttribute('#text', 'Pompe 13'), Infinity)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 2)
    svgCanvas.undoMgr.undo()
    expect($('t1').textContent).toBe('Pompe 12')
    select('t1')
    svgCanvas.undoMgr.undo()
    expect($('t1').textContent).toBe('Pompe')
  })

  it('names a text created and typed as its creation', () => {
    const text = svgCanvas.addSVGElementsFromJson({ element: 'text', attr: { id: 't9', x: 1, y: 20 } })
    const insert = new InsertElementCommand(text)
    insert.mergeKey = 'text'
    insert.mergeElements = [text]
    svgCanvas.addCommandToHistory(insert)
    svgCanvas.clearSelection()
    svgCanvas.addToSelection([text])
    svgCanvas.undoMgr.merging('text', () => svgCanvas.changeSelectedAttribute('#text', 'Vanne'), Infinity)
    expect(svgCanvas.undoMgr.getSteps().at(-1).stack).toHaveLength(2)
    expect(stepLabel(lastStep(), t)).toBe('Créer un texte')
  })

  it('gives each command its type, whatever a minifier names its class', () => {
    const Renamed = class extends InsertElementCommand {}
    const cmd = new Renamed($('r1'))
    expect(Renamed.name).toBe('Renamed')
    expect(cmd.type()).toBe('InsertElementCommand')
    expect(new BatchCommand('x').type()).toBe('BatchCommand')
    expect(new ChangeElementCommand($('r1'), { x: '0' }).type()).toBe('ChangeElementCommand')
  })

  it('keeps a limited number of steps', () => {
    svgCanvas.undoMgr.limit = 3
    select('r1')
    for (let i = 0; i < 5; i++) svgCanvas.moveSelectedElements(1, 0)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(3)
    expect(svgCanvas.undoMgr.getSteps()).toHaveLength(3)
  })

  it('gives the objects to select after an undo', () => {
    select('r1', 'r2')
    svgCanvas.deleteSelectedElements()
    const step = lastStep()
    expect(stepTargets(step)).toEqual([])
    svgCanvas.undoMgr.undo()
    expect(stepTargets(step).map((elem) => elem.id).sort()).toEqual(['r1', 'r2'])
  })
})
