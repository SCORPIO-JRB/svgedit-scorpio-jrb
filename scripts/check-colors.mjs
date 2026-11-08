#!/usr/bin/env node
/**
 * Lot V1 acceptance check: no colour is written in the editor shell outside
 * the token file (plan v2, section 6). Every stylesheet, template and
 * component reads the --se-* custom properties of src/editor/tokens.css.
 *
 * Scanned: src/editor/**\/*.{css,html,js}. A colour is a hexadecimal value, an
 * rgb()/rgba()/hsl()/hsla() function or a CSS colour name. Comments are
 * ignored.
 *
 * Exempt, each for a stated reason: the token file itself, the translations,
 * the icons and fonts, and the files whose colours are document data rather
 * than interface (the default paint of a new shape, the palette, the canvas
 * backgrounds offered in the preferences). A new exemption needs a reason
 * here, in review.
 *
 * Usage: node scripts/check-colors.mjs [--list]
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const scanned = join(root, 'src/editor')

const EXEMPT_DIRS = {
  'src/editor/locale': 'translations',
  'src/editor/images': 'icon files, drawn in currentColor',
  'src/editor/fonts': 'font files',
  'src/editor/tests': 'test harness pages',
  'src/editor/extensions/ext-shapes/shapelib': 'shape library data',
  // The jPicker and jGraduate plug-ins compute colours of the colour being
  // picked (gradient stops, text over the chosen colour). Their chrome is
  // styled by seColorPicker.js on the tokens; se-color-field replaces them in V3.
  'src/editor/components/jgraduate': 'colours of the colour being picked'
}

const EXEMPT_FILES = {
  'src/editor/tokens.css': 'the token file',
  'src/editor/ConfigObj.js': 'default paint and grid colour of the document',
  'src/editor/components/sePalette.js': 'palette of document colours',
  'src/editor/components/PaintBox.js': 'swatch of the document paint',
  'src/editor/dialogs/editorPreferencesDialog.js': 'canvas backgrounds offered to the user',
  'src/editor/extensions/ext-eyedropper/ext-eyedropper.js': 'default paint copied by the eyedropper'
}

const NAMED = [
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
  'gray', 'grey', 'silver', 'lightgray', 'lightgrey', 'darkgray', 'darkgrey',
  'navy', 'teal', 'maroon', 'olive', 'lime', 'aqua', 'fuchsia', 'brown', 'gold'
]

const PATTERNS = [
  // #rgb, #rgba, #rrggbb, #rrggbbaa; not an HTML entity (&#8212;), not an id
  // that merely starts with hex letters (#add_subpath).
  /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g,
  /\b(?:rgba?|hsla?)\(/g,
  // A colour name as a CSS value or as a JavaScript string.
  new RegExp(`(?::\\s*|['"\`])(?:${NAMED.join('|')})\\b(?![-\\w])`, 'g')
]

const stripComments = (text, ext) => {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  if (ext === 'html') out = out.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
  if (ext === 'js') out = out.replace(/(^|[\s;{}(),])\/\/.*$/gm, (m, lead) => lead + ' '.repeat(m.length - lead.length))
  // Attribute values of form fields are data (the default grid colour).
  if (ext === 'html') out = out.replace(/\svalue="[^"]*"/g, (m) => ' '.repeat(m.length))
  return out
}

const walk = async (dir) => {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const rel = relative(root, path).split(sep).join('/')
    if (entry.isDirectory()) {
      if (!EXEMPT_DIRS[rel]) found.push(...await walk(path))
    } else if (/\.(css|html|js)$/.test(entry.name) && !EXEMPT_FILES[rel]) {
      found.push(path)
    }
  }
  return found
}

const problems = []
for (const file of await walk(scanned)) {
  const ext = file.split('.').pop()
  const text = stripComments(await readFile(file, 'utf8'), ext)
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0
      const match = pattern.exec(line)
      if (match) {
        problems.push(`${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 120)}`)
        break
      }
    }
  })
}

if (process.argv.includes('--list')) {
  console.info('Exempt:')
  for (const [path, reason] of Object.entries({ ...EXEMPT_DIRS, ...EXEMPT_FILES })) {
    console.info(`  ${path}: ${reason}`)
  }
}

if (problems.length) {
  console.error(`${problems.length} colour(s) written outside src/editor/tokens.css:`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('Use a --se-* token instead (src/editor/tokens.css).')
  process.exit(1)
}
console.info('No colour outside src/editor/tokens.css.')
