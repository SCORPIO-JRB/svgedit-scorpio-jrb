import {
  apply,
  axisScales,
  computeResizeScale,
  invert,
  multiply,
  rotate,
  rotateAbout,
  scale,
  shearFreeMatrix,
  singleTextPreview,
  textPreviewMatrix,
  translate
} from '../../packages/svgcanvas/core/multi-transform.js'

// M2: geometry of a transformation applied to the whole selection.

const close = (actual, expected, digits = 6) => {
  Object.keys(expected).forEach((key) => {
    expect(actual[key]).toBeCloseTo(expected[key], digits)
  })
}

describe('multi-transform geometry (M2)', () => {
  describe('computeResizeScale', () => {
    const box = { x: 100, y: 100, width: 220, height: 60 }

    it('keeps the opposite corner in place', () => {
      expect(computeResizeScale({ box, dir: 'se', dx: 220, dy: 60 }))
        .toEqual({ sx: 2, sy: 2, ox: 100, oy: 100 })
      expect(computeResizeScale({ box, dir: 'nw', dx: -220, dy: -60 }))
        .toEqual({ sx: 2, sy: 2, ox: 320, oy: 160 })
    })

    it('ignores the other axis on a side grip', () => {
      expect(computeResizeScale({ box, dir: 'e', dx: 110, dy: 999 }))
        .toEqual({ sx: 1.5, sy: 1, ox: 100, oy: 100 })
    })

    it('resizes from the center with Alt', () => {
      expect(computeResizeScale({ box, dir: 'e', dx: 55, dy: 0, alt: true }))
        .toEqual({ sx: 1.5, sy: 1, ox: 210, oy: 130 })
    })

    it('keeps the proportions with Shift', () => {
      const corner = computeResizeScale({ box, dir: 'se', dx: 110, dy: 200, shift: true })
      expect(corner.sx).toBe(1.5)
      expect(corner.sy).toBe(1.5)
      const side = computeResizeScale({ box, dir: 's', dx: 0, dy: 30, shift: true })
      expect(side.sx).toBe(1.5)
      expect(side.sy).toBe(1.5)
    })

    it('flips when the pointer crosses the opposite side', () => {
      const { sx, ox } = computeResizeScale({ box, dir: 'e', dx: -330, dy: 0 })
      expect(sx).toBe(-0.5)
      expect(ox).toBe(100)
    })
  })

  describe('matrices', () => {
    it('inverts and multiplies', () => {
      const m = multiply(translate(10, -4), rotate(33), scale(2, 0.5))
      close(multiply(m, invert(m)), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    })
  })

  describe('rotateAbout (M3)', () => {
    it('keeps the pivot in place and turns clockwise on screen', () => {
      const m = rotateAbout(90, { x: 210, y: 130 })
      close(apply(m, 210, 130), { x: 210, y: 130 })
      // The center of the left element of a row goes above the pivot.
      close(apply(m, 140, 130), { x: 210, y: 60 })
    })

    it('makes centers follow a scale by 2 then a rotation by 30 degrees', () => {
      const s2 = multiply(translate(100, 50), scale(2, 2), translate(-100, -50))
      const total = multiply(rotateAbout(30, { x: 300, y: 200 }), s2)
      const p = apply(total, 140, 130)
      // By hand: (140, 130) -> (180, 210) -> rotated by 30 degrees about (300, 200).
      const r = Math.PI / 6
      close(p, {
        x: 300 + Math.cos(r) * -120 - Math.sin(r) * 10,
        y: 200 + Math.sin(r) * -120 + Math.cos(r) * 10
      }, 9)
    })
  })

  describe('axisScales', () => {
    it('gives the length of each own axis and detects the shear', () => {
      const unrotated = axisScales(scale(2, 1), 0)
      expect(unrotated).toMatchObject({ ax: 2, ay: 1, det: 2, shear: false })
      const rotated = axisScales(scale(2, 1), 30)
      expect(rotated.ax).toBeCloseTo(Math.sqrt(3.25), 10)
      expect(rotated.ay).toBeCloseTo(Math.sqrt(1.75), 10)
      expect(rotated.shear).toBe(true)
      expect(axisScales(scale(2, 2), 30).shear).toBe(false)
    })
  })

  describe('shearFreeMatrix', () => {
    const center = { x: 440, y: 120 }
    const m = multiply(translate(100, 100), scale(2, 1), translate(-100, -100))

    it('moves the center as the matrix does and keeps the angle', () => {
      const fixed = shearFreeMatrix(m, 30, center)
      close(apply(fixed, center.x, center.y), apply(m, center.x, center.y))
      // Applied on top of the rotation, the result is a rotation and an
      // axis-aligned scale: no shear.
      const total = multiply(fixed, translate(center.x, center.y), rotate(30), translate(-center.x, -center.y))
      // total already holds the rotation: its own axes are the unit axes.
      expect(axisScales(total, 0).shear).toBe(false)
      const local = multiply(rotate(-30), { ...total, e: 0, f: 0 })
      close(local, { a: Math.sqrt(3.25), b: 0, c: 0, d: Math.sqrt(1.75) }, 9)
    })

    it('leaves a matrix that does not shear, or mirrors, to the usual rules', () => {
      expect(shearFreeMatrix(scale(2, 2), 30, center)).toBeNull()
      expect(shearFreeMatrix(scale(2, 1), 0, center)).toBeNull()
      expect(shearFreeMatrix(scale(-2, 1), 30, center)).toBeNull()
    })
  })

  describe('text preview', () => {
    const info = { angle: 0, visual: { x: 150, y: 50 } }

    it('scales uniformly by the smaller factor about the moved center', () => {
      const m = multiply(translate(100, 0), scale(3, 1.5), translate(-100, 0))
      const preview = textPreviewMatrix(m, info)
      close(preview, { a: 1.5, b: 0, c: 0, d: 1.5 })
      close(apply(preview, 150, 50), apply(m, 150, 50))
    })

    it('keeps a mirror of an unrotated text', () => {
      const preview = textPreviewMatrix(scale(-2, 2), info)
      expect(preview.a).toBeCloseTo(-2)
      expect(preview.d).toBeCloseTo(2)
    })

    it('matches the single text grip preview', () => {
      const box = { x: 100, y: 30, width: 100, height: 40 }
      const p = singleTextPreview(box, 2, 1, 100, 30)
      expect(p).toEqual({ origin: { x: 150, y: 50 }, sx: 1, sy: 1, target: { x: 200, y: 50 } })
    })
  })
})
