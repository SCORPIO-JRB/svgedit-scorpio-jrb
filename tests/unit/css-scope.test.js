/**
 * Confining the stylesheet of an imported file to its <symbol> (lot 4).
 */
import { scopeStyleSheet, unscopeSelector, keyframesNames, splitTopLevel } from '../../packages/svgcanvas/core/css-scope.js'

const scope = { id: 's1', tag: 'symbol' }

describe('scopeStyleSheet', () => {
  it('confines each selector to the symbol, and to the symbol itself when it names no element', () => {
    const { css, removed } = scopeStyleSheet('rect { fill: red } .a > g, #k:hover { stroke: blue }', scope)
    assert.equal(css, '#s1 rect { fill: red } #s1 .a > g, #s1.a > g, #s1 #k:hover { stroke: blue }')
    assert.deepEqual(removed, [])
  })

  it('turns the root of the file (svg, :root) into the symbol', () => {
    const { css } = scopeStyleSheet('svg.synoptique text { font-family: x } svg { fill: red } :root { --c: blue }', scope)
    assert.equal(css, 'symbol#s1.synoptique text { font-family: x } symbol#s1 { fill: red } symbol#s1 { --c: blue }')
  })

  it('keeps the declarations, comments and strings as written', () => {
    const source = '/* a { b } */ .t::before { content: "}{;" ; font-family: \'A, B\' }'
    assert.equal(scopeStyleSheet(source, scope).css, '/* a { b } */ #s1 .t::before, #s1.t::before { content: "}{;" ; font-family: \'A, B\' }')
  })

  it('confines the rules of @media and @supports, and keeps @font-face', () => {
    const { css } = scopeStyleSheet('@media print { .a { fill: red } } @font-face { font-family: X; src: url(#f) }', scope)
    assert.equal(css, '@media print { #s1 .a, #s1.a { fill: red } } @font-face { font-family: X; src: url(#f) }')
  })

  it('removes and lists what applies to the whole document', () => {
    const { css, removed } = scopeStyleSheet('@charset "utf-8"; @namespace x url(a); html, body, .a { fill: red } @page { margin: 0 }', scope)
    assert.equal(css.trim(), '#s1 .a, #s1.a { fill: red }')
    assert.deepEqual(removed, ['@namespace x url(a)', 'html', 'body', '@page'])
  })

  it('renames an animation that the drawing already has, with the declarations that use it', () => {
    const takenKeyframes = new Set(['flux'])
    const source = '.p { animation: flux 1s linear infinite } .q { animation-name: flux, pulse } ' +
      '@keyframes flux { to { opacity: 0 } } @keyframes pulse { to { opacity: 1 } } @media print { @keyframes flux { to { opacity: 1 } } }'
    const { css } = scopeStyleSheet(source, { ...scope, takenKeyframes })

    assert.deepEqual(keyframesNames(css), ['flux-2', 'pulse', 'flux-2'])
    assert.match(css, /animation: flux-2 1s linear infinite/)
    assert.match(css, /animation-name: flux-2, pulse/)
    assert.deepEqual([...takenKeyframes], ['flux', 'flux-2', 'pulse'])
  })

  it('gives back the selectors as the file wrote them', () => {
    assert.equal(unscopeSelector('#s1 .a > g', scope), '.a > g')
    assert.equal(unscopeSelector('#s1.a > g', scope), '.a > g')
    assert.equal(unscopeSelector('symbol#s1.synoptique text', scope), 'svg.synoptique text')
    assert.equal(unscopeSelector('.other', scope), '.other')
  })

  it('splits a list without cutting brackets, parentheses or strings', () => {
    assert.deepEqual(splitTopLevel('a[x="1,2"], b:not(.c, .d), \'e,f\'', ','), ['a[x="1,2"]', 'b:not(.c, .d)', '\'e,f\''])
  })
})
