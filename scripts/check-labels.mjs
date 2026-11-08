#!/usr/bin/env node
/**
 * Lot V1 acceptance check: no visible label of the editor is written outside
 * the translations (plan v2, section 5, "Libellés anglais écrits en dur").
 *
 * Scanned, in src/editor (templates and components):
 * - the text of HTML templates and their title, aria-label, placeholder, alt
 *   and label attributes, which must be empty, a translation key
 *   ("tools.undo", "layer_view:buttons.0.title") or a placeholder (#{...});
 * - in JavaScript, a string literal given to seAlert, seConfirm, toast,
 *   textContent, innerText, or set as title, aria-label or placeholder.
 *
 * Exempt, each for a stated reason, below. A new exemption needs a reason, in
 * review.
 *
 * Usage: node scripts/check-labels.mjs
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const root = process.cwd()

const EXEMPT_DIRS = {
  'src/editor/locale': 'the translations themselves',
  'src/editor/tests': 'test harness pages',
  'src/editor/images': 'icons',
  'src/editor/fonts': 'fonts',
  'src/editor/components/jgraduate': 'colour picker plug-ins, replaced by se-color-field in V3',
  'src/editor/extensions/ext-helloworld': 'sample extension, not loaded by default'
}
const EXEMPT_FILES = {
  'src/editor/index.html': 'host page',
  'src/editor/iife-index.html': 'host page',
  'src/editor/xdomain-index.html': 'host page',
  'src/editor/browser-not-supported.html': 'shown before the editor and its translations load',
  'src/editor/browser-not-supported.js': 'shown before the editor and its translations load'
}
// Texts that are not labels: names of languages written in their own
// language, the default name of a new document and of its first layer.
const ALLOWED_TEXT = [
  /^(العربية|Čeština|Deutsch|English|Español|فارسی|Français|Frysk|हिन्दी, हिंदी|Italiano|日本語|Nederlands|Polski|Português \(BR\)|Română|Русский|Slovenčina|Slovenščina|Svenska|Türkçe|Українська|简体中文|繁體中文)$/,
  /^untitled\.svg$/,
  // The product name in the main menu, until the SCorp-io top bar of V3.
  /^SVG-Edit$/,
  /^Layer 1$/
]

const isKey = (value) => /^[\w-]+(?::[\w.-]+|\.[\w.-]+)$/.test(value)
const isLabel = (value) => {
  const text = value.trim()
  if (!text || !/[A-Za-zÀ-ɏ]{2,}/.test(text)) return false
  if (text.includes('#{') || text.includes('${') || isKey(text)) return false
  return !ALLOWED_TEXT.some((re) => re.test(text))
}

const walk = async (dir) => {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const rel = relative(root, path).split(sep).join('/')
    if (entry.isDirectory()) {
      if (!EXEMPT_DIRS[rel]) found.push(...await walk(path))
    } else if (/\.(html|js)$/.test(entry.name) && !EXEMPT_FILES[rel]) {
      found.push(path)
    }
  }
  return found
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

const checkHtml = (text, report) => {
  const markup = text
    .replace(/<style>[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
  for (const match of markup.matchAll(/>([^<>]+)</g)) {
    if (isLabel(match[1])) report(lineOf(markup, match.index), match[1].trim())
  }
  for (const match of markup.matchAll(/\s(title|aria-label|placeholder|alt|label)="([^"]*)"/g)) {
    if (isLabel(match[2])) report(lineOf(markup, match.index), `${match[1]}="${match[2]}"`)
  }
}

const JS_SINKS = [
  /\b(?:seAlert|seConfirm|toast)\(\s*(['"`])((?:(?!\1).)*)\1/g,
  /\.(?:textContent|innerText)\s*=\s*(['"`])((?:(?!\1).)*)\1/g,
  /setAttribute\(\s*'(?:title|aria-label|placeholder)'\s*,\s*(['"`])((?:(?!\1).)*)\1/g
]

const checkJs = (text, report) => {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, (m, lead) => lead + ' '.repeat(m.length - lead.length))
  for (const sink of JS_SINKS) {
    for (const match of code.matchAll(sink)) {
      if (isLabel(match[2].replace(/\$\{[^}]*\}/g, ''))) report(lineOf(code, match.index), match[0].trim())
    }
  }
  // HTML written in template literals of components.
  for (const literal of code.matchAll(/`([^`]*<[a-z][^`]*)`/g)) {
    const offset = lineOf(code, literal.index) - 1
    checkHtml(literal[1].replace(/\$\{[^}]*\}/g, '#{}'), (line, what) => report(offset + line, what))
  }
}

const problems = []
for (const file of await walk(join(root, 'src/editor'))) {
  const rel = relative(root, file)
  const text = await readFile(file, 'utf8')
  const report = (line, what) => problems.push(`${rel}:${line}: ${what.slice(0, 100)}`)
  if (file.endsWith('.html')) checkHtml(text, report)
  else checkJs(text, report)
}

if (problems.length) {
  console.error(`${problems.length} label(s) written outside the translations:`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('Add a key to src/editor/locale/lang.en.js and lang.fr.js, and show it through t().')
  process.exit(1)
}
console.info('No label outside the translations.')
