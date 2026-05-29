import { describe, expect, it } from 'vitest'
import { initOCCT, makeBox } from './occt'

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

  it.skip('buildPart: board produces mesh data (browser-only)', () => {
    // Full integration verified manually: pnpm dev → add a board → geometry renders
    // Playwright E2E arrives in weekend 11.
  })
})
