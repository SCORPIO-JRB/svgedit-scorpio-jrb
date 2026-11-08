import { describe, expect, it } from 'vitest'
import { collectDocument, diffDocuments, summarize } from '../output/fidelity-diff.mjs'

const NS = 'xmlns="http://www.w3.org/2000/svg"'
const diff = (before, after) => diffDocuments(collectDocument(before), collectDocument(after))
const kinds = (findings) => findings.map((f) => f.kind)

describe('fidelity report: a file against its export', () => {
  it('finds nothing when the export is the file', () => {
    const svg = `<svg ${NS} width="10" height="10"><g class="layer"><title>L</title><rect id="a" width="1" height="1"/></g></svg>`
    expect(diff(svg, svg)).toEqual([])
  })

  it('tells a rewritten numeric data-* from a lost one', () => {
    const before = `<svg ${NS}><g class="layer"><rect id="p" data-point="007" data-tag="P-101" data-unit="degC"/></g></svg>`
    const after = `<svg ${NS}><g class="layer"><rect id="p" data-point="7" data-tag="P-101"/></g></svg>`
    const found = diff(before, after)
    expect(kinds(found)).toEqual(['data-rounded', 'data-lost'])
    expect(found[0].detail).toBe('data-point="007" → "7"')
  })

  it('pairs elements by id, then by order, and reports a renamed id', () => {
    const before = `<svg ${NS}><g class="layer"><rect id="d"/><rect id="d" x="2"/></g></svg>`
    const after = `<svg ${NS}><g class="layer"><rect id="d"/><rect id="svg_1" x="2"/></g></svg>`
    expect(kinds(diff(before, after))).toEqual(['id-lost'])
  })

  it('sorts removed elements and attributes by kind', () => {
    const before = `<svg ${NS} xmlns:ink="urn:ink" viewBox="-5 0 10 10"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse"><stop offset="0"/></linearGradient></defs>` +
      '<g class="layer"><circle id="c" r="1" stroke="none" ink:label="x" style="animation: a 1s"><animate id="an" attributeName="r" to="2" dur="1s"/></circle></g></svg>'
    const after = `<svg ${NS}><g class="layer"><circle id="c" r="1"/></g></svg>`
    expect(kinds(diff(before, after)).sort()).toEqual([
      'default-omitted', 'definition-removed', 'definition-removed', 'definition-removed', 'foreign-namespace',
      'root-changed', 'smil-removed', 'style-removed'
    ].sort())
  })

  it('tells a default value left out without effect from one whose removal changes the drawing', () => {
    const shapes = (sw, rx, op) => '<style>/* trait */ @media print { .fin { stroke-width: 1 } } .epais { stroke-width: 6px }</style><g class="layer">' +
      `<g id="g1" stroke-width="5"><rect id="a"${sw}/></g>` +
      `<g id="g2" class="epais"><rect id="b"${sw}/></g>` +
      `<g id="g3" style="stroke-width: 5"><rect id="c"${sw}/></g>` +
      `<g id="g4" stroke-width="1px"><rect id="d"${sw}${op}/></g>` +
      `<rect id="e"${rx} ry="10"/><rect id="f"${rx}/><ellipse id="h"${rx} ry="4"/>` +
      `<g id="g5" stroke-width="5"><use href="#i"/></g><rect id="i"${sw}/></g>`
    const before = `<svg ${NS}>${shapes(' stroke-width="1"', ' rx="0"', ' opacity="1"')}</svg>`
    const after = `<svg ${NS}>${shapes('', '', '')}</svg>`
    const found = diff(before, after).map((f) => `${f.where} ${f.kind}`)
    expect(found).toEqual([
      'rect#a default-removed',
      'rect#b default-removed',
      'rect#c default-removed',
      'rect#d default-omitted',
      'rect#d default-omitted',
      'rect#e default-removed',
      'rect#f default-omitted',
      'ellipse#h default-removed',
      'rect#i default-removed'
    ])
  })

  it('reports a layer added for objects outside any layer', () => {
    const before = `<svg ${NS}><g class="layer"><title>L</title></g><rect id="r"/></svg>`
    const after = `<svg ${NS}><g class="layer"><title>L</title></g><g class="layer"><title>L2</title><rect id="r"/></g></svg>`
    expect(kinds(diff(before, after))).toContain('layer-added')
  })

  it('keeps notes apart from losses in the summary', () => {
    const before = `<svg ${NS}><g class="layer"><path id="p" d="M0 0L1 1" data-v="0.125"/></g></svg>`
    const after = `<svg ${NS}><g class="layer"><path id="p" d="m0,0l1,1" data-v="0.13"/></g></svg>`
    const rows = summarize(diff(before, after).map((f) => ({ file: 'f.svg', ...f })))
    expect(rows.map((r) => [r.kind, r.severity, r.count])).toEqual([
      ['data-rounded', 'perte', 1],
      ['path-rewritten', 'note', 1]
    ])
  })
})
