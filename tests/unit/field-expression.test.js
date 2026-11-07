import { describe, expect, it } from 'vitest'
import { isPlainNumber, parseFieldExpression, roundResult } from '../../src/editor/components/fieldExpression.js'

// M4: arithmetic typed in a numeric field of the panel.

const words = ['Mixte', 'Mixed']
const read = (text, current) => {
  const expression = parseFieldExpression(text, { words })
  return expression && { relative: expression.relative, value: expression.evaluate(current) }
}

describe('Field expressions (M4)', () => {
  it('keeps plain numbers as typed, a leading plus excepted', () => {
    expect(isPlainNumber('12.50')).toBe(true)
    expect(isPlainNumber(' -3 ')).toBe(true)
    expect(isPlainNumber('.5')).toBe(true)
    expect(isPlainNumber('1e3')).toBe(true)
    expect(isPlainNumber('+10')).toBe(false)
    expect(isPlainNumber('1,5')).toBe(false)
    expect(isPlainNumber('')).toBe(false)
  })

  it('computes an expression with the usual precedence and parentheses', () => {
    expect(read('100+20', 7)).toEqual({ relative: false, value: 120 })
    expect(read('10+5*2', 7).value).toBe(20)
    expect(read('(10+5)*2', 7).value).toBe(30)
    expect(read('-10', 7)).toEqual({ relative: false, value: -10 })
    expect(read('2×3', 0).value).toBe(6)
    expect(read('9÷3', 0).value).toBe(3)
  })

  it('reads a comma as a decimal point and removes floating point noise', () => {
    expect(read('1,5', 0).value).toBe(1.5)
    expect(read('0.1+0.2', 0).value).toBe(0.3)
    expect(roundResult(1 / 3)).toBe(0.333333333333)
  })

  it('applies an expression starting with +, * or / to the shown value', () => {
    expect(read('+10', 50)).toEqual({ relative: true, value: 60 })
    expect(read('*2', 50)).toEqual({ relative: true, value: 100 })
    expect(read('/4', 50)).toEqual({ relative: true, value: 12.5 })
    expect(read('+-10', 50).value).toBe(40)
  })

  it('reads the word Mixed, in any case or language given, as the value', () => {
    expect(read('Mixed-10', 50)).toEqual({ relative: true, value: 40 })
    expect(read('mixte*3', 2).value).toBe(6)
    expect(read('(MIXED+2)/2', 8).value).toBe(5)
  })

  it('rejects what is not an expression, and gives NaN for a division by zero', () => {
    expect(read('abc', 0)).toBeNull()
    expect(read('', 0)).toBeNull()
    expect(read('+', 0)).toBeNull()
    expect(read('3(2)', 0)).toBeNull()
    expect(read('(1+2', 0)).toBeNull()
    expect(read('10/0', 0).value).toBeNaN()
  })
})
