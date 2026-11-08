#!/usr/bin/env node
/**
 * Fidelity report: compares each SVG file with what the editor writes after
 * opening it, without any edit (import, then export).
 *
 *   node tests/output/fidelity.mjs --url=http://127.0.0.1:8000 \
 *     [--corpus=dir1,dir2] [--out=report.md] [--json=report.json]
 *
 * compare-output.mjs compares two builds with each other; this script
 * compares a file with its own export and sorts every difference by kind
 * (section 7 of the plan "Interface et expérience (v2)"). Without --corpus it
 * reads the SVG files of the repository, as compare-output.mjs does; give
 * --corpus to read real synoptics kept outside the repository. Set
 * PW_CHROMIUM_PATH to use a given Chromium binary. It never fails: it reports.
 */
import { chromium } from '@playwright/test'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { collectDocument, diffDocuments, KINDS, summarize } from './fidelity-diff.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=')
  return [key, rest.join('=')]
}))
const url = (args.url || 'http://127.0.0.1:8000').replace(/\/$/, '')
const root = resolve('.')
const SKIP = new Set(['node_modules', 'dist', '.git', 'images', 'test-results', 'coverage'])
const findSvgFiles = (dir) => readdirSync(dir).flatMap((name) => {
  if (SKIP.has(name) || name.startsWith('.')) { return [] }
  const path = join(dir, name)
  if (statSync(path).isDirectory()) { return findSvgFiles(path) }
  return name.endsWith('.svg') ? [path] : []
})
const corpus = args.corpus
  ? args.corpus.split(',').flatMap((dir) => findSvgFiles(resolve(dir)))
  : findSvgFiles(root)

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : {})
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(`${url}/index.html`)
await page.waitForFunction(() => window.svgEditor?.svgCanvas &&
  document.querySelector('se-storage-dialog')?.shadowRoot?.querySelector('#storage_ok'))
await page.evaluate(() => document.querySelector('se-storage-dialog').shadowRoot.querySelector('#storage_ok').click())
await page.waitForTimeout(300)

const findings = []
const files = []
for (const file of corpus) {
  const name = relative(root, file)
  const svg = readFileSync(file, 'utf8')
  const exported = await page.evaluate((s) => {
    try {
      const ok = window.svgEditor.svgCanvas.setSvgString(s)
      return ok === false ? null : window.svgEditor.svgCanvas.getSvgString()
    } catch (e) {
      return null
    }
  }, svg)
  if (exported === null) {
    files.push({ file: name, status: 'import refusé', count: 0 })
    continue
  }
  const [input, output] = [await page.evaluate(collectDocument, svg), await page.evaluate(collectDocument, exported)]
  if (input.error || output.error) {
    files.push({ file: name, status: `lecture impossible (${input.error || output.error})`, count: 0 })
    continue
  }
  const found = diffDocuments(input, output).map((f) => ({ file: name, ...f }))
  findings.push(...found)
  files.push({ file: name, status: found.length ? 'différences' : 'identique', count: found.filter((f) => KINDS[f.kind].severity !== 'note').length })
}
await browser.close()

const rows = summarize(findings)
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const md = [
  '# Rapport de fidélité : fichier contre export',
  '',
  `Éditeur : ${url}. ${files.length} fichiers lus, ${files.filter((f) => f.status === 'identique').length} sans aucune différence.`,
  '',
  '| Nature | Gravité | Occurrences | Fichiers | Exemple |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${cell(r.label)} | ${r.severity} | ${r.count} | ${r.files} | ${cell(`${r.examples[0].file} : ${r.examples[0].where}, ${r.examples[0].detail}`)} |`),
  '',
  '| Fichier | État | Pertes et changements |',
  '| --- | --- | --- |',
  ...files.map((f) => `| ${cell(f.file)} | ${f.status} | ${f.count} |`),
  ''
].join('\n')

if (args.out) { writeFileSync(args.out, md) }
if (args.json) { writeFileSync(args.json, JSON.stringify({ url, files, findings }, null, 2)) }
console.log(md)
