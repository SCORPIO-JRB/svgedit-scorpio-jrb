/**
 * Arithmetic typed in a numeric field of the panel.
 *
 * A field accepts a number, or an expression with + - * / and parentheses:
 * "100+20", "(10+5)*2". A comma is read as a decimal point. An expression
 * that starts with +, * or / is applied to the value the field shows: "+10"
 * adds 10, "*2" doubles, "/3" divides by three. A leading minus is a
 * negative number: "-10" gives -10.
 *
 * In a field that shows "Mixed" because the selected elements have different
 * values, such an expression is applied to each element's own value. The word
 * itself (in English or in the editor's language) may also be written:
 * "Mixed-10" takes 10 from each value.
 * @module fieldExpression
 * @license MIT
 */

const OPERATORS = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  '×': '*',
  x: '*',
  '/': '/',
  '÷': '/'
}

// Operators that, at the start of an expression, apply it to the shown value.
const RELATIVE_START = new Set(['+', '*', '/'])

/**
 * Splits a text into numbers, operators, parentheses and the current value.
 * @param {string} text
 * @param {string[]} words - Lower case words standing for the current value
 * @returns {Array<{type: string, value?: (number|string)}>|null} Null on an
 *   unknown character
 */
const tokenize = (text, words) => {
  const tokens = []
  let i = 0
  const lower = text.toLowerCase()
  while (i < text.length) {
    const char = text[i]
    if (/\s/.test(char)) {
      i++
      continue
    }
    const word = words.find((w) => w && lower.startsWith(w, i))
    if (word) {
      tokens.push({ type: 'current' })
      i += word.length
      continue
    }
    const number = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[-+]?\d+)?/i.exec(text.slice(i))
    if (number) {
      tokens.push({ type: 'number', value: Number(number[0].replace(',', '.')) })
      i += number[0].length
      continue
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: char })
      i++
      continue
    }
    const op = OPERATORS[lower[i]]
    if (op) {
      tokens.push({ type: 'op', value: op })
      i++
      continue
    }
    return null
  }
  return tokens
}

/**
 * Builds the evaluation of a token list, by recursive descent.
 * @param {Array<PlainObject>} tokens
 * @returns {((current: number) => number)|null} Null on a syntax error
 */
const compile = (tokens) => {
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (...ops) => peek()?.type === 'op' && ops.includes(peek().value)

  // factor := ('+' | '-') factor | number | current | '(' expr ')'
  const factor = () => {
    const token = peek()
    if (!token) { return null }
    if (isOp('+', '-')) {
      pos++
      const inner = factor()
      if (!inner) { return null }
      return token.value === '-' ? (c) => -inner(c) : inner
    }
    if (token.type === 'number') {
      pos++
      return () => token.value
    }
    if (token.type === 'current') {
      pos++
      return (c) => c
    }
    if (token.type === '(') {
      pos++
      const inner = expr()
      if (!inner || peek()?.type !== ')') { return null }
      pos++
      return inner
    }
    return null
  }

  // term := factor (('*' | '/') factor)*
  const term = () => {
    let left = factor()
    while (left && isOp('*', '/')) {
      const op = tokens[pos++].value
      const right = factor()
      if (!right) { return null }
      const l = left
      left = op === '*' ? (c) => l(c) * right(c) : (c) => l(c) / right(c)
    }
    return left
  }

  // expr := term (('+' | '-') term)*
  const expr = () => {
    let left = term()
    while (left && isOp('+', '-')) {
      const op = tokens[pos++].value
      const right = term()
      if (!right) { return null }
      const l = left
      left = op === '+' ? (c) => l(c) + right(c) : (c) => l(c) - right(c)
    }
    return left
  }

  const result = expr()
  return result && pos === tokens.length ? result : null
}

/**
 * Removes the noise of floating point arithmetic: 0.1 + 0.2 gives 0.3.
 * @param {number} value
 * @returns {number}
 */
export const roundResult = (value) => (Number.isFinite(value) ? Number(value.toPrecision(12)) : NaN)

/**
 * Checks whether a text is a plain number, which a field keeps as typed. A
 * leading plus is not: "+10" adds 10 to the shown value.
 * @param {string} text
 * @returns {boolean}
 */
export const isPlainNumber = (text) => /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(String(text).trim())

/**
 * Reads what was typed in a numeric field.
 * @param {string} text
 * @param {PlainObject} [options]
 * @param {string[]} [options.words] - Words standing for the current value,
 *   such as "Mixed" and its translation
 * @returns {{relative: boolean, evaluate: (current: number) => number}|null}
 *   Null when the text is not a valid expression. `relative` tells whether
 *   the result depends on the current value; `evaluate` returns NaN when the
 *   result is not a finite number (a division by zero).
 */
export const parseFieldExpression = (text, { words = [] } = {}) => {
  const lowerWords = words.filter(Boolean).map((w) => String(w).toLowerCase())
    // Longest first, so that a word is never cut by a shorter one.
    .sort((a, b) => b.length - a.length)
  const tokens = tokenize(String(text).trim(), lowerWords)
  if (!tokens?.length) { return null }
  const first = tokens[0]
  if (first.type === 'op' && RELATIVE_START.has(first.value)) {
    tokens.unshift({ type: 'current' })
  }
  const run = compile(tokens)
  if (!run) { return null }
  const relative = tokens.some((token) => token.type === 'current')
  return { relative, evaluate: (current) => roundResult(run(Number(current))) }
}
