import type { PartId, Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { pairIdsOf } from '../scene/suggestJoints'
import { groupByPair, orientationArrow } from '../scene/groupSuggestions'
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
}: {
  suggestions: JointSuggestion[]
  scene: Scene
  onApply: (s: JointSuggestion) => void
  onHoverSuggestion: (s: JointSuggestion | null) => void
}) {
  const [open, setOpen] = useState(false)
  const groups = useMemo(() => groupByPair(suggestions), [suggestions])
  if (groups.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border px-2">
      <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1.5 cursor-pointer select-none hover:text-foreground transition-colors">
        {open ? '▾' : '▸'} All possible joints ({groups.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        {groups.map((g) => (
          <div key={g.key} className="flex items-center gap-1 py-0.5 border-t border-border/30">
            <span className="flex-1 text-[11px] text-foreground">
              {label(scene, g.aId)} + {label(scene, g.bId)}
            </span>
            <div className="flex flex-wrap gap-1 justify-end">
              {g.options.map((s) => {
                const arrow = orientationArrow(g, s)
                return (
                  // Keyed by kind+arrow, not index: within a group only finger/tongue-groove repeat,
                  // and orientationArrow gives those two entries distinct arrows, so this is unique
                  // and — unlike an index — stable when the group's options change between renders.
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
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
