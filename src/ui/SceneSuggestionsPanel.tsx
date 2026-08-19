import type { PartId, Scene } from '../scene/types'

import type { JointSuggestion } from '../scene/suggestJoints'
import { pairIdsOf } from '../scene/suggestJoints'
import { orientationArrow } from '../scene/groupSuggestions'
import { buildJointChecklist } from '../scene/jointChecklist'
import { componentsById } from '../scene/componentTree'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useMemo, useState } from 'react'

const KIND_LABEL: Record<JointSuggestion['kind'], string> = {
  halflap: 'Half-lap',
  dado: 'Dado',
  'mortise-tenon': 'Mortise & tenon',
  finger: 'Finger joint',
  'tongue-groove': 'Tongue & groove',
}

// Short forms: a chip sits inside a row alongside up to three others.
const CHIP_LABEL: Record<JointSuggestion['kind'], string> = {
  halflap: 'Half-lap',
  dado: 'Dado',
  'mortise-tenon': 'M&T',
  finger: 'Finger',
  'tongue-groove': 'T&G',
}

function label(scene: Scene, id: PartId): string {
  return scene.parts.find((p) => p.id === id)?.label ?? '(deleted)'
}

// Scene rows must name both boards — unlike the per-part panel there is no selection to say
// "…with X" relative to. For the kinds whose orientation is a real choice, the phrasing also has
// to make clear which board plays which role, since both orientations appear as separate rows.
function describe(scene: Scene, s: JointSuggestion): string {
  const kind = KIND_LABEL[s.kind]
  switch (s.kind) {
    case 'dado':
      return `${kind} — ${label(scene, s.housedPartId)} into ${label(scene, s.housingPartId)}`
    case 'mortise-tenon':
      return `${kind} — ${label(scene, s.tenonPartId)} into ${label(scene, s.mortisePartId)}`
    case 'tongue-groove':
      return `${kind} — groove in ${label(scene, s.groovePartId)}, tongue on ${label(scene, s.tonguePartId)}`
    case 'finger':
      return `${kind} — ${label(scene, s.partAId)} leads, ${label(scene, s.partBId)} seats`
    case 'halflap': {
      const [a, b] = pairIdsOf(s)
      return `${kind} — ${label(scene, a)} and ${label(scene, b)}`
    }
  }
}

export function SceneSuggestionsPanel({
  suggestions,
  scene,
  onApply,
  onHoverSuggestion,
  onHoverPair,
}: {
  suggestions: JointSuggestion[]
  scene: Scene
  onApply: (s: JointSuggestion) => void
  onHoverSuggestion: (s: JointSuggestion | null) => void
  onHoverPair: (ids: [PartId, PartId] | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [unresolvedOpen, setUnresolvedOpen] = useState(false)
  const { rows, unresolved, jointedCount, actionableTotal } = useMemo(
    () =>
      buildJointChecklist(scene.parts, scene.joints, suggestions, componentsById(scene.components)),
    [scene.parts, scene.joints, scene.components, suggestions],
  )
  if (rows.length === 0 && unresolved.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border px-2">
      <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1.5 cursor-pointer select-none hover:text-foreground transition-colors">
        {open ? '▾' : '▸'} Joints — {jointedCount} / {actionableTotal}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center gap-1 py-0.5 border-t border-border/30"
            onMouseEnter={r.state === 'jointed' ? () => onHoverPair([r.aId, r.bId]) : undefined}
            // Unconditional, unlike the enter handler: a hovered row that flips to open — undo the
            // joint while the pointer sits on it — would otherwise lose its leave handler with the
            // tint still applied, leaving both boards lit with nothing left to clear them.
            onMouseLeave={() => onHoverPair(null)}
          >
            <span className="flex-1 text-[11px] text-foreground">
              {r.state === 'jointed' ? '✓ ' : ''}
              {label(scene, r.aId)} + {label(scene, r.bId)}
            </span>
            {r.state === 'jointed' ? (
              <span className="text-[11px] text-muted-foreground">
                {r.joints.map((j) => KIND_LABEL[j.kind]).join(', ')}
              </span>
            ) : (
              <div className="flex flex-wrap gap-1 justify-end">
                {r.options.map((s) => {
                  const arrow = orientationArrow(r, s)
                  return (
                    // Keyed by kind+arrow, not index: within a row only finger/tongue-groove repeat,
                    // and orientationArrow gives those two entries distinct arrows, so this is unique
                    // and — unlike an index — stable when the row's options change between renders.
                    <Button
                      key={`${s.kind}${arrow ?? ''}`}
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-1.5"
                      title={describe(scene, s)}
                      onMouseEnter={() => onHoverSuggestion(s)}
                      onMouseLeave={() => onHoverSuggestion(null)}
                      onClick={() => onApply(s)}
                    >
                      {CHIP_LABEL[s.kind]}
                      {arrow ? ` ${arrow}` : ''}
                    </Button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
        {unresolved.length > 0 && (
          <Collapsible
            open={unresolvedOpen}
            onOpenChange={setUnresolvedOpen}
            className="border-t border-border/30"
          >
            <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] text-muted-foreground/70 py-1 cursor-pointer select-none hover:text-muted-foreground transition-colors">
              {unresolvedOpen ? '▾' : '▸'} No joint available ({unresolved.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {unresolved.map((r) => (
                <div key={r.key} className="py-0.5 text-[11px] text-muted-foreground/70">
                  {label(scene, r.aId)} + {label(scene, r.bId)}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
