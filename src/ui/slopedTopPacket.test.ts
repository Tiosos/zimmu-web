import { expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { slopeFixture } from '../scene/__fixtures__/slope'
import { previewSlope, acceptSlope } from '../scene/slopedTop'
import { buildProductionPacket } from './buildProductionPacket'
it('includes the captured slope schedule and manifest entry in production packets', async () => {
  const f = slopeFixture(),
    scene = acceptSlope(f.scene, f.project, previewSlope(f.scene, f.project, f.draft))!
  const zip = unzipSync(
    await buildProductionPacket({
      scene,
      projectName: 'Slope',
      hardwareLibrary: {},
      materialLibrary: {},
      capturedAt: new Date('2026-10-23T00:00:00Z'),
    }),
  )
  expect(strFromU8(zip['lists/sloped-panels.csv'])).toContain('Opposite edge')
  expect(strFromU8(zip['manifest.json'])).toContain('lists/sloped-panels.csv')
})
