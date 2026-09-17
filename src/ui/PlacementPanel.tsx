import type { Anchor, CarcaseComponent, Component } from '../scene/types'
import { NumberField } from './NumberField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const FACES: Anchor['face'][] = ['left', 'right', 'front', 'back']

// Mirrors `IN_PLANE` in `src/scene/anchor.ts`: a left/right face's outward normal runs along x,
// leaving the depth (y) and height (z) axes free within the plane; a front/back face's normal runs
// along y, leaving the cross-cabinet (x) and height (z) axes free. The labels name whichever two
// axes `Anchor.offset` actually moves for the chosen face.
const OFFSET_LABELS: Record<Anchor['face'], [string, string]> = {
  left: ['Depth', 'Height'],
  right: ['Depth', 'Height'],
  front: ['Across', 'Height'],
  back: ['Across', 'Height'],
}

const DEFAULT_ANCHOR: Omit<Anchor, 'to'> = { face: 'right', gap: 0, offset: { u: 0, v: 0 } }

export function PlacementPanel({
  component,
  components,
  onUpdate,
}: {
  component: CarcaseComponent
  components: Component[]
  onUpdate: (patch: Partial<CarcaseComponent>) => void
}) {
  const anchor = component.anchor
  const anchored = anchor !== undefined

  // Only cabinets `resolvePlacement` would actually honour: a carcase, not this one, sharing this
  // one's parent. Offering a cross-frame or self target would offer a choice the pass silently
  // undoes at resolve time.
  const targets = components.filter(
    (c): c is CarcaseComponent =>
      c.kind === 'carcase' && c.id !== component.id && c.parentId === component.parentId,
  )

  const setAnchor = (patch: Partial<Anchor>) => {
    if (anchor === undefined) return
    onUpdate({ anchor: { ...anchor, ...patch } })
  }

  return (
    <div>
      <NumberField
        id="placement-x"
        label="X"
        value={component.position.x}
        disabled={anchored}
        onCommit={(v) => onUpdate({ position: { ...component.position, x: v } })}
      />
      <NumberField
        id="placement-y"
        label="Y"
        value={component.position.y}
        disabled={anchored}
        onCommit={(v) => onUpdate({ position: { ...component.position, y: v } })}
      />
      <NumberField
        id="placement-z"
        label="Z"
        value={component.position.z}
        disabled={anchored}
        onCommit={(v) => onUpdate({ position: { ...component.position, z: v } })}
      />
      {/* Rotation is never derived — a corner is a cabinet both turned and anchored — so this field
          stays enabled regardless of anchor state. */}
      <NumberField
        id="placement-rotation-z"
        label="Rotation Z"
        value={component.rotation.z}
        onCommit={(v) => onUpdate({ rotation: { ...component.rotation, z: v } })}
      />

      <div className="flex items-center gap-1.5 mb-1">
        <Label htmlFor="placement-anchor-target">Anchored to</Label>
        <select
          id="placement-anchor-target"
          aria-label="Anchored to"
          value={anchor?.to ?? ''}
          onChange={(e) => {
            const to = e.target.value
            onUpdate({ anchor: to === '' ? undefined : { to, ...DEFAULT_ANCHOR } })
          }}
        >
          <option value="">Nothing — free placed</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {anchor !== undefined && (
        <>
          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="placement-anchor-face">Face</Label>
            <select
              id="placement-anchor-face"
              aria-label="Face"
              value={anchor.face}
              onChange={(e) => setAnchor({ face: e.target.value as Anchor['face'] })}
            >
              {FACES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <NumberField
            id="placement-anchor-gap"
            label="Gap"
            value={anchor.gap}
            onCommit={(v) => setAnchor({ gap: v })}
          />
          <NumberField
            id="placement-anchor-offset-u"
            label={OFFSET_LABELS[anchor.face][0]}
            value={anchor.offset.u}
            onCommit={(v) => setAnchor({ offset: { ...anchor.offset, u: v } })}
          />
          <NumberField
            id="placement-anchor-offset-v"
            label={OFFSET_LABELS[anchor.face][1]}
            value={anchor.offset.v}
            onCommit={(v) => setAnchor({ offset: { ...anchor.offset, v: v } })}
          />
          <Button size="sm" variant="outline" onClick={() => onUpdate({ anchor: undefined })}>
            Detach
          </Button>
        </>
      )}
    </div>
  )
}
