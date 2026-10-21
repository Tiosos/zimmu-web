import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import type { PullPreview } from '../scene/pullLayout'
import type { MotionPreview } from '../scene/motionHardware'
import { CabinetPullEditor } from './CabinetPullEditor'
import { CabinetMotionEditor } from './CabinetMotionEditor'
export function CabinetHardwareWorkspace({
  cabinet,
  scene,
  onApply,
  onApplyMotion,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (p: PullPreview) => boolean
  onApplyMotion?: (p: MotionPreview) => boolean
}) {
  const [mode, setMode] = useState<'pulls' | 'motion'>('pulls')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-pressed={mode === 'pulls'}
          onClick={() => setMode('pulls')}
        >
          Handles & Pulls
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={mode === 'motion'}
          disabled={!onApplyMotion}
          onClick={() => setMode('motion')}
        >
          Hinges & Runners
        </Button>
      </div>
      {mode === 'pulls' ? (
        <CabinetPullEditor cabinet={cabinet} scene={scene} onApply={onApply} />
      ) : (
        onApplyMotion && (
          <CabinetMotionEditor cabinet={cabinet} scene={scene} onApply={onApplyMotion} />
        )
      )}
    </div>
  )
}
