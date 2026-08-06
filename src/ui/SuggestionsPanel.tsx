import type { PartId, Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { Button } from '@/components/ui/button'

const KIND_LABEL: Record<JointSuggestion['kind'], string> = {
  halflap: 'Half-lap',
  dado: 'Dado',
  'mortise-tenon': 'Mortise & tenon',
  finger: 'Finger joint',
  'tongue-groove': 'Tongue & groove',
}

function partLabel(scene: Scene, id: PartId): string {
  return scene.parts.find((p) => p.id === id)?.label ?? '(deleted)'
}

export function SuggestionsPanel({
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
  if (suggestions.length === 0) return null
  return (
    <>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">
        ▾ Suggested joints
      </p>
      {suggestions.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-1 py-0.5 border-t border-border/30"
          onMouseEnter={() => onHoverSuggestion(s)}
          onMouseLeave={() => onHoverSuggestion(null)}
        >
          <span className="flex-1 text-[11px] text-foreground">
            {KIND_LABEL[s.kind]} with {partLabel(scene, s.neighborId)}
          </span>
          <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => onApply(s)}>
            Add
          </Button>
        </div>
      ))}
    </>
  )
}
