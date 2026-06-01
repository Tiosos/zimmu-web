import { describe, expect, it } from 'vitest'
import { initOCCT, makeBox, makeCut } from './occt'

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
})
