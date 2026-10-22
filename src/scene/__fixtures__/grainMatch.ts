import { motionScene } from './motion'
import { applyPipeline } from '../pipeline'
import { defaultProject } from '../projectStructure'
import { defaultGrainMatchDraft, grainFronts } from '../grainMatching'
import { defaultInterior } from '../sectionInterior'
import type { CarcaseComponent } from '../types'
export function grainFixture(kind: 'pair' | 'stack' | 'mixed' = 'pair') {
  let scene = motionScene('pair')
  const c = scene.components[0] as CarcaseComponent
  c.params.baseMode = 'none'
  if (kind !== 'pair')
    c.params.section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'horizontal',
        division: 'none',
        children: [
          {
            id: 'lower',
            size: { kind: 'equal' },
            content: { kind: 'leaf' },
            front: { kind: 'drawer-front' },
            interior: defaultInterior(0),
          },
          {
            id: 'upper',
            size: { kind: 'equal' },
            content: { kind: 'leaf' },
            front:
              kind === 'stack'
                ? { kind: 'drawer-front' }
                : { kind: 'door', leaves: 1, hinge: 'left' },
            interior: defaultInterior(0),
          },
        ],
      },
    }
  scene = applyPipeline(scene)
  const fronts = grainFronts(scene),
    material = fronts[0].part.material
  scene.materials[material] = {
    ...scene.materials[material],
    hasGrain: true,
    sheet: { length: 2440, width: 1220 },
  }
  const project = defaultProject(scene, 'Matching'),
    draft = {
      ...defaultGrainMatchDraft(),
      memberIds: fronts.map((t) => t.id),
      referenceId: fronts[0].id,
    }
  return { scene, project, draft, fronts, material }
}
