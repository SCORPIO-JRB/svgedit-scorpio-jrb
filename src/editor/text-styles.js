/**
 * Text styles of the SCorp-io synoptics (lot V4, N10): the typography of
 * the reference synoptic of the corpus (tests/fixtures/import/scorpio).
 * Colours of the document, not of the interface. A host gives its own list
 * with the `textStyles` option.
 * @module text-styles
 */

const DISPLAY = "'Space Grotesk', sans-serif"
const BODY = "'Roboto Flex', sans-serif"

/**
 * @typedef {object} TextStyle
 * @property {string} id
 * @property {string} label Translation key or text
 * @property {string} fontFamily
 * @property {number} fontSize In user units
 * @property {number} fontWeight
 * @property {string} fill A colour in hexadecimal
 */

/** @type {TextStyle[]} */
export const DEFAULT_TEXT_STYLES = [
  { id: 'page_title', label: 'textstyles.page_title', fontFamily: DISPLAY, fontSize: 34, fontWeight: 500, fill: '#CEB8FF' },
  { id: 'section_title', label: 'textstyles.section_title', fontFamily: DISPLAY, fontSize: 19, fontWeight: 500, fill: '#CEB8FF' },
  { id: 'card_title', label: 'textstyles.card_title', fontFamily: DISPLAY, fontSize: 17, fontWeight: 500, fill: '#CEB8FF' },
  { id: 'subtitle', label: 'textstyles.subtitle', fontFamily: BODY, fontSize: 16, fontWeight: 400, fill: '#9B92AA' },
  { id: 'equipment', label: 'textstyles.equipment', fontFamily: BODY, fontSize: 17, fontWeight: 400, fill: '#C9C5D1' },
  { id: 'label', label: 'textstyles.label', fontFamily: BODY, fontSize: 15, fontWeight: 400, fill: '#9B92AA' },
  { id: 'small_label', label: 'textstyles.small_label', fontFamily: BODY, fontSize: 13, fontWeight: 400, fill: '#9B92AA' },
  { id: 'key_value', label: 'textstyles.key_value', fontFamily: BODY, fontSize: 34, fontWeight: 500, fill: '#EEECF1' },
  { id: 'summary_value', label: 'textstyles.summary_value', fontFamily: BODY, fontSize: 30, fontWeight: 500, fill: '#EEECF1' },
  { id: 'value', label: 'textstyles.value', fontFamily: BODY, fontSize: 20, fontWeight: 400, fill: '#C9C5D1' },
  { id: 'detail_value', label: 'textstyles.detail_value', fontFamily: BODY, fontSize: 14, fontWeight: 400, fill: '#C9C5D1' }
]
