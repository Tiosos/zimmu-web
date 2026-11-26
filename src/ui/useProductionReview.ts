import { useMemo } from 'react'
import type { MaterialDef, Scene } from '../scene/types'
import { buildShelfReadiness } from '../scene/shelfReadiness'
import { buildProductionReadiness } from '../scene/productionReadiness'
import { manufacturingParts } from '../scene/manufacturingPart'
import { manufacturingChecks } from '../scene/manufacturingChecks'
import { effectiveMaterialsOf } from '../scene/effectiveMaterials'
import { buildProductionReview } from '../scene/productionReview'
import { reconcileMachiningScene } from './machiningReconciliation'
import { reconcileScene } from './outputReconciliation'

/**
 * One derivation behind both the full Manufacturing Readiness dialog and the Manufacturing
 * perspective summary. The two surfaces must never classify a finding differently: the readiness
 * report, the production packet and this dashboard all read the same review engine.
 */
export function useProductionReview(scene: Scene, materialLibrary: Record<string, MaterialDef>) {
  const shelves = useMemo(() => buildShelfReadiness(scene), [scene])
  const production = useMemo(() => buildProductionReadiness(scene), [scene])
  const manufacturing = useMemo(
    () =>
      manufacturingChecks(
        manufacturingParts(
          scene.parts,
          effectiveMaterialsOf(materialLibrary, scene.materials),
          scene.components,
        ),
      ),
    [scene, materialLibrary],
  )
  const machining = useMemo(
    () => reconcileMachiningScene(scene, materialLibrary),
    [scene, materialLibrary],
  )
  const reconciliation = useMemo(
    () => reconcileScene(scene, materialLibrary),
    [scene, materialLibrary],
  )
  const review = useMemo(
    () =>
      buildProductionReview({
        manufacturing,
        production,
        machiningReconciliation: machining,
        cabinets: shelves.map((entry) => ({
          id: entry.cabinet.id,
          issues: entry.issues,
          shelves: entry.shelves,
        })),
      }),
    [manufacturing, production, machining, shelves],
  )

  return { shelves, production, manufacturing, machining, reconciliation, review }
}
