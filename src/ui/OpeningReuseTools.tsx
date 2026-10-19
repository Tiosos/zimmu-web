import type { ResolvedTree } from '../scene/sectionTree'
import { Button } from '@/components/ui/button'
import {
  clearOpening,
  copyOpening,
  equalizeNestedOpenings,
  lockOpeningSizes,
  mirrorOpening,
  openingLeaves,
  pasteOpening,
  repeatOpeningContents,
} from '../scene/openingReuse'
import { findOpening, openingParent } from '../scene/openingLayouts'
import type { CarcaseParams, Section, SectionId } from '../scene/types'

export function OpeningReuseTools({
  params,
  selected,
  tree,
  copied,
  onCopy,
  onSelect,
  onCommit,
}: {
  params: CarcaseParams
  selected: SectionId
  tree: ResolvedTree | null
  copied: Section | null
  onCopy: (section: Section | null) => void
  onSelect: (id: SectionId) => void
  onCommit: (next: CarcaseParams, label: string, target: SectionId) => void
}) {
  const section = findOpening(params.section, selected)
  if (!section) return null
  const leaves = openingLeaves(params.section)
  const index = leaves.findIndex((leaf) => leaf.id === selected)
  const parent = openingParent(params.section, selected)
  const group = section.content.kind === 'split' ? section : parent
  const partial = section.content.kind === 'leaf' && copied?.content.kind === 'leaf'
  const repeat =
    section.content.kind === 'leaf' &&
    parent?.content.kind === 'split' &&
    parent.content.children.every((child) => child.content.kind === 'leaf')
  return (
    <section aria-label="Reuse opening design" className="flex flex-col gap-2 border-t pt-2">
      <strong>Reuse opening design</strong>
      <div className="flex flex-col gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={index <= 0}
          onClick={() => onSelect(leaves[index - 1].id)}
        >
          Previous opening
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={index === leaves.length - 1}
          onClick={() => onSelect(leaves[index + 1].id)}
        >
          Next opening
        </Button>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onCopy(copyOpening(params.section, selected))}
      >
        Copy opening design
      </Button>
      {copied && (
        <p role="status">
          Copied{' '}
          {copied.content.kind === 'leaf'
            ? 'one opening'
            : `${openingLeaves(copied).length} openings`}
          . Clipboard stays available while this cabinet editor is open.
        </p>
      )}
      <p>
        Paste layout replaces the selected design and its independent face-frame layouts. New drawer
        boxes use default settings; board overrides are not copied.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={!copied}
        onClick={() =>
          copied &&
          onCommit(
            pasteOpening(params, selected, copied, 'layout'),
            'Paste opening layout',
            selected,
          )
        }
      >
        Paste opening layout
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!partial}
        onClick={() =>
          copied &&
          onCommit(pasteOpening(params, selected, copied, 'front'), 'Paste opening front', selected)
        }
      >
        Paste opening front
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!partial}
        onClick={() =>
          copied &&
          onCommit(
            pasteOpening(params, selected, copied, 'shelving'),
            'Paste opening shelving',
            selected,
          )
        }
      >
        Paste opening shelving
      </Button>
      <p>
        Mirror reverses matching divisions and left/right door handing. Independent face-frame
        layouts in this opening are removed.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onCommit(
            mirrorOpening(params, selected, 'vertical'),
            'Mirror opening left/right',
            selected,
          )
        }
      >
        Mirror opening left/right
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onCommit(
            mirrorOpening(params, selected, 'horizontal'),
            'Mirror opening top/bottom',
            selected,
          )
        }
      >
        Mirror opening top/bottom
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onCommit(clearOpening(params, selected, 'fronts'), 'Remove opening fronts', selected)
        }
      >
        Remove opening fronts
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onCommit(clearOpening(params, selected, 'shelving'), 'Remove opening shelving', selected)
        }
      >
        Remove opening shelving
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onCommit(clearOpening(params, selected, 'contents'), 'Clear opening contents', selected)
        }
      >
        Clear opening contents
      </Button>
      <p>
        Repeat front or shelving replaces that setting on every leaf sibling. Other contents and
        divisions stay in place.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={!repeat}
        onClick={() =>
          onCommit(
            repeatOpeningContents(params, selected, 'front'),
            'Repeat opening front',
            parent!.id,
          )
        }
      >
        Repeat front to siblings
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!repeat}
        onClick={() =>
          onCommit(
            repeatOpeningContents(params, selected, 'shelving'),
            'Repeat opening shelving',
            parent!.id,
          )
        }
      >
        Repeat shelving to siblings
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!tree || !group}
        onClick={() =>
          tree &&
          onCommit(lockOpeningSizes(params, selected, tree), 'Lock opening sizes', group!.id)
        }
      >
        Lock current opening sizes
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={section.content.kind !== 'split'}
        onClick={() =>
          onCommit(equalizeNestedOpenings(params, selected), 'Equalize nested openings', selected)
        }
      >
        Equalize nested openings
      </Button>
    </section>
  )
}
