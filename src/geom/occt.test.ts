import { describe, expect, it } from 'vitest'
import {
  initOCCT,
  makeBox,
  makeCut,
  makeShape,
  makeCylinder,
  makeDowelShape,
  stepVector,
} from './occt'
import { faceAxes } from '../scene/snapMath'
import type { Face } from '../scene/types'

// Smoke test for the kernel seam. opencascade.js 1.x WASM expects a browser-like
// global, so the actual init calls are skipped in Node and will be exercised via
// Playwright in weekend 11. The type-only export check still guards against
// accidental rename of the public surface.
describe('geom/occt', () => {
  it.skip('initOCCT returns a non-null OC instance (browser-only)', async () => {
    const oc = await initOCCT()
    expect(oc).toBeTruthy()
  })

  it.skip('makeBox returns a TopoDS_Shape (browser-only)', async () => {
    const oc = await initOCCT()
    const shape = makeBox(oc, 10, 10, 10)
    expect(shape).toBeTruthy()
    shape.delete()
  })

  it('exports initOCCT and makeBox', () => {
    expect(typeof initOCCT).toBe('function')
    expect(typeof makeBox).toBe('function')
  })

  it('exports makeCut', () => {
    expect(typeof makeCut).toBe('function')
  })

  it('exports makeShape', () => {
    expect(typeof makeShape).toBe('function')
  })

  it('exports makeCylinder', () => {
    expect(typeof makeCylinder).toBe('function')
  })

  it.skip('makeCylinder returns a TopoDS_Shape (browser-only)', async () => {
    const oc = await initOCCT()
    const shape = makeCylinder(oc, 4, 100)
    expect(shape).toBeTruthy()
    shape.delete()
  })

  it.skip('makeCut: board with one cut produces fewer triangles than bare board (browser-only)', async () => {
    const oc = await initOCCT()
    const board = makeBox(oc, 200, 100, 25)
    const cut = makeCut(oc, board, { x: 90, y: 40, z: 15 }, { x: 20, y: 20, z: 10 })
    // Can't easily count triangles here — just verify shape is valid
    expect(cut).toBeTruthy()
    cut.delete()
  })

  it.skip('makeCut: non-intersecting tool returns valid shape (browser-only)', async () => {
    const oc = await initOCCT()
    const board = makeBox(oc, 200, 100, 25)
    // Cut placed completely outside the board
    const result = makeCut(oc, board, { x: 1000, y: 1000, z: 1000 }, { x: 10, y: 10, z: 10 })
    expect(result).toBeTruthy()
    result.delete()
  })

  it.skip('buildPart: board produces mesh data (browser-only)', () => {
    // Full integration verified manually: pnpm dev → add a board → geometry renders
    // Playwright E2E arrives in weekend 11.
  })

  it.skip('makeDowelShape applies an end cut without throwing (needs WASM)', async () => {
    const oc = await initOCCT()
    const shape = makeDowelShape(oc, {
      diameter: 8,
      length: 100,
      cuts: [
        { kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 },
      ],
    })
    expect(shape).toBeTruthy()
    shape.delete()
  })

  it.skip('makeDowelShape applies axial + transverse bores (needs WASM)', async () => {
    const oc = await initOCCT()
    const shape = makeDowelShape(oc, {
      diameter: 8,
      length: 100,
      cuts: [
        { kind: 'bore-axial', id: 'a', label: 'Bore 1', end: '+Z', diameter: 3, depth: 20 },
        {
          kind: 'bore-transverse',
          id: 'b',
          label: 'Bore 2',
          position: 50,
          azimuth: 0,
          diameter: 3,
          depth: 8,
        },
      ],
    })
    expect(shape).toBeTruthy()
    shape.delete()
  })

  it.skip('makeDowelShape applies a notch (needs WASM)', async () => {
    const oc = await initOCCT()
    const shape = makeDowelShape(oc, {
      diameter: 8,
      length: 100,
      cuts: [
        { kind: 'notch', id: 'n', label: 'Notch 1', position: 50, width: 20, depth: 4, azimuth: 0 },
      ],
    })
    expect(shape).toBeTruthy()
    shape.delete()
  })

  it.skip('writeStep: one board returns a STEP string (browser-only)', async () => {
    const oc = await initOCCT()
    const { writeStep } = await import('./occt')
    const text = writeStep(oc, [
      {
        kind: 'board',
        label: 'Rail',
        length: 200,
        width: 100,
        thickness: 25,
        cuts: [],
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
    ])
    // Unnamed-compound fallback: solids carry no TDataStd_Name, so the 'Rail'
    // label is not embedded — only assert the STEP envelope is present.
    expect(text).toContain('ISO-10303-21')
    expect(text).toContain('END-ISO-10303-21')
  })
})

// `HoleArrayCut.axis: 'U' | 'V'` is interpreted twice: `stepVector` here decides which way the
// kernel drills the row, and `faceAxes` in scene/snapMath.ts decides which way the shop drawing
// draws it. Nothing in the type system ties them together. If one ordering changes alone the
// drawing marches the row along the wrong axis while the kernel still drills it correctly — a
// wrong drawing reaching a fabricator, with nothing failing.
//
// The structural fix is one shared definition, not this test. It was not taken because snapMath
// imports THREE and this module runs in the geometry worker, so the import would pull Three.js
// into the worker bundle. Revisit if faceAxes ever moves somewhere THREE-free.
describe('stepVector agrees with faceAxes on every face', () => {
  const FACES: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']

  // Which axis a step vector actually moves along, read back from the vector rather than assumed.
  const steppedAxis = (v: { x: number; y: number; z: number }) => {
    const moved = (['x', 'y', 'z'] as const).filter((a) => v[a] !== 0)
    expect(moved).toHaveLength(1)
    return moved[0]
  }

  for (const face of FACES) {
    it(`marches U and V along faceAxes' u and v for ${face}`, () => {
      const { u, v } = faceAxes(face)
      expect(steppedAxis(stepVector(face, 'U', 32))).toBe(u)
      expect(steppedAxis(stepVector(face, 'V', 32))).toBe(v)
    })
  }

  it('never steps along the face normal', () => {
    for (const face of FACES) {
      const normal = faceAxes(face).depth
      for (const rowAxis of ['U', 'V'] as const) {
        expect(stepVector(face, rowAxis, 32)[normal], `${face} ${rowAxis}`).toBe(0)
      }
    }
  })
})
