/**
 * The GTB symbol library of the editor (lot V7; plan v2, section 2.11):
 * equipment of heating, cooling and air handling, drawn in the style of the
 * reference synoptic of the corpus (tests/fixtures/import/scorpio/
 * synoptique-chaufferie.svg).
 *
 * Rules of the drawings, so that the supervision can show the state of an
 * equipment by changing attributes of its instance (D4):
 * - the body sets neither `fill` nor `stroke`: it takes those of the
 *   `<use>` (here the colours of an equipment at rest);
 * - the marks (direction of a pump, letter of a probe, flame of a boiler)
 *   are in `currentColor`: the `color` of the instance;
 * - the ports are on the edge of the box, at multiples of 10: with the grid
 *   of 10 snapping, the ends of the networks fall on it.
 *
 * A symbol is versioned: when its drawing changes, its version goes up, and
 * the documents that hold an older one are offered the update.
 *
 * A host gives its own symbols with the `symbolLibraries` option (same
 * shape). The names are keys of the translations, or texts shown as is.
 * @module gtb-symbols
 */

/** Attributes of a new instance: an equipment at rest, as in the synoptic. */
const AT_REST = {
  fill: '#1F1430',
  stroke: '#625A6E',
  'stroke-width': '1.5',
  color: '#9B92AA'
}

/** Pumps and valves are drawn on the background of the pipes. */
const ON_PIPE = { ...AT_REST, fill: '#160F23' }

/**
 * @param {string} type Class of the equipment, as in the synoptic
 * @param {object} [base]
 * @returns {Object<string, string>}
 */
const instance = (type, base = AT_REST) => ({ class: `equipement ${type}`, ...base })

/** @type {import('./symbols.js').SymbolLibraryData[]} */
export const DEFAULT_SYMBOL_LIBRARIES = [
  {
    id: 'gtb',
    name: 'symbols.lib_gtb',
    categories: [
      { id: 'hydraulic', name: 'symbols.cat_hydraulic' },
      { id: 'air', name: 'symbols.cat_air' },
      { id: 'production', name: 'symbols.cat_production' },
      { id: 'measure', name: 'symbols.cat_measure' }
    ],
    symbols: [
      {
        id: 'gtb-pompe',
        version: 1,
        category: 'hydraulic',
        name: 'symbols.pump',
        keywords: 'pompe circulateur pump circulator',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<circle cx="20" cy="20" r="19"/><path d="M14 10.5 30 20 14 29.5Z" fill="currentColor" stroke="none"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' },
          { id: 'power', x: 20, y: 0, dir: 'up', kind: 'power' }
        ],
        attributes: instance('pompe', ON_PIPE)
      },
      {
        id: 'gtb-vanne-2v',
        version: 1,
        category: 'hydraulic',
        name: 'symbols.valve2',
        keywords: 'vanne 2 voies deux robinet valve two way',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<path d="M0 10V34L20 22ZM40 10V34L20 22Z"/><path d="M20 22V8" fill="none"/><rect x="13" y="1" width="14" height="7" rx="1.5"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' },
          { id: 'signal', x: 20, y: 0, dir: 'up', kind: 'signal' }
        ],
        attributes: instance('vanne', ON_PIPE)
      },
      {
        id: 'gtb-vanne-3v',
        version: 1,
        category: 'hydraulic',
        name: 'symbols.valve3',
        keywords: 'vanne 3 voies trois melangeuse mixing valve three way',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<path d="M0 10V30L20 20ZM40 10V30L20 20ZM10 40H30L20 20Z"/><path d="M20 20V8" fill="none"/><rect x="13" y="1" width="14" height="7" rx="1.5"/>',
        ports: [
          { id: 'a', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'ab', x: 40, y: 20, dir: 'right', kind: 'out' },
          { id: 'b', x: 20, y: 40, dir: 'down', kind: 'in' },
          { id: 'signal', x: 20, y: 0, dir: 'up', kind: 'signal' }
        ],
        attributes: instance('vanne', ON_PIPE)
      },
      {
        id: 'gtb-clapet',
        version: 1,
        category: 'hydraulic',
        name: 'symbols.check_valve',
        keywords: 'clapet anti retour non return check valve',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<path d="M0 20H40" fill="none"/><path d="M8 8V32L30 20Z"/><path d="M32 8V32" fill="none"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' }
        ],
        attributes: instance('clapet', ON_PIPE)
      },
      {
        id: 'gtb-echangeur',
        version: 1,
        category: 'hydraulic',
        name: 'symbols.exchanger',
        keywords: 'echangeur échangeur plaques plate heat exchanger',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<rect x="0.75" y="0.75" width="38.5" height="38.5" rx="2"/><path d="M4 4 36 36M4 36 36 4" fill="none" stroke="currentColor"/>',
        ports: [
          { id: 'p-in', x: 0, y: 10, dir: 'left', kind: 'in' },
          { id: 'p-out', x: 0, y: 30, dir: 'left', kind: 'out' },
          { id: 's-in', x: 40, y: 30, dir: 'right', kind: 'in' },
          { id: 's-out', x: 40, y: 10, dir: 'right', kind: 'out' }
        ],
        attributes: instance('echangeur')
      },
      {
        id: 'gtb-ballon',
        version: 1,
        category: 'hydraulic',
        name: 'symbols.tank',
        keywords: 'ballon réservoir reservoir bouteille découplage decouplage tank buffer',
        viewBox: '0 0 40 80',
        width: 40,
        height: 80,
        body: '<rect x="0.75" y="0.75" width="38.5" height="78.5" rx="19"/>',
        ports: [
          { id: 'l1', x: 0, y: 20, dir: 'left', kind: 'any' },
          { id: 'l2', x: 0, y: 60, dir: 'left', kind: 'any' },
          { id: 'r1', x: 40, y: 20, dir: 'right', kind: 'any' },
          { id: 'r2', x: 40, y: 60, dir: 'right', kind: 'any' }
        ],
        attributes: instance('bouteille')
      },
      {
        id: 'gtb-ventilateur',
        version: 1,
        category: 'air',
        name: 'symbols.fan',
        keywords: 'ventilateur extracteur fan blower',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<circle cx="20" cy="20" r="19"/><path d="M12 9.5 33 20 12 30.5Z" fill="none" stroke="currentColor"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' },
          { id: 'power', x: 20, y: 0, dir: 'up', kind: 'power' }
        ],
        attributes: instance('ventilateur')
      },
      {
        id: 'gtb-registre',
        version: 1,
        category: 'air',
        name: 'symbols.damper',
        keywords: 'registre volet clapet air damper',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<rect x="0.75" y="10" width="38.5" height="20"/><path d="M20 0V10" fill="none"/><path d="M9 28 31 12" fill="none" stroke="currentColor"/><circle cx="20" cy="20" r="2" fill="currentColor" stroke="none"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' },
          { id: 'signal', x: 20, y: 0, dir: 'up', kind: 'signal' }
        ],
        attributes: instance('registre')
      },
      {
        id: 'gtb-filtre',
        version: 1,
        category: 'air',
        name: 'symbols.filter',
        keywords: 'filtre filter',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<rect x="0.75" y="0.75" width="38.5" height="38.5"/><path d="M10 1 30 20 10 39" fill="none" stroke="currentColor"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' }
        ],
        attributes: instance('filtre')
      },
      {
        id: 'gtb-batterie-chaude',
        version: 1,
        category: 'air',
        name: 'symbols.heating_coil',
        keywords: 'batterie chaude chauffage heating coil',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<rect x="0.75" y="0.75" width="38.5" height="38.5"/><path d="M1 39 39 1" fill="none"/><path d="M25 30H35M30 25V35" fill="none" stroke="currentColor"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' },
          { id: 'w-in', x: 10, y: 40, dir: 'down', kind: 'in' },
          { id: 'w-out', x: 30, y: 40, dir: 'down', kind: 'out' }
        ],
        attributes: instance('batterie')
      },
      {
        id: 'gtb-batterie-froide',
        version: 1,
        category: 'air',
        name: 'symbols.cooling_coil',
        keywords: 'batterie froide refroidissement cooling coil',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<rect x="0.75" y="0.75" width="38.5" height="38.5"/><path d="M1 39 39 1" fill="none"/><path d="M25 30H35" fill="none" stroke="currentColor"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' },
          { id: 'w-in', x: 10, y: 40, dir: 'down', kind: 'in' },
          { id: 'w-out', x: 30, y: 40, dir: 'down', kind: 'out' }
        ],
        attributes: instance('batterie')
      },
      {
        id: 'gtb-chaudiere',
        version: 1,
        category: 'production',
        name: 'symbols.boiler',
        keywords: 'chaudière chaudiere générateur boiler',
        viewBox: '0 0 60 80',
        width: 60,
        height: 80,
        body: '<rect x="0.75" y="0.75" width="58.5" height="78.5" rx="6"/><path d="M30 62c-9-5-8-14 0-24 2 7 9 9 9 16a9 8 0 0 1-9 8Z" fill="currentColor" stroke="none"/>',
        ports: [
          { id: 'depart', x: 20, y: 0, dir: 'up', kind: 'out' },
          { id: 'retour', x: 40, y: 80, dir: 'down', kind: 'in' },
          { id: 'power', x: 60, y: 40, dir: 'right', kind: 'power' }
        ],
        attributes: instance('chaudiere')
      },
      {
        id: 'gtb-groupe-froid',
        version: 1,
        category: 'production',
        name: 'symbols.chiller',
        keywords: 'groupe froid refroidisseur pac pompe à chaleur chiller heat pump',
        viewBox: '0 0 80 60',
        width: 80,
        height: 60,
        body: '<rect x="0.75" y="0.75" width="78.5" height="58.5" rx="4"/><path d="M40 16V44M28 23 52 37M28 37 52 23" fill="none" stroke="currentColor"/>',
        ports: [
          { id: 'depart', x: 0, y: 20, dir: 'left', kind: 'out' },
          { id: 'retour', x: 0, y: 40, dir: 'left', kind: 'in' },
          { id: 'power', x: 80, y: 30, dir: 'right', kind: 'power' }
        ],
        attributes: instance('groupe-froid')
      },
      {
        id: 'gtb-moteur',
        version: 1,
        category: 'production',
        name: 'symbols.motor',
        keywords: 'moteur motor',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<circle cx="20" cy="20" r="19"/><path d="M12 28V12L20 22 28 12V28" fill="none" stroke="currentColor"/>',
        ports: [
          { id: 'power', x: 20, y: 0, dir: 'up', kind: 'power' },
          { id: 'shaft', x: 40, y: 20, dir: 'right', kind: 'any' }
        ],
        attributes: instance('moteur')
      },
      {
        id: 'gtb-sonde-temperature',
        version: 1,
        category: 'measure',
        name: 'symbols.temperature_probe',
        keywords: 'sonde température temperature capteur probe sensor',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<path d="M20 32V40" fill="none"/><circle cx="20" cy="18" r="13"/><path d="M14 12H26M20 12V25" fill="none" stroke="currentColor"/>',
        ports: [{ id: 'probe', x: 20, y: 40, dir: 'down', kind: 'signal' }],
        attributes: instance('sonde')
      },
      {
        id: 'gtb-sonde-pression',
        version: 1,
        category: 'measure',
        name: 'symbols.pressure_probe',
        keywords: 'sonde pression pressure capteur probe sensor',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<path d="M20 32V40" fill="none"/><circle cx="20" cy="18" r="13"/><path d="M16 25V11H22a4 4 0 0 1 0 8H16" fill="none" stroke="currentColor"/>',
        ports: [{ id: 'probe', x: 20, y: 40, dir: 'down', kind: 'signal' }],
        attributes: instance('sonde')
      },
      {
        id: 'gtb-sonde-humidite',
        version: 1,
        category: 'measure',
        name: 'symbols.humidity_probe',
        keywords: 'sonde humidité humidite hygrométrie humidity capteur probe sensor',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<path d="M20 32V40" fill="none"/><circle cx="20" cy="18" r="13"/><path d="M15 11V25M25 11V25M15 18H25" fill="none" stroke="currentColor"/>',
        ports: [{ id: 'probe', x: 20, y: 40, dir: 'down', kind: 'signal' }],
        attributes: instance('sonde')
      },
      {
        id: 'gtb-compteur',
        version: 1,
        category: 'measure',
        name: 'symbols.meter',
        keywords: 'compteur énergie energie débitmètre debitmetre meter flow',
        viewBox: '0 0 40 40',
        width: 40,
        height: 40,
        body: '<rect x="0.75" y="6" width="38.5" height="28" rx="4"/><circle cx="20" cy="20" r="8" fill="none" stroke="currentColor"/><path d="M20 20 25 15" fill="none" stroke="currentColor"/>',
        ports: [
          { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
          { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' }
        ],
        attributes: instance('compteur')
      }
    ]
  }
]
