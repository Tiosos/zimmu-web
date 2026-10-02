import type { Scene } from './types'
import { resolvePlacement } from './resolvePlacement'
import { reconcileJoints } from './reconcileJoints'
import { regenerateComponents } from './regenerateComponents'
import { regenerateDrawers } from './regenerateDrawers'
import { regenerateFaceFrames } from './regenerateFaceFrames'
import { reconcileCatalogue } from './catalogue'

// The one place a scene mutation becomes geometry. Five stages, and the order is fixed because
// the dependencies run one way. The face frame leads the generators: it reads nothing any of them
// emit — its inputs are the section tree, the cabinet's front rectangle, the frame parameters and
// the materials. Drawers follow for the same reason: a drawer reads nothing a carcase emits — its
// inputs are the section tree, its own parameters and the materials — while the carcase's slide
// machining is a figure about the box that fills the opening, so a pass run the other way round
// would machine the cabinet against a box it had not built yet. Carcases then emit their parts and
// component-owned cuts, and reconcileJoints derives joint cuts and seats from scene.joints last:
// reversed, joints would be derived against parts that do not exist yet.
// Placement leads, and it has to. regenerateDrawers and regenerateComponents genuinely do not read a
// component's position — they write part positions *local* to the component — but reconcileJoints
// does, transitively: deriveJoint resolves each part's world matrix through its ancestors
// (`resolveWorldMatrix(housed, byId)` in geom/dado.ts), so a joint derived before its cabinet has
// moved is derived against the wrong world placement. Running placement last leaves the pass
// non-idempotent — the second call re-derives joint cuts the first got wrong — which is how this was
// caught. A grep for `.position` does not show it; the dependency is through the matrix.
export function applyPipeline(scene: Scene): Scene {
  const catalogued = { ...scene, components: scene.components.map((component) =>
    component.kind === 'carcase' ? reconcileCatalogue(component, scene.cabinetRules) : component) }
  return reconcileJoints(
    regenerateComponents(regenerateDrawers(regenerateFaceFrames(resolvePlacement(catalogued)))),
  )
}

