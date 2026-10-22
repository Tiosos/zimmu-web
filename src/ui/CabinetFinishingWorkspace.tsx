import type { CornerPreview } from '../scene/cornerPanels'
import { CabinetCornerEditor } from './CabinetCornerEditor'
import { CabinetRunPanelEditor } from './CabinetRunPanelEditor'
import { WorktopMachiningEditor } from './WorktopMachiningEditor'
import type { WorktopMachiningPreview } from '../scene/worktopMachining'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import type { FinishingPreview } from '../scene/finishingPanels'
import type { RunWorktopPreview } from '../scene/runWorktops'
import { CabinetFinishingEditor } from './CabinetFinishingEditor'
import { CabinetRunWorktopEditor } from './CabinetRunWorktopEditor'

export function CabinetFinishingWorkspace({
  cabinet,
  scene,
  onApply,
  onApplyRun,
  onApplyCorner,
  onApplyMachining,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: FinishingPreview) => boolean
  onApplyMachining?: (preview: WorktopMachiningPreview) => boolean
  onApplyCorner?: (preview: CornerPreview) => boolean
  onApplyRun?: (preview: RunWorktopPreview) => boolean
}) {
  const [mode, setMode] = useState<'single' | 'run' | 'machining' | 'panels' | 'corner'>('single')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-pressed={mode === 'single'}
          onClick={() => setMode('single')}
        >
          Single-cabinet panels
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={mode === 'run'}
          disabled={!onApplyRun}
          onClick={() => setMode('run')}
        >
          Run-spanning worktops
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={mode === 'panels'}
          disabled={!onApplyRun}
          onClick={() => setMode('panels')}
        >
          Run plinths &amp; splashbacks
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={mode === 'machining'}
          disabled={!onApplyMachining}
          onClick={() => setMode('machining')}
        >
          Worktop machining
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={mode === 'corner'}
          disabled={!onApplyCorner}
          onClick={() => setMode('corner')}
        >
          Corner assemblies
        </Button>
      </div>
      {mode === 'corner' ? (
        onApplyCorner && (
          <CabinetCornerEditor cabinet={cabinet} scene={scene} onApply={onApplyCorner} />
        )
      ) : mode === 'single' ? (
        <CabinetFinishingEditor cabinet={cabinet} scene={scene} onApply={onApply} />
      ) : mode === 'panels' ? (
        onApplyRun && <CabinetRunPanelEditor cabinet={cabinet} scene={scene} onApply={onApplyRun} />
      ) : mode === 'machining' ? (
        onApplyMachining && (
          <WorktopMachiningEditor cabinet={cabinet} scene={scene} onApply={onApplyMachining} />
        )
      ) : (
        onApplyRun && (
          <CabinetRunWorktopEditor cabinet={cabinet} scene={scene} onApply={onApplyRun} />
        )
      )}
    </div>
  )
}
