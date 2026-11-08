import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0))

describe('se-spin-input', () => {
  beforeAll(async () => {
    globalThis.svgEditor = {
      configObj: {
        curConfig: {
          imgPath: ''
        }
      }
    }
    await import('../../src/editor/components/seSpinInput.js')
  })

  beforeEach(() => {
    document.body.textContent = ''
  })

  const createSpinInput = async (attrs = {}) => {
    const spin = document.createElement('se-spin-input')
    Object.entries(attrs).forEach(([name, value]) => {
      spin.setAttribute(name, value)
    })
    document.body.append(spin)
    await nextFrame()
    await nextFrame()
    return spin
  }

  const getTextInput = spin => {
    return spin.shadowRoot
      .querySelector('elix-number-spin-box')
      .shadowRoot
      .getElementById('input')
  }

  it('selects the current value on focus', async () => {
    const spin = await createSpinInput({ value: '123' })
    const input = getTextInput(spin)
    const select = vi.spyOn(input, 'select')

    input.dispatchEvent(new FocusEvent('focus'))

    expect(select).toHaveBeenCalledOnce()
  })

  it('commits typed values only on Enter', async () => {
    const spin = await createSpinInput({ value: '10', min: '0', max: '100' })
    const input = getTextInput(spin)
    const changes = []
    spin.addEventListener('change', () => changes.push(spin.value))

    input.dispatchEvent(new FocusEvent('focus'))
    input.value = '25'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))

    expect(changes).toEqual([])

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(changes).toEqual(['25'])
    expect(spin.value).toBe('25')
  })

  it('reverts invalid typed values on blur', async () => {
    const spin = await createSpinInput({ value: '10', min: '0', max: '100' })
    const input = getTextInput(spin)
    const changes = []
    spin.addEventListener('change', () => changes.push(spin.value))

    input.dispatchEvent(new FocusEvent('focus'))
    input.value = 'abc'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur'))

    expect(changes).toEqual([])
    expect(spin.value).toBe('10')
  })

  it('propagates spin button changes immediately', async () => {
    const spin = await createSpinInput({ value: '10', min: '0', max: '100', step: '5' })
    const elixInput = spin.shadowRoot.querySelector('elix-number-spin-box')
    const changes = []
    spin.addEventListener('change', () => changes.push(spin.value))

    elixInput.value = '15'
    elixInput.dispatchEvent(new CustomEvent('change', { bubbles: true }))

    expect(changes).toEqual(['15'])
    expect(spin.value).toBe('15')
  })

  it('propagates a spin button change after manual editing has started', async () => {
    const spin = await createSpinInput({ value: '10', min: '0', max: '100', step: '5' })
    const elixInput = spin.shadowRoot.querySelector('elix-number-spin-box')
    const input = getTextInput(spin)
    const upButton = elixInput.shadowRoot.getElementById('upButton')
    const changes = []
    spin.addEventListener('change', () => changes.push(spin.value))

    input.dispatchEvent(new FocusEvent('focus'))
    input.value = '12'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))

    // Let the wrapper observe the button press, but keep this unit test
    // independent from Elix's internal stepping implementation.
    elixInput.shadowRoot.addEventListener('mousedown', (e) => {
      e.stopImmediatePropagation()
    }, { capture: true, once: true })
    upButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    elixInput.value = '17'
    elixInput.dispatchEvent(new CustomEvent('change', { bubbles: true }))

    expect(changes).toEqual(['17'])
    expect(spin.value).toBe('17')
  })

  it('keeps manual edit handlers when Elix replaces its internal input', async () => {
    const spin = await createSpinInput({ value: '10', min: '0', max: '100' })
    const input = getTextInput(spin)
    const replacement = input.cloneNode()
    const changes = []
    spin.addEventListener('change', () => changes.push(spin.value))
    input.replaceWith(replacement)

    replacement.dispatchEvent(new FocusEvent('focus'))
    replacement.value = '25'
    replacement.dispatchEvent(new InputEvent('input', { bubbles: true }))
    replacement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(changes).toEqual(['25'])
    expect(spin.value).toBe('25')
  })

  describe('expressions and mixed values (M4)', () => {
    const type = (spin, text) => {
      const input = getTextInput(spin)
      input.dispatchEvent(new FocusEvent('focus'))
      input.value = text
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }

    it('applies an expression to the shown value', async () => {
      const spin = await createSpinInput({ value: '10', min: '0', max: '100' })
      const changes = []
      spin.addEventListener('change', () => changes.push(spin.value))
      type(spin, '+5')
      type(spin, '*2')
      type(spin, '(1+2)*3')
      expect(changes).toEqual(['15', '30', '9'])
    })

    it('applies an expression to the exact value behind a rounded one', async () => {
      const spin = await createSpinInput({ value: '33.33' })
      spin.preciseValue = 100 / 3
      const changes = []
      spin.addEventListener('change', () => changes.push(spin.value))
      type(spin, '*3')
      expect(changes).toEqual(['100'])
      // A new value drops the exact one.
      spin.value = '5'
      expect(spin.preciseValue).toBeUndefined()
    })

    it('reverts an expression whose result is out of bounds', async () => {
      const spin = await createSpinInput({ value: '60', min: '0', max: '100' })
      const changes = []
      spin.addEventListener('change', () => changes.push(spin.value))
      type(spin, '*2')
      expect(changes).toEqual([])
      expect(spin.value).toBe('60')
    })

    it('shows "Mixed" as an empty field until a value is set', async () => {
      const spin = await createSpinInput({ value: '10' })
      spin.mixed = true
      expect(spin.mixed).toBe(true)
      expect(spin.value).toBe('')
      const { t } = await import('../../src/editor/locale.js')
      expect(getTextInput(spin).placeholder).toBe(t('properties.mixed') ?? '')
      expect(spin.classList.contains('mixed')).toBe(true)
      spin.value = '4'
      expect(spin.mixed).toBe(false)
      expect(spin.classList.contains('mixed')).toBe(false)
    })

    it('sends an expression typed in a mixed field as a change of each value', async () => {
      const spin = await createSpinInput({ min: '0', max: '100' })
      spin.mixed = true
      const details = []
      spin.addEventListener('change', (e) => details.push(e.detail))
      type(spin, '+10')
      type(spin, 'mixed*2')
      expect(details.map((d) => [d.relative(5), d.relative(95)])).toEqual([[15, 100], [10, 100]])
      // The field still stands for different values.
      expect(spin.mixed).toBe(true)
      expect(spin.value).toBe('')
    })

    it('marks a number typed in a mixed field, to be given to every element', async () => {
      const spin = await createSpinInput({ min: '0', max: '100' })
      spin.mixed = true
      const details = []
      spin.addEventListener('change', (e) => details.push([spin.value, e.detail]))
      type(spin, '7')
      expect(details).toEqual([['7', { wasMixed: true }]])
      expect(spin.mixed).toBe(false)
    })

    it('turns the arrows of a mixed field into a change of each value', async () => {
      const spin = await createSpinInput({ min: '0', max: '100', step: '5' })
      spin.mixed = true
      const details = []
      spin.addEventListener('change', (e) => details.push(e.detail))
      const elixInput = spin.shadowRoot.querySelector('elix-number-spin-box')
      elixInput.stepUp()
      elixInput.stepDown()
      expect(details.map((d) => d.relative(10))).toEqual([15, 5])
      expect(spin.value).toBe('')
    })
  })
})
