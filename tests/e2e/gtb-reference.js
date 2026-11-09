/**
 * The reference synoptic of lot V7 (plan v2, criterion of V7: "a reference
 * synoptic made end to end and read without retouching by SCorp-io"): a
 * heating plant with two boilers and their charge pumps, a decoupling
 * bottle and two circuits (3-way valve, pump, temperature probe, energy
 * meter), drawn with the editor's own commands.
 *
 * It runs in the page (page.evaluate): the end-to-end test checks it, and
 * scripts/gtb-reference.mjs writes the saved and exported files given to
 * SCorp-io. Each step goes through the commands a user's gesture calls.
 * @returns {Promise<{saved: string, exported: string}>}
 */
export const buildReference = async () => {
  const ed = window.svgEditor
  const c = ed.svgCanvas
  const t = (key) => ed.i18next.t(key)
  const layer = (key) => c.setCurrentLayer(t(key))

  // 1. The template: page and output frame at 1 920 × 1 080, layers.
  ed.showSaveWarning = false
  await ed.templates.apply('synoptic')

  // 2. The equipments, from the GTB library, named and identified.
  layer('templates.layer_equipment')
  const place = (key, x, y, id, title) => {
    const use = ed.symbols.insert(key, { x, y })
    c.changeSelectedAttribute('id', id, [use])
    c.setElementTitle(use, title)
    return use
  }
  place('gtb-chaudiere', 300, 700, 'chaudiere-1', 'Chaudière 1')
  place('gtb-chaudiere', 520, 700, 'chaudiere-2', 'Chaudière 2')
  place('gtb-pompe', 290, 560, 'pompe-charge-1', 'Pompe de charge 1')
  place('gtb-pompe', 510, 560, 'pompe-charge-2', 'Pompe de charge 2')
  place('gtb-ballon', 900, 640, 'bouteille-decouplage', 'Bouteille de découplage')
  for (const [n, y, name] of [[1, 500, 'Radiateurs'], [2, 780, 'Plancher']]) {
    place('gtb-vanne-3v', 1200, y, `vanne-3-voies-c${n}`, `Vanne 3 voies, circuit ${name}`)
    place('gtb-pompe', 1360, y, `pompe-c${n}`, `Pompe, circuit ${name}`)
    place('gtb-sonde-temperature', 1500, y - 20, `sonde-depart-c${n}`, `Sonde de départ, circuit ${name}`)
    place('gtb-compteur', 1660, y, `compteur-c${n}`, `Compteur d'énergie, circuit ${name}`)
  }

  // 3. The networks, in their layer, port to port, by fluid.
  layer('templates.layer_networks')
  const fluid = (id) => ed.connectors.fluid(id)
  const join = (start, startPort, end, endPort, kind) => c.addConnector({
    start: document.getElementById(start), startPort, end: document.getElementById(end), endPort, fluid: fluid(kind)
  })
  join('chaudiere-1', 'depart', 'pompe-charge-1', 'in', 'chaud-depart')
  join('pompe-charge-1', 'out', 'bouteille-decouplage', 'l1', 'chaud-depart')
  join('chaudiere-2', 'depart', 'pompe-charge-2', 'in', 'chaud-depart')
  join('pompe-charge-2', 'out', 'bouteille-decouplage', 'l1', 'chaud-depart')
  join('bouteille-decouplage', 'l2', 'chaudiere-1', 'retour', 'chaud-retour')
  join('bouteille-decouplage', 'l2', 'chaudiere-2', 'retour', 'chaud-retour')
  for (const n of [1, 2]) {
    join('bouteille-decouplage', 'r1', `vanne-3-voies-c${n}`, 'a', 'chaud-depart')
    join(`vanne-3-voies-c${n}`, 'ab', `pompe-c${n}`, 'in', 'chaud-depart')
    join(`pompe-c${n}`, 'out', `compteur-c${n}`, 'in', 'chaud-depart')
    join('bouteille-decouplage', 'r2', `vanne-3-voies-c${n}`, 'b', 'chaud-retour')
  }

  // 4. The values: one text per point, with a stable id and its binding.
  layer('templates.layer_values')
  const text = (id, x, y, content, { size = 15, fill = '#C9C5D1', point = null, anchor = null } = {}) => {
    const el = c.addSVGElementsFromJson({
      element: 'text',
      attr: { id, x, y, fill, 'font-size': size, 'font-family': 'Roboto Flex, Roboto, sans-serif', ...(anchor ? { 'text-anchor': anchor } : {}) }
    })
    el.textContent = content
    if (point) el.setAttribute('data-point', point)
    c.addCommandToHistory(new c.history.InsertElementCommand(el))
    return el
  }
  text('titre', 48, 72, 'Chaufferie', { size: 34, fill: '#CEB8FF' })
  text('etat-chaudiere-1', 300, 680, '—', { anchor: 'middle', point: 'CHAUF.CH1.ETAT' })
  text('etat-chaudiere-2', 520, 680, '—', { anchor: 'middle', point: 'CHAUF.CH2.ETAT' })
  for (const [n, y] of [[1, 500], [2, 780]]) {
    text(`t-depart-c${n}`, 1530, y - 30, '— °C', { size: 20, fill: '#EEECF1', point: `CHAUF.C${n}.T_DEPART` })
    text(`energie-c${n}`, 1660, y + 40, '— kWh', { anchor: 'middle', point: `CHAUF.C${n}.ENERGIE` })
  }
  c.clearSelection()
  layer('templates.layer_equipment')

  // 5. The files: the saved document, and the export of its frame.
  const frame = c.getFrames()[0]
  return { saved: c.getSvgString(), exported: c.getFrameSvgString(frame.element) }
}

/**
 * What the export of the reference synoptic must hold, read in the page
 * (DOMParser), for the test and the script.
 * @param {string} svg
 * @returns {object}
 */
export const describeExport = (svg) => {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  const all = [...root.querySelectorAll('*')]
  return {
    parseError: Boolean(doc.querySelector('parsererror')),
    viewBox: root.getAttribute('viewBox'),
    size: [root.getAttribute('width'), root.getAttribute('height')],
    symbols: root.querySelectorAll('symbol').length,
    uses: [...root.querySelectorAll('use')].map((use) => [use.id, use.querySelector('title')?.textContent ?? '']),
    pipes: [...root.querySelectorAll('polyline')].map((line) => line.getAttribute('class')),
    points: [...root.querySelectorAll('[data-point]')].map((el) => [el.id, el.getAttribute('data-point')]),
    frames: all.filter((el) => el.localName === 'frame').length,
    scripts: all.filter((el) => el.localName === 'script' || [...el.attributes].some((a) => /^on/i.test(a.name))).length
  }
}
