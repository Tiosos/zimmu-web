# Cabinet assembly restructure — a Cabinet Vision-style section model

**Plan:** _(staged; written per stage — see [Staging](#staging))_
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
**Supersedes parts of:** `docs/superpowers/specs/2026-08-18-cabinet-assembly-design.md`

## Why this exists, and how the scope arrived here

This began as "add doors and drawer fronts to the carcase generator". The first design put fronts
in as a per-bay array alongside the existing `dividers` and `fixedShelves` parameters. The user
rejected that structure in favour of the Cabinet Vision assembly method, and the reasoning that
followed is worth recording, because the end scope looks disproportionate to the request:

1. In Cabinet Vision a cabinet's **front elevation is a recursive division tree**, and dividing a
   section is what *creates* the partition or shelf between its children. So `dividers` and
   `fixedShelves` are not peers of a front spec — they are consequences of the same tree.
2. Once the tree owns interior division, adjustable shelves belong to a section rather than to the
   cabinet, because a divider between a drawer bank and a door bay must not be bored on the drawer
   side.
3. The default joinery in Cabinet Vision is screw fixing that shows its holes, not a dado. Zimmu's
   three fastener methods currently emit nothing at all.
4. Joint method and material are per-part properties in Cabinet Vision, overridable from any face —
   and because a material carries a thickness, changing one **resizes the parts derived from it**.

Each step is a consequence of the one before, not scope creep. But the honest total is a
re-architecture of the carcase generator, not a feature. It is specified as one design because the
seven stages are one decision; it is implemented as seven plans because it is not one change.

## Scope, and what is deliberately excluded

**In scope:** the section tree; per-section interiors; per-part materials and thicknesses with
geometric propagation; a screw joint kind; per-joint overrides; fronts with overlay and inset
mounts; hinge, plate and slide machining; a cabinet-level editor with Section / Front / Top / End /
3D subtabs; a v13 file migration.

**Excluded, deliberately:**

- **Drawer boxes.** A drawer front is generated; the box behind it is not. This has a visible
  consequence, recorded under [Risks](#risks-and-things-that-will-surprise-someone).
- **Hardware in the BOM.** Machining positions are generated; no `HardwareItem` is emitted. The
  hardware model is a separate design.
- **Face frames and half-overlay.** This generator is frameless. Half-overlay exists to share a
  face-frame stile between neighbouring cabinets and has no meaning without one.
- **Vendor hardware catalogues.** Screw and hinge geometry is a documented constant, not a lookup.

## Decisions taken with the user

All taken in the 2026-08-27 session, in this order. Each was put as a question with the trade-off
stated; where the user chose against the recommendation it is marked.

| # | Question | Decision |
|---|---|---|
| 1 | How far does the section tree go? | Sections **replace** `dividers` and `fixedShelves` |
| 2 | How does a section divide? | N-ary split, per-child sizing rule |
| 3 | What does a division generate? | Carried on the split: `none` / `panel` / `rail`, defaulted by axis |
| 4 | Where do adjustable shelves live? | **Everything** per section *(against recommendation, which was count-per-section)* |
| 5 | Door leaf count and hinge | `leaves: 1 \| 2`; a single leaf names its hinge side |
| 6 | Which leaf front types? | All five: open, door, drawer-front, false-front, panel |
| 7 | Front mount modes | Both overlay and inset |
| 8 | Front material | Own slot, seeded from the carcase |
| 9 | How much machining? | Cups **plus** carcase-side screw rows *(against recommendation, which was cups only)* |
| 10 | Screw geometry source | Named constants in one module, Blum-style |
| 11 | Grain on fronts | Everything vertical *(against recommendation, which was horizontal drawer fronts)* |
| 12 | Scene tree shape | Mirrors the section tree *(against recommendation, which was Box + Fronts groups)* |
| 13 | Shell and division ownership | Shell on the cabinet; divisions on the split that made them |
| 14 | Adjustable shelves as boards? | Yes — real driven parts at pin positions |
| 15 | Section editing surface | 2D front-elevation editor in a modal |
| 16 | Front vs interior on one section | Splits drive the elevation; interior is separate |
| 17 | Where does thickness come from? | Material owns it; a part may override to any number > 0 |
| 18 | How are overrides represented? | An explicit `overrides` bag on the part |
| 19 | What does a screw joint emit? | Clearance holes on the face **and** pilot holes into the end |
| 20 | Where does a manual joint live? | On the derived joint itself, marked `driven: false` |
| 21 | Subtab interactivity | Section edits; Front / Top / End select-only |
| 22 | Default material slots | Three: carcase, back, front |

## `CarcaseParams` after the restructure

Stated up front, because three fields are deleted and five are added and the rest of this document
assumes the result.

```ts
export interface CarcaseParams {
  width: number
  height: number
  depth: number

  // Deleted: material, thickness, backThickness. Thickness now comes from the material.
  carcaseMaterial: string
  backMaterial: string
  frontMaterial: string

  hasTop: boolean
  backMode: 'captured' | 'applied' | 'none'
  baseMode: 'toe-kick' | 'ladder' | 'legs' | 'none'
  toeKickHeight: number
  toeKickSetback: number

  jointMethod: 'butt-screw' | 'dado-rabbet' | 'finger' | 'dowel' | 'confirmat' // now a default only

  // Deleted: dividers, fixedShelves, adjustableShelves. The tree owns all three.
  section: Section

  frontMount: 'overlay' | 'inset'
  frontReveal: number // mm — the visible gap, everywhere
}
```

Where this document writes a panel's thickness it means *that panel's* resolved thickness — its
override if it has one, otherwise its material's. It is never a single cabinet-wide `T`.

## The section tree

```ts
export type SectionId = string // "sec_<uuid>"

export interface Section {
  id: SectionId
  size: SectionSize          // how it claims space inside its parent's split
  interior: InteriorSpec     // what sits behind whatever covers it
  content: SectionContent
}

export type SectionSize =
  | { kind: 'equal' }
  | { kind: 'fixed'; mm: number }
  | { kind: 'percent'; pct: number }

export type SectionContent =
  | { kind: 'leaf'; front: FrontSpec }
  | {
      kind: 'split'
      axis: 'vertical' | 'horizontal'
      division: DivisionKind
      children: Section[]
    }

export type DivisionKind = 'none' | 'panel' | 'rail'

export type FrontSpec =
  | { kind: 'open' }
  | { kind: 'door'; leaves: 1 | 2; hinge: 'left' | 'right' } // hinge read only when leaves === 1
  | { kind: 'drawer-front' }
  | { kind: 'false-front' }
  | { kind: 'panel' }

export interface InteriorSpec {
  fixedShelves: number
  adjustable: {
    count: number
    rows: 1 | 2
    pitch: 32 // literal, not number: 32 mm *is* the system being modelled
    setback: number
    backSetback: number
  }
}
```

### Identity is a uuid, never a path

`regenerateOne` reconciles parts by role key. A positional key — `s.0.2` — would renumber every
sibling when a section is inserted, re-bind their parts, and rebuild panels that did not change,
losing their colours. A uuid means splitting one bay leaves every other bay untouched. It also
matches how the codebase already handles identity: `cmp_<uuid>`, `board_<uuid>`, `joint_<uuid>`.

### Role keys

The family is a prefix and the identity is the uuid, so `grainAxisOf` keeps matching on
`startsWith` and keeps its deliberately-fatal unknown-role contract.

| part | key |
|---|---|
| shell | unchanged: `left-side`, `right-side`, `bottom`, `top`, `back`, `toe-kick`, `ladder-*` |
| division from a split | `division-{sectionId}-{i}` |
| fixed shelf inside a section | `fixed-shelf-{sectionId}-{i}` |
| adjustable shelf | `adj-shelf-{sectionId}-{i}` |
| door | `door-{sectionId}`, or `door-{sectionId}-l` / `-r` for two leaves |
| other fronts | `drawer-front-{sectionId}`, `false-front-{sectionId}`, `panel-{sectionId}` |

### Splits drive the elevation; interior is separate

A pantry is **one leaf** with a door front and an interior of four fixed shelves. Those shelves
divide the cabinet but not the elevation. A fixed shelf between two open display sections is a
different thing: a horizontal split with `division: 'panel'`, visible in the elevation grid.

Conflating the two would make a door's children mean something different from an open section's
children, which is why `InteriorSpec` sits beside `content` rather than inside the leaf variant.

### Size resolution

Stated once so the validator and the layout cannot disagree. Within a split, in order:

1. Divisions consume their own thickness — `panel` and `rail` take the division part's own resolved
   thickness, `none` takes zero. A division part defaults to the `carcaseMaterial` slot and is
   overridable per part like any other, so a split's arithmetic depends on the override bag exactly
   as the shell's does.
2. `fixed` children take their millimetres.
3. `percent` children take their share of the **clear span that remains** after step 2.
4. `equal` children split what is left.

### Validation

Joins `validateCarcaseParams`, which stays total, side-effect free, and collects every error; the
generator emits nothing when it returns errors, so last-good parts survive a keystroke.

- a split has ≥ 2 children
- `fixed` mm > 0; `percent` pct in (0, 100]; percentages within one split sum to ≤ 100
- every resolved section span > 0
- `division: 'rail'` is rejected on a vertical split — a vertical stretcher across a front is a
  mullion, a different part with different joinery
- `door` leaves ∈ {1, 2}
- interior counts ≥ 0; pin setbacks ≥ the pin radius, now checked per section
- section ids unique within a cabinet

## Tree → geometry

### `resolveSections(p, overrides)`

One new pure pass. The root rectangle is the cabinet's opening, which today reads `x ∈ [T, W−T]` and
now must read the two sides separately — `x ∈ [leftSideThickness, W − rightSideThickness]`, with
`z ∈ [bayZ0, innerTop]` derived the same way from the bottom's and top's own thicknesses. **Every
place the current code spends `p.thickness` twice is a place that must now spend two different
numbers**, and a symmetric test fixture will not catch a mistake here: the plan needs at least one
case with different materials on the left and right sides.

Recursion subtracts each division's thickness from the parent's clear span, then applies the size
rule above. It returns each section id's rectangle, and each split's division boxes.

### `boundsOf(sectionId)`

The piece that does the real work. Four consumers need to know what bounds a section: pin bores need
its left and right uprights; hinge plate screws need the upright on the hinge side; slide screws need
both; every division needs to know what it is housed into. One function returns the role keys of the
four parts touching a rectangle — a shell panel or a division, whichever is nearest on each side.
One rule, four consumers, no second copy.

### Joints generalise rather than grow

Today `carcaseJoints` hardcodes a divider into bottom-and-top and a shelf into the two sides. Those
are one rule seen twice:

> A division is housed at both ends into whatever bounds its parent section along the perpendicular
> axis.

A vertical split's partition meets the parent's top and bottom bounds; a horizontal split's shelf
meets its left and right bounds. Shell joints — sides to bottom, top, back, toe kick — are untouched.
`extendToward` runs exactly as it does now: it consumes joint descriptors and does not care where
they came from.

### What each division kind emits

| kind | vertical split | horizontal split |
|---|---|---|
| `panel` | full-depth partition, `y ∈ [0, shelfBackY]` | full-depth fixed shelf, same y extent |
| `rail` | rejected by the validator | front stretcher, `y` spanning its own thickness from the front face, butt-jointed at its ends |
| `none` | nothing | nothing |

### Interior parts

From the leaf's `InteriorSpec`: `fixedShelves` evenly spaced across the section's own height, housed
into its left and right bounds; `adjustable.count` boards seated at pin positions, plus the pin bores
into those same bounds — bounded to the section's own z-range.

### Ordering

Remains a documented contract: shell first in its current order, then a depth-first walk of the tree.
Every existing shell role keeps its index, so `PART_COLORS[i % n]` keeps assigning the same colours
to the same shell panels.

## Materials own geometry

`MaterialDef` gains `thickness`. `CarcaseParams.thickness`, `backThickness` and `frontThickness` are
deleted, replaced by three slots: `carcaseMaterial`, `backMaterial`, `frontMaterial`.

**"18mm Ply" and "25mm Ply" become distinct materials.** That is what they are on an invoice, and it
is how Cabinet Vision treats them. Both `scene.materials` (per file) and the IDB `library` (global)
carry the thickness; the existing rule that the two are merged only at the BOM layer is unchanged.

Every `T` inside `carcaseBoxes` becomes *that panel's* thickness. This is what makes propagation
real: assigning a 25 mm material to the sides resolves the bottom to `W − 50` because the layout read
25 twice — not because anything watched for a change.

## Overrides

```ts
part.overrides?: { thickness?: number; material?: string }
```

Applied on top of the driven value. A thickness override is any number > 0 and wins over its
material. The part stays `driven: true` — it still follows width, depth and joinery changes. This
generalises what `regenerateOne` already does implicitly for `label`, `color`, `visible` and
user-authored cuts, but makes it explicit, resettable per field, and visible in the UI.

### The inversion this forces

**Overrides are read before layout, not applied after it.** A 25 mm override on a side is what makes
the bottom come out at `W − 50`, so the layout must see it. `carcaseBoxes(params)` becomes
`carcaseBoxes(params, overridesByRole)`. It stays pure; its input grows.

The generator now reads from the parts it generates. That loop must resolve in one direction —
overrides in, boxes out — with no second pass and no fixed-point iteration. An override may not
depend on a generated dimension.

## Joints

### Screw fixing is the default

A sixth member of the `Joint` union, shaped like the existing five — explicit numeric fields, nothing
derived at read time:

```ts
export interface ScrewJoint {
  kind: 'screw'
  id: string // "joint_<uuid>"
  label: string // "Screw fixing 1"
  sourceComponentId?: string
  driven: boolean
  throughPartId: PartId // panel screwed through — clearance holes on its face
  throughFace: Face
  receivingPartId: PartId // panel receiving them — pilots into its end
  receivingEnd: Face
  screwCount: number
  endInset: number // first and last screw, from each end of the joint line
  clearanceDiameter: number // ⌀5
  pilotDiameter: number // ⌀3
  pilotDepth: number
}
```

Both halves are `HoleArrayCut`s, which buys two behaviours already built and tested: `occupancyMask`
ignores hole arrays, so screws never perturb the nest; and the drawing viewer dashes a bore whose
`depth < throughDepth`, so a pilot reads correctly on a shop drawing with no new primitive.

`CARCASE_PRESETS` flips from `jointMethod: 'dado-rabbet'` to `'butt-screw'`. `jointMethod` becomes
the cabinet's **default** only.

Screw count is derived from joint length: one at each end inset by `endInset`, intermediates added
until no gap exceeds a documented maximum spacing.

### Per-face override

Select a face pair, choose a kind. The derived joint keeps its deterministic id
(`joint_{componentId}_{housingRole}__{housedRole}`), takes the new kind, and is marked
`driven: false`.

**No new concept is required.** Every `Joint` member already carries `driven: boolean`. What changes
is one line in `regenerateOne`, which today replaces every joint matching its `sourceComponentId`
unconditionally: it must now preserve those marked `driven: false`, exactly as it already preserves
a detached part. One joint per contact makes two faces unable to contradict each other.

## Fronts

### Mount and reveal

A front is a panel on the cabinet's front face — `y = 0`, with y running front to back, confirmed
against the toe-kick setback and the shelf-pin front row (`carcaseRoles.ts:585`).

Writing `FT` for the front's own resolved thickness — its override, or the `frontMaterial`'s:

- **Inset:** `y ∈ [0, FT]`, outer face flush with the carcase edges.
- **Overlay:** `y ∈ [−FT, 0]`, inner face against them.

The governing rule is stated once: **every visible gap equals `frontReveal`.** The two mounts differ
only in what a front's cell is.

| | cell | edge treatment |
|---|---|---|
| inset | the section's own rectangle | edges meeting carcase material inset by the full reveal; edges meeting another front inset by half, so the gap between them is one reveal |
| overlay | the section's rectangle expanded to the midline of any division it abuts, or to the cabinet's outer edge | every cell edge inset by half a reveal — so gaps between fronts *and* between neighbouring cabinets both come out at one reveal |

The overlay vertical extent is `[floorZ(p), H]` in every base mode: the door covers the carcase body,
whose underside is the bottom panel's underside. `floorZ` already returns `toeKickHeight` for both
toe-kick and ladder bases and 0 otherwise, so no base-mode branch is needed.

### Material and grain

Fronts take the `frontMaterial` slot, so their thickness comes from it like any other panel. Material
is the nest's grouping key, so a distinct front material forms its own nest group with its own sheet
count and cost line — this changes the yield report, not just a label.

Grain runs **vertical on every front**. Fronts are thickness-on-y panels exactly like `back`, and
`grainAxisOf` already returns `'z'` for `back`, so fronts join that branch verbatim and
`grainFieldFor('y', 'z')` resolves to `'length'` through the existing `GRAIN_IN_PLANE.y` map. No new
map entry, and no hand-tabulated role→field row — the design doc's table stays a consequence.

### Fronts need no special-casing in the joinery pass

`carcaseRoles` extends panels by iterating `carcaseJoints`' descriptors. A front appears in no
descriptor — it hangs on hardware, it is housed in nothing — so `extendToward` never reaches it and
it passes through face-to-face sized. A front is simply a box no joint mentions.

## Machining

A new module owns this. Its name should say what it holds, and its module comment must say the
non-obvious thing: **it owns the machining that fronts imply, which is not the same as machining on
fronts** — hinge plate and slide screws are bored into the carcase sides, driven by front parameters.

- **Hinge cups**, on the door's back face: ⌀35, 12.5 mm deep (blind), cup centre 22.5 mm from the
  hinged edge. Count derived from door height; first and last inset a fixed distance from each end,
  the remainder evenly spaced, so the row is expressible as one `HoleArrayCut` with a uniform pitch.
- **Hinge plate screws**, into the flanking upright on the hinge side: two per hinge, 32 mm apart
  along the panel's depth, at the cup's height, a fixed setback from the front edge.
- **Drawer slide screws**, into both flanking uprights of a drawer section: a row along the depth at
  the slide height, 32 mm pitch.

All figures are **named constants in one module**, documented as Blum-style 32 mm-system values, with
a comment stating that the hardware model in a later design supersedes them. No vendor parameter is
added: a hardware item will carry its own geometry, and a parameter now would be orphaned then.

## UI

### Scene tree

Mirrors the section tree. Shell parts are direct children of the cabinet — they exist before any
split does. A division part is listed under the section whose split created it, before that section's
children, because it belongs to the split rather than to either child it sits between.

```
Base 600
├─ Left Side, Right Side, Bottom, Top, Back, Toe Kick     ← shell, cabinet-level
└─ Opening                                                 ← root section
   ├─ Partition 1                                          ← this split made it
   ├─ Section 1
   │  └─ Drawer Front 1, Drawer Front 2, Drawer Front 3
   └─ Section 2
      └─ Door
```

Fronts and box parts remain parts of the **same component**; the grouping is presentation, not
ownership. The detach contract (`role: undefined` makes a part the user's) works unchanged for a door
exactly as it does for a side.

### The cabinet editor

Subtabs at the cabinet edit level:

- **Section** — the interactive elevation editor. Click a section to select, split it horizontally or
  vertically, set child sizes, assign a front type. The first interactive SVG in the codebase.
- **Front / Top / End** — whole-cabinet orthographic projections. Clicking a part selects it and opens
  its properties (material, thickness, joints) in the sidebar.
- **3D** — the existing viewport, filtered to this cabinet.

`buildDrawingSheet` generalises from one part to a part set rather than growing a second projector
that would drift from the first.

`parameterForRole` (`carcaseRoles.ts:616`) currently maps a role back to the parameter driving it. It
now maps to a section id plus a field, which is what lets a click in any view select the section a
part belongs to.

## File format and migration

`FILE_FORMAT_VERSION` goes to **13**. This bump is earned: a v12 app reading a v13 file would find no
`dividers`, no `fixedShelves`, no `thickness`, and would render a different cabinet.

The v12 → v13 migration is mechanical:

- `dividers: number[]` → a root section split vertically into `dividers.length + 1` children with
  `division: 'panel'`, sized by percentage to reproduce the original fractions.
- `fixedShelves: n` → each bay child split horizontally into `n + 1` grandchildren with
  `division: 'panel'`.
- `adjustableShelves` → copied onto every leaf's `InteriorSpec`.
- `thickness` / `backThickness` / `frontThickness` → materials are synthesised at those thicknesses
  and assigned to the three slots.
- every leaf gets `front: { kind: 'open' }`.

## Staging

Seven plans. Each ships green with its own acceptance.

| | stage | acceptance |
|---|---|---|
| A | Section tree, output-identical, + v13 migration | the migrated tree reproduces v12 roles, boxes and joints across the existing 96-case sweep |
| B | Materials own thickness; the override bag | a 25 mm side resolves the bottom to `W − 50`; an override survives a width change |
| C | Screw joints as the default; per-joint override | presets flip; clearance and pilot arrays land; an overridden joint survives regeneration |
| D | Adjustable shelf boards; per-section pin bores | shelves reach the cutting list; no rows on drawer-bay faces |
| E | Fronts — mounts, reveals, material, grain | every visible gap equals `frontReveal`, in both mounts |
| F | Front machining — cups, plate and slide screws | bores land at the 32 mm system positions |
| G | The cabinet editor and its subtabs | section edits round-trip; projections select |

**Stage A is shippable, not a broken intermediate.** The existing `CarcasePanel` divider field and
shelf counters stay, rewritten as a shim that writes simple trees — *n* bays, *m* shelves. Nothing
regresses, and the real editor arrives in G.

## Testing

The rule this project has earned the hard way: **check the system against itself, never against a
number a human or a model supplied.** Every real defect in the cabinet-assembly work was found by
pairwise overlap, coverage assertions, parameter sweeps and mutation testing; every test asserting a
number the author chose passed while baking the same error into both sides.

So the acceptance properties here are recomputed from outputs:

- **Stage A's output-identity** is the strongest property available: for every case in the 96-case
  sweep, the migrated tree's roles, boxes and joints must equal what the v12 parameters produced.
  Both sides are derived; neither is typed.
- **Size resolution** — resolved child spans plus division thicknesses must equal the parent's span,
  for any tree, at any depth.
- **`boundsOf`** — every division's two ends must touch the parts `boundsOf` names, verified by
  coordinate comparison rather than by role name.
- **Reveals** — no two fronts on a cabinet closer than `frontReveal`; every inset front clears
  surrounding material by exactly `frontReveal`. True for any correct implementation, so it survives
  a formula change.
- **Thickness propagation** — for a swept range of side thicknesses, the bottom's length must equal
  `W − 2 × sideThickness`, computed from the emitted parts.
- **Role coverage and grain totality** must be re-derived over the tree's own case space, not the old
  divider/shelf sweep, and `grainAxisOf` must stay total over it.
- Every guard added must be **mutation-tested**. A test that cannot fail is not evidence.

## Risks and things that will surprise someone

- **Stage A's output-identity does not extend to pin bores.** A bore now spans a *section* rather
  than a panel, so a subdivided bay's rows change. This is a deliberate behaviour change and the
  correct one — the old rows ran past the shelves they served — but the plan must measure which
  shipped presets hit it rather than asserting none do. The sheet-yield spec made exactly this
  mistake, claiming a change re-baselined nothing when it re-baselined real rows.
- **Stage B changes what `shapeKey()` must encode.** Thickness now has two possible sources, material
  and override. `shapeKey` is the geometry cache key; if it reads the wrong one, a material change
  silently fails to rebuild.
- **A drawer front has no drawer box.** Slide screw rows are bored into the uprights at a height
  derived from the front's own centreline, because there is no box to derive it from. When drawer
  boxes land, that height is likely to move.
- **The generator reads from the parts it generates.** Overrides in, boxes out. If anything ever
  makes an override depend on a generated dimension, the pass stops being a function.
- **`carcaseRoles.ts` is 649 lines against a 1585-line test file** before any of this. Stage A should
  split the layout pass into its own module rather than growing that file further.
- **Two Cabinet Vision behaviours were characterised from general familiarity, not from the product.**
  The recursive section tree and the per-part material override were confirmed with the user; anything
  else attributed to Cabinet Vision in this document is a description of what Zimmu will do, not a
  claim about what Cabinet Vision does.
