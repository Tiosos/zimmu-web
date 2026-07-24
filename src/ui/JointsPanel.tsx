import type { BoardPart, DadoJoint, Joint, Part, PartId, Scene } from '../scene/types'
import { isValidDadoSeat } from '../geom/dado'
import { isValidHalfLap } from '../geom/halflap'
import { jointInvolves } from '../scene/jointInvolves'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebouncedCallback } from './useDebouncedCallback'

function JointNumInput({
  label,
  value,
  onCommit,
  suffix,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  suffix: string
}) {
  const debounced = useDebouncedCallback(onCommit, 150)
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <Label className="w-10 shrink-0 text-right">{label}</Label>
      <Input
        type="number"
        step="any"
        defaultValue={String(value)}
        key={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (isFinite(v)) debounced(v)
        }}
        className="flex-1 min-w-0"
      />
      <span className="text-[11px] text-muted-foreground shrink-0 w-8">{suffix}</span>
    </div>
  )
}

function partLabel(scene: Scene, id: PartId): string {
  return scene.parts.find((p) => p.id === id)?.label ?? '(deleted)'
}

export function JointsPanel({
  part,
  scene,
  onUpdateJoint,
  onRemoveJoint,
}: {
  part: Part
  scene: Scene
  onUpdateJoint: (jointId: string, updater: (j: Joint) => Joint) => void
  onRemoveJoint: (jointId: string) => void
}) {
  const joints = scene.joints.filter((j) => jointInvolves(j, part.id))
  if (joints.length === 0) return null

  return (
    <>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">▾ Joints</p>
      {joints.map((j: Joint) => {
        if (j.kind === 'halflap') {
          const a = scene.parts.find((p) => p.id === j.partAId)
          const b = scene.parts.find((p) => p.id === j.partBId)
          const stale = a?.kind === 'board' && b?.kind === 'board' ? !isValidHalfLap(a, b) : true
          const other = j.partAId === part.id ? j.partBId : j.partAId
          return (
            <div key={j.id} className="border-t border-border/30 pt-1 pb-1">
              <div className="flex items-center gap-1 py-0.5">
                <span className="flex-1 text-[11px] text-foreground">{j.label}</span>
                <span className="text-[10px] text-muted-foreground">half-lap</span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remove joint"
                  className="h-5 w-5 text-destructive hover:text-destructive"
                  onClick={() => onRemoveJoint(j.id)}
                >
                  ✕
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground pb-0.5">
                ↔ {partLabel(scene, other)}
              </p>
              {stale && (
                <p className="text-[10px] text-destructive-foreground pb-1">
                  Joint stale — boards must be coplanar, equal-thickness, and overlapping
                </p>
              )}
              <JointNumInput
                label="Split"
                value={j.split}
                suffix=""
                onCommit={(v) =>
                  onUpdateJoint(j.id, (jt) => ({ ...jt, split: Math.min(Math.max(0.05, v), 0.95) }))
                }
              />
              <JointNumInput
                label="Clear"
                value={j.clearance}
                suffix="mm"
                onCommit={(v) =>
                  onUpdateJoint(j.id, (jt) => ({ ...jt, clearance: Math.max(0, v) }))
                }
              />
            </div>
          )
        }
        if (j.kind === 'mortise-tenon') return null
        const isHousing = j.housingPartId === part.id
        const housing = scene.parts.find((p) => p.id === j.housingPartId)
        const housed = scene.parts.find((p) => p.id === j.housedPartId)
        const stale =
          housing?.kind === 'board' && housed?.kind === 'board'
            ? !isValidDadoSeat(
                housing as BoardPart,
                j.housingFace,
                housed as BoardPart,
                j.housedEnd,
              )
            : true
        return (
          <div key={j.id} className="border-t border-border/30 pt-1 pb-1">
            <div className="flex items-center gap-1 py-0.5">
              <span className="flex-1 text-[11px] text-foreground">{j.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {isHousing ? 'housing' : 'housed'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                title="Remove joint"
                className="h-5 w-5 text-destructive hover:text-destructive"
                onClick={() => onRemoveJoint(j.id)}
              >
                ✕
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground pb-0.5">
              {isHousing ? '↔' : '→'}{' '}
              {isHousing ? partLabel(scene, j.housedPartId) : partLabel(scene, j.housingPartId)}
            </p>
            {stale && (
              <p className="text-[10px] text-destructive-foreground pb-1">
                Joint stale — housed board is no longer perpendicular
              </p>
            )}
            {isHousing ? (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <Label className="w-10 shrink-0 text-right">Profile</Label>
                  <Select
                    value={j.profile}
                    onValueChange={(v) =>
                      onUpdateJoint(j.id, (jt) => ({ ...jt, profile: v as DadoJoint['profile'] }))
                    }
                  >
                    <SelectTrigger className="h-7 flex-1 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plain">Plain</SelectItem>
                      <SelectItem value="rabbeted">Rabbeted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <JointNumInput
                  label="Depth"
                  value={j.depth}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, depth: Math.max(0.1, v) }))
                  }
                />
                <JointNumInput
                  label="Clear"
                  value={j.clearance}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, clearance: Math.max(0, v) }))
                  }
                />
                <JointNumInput
                  label="Offset"
                  value={j.offset}
                  suffix="mm"
                  onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, offset: v }))}
                />
                <JointNumInput
                  label="Stop A"
                  value={j.stopStart}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, stopStart: Math.max(0, v) }))
                  }
                />
                <JointNumInput
                  label="Stop B"
                  value={j.stopEnd}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, stopEnd: Math.max(0, v) }))
                  }
                />
                {j.profile === 'rabbeted' && (
                  <>
                    <JointNumInput
                      label="Tongue"
                      value={j.tongueThickness}
                      suffix="mm"
                      onCommit={(v) =>
                        onUpdateJoint(j.id, (jt) => ({
                          ...jt,
                          tongueThickness:
                            housed?.kind === 'board'
                              ? Math.min(Math.max(0.1, v), housed.thickness - 0.1)
                              : Math.max(0.1, v),
                        }))
                      }
                    />
                    <div className="flex items-center gap-1.5 mb-1">
                      <Label className="w-10 shrink-0 text-right">Rabbet</Label>
                      <Select
                        value={j.rabbetFace}
                        onValueChange={(v) =>
                          onUpdateJoint(j.id, (jt) => ({
                            ...jt,
                            rabbetFace: v as DadoJoint['rabbetFace'],
                          }))
                        }
                      >
                        <SelectTrigger className="h-7 flex-1 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="+Z">Face +Z</SelectItem>
                          <SelectItem value="-Z">Face −Z</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground pb-0.5">
                Edit depth / clearance / offset / stops from {partLabel(scene, j.housingPartId)}.
              </p>
            )}
          </div>
        )
      })}
    </>
  )
}
