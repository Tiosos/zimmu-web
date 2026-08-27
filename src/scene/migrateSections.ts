import { newSectionId, type Section } from './sectionTree'

// v12 described interior division twice: `dividers` as cumulative fractions of the width, and
// `fixedShelves` as a count repeated in every bay. Both are splits of the same tree — a divider is
// a vertical split, a fixed shelf a horizontal one — which is the whole reason the tree replaces
// them. This function is the only place that conversion exists: the file parser, the presets and
// the test sweep all call it.
export function legacyToSection(dividers: number[], fixedShelves: number): Section {
  const bays = bayWidths(dividers).map((pct) =>
    withShelves({ kind: 'percent' as const, pct }, fixedShelves),
  )
  // A single bay is the whole cabinet: it has no parent to be a percentage of, so as root it
  // reverts to `equal` — the same default every fresh section starts from.
  if (bays.length === 1) return { ...bays[0], size: { kind: 'equal' } }
  return {
    id: newSectionId(),
    size: { kind: 'equal' },
    content: { kind: 'split', axis: 'vertical', division: 'panel', children: bays },
  }
}

// Cumulative positions to widths: [0.25, 0.5] is bays of 25%, 25% and 50%.
function bayWidths(dividers: number[]): number[] {
  const edges = [0, ...dividers, 1]
  return edges.slice(1).map((e, i) => (e - edges[i]) * 100)
}

function withShelves(size: Section['size'], fixedShelves: number): Section {
  const id = newSectionId()
  if (fixedShelves <= 0) return { id, size, content: { kind: 'leaf' } }
  return {
    id,
    size,
    content: {
      kind: 'split',
      axis: 'horizontal',
      division: 'panel',
      children: Array.from({ length: fixedShelves + 1 }, () => ({
        id: newSectionId(),
        size: { kind: 'equal' as const },
        content: { kind: 'leaf' as const },
      })),
    },
  }
}
