/**
 * The corrections of the file rewrites listed in section 7 of the plan
 * "Interface et expérience (v2)", made in lot V6. Each one can be turned off
 * by the option `fidelity` of the canvas (`{ fidelity: { rawValues: false } }`):
 * the editor then rewrites the file as it did before.
 *
 * - `rawValues`: `data-*`, `id`, `class`, the SCorp-io binding (`scorp_*`,
 *   `instanceId`, `representationId`), `role` and `aria-*` are written as
 *   they are, never rounded (`data-point="007"` stayed `"7"`).
 * - `styleProperties`: the properties of a `style` attribute that have no
 *   attribute (`animation`, `transform-origin`...) stay in it; a click no
 *   longer removes the `style` of an object and of what it holds.
 * - `attributes`: `paint-order`, `vector-effect`, `pointer-events`,
 *   `mix-blend-mode`, `isolation`, `pathLength`, `dx` and `dy` of a text,
 *   `target` of a link are kept.
 * - `gradientUnits`: a gradient in `userSpaceOnUse` that several objects use
 *   keeps its units (it was converted after the first one, which changed the
 *   others).
 * - `layerOrder`: the objects outside any layer go into a layer at their
 *   place, not into a new layer at the end of the drawing.
 * - `emptyValues`: an empty attribute of another application
 *   (`rdf:about=""`) is written.
 * - `nestedSvg`: the group the editor puts around a nested `<svg>` of a file
 *   is left out on save while it carries nothing of its own (a marker that
 *   was never written kept it).
 * - `stableSave`: saving a saved file gives the same text: the attributes of
 *   the root keep their order (written backwards, they were reversed at each
 *   save), an empty `<defs>` leaves no blank line (there was one, at the
 *   first save only).
 * @module fidelity
 */

/** @type {string[]} */
export const FIDELITY_CORRECTIONS = ['rawValues', 'styleProperties', 'attributes', 'gradientUnits', 'layerOrder', 'emptyValues', 'nestedSvg', 'stableSave']

/**
 * @function module:fidelity.isFidelityOn
 * @param {object|undefined} config - The configuration of the canvas
 * @param {string} name - One of {@link FIDELITY_CORRECTIONS}
 * @returns {boolean} Whether that correction is on (it is, unless set to false)
 */
export const isFidelityOn = (config, name) => config?.fidelity?.[name] !== false

/**
 * Attributes written as they are when `rawValues` is on: they name, they do
 * not measure.
 * @function module:fidelity.isRawAttribute
 * @param {Attr} attr
 * @returns {boolean}
 */
export const isRawAttribute = ({ namespaceURI, localName }) => !namespaceURI && (
  localName === 'id' || localName === 'class' || localName === 'role' ||
  localName.startsWith('data-') || localName.startsWith('aria-') ||
  localName.startsWith('scorp_') || localName === 'instanceId' || localName === 'representationId'
)
