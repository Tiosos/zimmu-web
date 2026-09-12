# Drawer boxes — the front finally has something behind it

**Status:** Designed. Not yet implemented.
**Notes:** `docs/superpowers/notes/2026-09-12-drawer-boxes-notes.md`

A drawer front is generated. The box behind it is not. This design adds the box as a driven child
component with its own generator, and re-baselines the two figures that the absence of a box forced
into approximations.

## Why now

The cabinet-assembly restructure excluded four things deliberately. Hardware in the BOM shipped on
2026-09-11. Face frames and half-overlay need a face frame first, which is its own slice. Vendor
catalogues are a lookup layer over constants that now exist. Drawer boxes are the one left, and two
shipped figures are recorded in two separate specs as waiting on them:

- **Slide screw height** comes off the drawer front's own centreline, because there is no box to
  measure from. `carcaseRoles.ts` carries a comment at that exact line saying the figure is expected
  to move.
- **Runner length** comes off the cabinet's clear internal depth for the same reason. The driven
  hardware spec says both figures should be revisited together.

So this is not a new feature bolted on. It is the removal of two stated approximations.

## Scope

**In scope:** a `DrawerComponent` with its own parameters, including a runner family; a
`regenerateDrawers` generator emitting five boards per drawer; box metrics stated once and read by
two callers; the slide screw height re-baselined onto the box; a v18 file format; **both** the
cutting list's and the hardware BOM's cabinet attribution fixed to resolve the nearest carcase
ancestor; the undermount back notch and locating hole.

**Excluded, deliberately:**

- **Box joinery beyond a screwed carcase default and the bottom groove.** No dovetails, no rabbeted
  corners. The sides are screwed, which is what the carcase already defaults to.
- **Runner systems beyond the two families below.** Side-mount and undermount ship; a full vendor
  catalogue with per-model geometry does not. A drawer names a *family*, not a product.
- **Drawer fronts themselves.** They already generate as carcase roles and stay that way.
- **Per-drawer front alignment.** Fronts are sized by `frontCells`; this design does not touch it.

## Decisions taken with the user

Taken in the 2026-09-12 session, in this order. Each was put as a question with the trade-off
stated. Where the user chose against the recommendation it is marked.

1. **A box is correct boards, screwed.** Not placement-only, and not fully joined. The cutting list,
   the nest and the hardware BOM must all be complete and correct; the box does not need a joinery
   vocabulary the app lacks.
2. **A drawer is a child component, not a set of carcase roles.** *Chosen against the
   recommendation.* The recommendation was carcase roles, on the grounds that fronts and shelves
   already work that way and every consumer handles them. The user chose the child component, which
   realises what the 2026-08-18 cabinet-assembly design actually specified: "Fronts (doors, drawer
   boxes) are **child components with their own generators**, not carcase parameters." Fronts shipped
   as carcase roles instead, so that claim has been contradicted once already. This design honours it
   rather than contradicting it a second time.
3. **The section tree drives the drawer's lifecycle.** An opening whose front is a drawer front has
   exactly one drawer component. Change the front to a door and the drawer goes. The alternative,
   a user-created drawer, would leave "a drawer front with no box" possible, which is the exact
   defect this work exists to close.
4. **The slide height re-baselines onto the box, and the runner offset is a parameter.** *Chosen
   against a stated caveat.* The caveat was that the driven hardware design explicitly declined to
   add vendor parameters, on the grounds that a hardware item will later carry its own geometry and
   a parameter now would be orphaned then. The user chose the parameter anyway. It is consistent
   with decision 2: a component that owns its own parameters is the natural place for it.
5. **Box height is a per-drawer parameter with a derived default.** Front height minus a stated
   clearance, overridable. A shallow box behind a tall front is ordinary where plumbing or a rail
   is in the way, and a derived-only rule cannot express it.
6. **The bottom sits in a groove.** Not screwed underneath. The groove is a cut the generator
   already emits, it is how drawers are actually built, and it makes the bottom's size derivable
   from the groove rather than guessed.
7. **The drawer generator is its own pipeline stage.** Not an extension of `regenerateComponents`,
   and not a step inside the per-carcase loop. See the cycle below.

Taken after the L99 review, once measuring the code contradicted three claims in the first draft:

8. **A drawer board is attributed to its cabinet, not its drawer**, in both the cutting list and the
   hardware BOM. Identical boards from two drawers in one cabinet then merge, which is correct for
   cutting.
9. **`driven` goes on the drawer component only**, not on all component kinds. A detached carcase
   has no defined meaning today.
10. **Drawer boxes appear in the cabinet's shop drawings**, and the plan measures which views move
    rather than assuming none do.
11. **Both runner families ship.** *Chosen against the recommendation.* The recommendation was
    side-mount alone, cited at 12.7 mm, because it matches the grooved bottom and screwed sides
    already agreed and needs no new geometry. The user chose both, on the grounds that real shops
    use both. This is the largest single addition to the design: two width rules that are not the
    same rule with different constants, two bottom treatments, and a back notch plus locating hole
    that only one family needs.

## The cycle, and how it is broken

Slide screws are bored into the carcase uprights, which are carcase parts, at a height that now
comes from the box. The box is generated by the drawer. So the carcase appears to need the drawer's
output while the drawer needs the carcase's front cells.

That would break the generator's stated invariant: **overrides in, boxes out, a function in one
direction.** An override that depended on a generated dimension would turn the pass into a
fixed-point iteration, and the same is true here.

It is broken the way this codebase breaks it everywhere else — `pinRow`, `clearDepth`, `frontCells`
— by stating the rule once and letting two callers read it:

```
drawerBoxMetrics(frontRect, params, thicknessOf) → { box, runnerHeight, grooveLine }
```

The drawer generator reads it to build boards. `carcaseMachining` reads it to place slide screws.
Neither reads the other's output, so there is no cycle. A second copy of the runner height is how
the box and the screws that carry it come to disagree.

## Pipeline

`applyPipeline` goes from two stages to three:

```
regenerateDrawers → regenerateComponents → reconcileJoints
```

**Drawers run first**, which is the part worth stating. The carcase's slide machining reads drawer
*parameters*; the drawer reads nothing the carcase *emits*. Its inputs are the section tree, the
drawer parameters and the materials, all of which exist before the carcase pass. Run the other way
round, the first pass after an opening becomes a drawer front would bore no slide screws and the
second would, which is convergence over two passes rather than idempotence in one.

All three stages stay pure and idempotent. **This rewrites the "the regeneration pipeline order is
fixed" invariant in CLAUDE.md from two stages to three**, with the ordering reason stated. That edit
is part of the work, not a side effect of it.

`regenerateDrawers` is the first stage that reconciles **components**, not just parts and joints. It
creates one drawer per drawer-front opening, removes those whose opening is gone or whose front kind
changed, and emits the boards. Reconciliation is by `(cabinetId, sectionId)`, never by index: the
v12 divider shim rebuilds section ids on every keystroke, and an index would rebind a drawer to a
different bay.

## The box

**Five boards, keyed within the component**, which needs no section id because the component is
already per-opening:

| Role | Length | Width | Notes |
|---|---|---|---|
| `box-left`, `box-right` | box depth | box height | |
| `box-front`, `box-back` | box outside width − 2 × side thickness | box height | Between the sides |
| `box-bottom` | inside depth + 2 × groove depth | inside width + 2 × groove depth | Side-mount only |

**The box front is not the drawer front.** The drawer front is a carcase role and stays one; the box
carries its own front for the applied front to screw to. A four-sided open tray would be wrong, and
would also leave the applied front joined to nothing.

**Depth** is the runner nominal from `runnerKeyFor(clearDepth)`, which already ships and already
chooses the runner for the hardware list, so the box and the quoted runner cannot disagree about
length. Both families define the nominal as the drawer depth rather than the runner's own length.

**Height** is the parameter, defaulting to the front cell's height minus a clearance, clamped to the
opening.

*Inside* width and depth are the box's outer dimensions less two side thicknesses. Where a bottom is
grooved it adds back twice the groove depth, so the bottom's size follows the groove figure
automatically rather than being a sixth number that can drift out of step with it.

## The two runner families

A drawer names a family, and the family decides three things: how width is derived, how the bottom
is captured, and where the runner sits. **This is the widest part of the design**, and it exists
because a real shop uses both.

| | Side-mount | Undermount |
|---|---|---|
| Width rule | **Outside** width = clear width − 2 × side clearance | **Inside** width = opening width − a stated deduction |
| Side clearance / deduction | 12.7 mm each side | 42 mm total for side material ≤ 16 mm; 49 mm above that |
| Bottom | Captured in a groove | Rests on the runner; no groove |
| Back | Plain | Notch for the locking device, plus a locating hole |
| Runner height | Box bottom + the parameter | The box bottom itself; the runner carries it |

The two width rules are **not** the same rule with different constants. Side-mount fixes the gap
either side of the box; undermount fixes the box's *interior*, so its outside width moves with the
side material's thickness. Modelling undermount as a per-side clearance is the mistake this section
exists to prevent: at 16 mm sides the undermount outside clearance works out near 5 mm a side, not
12.7 mm, and a box built to the wrong rule fouls the cabinet or rattles in it.

**The back notch and locating hole are ordinary cuts.** The notch is a box cut and the hole is a
single-hole array, both of which the generator already emits and `shapeKey` already encodes. No new
cut kind is needed.

### Stated figures

| Figure | Value | Source |
|---|---|---|
| Side-mount clearance per side | 12.7 mm (1/2") | Side-mount ball-bearing convention |
| Undermount inside-width deduction | 42 mm (≤ 16 mm sides), 49 mm above | Blum TANDEM |
| Undermount back notch | 1/2" tall × 1-3/8" wide minimum | Blum TANDEM |
| Undermount locating hole | 6 mm diameter × 10 mm deep | Blum TANDEM |
| Undermount box height clearance | 7 mm top, 14 mm bottom | Blum TANDEM |
| Side-mount runner height above box bottom | parameter, default 32 mm | **Unsourced.** Model-specific. |
| Box height below front height | 25 mm | Convention |
| Groove up from bottom edge | 10 mm | Convention |
| Groove depth | 6 mm | Convention |

**A warning about these figures that the plan must carry forward.** The egress proxy in this
environment blocked every primary PDF, Blum's own included. The TANDEM numbers above come from
vendor and distributor summaries, **not from the printed Blum document**. They are plausible and
mutually consistent, and they are not verified. Before anyone cuts material to them, they must be
checked against Blum's published installation instructions for the specific runner. The
side-mount runner height is worse than unverified: it is a convention I chose, and it is
model-specific in a way the other figures are not.

This is the same risk class as the hinge-count table, and for the same reason: a wrong figure here
produces a perfectly self-consistent drawer that does not slide.

### The decline path

If the cabinet is too shallow for the smallest runner, `runnerKeyFor` returns nothing and the
hardware list already omits the runner. **The drawer then emits no box either.** That mirrors the
existing rule that a door too thin to bore lists no hinge: the generator declines rather than
inventing a size. A box emitted beside a missing runner would be a drawer that cannot be built.

## File format

**`FILE_FORMAT_VERSION` 17 → 18.** A new component kind and `DrawerParams` both have to parse.

**No migration data is needed.** A v17 file with drawer-front openings simply has no drawer
components; regeneration creates them on load, because they are driven by the section tree. The
parser only has to accept the new kind.

**A `parseFile` test is required, not just a typecheck.** CLAUDE.md already states that `useFile.ts`
types `base.params` loosely, so `tsc` will happily compile a parser that produces objects missing a
required field, and the failure appears only when the generator dereferences it at runtime.

## Ownership and detaching

**No component has ever carried `driven`.** Parts have it; components do not. This design adds it to
the drawer component only, which is a new concept at the component level and is presented as one
rather than smuggled in as an established pattern.

**A detached drawer is the user's**: no regeneration, no deletion, matching the rule parts already
follow. Without it, the next pass would delete a box someone had hand-edited. Carcases and groups
are deliberately left alone; a detached carcase has no defined meaning today and inventing one here
would be scope this design has not earned.

## Consumers

Every claim below was checked against the code. Three that were asserted in the first draft turned
out to be wrong or incomplete, and are corrected here.

**Genuinely needs nothing.** `resolveWorldMatrix` composes through ancestors already and is the
single source of world placement. The nest treats box boards as ordinary boards. Grain reads a
role's family. `reconcileJoints` never inspects component kind, so drawer joints work untouched.
`regenerateOne` scopes itself to `parts.filter(p => p.parentId === component.id)`, so it will not
delete drawer boards. **`shapeKey` already encodes box cuts and hole arrays**, so the bottom groove,
the back notch and the locating hole need no change there — a check the project rules demand
explicitly whenever a shape-affecting field is added.

**Both BOM consumers misattribute a drawer board, not just one.** The first draft claimed the
cutting list already handled this. It does not. `groupParts` calls `ancestorsOf(p, byId)[0]`, and
`ancestorsOf` returns **nearest-first**, so index zero is the immediate parent. For a carcase part
that is the cabinet; for a drawer board it is the drawer. So the Cabinet column would read the
drawer's label, and because that label is part of the grouping key, identical box sides from two
different cabinets would merge into one row under a generic drawer name.

`carcaseHardware` has the same defect in a different shape, resolving an owner only when the direct
parent is a carcase:

```ts
const owner = part.parentId !== null && carcases.has(part.parentId) ? part.parentId : null
```

Its drawer screws would tally as `Ungrouped` — emitted, but attributed to no cabinet.

**Both are fixed the same way: resolve the nearest carcase ancestor.** Stating that rule once and
having both call it is what makes the two agree by construction rather than by coincidence. It is
the same shape as every other "stated once" rule in this codebase.

**`carcaseMachining` cannot reach the drawer parameters.** Its signature is
`(p, thicknessOf, kindOf, role)` — carcase params and a role, nothing else. Placing a slide screw
from the box requires the drawer's parameters for that section, so the signature grows and the new
argument is threaded from `regenerateComponents`, its only call site. The first draft asserted the
read without naming the plumbing.

**The shop drawings change, and the change must be measured.** `descendantIds` is recursive, so the
3D view and the cabinet projections already collect parts of nested components. Drawer boxes will
therefore appear in Front, Top and End without anyone adding them. That is wanted — Top and End are
sections, and a section that omitted the thing it cuts through would be a worse drawing — and Front
should hide them behind the applied front through ordinary hidden-line removal. **None of that may
be assumed.** The plan measures which views actually change on which presets. The sheet-yield spec
claimed a change re-baselined nothing when it re-baselined real rows, and this design has the same
opportunity to be wrong in the same way.

**Needs showing.** The scene tree must render a drawer under its cabinet, with its boards under it.

## Testing

The generator gets the treatment the carcase generator got: pure input-to-output tests on the seam,
and **every new rule mutation-tested** — break it deliberately, watch a test fail, restore. A test
that cannot fail is not evidence.

Two fixtures matter most, and neither exists today:

- **Drawer bays at more than one height.** A runner offset or a box height copied between drawers
  passes any single-drawer fixture. This is the same defect class as the single-opening fixture that
  let `sections[0]` survive fifteen tests during the hardware work.
- **A cabinet too shallow for any runner.** The decline path is otherwise asserted rather than
  exercised, and an emptiness assertion that can never fail is worse than no test.

Specific mutations to run, chosen because a plausible fixture would survive them:

- Both callers of `drawerBoxMetrics` inlining their own runner height. Passes unless a test compares
  the screw row against the box's actual geometry.
- Reconciling drawers by index rather than by section id. Passes every single-drawer fixture.
- Emitting a box when `runnerKeyFor` returns nothing. Passes unless the shallow fixture exists.
- Owner resolution left as a direct-parent check. Passes unless a test asserts a drawer screw lands
  against its cabinet rather than `Ungrouped`.

## Risks

- **The runner figures are unverified, and one is unsourced.** The egress proxy blocked every
  primary PDF, so the TANDEM numbers come from vendor and distributor summaries rather than Blum's
  printed instructions, and the side-mount runner height is a convention I chose. Same class as the
  hinge table: a drawer that looks right in the viewport and does not slide, with no green suite to
  say so. Confirm them before cutting.
- **Two width rules invite being collapsed into one.** Undermount fixes the box's interior and
  side-mount fixes the gap either side, so they diverge as side thickness changes. A future reader
  who "simplifies" them into a single per-side constant will produce boxes that are wrong only for
  thick-sided drawers, which is the hardest kind of wrong to notice.
- **Supporting both families roughly doubles the geometry** and adds a notch and a hole that one
  family never uses. Every fixture must cover both, or the untested family rots.
- **Re-baselining the slide height moves shipped positions.** The Front, Top and End projections and
  every fixture pinning a slide row must be **re-measured, not assumed unchanged**. The sheet-yield
  spec claimed a change re-baselined nothing when it re-baselined real rows; do not repeat it.
- **A third pipeline stage is a stated invariant being rewritten.** If the ordering argument above
  is wrong, the symptom is a cabinet that needs two passes to settle, which looks like a rendering
  glitch rather than a pipeline bug.
- **`regenerateDrawers` is the first pass to reconcile components.** Undo, selection and the scene
  tree all assume components change only when a user changes them. A selected drawer that vanishes
  because its opening became a door is a stale selection, and the section-pick rules already learned
  that lesson once.
- **Parameters chosen over stated constants** for the runner offset and box height. Decision 4 was
  taken against the hardware spec's own reasoning. If a vendor model later carries this geometry,
  these two parameters are the ones that will need migrating away.
