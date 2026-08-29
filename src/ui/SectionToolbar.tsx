import { setSectionSize, splitSection, unsplitSection } from '../scene/editSection'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DimInput } from './DimInput'
import type { CarcaseParams, Component, Section, SectionId } from '../scene/types'

// What can be done to the section the elevation has selected. Every button goes through
// `editSection`, which is where the rules about the tree's shape live — an SVG click handler is the
// worst place in the codebase to put the fourth copy of one.
//
// The axis names are a trap worth restating: `axis: 'vertical'` puts children *side by side*,
// separated by a vertical partition, and `axis: 'horizontal'` *stacks* them, separated by a
// horizontal shelf. The axis names the division's orientation, not the stacking direction — which
// is why `divisionLabel` maps vertical to "Partition" and horizontal to "Shelf". The buttons are
// labelled by what the user sees, so "Split across" makes a shelf and takes `'horizontal'`.

// Where a section sits in the tree: the split that contains it, if any. A root has none, so it can
// be divided but neither merged nor sized — there is no parent for it to claim space inside.
function findParent(root: Section, id: SectionId): Section | null {
  if (root.content.kind === 'leaf') return null
  for (const c of root.content.children) {
    if (c.id === id) return root
    const found = findParent(c, id)
    if (found !== null) return found
  }
  return null
}

function findSection(root: Section, id: SectionId): Section | null {
  if (root.id === id) return root
  if (root.content.kind === 'leaf') return null
  for (const c of root.content.children) {
    const found = findSection(c, id)
    if (found !== null) return found
  }
  return null
}

export function SectionToolbar({
  params,
  selected,
  onUpdate,
}: {
  params: CarcaseParams
  selected: SectionId | null
  onUpdate: (updater: (c: Component) => Component) => void
}) {
  const section = selected === null ? null : findSection(params.section, selected)
  if (selected === null || section === null) {
    return (
      <div className="w-44 shrink-0 text-[11px] text-muted-foreground">
        Pick an opening in the elevation to divide, size or cover it.
      </div>
    )
  }

  const setSection = (next: Section) =>
    onUpdate((c) => (c.kind === 'carcase' ? { ...c, params: { ...c.params, section: next } } : c))

  const parent = findParent(params.section, selected)
  const isSplit = section.content.kind === 'split'
  // Board-space words for the user: a child sitting beside its siblings is sized by width, one
  // stacked above them by height. A field labelled "Width" on a stacked section is wrong half the
  // time — the same defect as offering a hinge side on a two-leaf door.
  const sizeLabel =
    parent?.content.kind === 'split' && parent.content.axis === 'vertical' ? 'Width' : 'Height'

  return (
    <div className="w-44 shrink-0 flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => setSection(splitSection(params.section, selected, 'horizontal', 'panel', 2))}
        >
          Split across
        </Button>
        <Button
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => setSection(splitSection(params.section, selected, 'vertical', 'panel', 2))}
        >
          Split down
        </Button>
        {isSplit && (
          <Button
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => setSection(unsplitSection(params.section, selected))}
          >
            Merge
          </Button>
        )}
      </div>

      {parent !== null && (
        <>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="section-size" className="w-12 shrink-0 text-right">
              Size
            </Label>
            <Select
              value={section.size.kind === 'fixed' ? 'fixed' : 'equal'}
              onValueChange={(v) =>
                setSection(
                  setSectionSize(
                    params.section,
                    selected,
                    // A section switching to fixed has to start somewhere, and its current resolved
                    // width is not knowable here — this component is given the tree, not its
                    // rectangles. 300 is a stated starting point the user types over.
                    v === 'fixed' ? { kind: 'fixed', mm: 300 } : { kind: 'equal' },
                  ),
                )
              }
            >
              <SelectTrigger id="section-size" className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equal">Equal</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {section.size.kind === 'fixed' && (
            <DimInput
              labelWidth="w-12"
              label={sizeLabel}
              value={section.size.mm}
              suffix="mm"
              onCommit={(v) =>
                setSection(setSectionSize(params.section, selected, { kind: 'fixed', mm: v }))
              }
            />
          )}
        </>
      )}
    </div>
  )
}
