import type { PartId, Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { pairIdsOf } from '../scene/suggestJoints'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useState } from 'react'

const KIND_LABEL: Record<JointSuggestion['kind'], string> = {
  halflap: 'Half-lap',
  dado: 'Dado',
  'mortise-tenon': 'Mortise & tenon',
  finger: 'Finger joint',
  'tongue-groove': 'Tongue & groove',
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
  if (suggestions.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border px-2">
      <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1.5 cursor-pointer select-none hover:text-foreground transition-colors">
        {open ? '▾' : '▸'} All possible joints ({suggestions.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-1 py-0.5 border-t border-border/30"
            onMouseEnter={() => onHoverSuggestion(s)}
            onMouseLeave={() => onHoverSuggestion(null)}
          >
            <span className="flex-1 text-[11px] text-foreground">{describe(scene, s)}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => onApply(s)}
            >
              Add
            </Button>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
