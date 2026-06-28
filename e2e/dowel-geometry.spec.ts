import { test, expect } from '@playwright/test'

// Verifies dowel cut *geometry* — not just that the build doesn't throw (that's
// geom-kernel.spec.ts). Boots OCCT in-page and measures the volume, centroid, and
// bounding box of a ⌀8×100 dowel with each cut type, then asserts each cut removed
// the right amount of material in the right place and orientation. This catches
// silent mis-placement (a cut that builds but lands wrong removes no / wrong
// volume, or shifts the centroid the wrong way) — the class of bug the OCCT
// matrix-mapping and azimuth math could regress into. Runs under Playwright (the
// only place the live opencascade.js kernel executes).

const OCCT_READY_TIMEOUT = 120_000

interface Measurement {
  volume: number
  centroid: [number, number, number]
  bboxMaxZ: number
}

test('dowel cuts remove the correct material in the correct place', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  const m = await page.evaluate(async () => {
    // @ts-expect-error dev-only source import served by Vite; occt is untyped here
    const occt = await import('/src/geom/occt.ts')
    const oc = await occt.initOCCT()

    const measure = (shape: unknown): Measurement => {
      const g = new oc.GProp_GProps_1()
      oc.BRepGProp.VolumeProperties_1(shape, g, false, false, false)
      const c = g.CentreOfMass()
      const centroid: [number, number, number] = [c.X(), c.Y(), c.Z()]
      const volume = g.Mass()
      g.delete()
      const box = new oc.Bnd_Box_1()
      oc.BRepBndLib.Add(shape, box, false)
      const bboxMaxZ = box.CornerMax().Z()
      box.delete()
      return { volume, centroid, bboxMaxZ }
    }

    const dowel = { diameter: 8, length: 100 }
    const id = (s: string) => ({ id: s, label: s })
    const build = (cuts: unknown[]) => occt.makeDowelShape(oc, { ...dowel, cuts })

    return {
      plain: measure(build([])),
      endCut: measure(build([{ kind: 'end', ...id('e'), end: '+Z', offset: 5, angle: 30, azimuth: 0 }])),
      notch: measure(build([{ kind: 'notch', ...id('n'), position: 50, width: 10, depth: 4, azimuth: 0 }])),
      axialBore: measure(build([{ kind: 'bore-axial', ...id('b'), end: '+Z', diameter: 4, depth: 20 }])),
      transverseBore: measure(
        build([{ kind: 'bore-transverse', ...id('t'), position: 50, azimuth: 0, diameter: 4, depth: 12 }]),
      ),
    }
  })

  // Plain ⌀8×100 cylinder: volume = π·4²·100, centroid on the axis at mid-length.
  const PLAIN_VOLUME = Math.PI * 16 * 100 // 5026.5
  expect(m.plain.volume).toBeCloseTo(PLAIN_VOLUME, 0)
  expect(m.plain.centroid[0]).toBeCloseTo(0, 1)
  expect(m.plain.centroid[1]).toBeCloseTo(0, 1)
  expect(m.plain.centroid[2]).toBeCloseTo(50, 1)
  expect(m.plain.bboxMaxZ).toBeCloseTo(100, 1)

  // End cut at the +Z end: shortens the dowel (bbox max Z drops) and pulls the
  // centroid toward −Z. Material is actually removed.
  expect(m.endCut.bboxMaxZ).toBeLessThan(99)
  expect(m.endCut.centroid[2]).toBeLessThan(49)
  expect(m.endCut.volume).toBeLessThan(PLAIN_VOLUME)

  // Notch (depth = radius ⇒ half-section) over width 10 removes exactly half the
  // ⌀8 cross-section × 10 = π·4²/2·10. azimuth 0 faces +X, so the centroid shifts
  // to −X while staying at mid-length.
  const NOTCH_REMOVED = ((Math.PI * 16) / 2) * 10 // 251.3
  expect(PLAIN_VOLUME - m.notch.volume).toBeCloseTo(NOTCH_REMOVED, 0)
  expect(m.notch.centroid[0]).toBeLessThan(-0.02)
  expect(m.notch.centroid[2]).toBeCloseTo(50, 1)

  // Axial bore ⌀4 × depth 20 from the +Z end removes π·2²·20 of an internal hole;
  // bbox is unchanged, centroid stays on-axis but shifts toward −Z.
  const BORE_REMOVED = Math.PI * 4 * 20 // 251.3
  expect(PLAIN_VOLUME - m.axialBore.volume).toBeCloseTo(BORE_REMOVED, 0)
  expect(m.axialBore.centroid[0]).toBeCloseTo(0, 1)
  expect(m.axialBore.centroid[1]).toBeCloseTo(0, 1)
  expect(m.axialBore.centroid[2]).toBeLessThan(49)
  expect(m.axialBore.bboxMaxZ).toBeCloseTo(100, 1)

  // Transverse through-bore at mid-length removes material symmetrically about the
  // axis, so the centroid stays centered while the volume drops.
  expect(m.transverseBore.volume).toBeLessThan(PLAIN_VOLUME)
  expect(m.transverseBore.centroid[0]).toBeCloseTo(0, 1)
  expect(m.transverseBore.centroid[2]).toBeCloseTo(50, 1)
})
