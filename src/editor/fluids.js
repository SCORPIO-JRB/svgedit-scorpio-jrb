/**
 * Styles of the networks of a synoptic (lot V7; plan v2, section 2.11):
 * one per fluid, with its colour, width, dashes and arrow of direction.
 *
 * The colours of water are those of the reference synoptic of the corpus
 * (pipes in operation, hot and cold, supply and return), its classes those
 * of its pipes (`tuyau chaud depart`): the stylesheet of a synoptic that
 * animates them by class still finds them. The colours of air, gas, power
 * and signals are taken from the scales of the design system; like the
 * colour library, the list is to be confirmed by SCorp-io.
 *
 * A host gives its own with the `fluids` option (same shape). The names are
 * keys of the translations, or texts shown as is.
 * @module fluids
 */

/** @type {import('@svgedit/svgcanvas/core/connectors.js').Fluid[]} */
export const DEFAULT_FLUIDS = [
  { id: 'neutre', name: 'fluids.neutral', stroke: '#625A6E', width: 1.5, arrow: false, className: 'tuyau' },
  { id: 'chaud-depart', name: 'fluids.hot_supply', stroke: '#F08A62', width: 3, arrow: true, className: 'tuyau chaud depart' },
  { id: 'chaud-retour', name: 'fluids.hot_return', stroke: '#B5623F', width: 3, arrow: true, className: 'tuyau chaud retour' },
  { id: 'froid-depart', name: 'fluids.cold_supply', stroke: '#6E9CF5', width: 3, arrow: true, className: 'tuyau froid depart' },
  { id: 'froid-retour', name: 'fluids.cold_return', stroke: '#4A70BD', width: 3, arrow: true, className: 'tuyau froid retour' },
  { id: 'air-souffle', name: 'fluids.supply_air', stroke: '#A365FF', width: 2.5, arrow: true, className: 'gaine air souffle' },
  { id: 'air-repris', name: 'fluids.return_air', stroke: '#CEB8FF', width: 2.5, arrow: true, className: 'gaine air repris' },
  { id: 'air-neuf', name: 'fluids.fresh_air', stroke: '#74A0FF', width: 2.5, arrow: true, className: 'gaine air neuf' },
  { id: 'air-extrait', name: 'fluids.exhaust_air', stroke: '#8A8490', width: 2.5, arrow: true, className: 'gaine air extrait' },
  { id: 'gaz', name: 'fluids.gas', stroke: '#625A6E', width: 1.5, dash: '6 5', arrow: true, className: 'gaz' },
  { id: 'electrique', name: 'fluids.power', stroke: '#C9C5D1', width: 1.5, dash: '1 4', arrow: false, className: 'cable' },
  { id: 'signal', name: 'fluids.signal', stroke: '#9B92AA', width: 1, dash: '4 3', arrow: false, className: 'signal' }
]
