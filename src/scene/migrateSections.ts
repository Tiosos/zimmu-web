import { newSectionId, type Section } from './sectionTree'

// v12 described interior division twice: `dividers` as cumulative fractions of the width, and
// `fixedShelves` as a count repeated in every bay. Both are splits of the same tree — a divider is
// a vertical split, a fixed shelf a horizontal one — which is the whole reason the tree replaces
// them. This function is the only place that conversion exists: the file parser, the presets and
// the test sweep all call it.
//
// `width` and `thickness` are needed because the two models measure different things. A v12 divider
// is *centred* on a fraction of the gross width, so its bays are fractions of the width minus a
// half thickness at each divider and a whole one at each side; a section percentage is a share of
// the clear span that is left once every division has taken its thickness. Converting one to the
// other without the carcase's own dimensions moves every divider — by 3 mm on the 1400 mm sweep
// case — and the golden-master baseline catches it.
export function legacyToSection(
  dividers: number[],
  fixedShelves: number,
  width: number,
  thickness: number,
): Section {
  const bays = bayPercents(dividers, width, thickness).map((pct) =>
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

// Cumulative positions to shares of the clear span. A bay runs from the previous divider's right
// face (or the left side panel) to the next divider's left face (or the right side panel), which is
// exactly the span `carcaseBoxes` gave it before the tree existed.
function bayPercents(dividers: number[], width: number, thickness: number): number[] {
  const lefts = [thickness, ...dividers.map((d) => width * d + thickness / 2)]
  const rights = [...dividers.map((d) => width * d - thickness / 2), width - thickness]
  const clear = width - 2 * thickness - dividers.length * thickness
  const pcts = lefts.map((left, i) => ((rights[i] - left) / clear) * 100)
  // The shares sum to 100 by construction, but only exactly in real arithmetic. `validateSection`
  // rejects a split whose percentages exceed 100, and a cabinet that fails validation emits no
  // parts at all — so the last bay takes whatever the others left rather than its own quotient.
  return pcts.map((pct, i) =>
    i === pcts.length - 1 ? 100 - pcts.slice(0, -1).reduce((s, n) => s + n, 0) : pct,
  )
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
