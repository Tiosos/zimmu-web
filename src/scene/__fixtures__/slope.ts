import { motionScene } from './motion'
import { applyPipeline } from '../pipeline'
import { defaultProject } from '../projectStructure'
import { defaultSlopeDraft } from '../slopedTop'
import { defaultInterior } from '../sectionInterior'
import type { CarcaseComponent } from '../types'
export function slopeFixture() {
  let scene = motionScene('pair')
  const cab = scene.components[0] as CarcaseComponent
  cab.params = {
    ...cab.params,
    width: 600,
    height: 800,
    depth: 500,
    hasTop: true,
    baseMode: 'none',
    backMode: 'applied',
    carcaseMaterial: 'Slope panel',
    backMaterial: 'Slope back',
    jointMethod: 'butt-screw',
    section: {
      id: 'root',
      size: { kind: 'equal' },
      content: { kind: 'leaf' },
      interior: defaultInterior(2, 1),
    },
  }
  scene.materials['Slope panel'] = {
    thickness: 18,
    hasGrain: true,
    sheet: { length: 2440, width: 1220 },
  }
  scene.materials['Slope back'] = {
    thickness: 6,
    hasGrain: false,
    sheet: { length: 2440, width: 1220 },
  }
  scene = applyPipeline(scene)
  const project = defaultProject(scene, 'Slope'),
    draft = defaultSlopeDraft(scene, cab.id)
  draft.enabled = true
  draft.first = 800
  draft.second = 600
  return { scene, project, draft, cabinetId: cab.id }
}
