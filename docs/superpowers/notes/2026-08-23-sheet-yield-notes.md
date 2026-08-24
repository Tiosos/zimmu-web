# Sheet yield and grain — implementation notes

**Spec:** `docs/superpowers/specs/2026-08-23-sheet-yield-design.md`
**Plan:** _(staged; written per stage)_

Living record of decisions that do not belong in the spec — why an approach was rejected, what was
discovered during implementation, and anything that would surprise a future reader.

## 2026-08-23 — how the scope arrived here

Worth recording because the feature looks disproportionate to its origin. It started as a
cutting-list defect: a generated cabinet side is stored `length 560, width 720`, so the list said
"cut it 560 long" for a 720 mm tall panel. Fixing *that* (Task 7.9, `cutDimensions`) raised the
question of what decides which dimension is the length — and the honest answer is grain, not size.
Grain in turn only earns its place if something consumes it, which is yield.

So the chain was: wrong label → what defines length → grain → why model grain → nesting. Each step
was a real consequence of the one before, not scope creep.

### Options rejected along the way, and why

- **Fixing the length/width swap in the geometry** rather than the cutting list. Rejected on
  measurement: `orientedPanel` maps all three board axes onto carcase axes *positively*, which is
  precisely what makes `position` the box min corner. Putting length on the long axis needs
  board x→x, y→z, z→y — a transposition, determinant −1, not a rotation. It is unreachable without
  an improper mapping, which would mean compensating position on every such panel and re-deriving
  the toe-kick notch, the joint faces, and the ladder contact decision. The cutting list was the
  cheap and correct place.
- **Guillotine nesting.** Rejected by the user in favour of free nesting (CNC). Guillotine would
  have produced a followable cut sequence; see the stated assumption in the spec for the tension
  this creates with a visual-only output.
- **No-fit polygons.** Rejected in favour of raster occupancy. NFP is the literature-standard method
  and would be exact, but its failure modes — degenerate contacts, concave-concave cases, holes,
  floating-point robustness — are the kind that consume weeks. At 1 mm, rasterisation is finer than
  router tolerance and the no-overlap property is directly checkable.
- **Continuous rotation.** Rejected: it turns an enumerable placement search into an optimisation
  over a continuous space, with run-to-run variation. A nest that shuffles on every keystroke is
  unusable in a live design tool.
- **Grain-free defaults for hidden parts** (backs, toe kicks, ladder rails). Proposed as a yield
  win and rejected by the user: every generated panel carries grain, and `free` is a manual
  override. Recorded because the yield cost of that choice is real and someone will ask.

### The board-frame subtlety

The per-role grain table lands on `width` for sides and `length` for shelves, expressing the *same*
physical convention. This is a consequence of each panel having its own board frame, not an
inconsistency. Anyone tempted to normalise it should read the `orientedPanel` parity argument first.

A property that makes Stage 1 cheap: for every generated role, the grain-running dimension is also
the larger one, so grain and `cutDimensions`' longest-first rule agree on every carcase panel. They
diverge only for a hand-made board whose grain was set across the short edge. Assert this in a test
— if it ever stops holding, a role table changed and the cutting list moved with it.
