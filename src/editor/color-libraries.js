/**
 * Colour libraries of the colour window (Libraries tab).
 *
 * - "Synoptiques Scorp-io": the colours of the reference synoptic of the
 *   corpus (tests/fixtures/import/scorpio/synoptique-chaufferie.svg), named
 *   by their use. The GED holds no standard of the synoptics yet; this list
 *   is to be confirmed, like the text styles (lot V4).
 * - "Design system Scorp-io": the primitive scales of the design system
 *   (tokens --scorpio-color-*), whose names are those of the tokens.
 *
 * A host gives its own with the `colorLibraries` option. A name is a key of
 * the translations or a text shown as is; a colour of a scale may give a
 * `step` instead of a name, shown after the name of its group.
 * @module color-libraries
 */

/**
 * @typedef {object} ColorLibrary
 * @property {string} id
 * @property {string} name
 * @property {Array<{name: string, colors: Array<{value: string, name?: string, step?: string}>}>} groups
 */

/**
 * @param {string} name Key of the group
 * @param {Object<string, string>} steps Colour by step of the scale
 * @returns {{name: string, colors: Array<{value: string, step: string}>}}
 */
const scale = (name, steps) => ({
  name,
  colors: Object.entries(steps).map(([step, value]) => ({ step, value }))
})

/** @type {ColorLibrary[]} */
export const DEFAULT_COLOR_LIBRARIES = [
  {
    id: 'synoptique',
    name: 'color.lib_synoptique',
    groups: [
      {
        name: 'color.group_surfaces',
        colors: [
          { name: 'color.c_background', value: '#160F23' },
          { name: 'color.c_tile', value: '#1F1430' },
          { name: 'color.c_line', value: '#3D374C' },
          { name: 'color.c_page', value: '#0C0813' }
        ]
      },
      {
        name: 'color.group_text',
        colors: [
          { name: 'color.c_title', value: '#CEB8FF' },
          { name: 'color.c_measure', value: '#EEECF1' },
          { name: 'color.c_equipment', value: '#C9C5D1' },
          { name: 'color.c_label', value: '#9B92AA' },
          { name: 'color.c_muted', value: '#625A6E' }
        ]
      },
      {
        name: 'color.group_states',
        colors: [
          { name: 'color.c_running', value: '#4CC38A' },
          { name: 'color.c_fault', value: '#F43F5E' },
          { name: 'color.c_stopped', value: '#4F465F' }
        ]
      },
      {
        name: 'color.group_fluids',
        colors: [
          { name: 'color.c_hot_supply', value: '#F08A62' },
          { name: 'color.c_hot_return', value: '#B5623F' },
          { name: 'color.c_cold_supply', value: '#6E9CF5' },
          { name: 'color.c_cold_return', value: '#4A70BD' }
        ]
      }
    ]
  },
  {
    id: 'scorpio',
    name: 'color.lib_scorpio',
    groups: [
      scale('color.group_nuit', { 10: '#EEECF1', 20: '#C9C5D1', 30: '#9B92AA', 40: '#625A6E', 60: '#1F1430', 70: '#160F23', 80: '#0C0813' }),
      scale('color.group_lavande', { 10: '#FDFBFF', 20: '#F0E8FF', 30: '#DCCDFF', 40: '#CEB8FF', 60: '#8B6FD4', 70: '#524966', 80: '#3D374C' }),
      scale('color.group_creme', { 10: '#F5EFFF', 20: '#ECE3F7', 30: '#E8DFF7', 40: '#C4BFCC', 60: '#8A8490', 70: '#625F66', 80: '#49474C' }),
      scale('color.group_violet', { 50: '#F6F2FF', 100: '#EBE0FF', 200: '#DAC4FF', 300: '#C29BFF', 400: '#A365FF', 500: '#7D34FF', 600: '#6119D6', 700: '#441194', 800: '#2A0A57', 900: '#130428' }),
      scale('color.group_bleu', { 50: '#EDF3FF', 100: '#DBE7FF', 200: '#B0CAFF', 300: '#74A0FF', 400: '#4E8AFF', 500: '#347DFF', 600: '#1A5FDE', 700: '#12409E', 800: '#0B2660', 900: '#05122D' }),
      scale('color.group_rouge', { 50: '#FFECEF', 100: '#FFE0E6', 200: '#FFC2CE', 300: '#FF9CAF', 400: '#FF6C86', 450: '#F43F5E', 500: '#EC3354', 600: '#D51843', 700: '#A91036', 800: '#7E0F29', 900: '#510A1B' }),
      scale('color.group_neutral', { 50: '#EDEDEE', 100: '#DCDCDF', 200: '#BABABE', 300: '#97969C', 400: '#8A8989', 500: '#828186', 600: '#6F6D71', 700: '#4D4A4F', 800: '#2B282E', 900: '#0D0B0F' })
    ]
  }
]

// White, a primitive of its own in the design system, heads the neutrals.
DEFAULT_COLOR_LIBRARIES[1].groups[6].colors.unshift({ name: 'color.c_white', value: '#FFFFFF' })
