import { Button } from '../components/ui/button'
import type { CylinderPart, DowelCut, Part, PartId } from '../scene/types'
import type { DowelCutTool } from '../scene/useAddCut'
import { NumberField } from './NumberField'

interface Props {
  part: CylinderPart
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part, label: string) => void
}

const TOOLS: { tool: DowelCutTool; label: string }[] = [
  { tool: 'end', label: 'End' },
  { tool: 'notch', label: 'Notch' },
  { tool: 'bore-axial', label: 'Axial bore' },
  { tool: 'bore-transverse', label: 'Transverse bore' },
]

export function DowelCutsPanel({ part, dowelTool, armDowelTool, onUpdate }: Props) {
  const patch = (cutId: string, fields: Partial<DowelCut>) =>
    onUpdate(
      part.id,
      (p) =>
        p.kind === 'cylinder'
          ? {
              ...p,
              cuts: p.cuts.map((c) => (c.id === cutId ? ({ ...c, ...fields } as DowelCut) : c)),
            }
          : p,
      'Edit cut',
    )

  const removeCut = (cutId: string) =>
    onUpdate(
      part.id,
      (p) => (p.kind === 'cylinder' ? { ...p, cuts: p.cuts.filter((c) => c.id !== cutId) } : p),
      'Remove cut',
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {TOOLS.map(({ tool, label }) => (
          <Button
            key={tool}
            size="sm"
            variant={dowelTool === tool ? 'default' : 'outline'}
            onClick={() => armDowelTool(tool)}
          >
            {label}
          </Button>
        ))}
      </div>

      {part.cuts.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Arm a tool, then click the dowel to add a cut.
        </p>
      )}

      {part.cuts.map((cut) => (
        <div key={cut.id} className="rounded border p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{cut.label}</span>
            <Button size="sm" variant="ghost" onClick={() => removeCut(cut.id)}>
              Delete
            </Button>
          </div>

          {cut.kind === 'end' && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => patch(cut.id, { end: cut.end === '+Z' ? '-Z' : '+Z' })}
              >
                End: {cut.end}
              </Button>
              <Button size="sm" variant="outline" onClick={() => patch(cut.id, { angle: 0 })}>
                Square
              </Button>
              <NumberField
                id={`${cut.id}-offset`}
                label="Offset"
                value={cut.offset}
                onCommit={(v) => patch(cut.id, { offset: v })}
              />
              <NumberField
                id={`${cut.id}-angle`}
                label="Angle"
                value={cut.angle}
                onCommit={(v) => patch(cut.id, { angle: v })}
              />
              <NumberField
                id={`${cut.id}-azimuth`}
                label="Azimuth"
                value={cut.azimuth}
                onCommit={(v) => patch(cut.id, { azimuth: v })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
