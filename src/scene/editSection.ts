// Every change to the section tree's *shape*. Its two siblings write what a section holds —
// `setInterior` and `setFrontOn` in `sectionInterior.ts` — and this writes how it is divided.
//
// Pure and total, and total in the same way they are: an id naming nothing returns the tree
// unchanged rather than throwing. A selection outlives the tree it names every time the divider
// shim rebuilds one, so a stale id is ordinary rather than exceptional.

import {
  newSectionId,
  type DivisionKind,
  type Section,
  type SectionId,
  type SectionSize,
} from './sectionTree'

// Applies `f` to the section with `id` and rebuilds the spine above it, leaving every other node
// referentially identical. Written once because all three operations below are the same walk.
function edit(root: Section, id: SectionId, f: (s: Section) => Section): Section {
  if (root.id === id) return f(root)
  const content = root.content
  if (content.kind === 'leaf') return root
  const children = content.children.map((c) => edit(c, id, f))
  // Referentially identical when nothing below changed, so React sees no new object for a branch
  // the edit did not touch — and so the "leaves the tree alone" tests can use `toEqual` honestly.
  return children.every((c, i) => c === content.children[i])
    ? root
    : { ...root, content: { ...content, children } }
}

// Divides a section into `count` children. Children inherit the parent's front and interior: a user
// who splits a doored bay in two should get two doored bays, not one silently undoored one. The
// parent's own copies are cleared, because only leaves are read and a field nothing looks at is one
// that will be wrong when something finally does.
export function splitSection(
  root: Section,
  id: SectionId,
  axis: 'vertical' | 'horizontal',
  division: DivisionKind,
  count: number,
): Section {
  // `validateSection` rejects a split with fewer than two children. Refusing here keeps a tree that
  // cannot be built from ever existing, rather than building one and reporting it afterwards.
  if (count < 2) return root
  return edit(root, id, (s) => {
    const child = (): Section => ({
      id: newSectionId(),
      size: { kind: 'equal' },
      content: { kind: 'leaf' },
      ...(s.front === undefined ? {} : { front: s.front }),
      ...(s.interior === undefined ? {} : { interior: s.interior }),
    })
    return {
      id: s.id,
      size: s.size,
      content: { kind: 'split', axis, division, children: Array.from({ length: count }, child) },
    }
  })
}

// Collapses a split back to a leaf, adopting the first child's front and interior — the mirror of
// the split rule, so split-then-unsplit returns a section carrying what it carried before.
export function unsplitSection(root: Section, id: SectionId): Section {
  return edit(root, id, (s) => {
    if (s.content.kind === 'leaf') return s
    const [first] = s.content.children
    return {
      id: s.id,
      size: s.size,
      content: { kind: 'leaf' },
      ...(first.front === undefined ? {} : { front: first.front }),
      ...(first.interior === undefined ? {} : { interior: first.interior }),
    }
  })
}

export function setSectionSize(root: Section, id: SectionId, size: SectionSize): Section {
  return edit(root, id, (s) => ({ ...s, size }))
}
