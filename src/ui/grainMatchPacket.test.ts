import { expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { grainFixture } from '../scene/__fixtures__/grainMatch'
import { acceptGrainMatch, previewGrainMatch } from '../scene/grainMatching'
import { buildProductionPacket } from './buildProductionPacket'
it('includes captured group sequence data in the production packet and its manifest', async () => {
  const f = grainFixture(),
    scene = acceptGrainMatch(
      f.scene,
      f.project,
      previewGrainMatch(f.scene, f.project, f.draft),
      'group',
    )!
  const bytes = await buildProductionPacket({
    scene,
    projectName: 'Grain job',
    hardwareLibrary: {},
    materialLibrary: {},
    capturedAt: new Date('2026-10-22T00:00:00Z'),
  })
  const files = unzipSync(bytes)
  expect(strFromU8(files['lists/grain-matching.csv'])).toContain('"group","Matched fronts","1","2"')
  expect(strFromU8(files['manifest.json'])).toContain('lists/grain-matching.csv')
})
