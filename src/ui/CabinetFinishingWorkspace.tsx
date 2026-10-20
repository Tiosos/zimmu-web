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
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: FinishingPreview) => boolean
  onApplyRun?: (preview: RunWorktopPreview) => boolean
}) {
  const [mode, setMode] = useState<'single' | 'run'>('single')
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
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
      </div>
      {mode === 'single' ? (
        <CabinetFinishingEditor cabinet={cabinet} scene={scene} onApply={onApply} />
      ) : (
        onApplyRun && (
          <CabinetRunWorktopEditor cabinet={cabinet} scene={scene} onApply={onApplyRun} />
        )
      )}
    </div>
  )
}
