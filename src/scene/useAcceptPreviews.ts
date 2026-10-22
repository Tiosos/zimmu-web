import { useCallback, type MutableRefObject } from 'react'
import { acceptSlope, type SlopePreview } from './slopedTop'
import { acceptStockPlan, type StockPreview } from './stockPlanning'
import { acceptGrainMatch, type GrainMatchPreview } from './grainMatching'
import { acceptOpeningSettings, type OpeningPreview } from './openingMotion'
import type { ProjectStructure } from './projectStructure'
import {
  acceptInstallation,
  acceptWallFiller,
  type InstallationPreview,
  type WallFillerPreview,
} from './roomInstallation'
import { acceptCorner, type CornerPreview } from './cornerPanels'
import { acceptAppliance, type AppliancePreview } from './applianceBays'
import { acceptService, type ServicePreview } from './serviceMachining'
import { acceptMaterials, type MaterialsPreview } from './cabinetMaterials'
import { acceptInteriors, type InteriorsPreview } from './shelvesInteriors'
import { acceptMotion, type MotionPreview } from './motionHardware'
import { acceptWorktopMachining, type WorktopMachiningPreview } from './worktopMachining'
import { acceptRunWorktop, type RunWorktopPreview } from './runWorktops'
import { acceptPulls, type PullPreview } from './pullLayout'
import { acceptFronts, type FrontsPreview } from './frontsDrawers'
import { acceptFinishing, type FinishingPreview } from './finishingPanels'
import { acceptLayout, type LayoutPreview } from './layoutTools'
import { acceptPlacement, type PlacementPreview } from './placementTools'
import { acceptRunFit, type RunFitPreview } from './runFit'
import type { MaterialDef, Scene } from './types'
import { acceptedRulePreview, type RulePreview } from './ruleFlow'

type CommitReconciled = (mutate: (s: Scene) => Scene, label: string, coalesceKey?: string) => void

// Each handler accepts one workspace's preview against the live scene and commits it as one undo
// step. The accept* functions return null when the preview has gone stale, which is the only
// reason a handler answers false.
export function useAcceptPreviews(
  sceneRef: MutableRefObject<Scene>,
  commitReconciled: CommitReconciled,
) {
  const onApplyPullPreview = useCallback(
    (preview: PullPreview): boolean => {
      const next = acceptPulls(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply cabinet hardware')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyFrontsPreview = useCallback(
    (preview: FrontsPreview): boolean => {
      const next = acceptFronts(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply fronts and drawers')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyMotionPreview = useCallback(
    (preview: MotionPreview): boolean => {
      const next = acceptMotion(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply hinges and runners')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyWorktopMachiningPreview = useCallback(
    (preview: WorktopMachiningPreview): boolean => {
      const next = acceptWorktopMachining(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply worktop machining')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplySlope = useCallback(
    (project: ProjectStructure, preview: SlopePreview): boolean => {
      const next = acceptSlope(sceneRef.current, project, preview)
      if (!next) return false
      commitReconciled(
        () => next,
        preview.draft.enabled ? 'Apply sloped cabinet' : 'Disable sloped cabinet',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyStockPlan = useCallback(
    (
      project: ProjectStructure,
      materials: Record<string, MaterialDef>,
      preview: StockPreview,
      action: 'save' | 'consume',
      remnantIds: string[] = [],
    ): boolean => {
      const next = acceptStockPlan(
        sceneRef.current,
        project,
        materials,
        preview,
        action,
        remnantIds,
        `offcut_${crypto.randomUUID()}`,
      )
      if (!next) return false
      commitReconciled(
        () => next,
        action === 'save' ? 'Save stock settings' : 'Consume stock and save remnants',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyGrainMatchPreview = useCallback(
    (project: ProjectStructure, preview: GrainMatchPreview): boolean => {
      const next = acceptGrainMatch(
        sceneRef.current,
        project,
        preview,
        `grain_${crypto.randomUUID()}`,
      )
      if (!next) return false
      commitReconciled(
        () => next,
        preview.action === 'detach' ? 'Detach grain matching group' : 'Apply grain matching group',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyOpeningPreview = useCallback(
    (project: ProjectStructure, preview: OpeningPreview): boolean => {
      const next = acceptOpeningSettings(sceneRef.current, project, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply opening motion settings')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyInstallationPreview = useCallback(
    (project: ProjectStructure, preview: InstallationPreview): boolean => {
      const next = acceptInstallation(
        sceneRef.current,
        project,
        preview,
        `installation_${crypto.randomUUID()}`,
      )
      if (!next) return false
      commitReconciled(
        () => next,
        preview.action === 'detach' ? 'Detach room installation' : 'Apply room installation',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyWallFillerPreview = useCallback(
    (project: ProjectStructure, preview: WallFillerPreview): boolean => {
      const next = acceptWallFiller(
        sceneRef.current,
        project,
        preview,
        `board_${crypto.randomUUID()}`,
      )
      if (!next) return false
      commitReconciled(
        () => next,
        preview.action === 'delete'
          ? 'Delete wall filler'
          : preview.action === 'detach'
            ? 'Detach wall filler'
            : 'Apply wall filler',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyCornerPreview = useCallback(
    (preview: CornerPreview): boolean => {
      const next = acceptCorner(sceneRef.current, preview, `corner_${crypto.randomUUID()}`)
      if (!next) return false
      commitReconciled(
        () => next,
        preview.action === 'delete'
          ? 'Delete corner assembly'
          : preview.action === 'detach'
            ? 'Detach corner assembly'
            : 'Apply corner assembly',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyRunWorktopPreview = useCallback(
    (preview: RunWorktopPreview): boolean => {
      const next = acceptRunWorktop(sceneRef.current, preview, `board_${crypto.randomUUID()}`)
      if (!next) return false
      const kind = preview.draft.profile ?? 'worktop'
      const action =
        preview.action === 'detach'
          ? 'Detach'
          : preview.action === 'delete'
            ? 'Delete'
            : preview.targetId
              ? 'Update'
              : 'Add'
      commitReconciled(() => next, `${action} run ${kind}`)
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyFinishingPreview = useCallback(
    (preview: FinishingPreview): boolean => {
      const next = acceptFinishing(sceneRef.current, preview, `board_${crypto.randomUUID()}`)
      if (!next) return false
      commitReconciled(
        () => next,
        preview.action === 'delete'
          ? 'Delete finishing board'
          : preview.action === 'detach'
            ? 'Detach finishing board'
            : preview.targetId
              ? 'Update finishing board'
              : 'Add finishing board',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyLayoutPreview = useCallback(
    (preview: LayoutPreview): boolean => {
      const next = acceptLayout(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply cabinet layout')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyAppliancePreview = useCallback(
    (preview: AppliancePreview): boolean => {
      const next = acceptAppliance(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(
        () => next,
        preview.action === 'delete' ? 'Remove appliance bay' : 'Save appliance bay',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyServicePreview = useCallback(
    (preview: ServicePreview): boolean => {
      const next = acceptService(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply service openings')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyMaterialsPreview = useCallback(
    (preview: MaterialsPreview): boolean => {
      const next = acceptMaterials(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(
        () => next,
        preview.mode === 'materials' ? 'Apply cabinet materials' : 'Apply cabinet edgebanding',
      )
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyInteriorsPreview = useCallback(
    (preview: InteriorsPreview): boolean => {
      const next = acceptInteriors(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply cabinet interiors')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyRunFitPreview = useCallback(
    (preview: RunFitPreview): boolean => {
      const next = acceptRunFit(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Fit cabinet run')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyPlacementPreview = useCallback(
    (preview: PlacementPreview): boolean => {
      const next = acceptPlacement(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply cabinet placement')
      return true
    },
    [sceneRef, commitReconciled],
  )

  const onApplyRulePreview = useCallback(
    (preview: RulePreview): boolean => {
      const next = acceptedRulePreview(sceneRef.current, preview)
      if (!next) return false
      commitReconciled(() => next, 'Apply cabinet rules')
      return true
    },
    [sceneRef, commitReconciled],
  )

  return {
    onApplyPullPreview,
    onApplyFrontsPreview,
    onApplyMotionPreview,
    onApplyWorktopMachiningPreview,
    onApplySlope,
    onApplyStockPlan,
    onApplyGrainMatchPreview,
    onApplyOpeningPreview,
    onApplyInstallationPreview,
    onApplyWallFillerPreview,
    onApplyCornerPreview,
    onApplyRunWorktopPreview,
    onApplyFinishingPreview,
    onApplyLayoutPreview,
    onApplyAppliancePreview,
    onApplyServicePreview,
    onApplyMaterialsPreview,
    onApplyInteriorsPreview,
    onApplyRunFitPreview,
    onApplyPlacementPreview,
    onApplyRulePreview,
  }
}
