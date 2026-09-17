# Cabinet placement — anchors stored, runs derived

**Status:** Designed, not implemented. Brainstormed 2026-09-14 on `claude/next-step-suggestion-4itos3`.
**Notes:** `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md`
**Plan:** `docs/superpowers/plans/2026-09-14-cabinet-placement-stage-1-primitive.md` (Stage 1); later stages get their own files — see [Staging](#staging)

A cabinet is generated, machined, priced and drawn. It cannot be put anywhere. This design gives a
carcase a place to stand, and a way to stand against its neighbour.

## Why this exists

`onAddCarcase` hardcodes `position: { x: 0, y: 0, z: 0 }` (`useScene.ts:1247`), and **no field
anywhere in the UI writes a component's position** — `CarcasePanel` edits parameters, `EditPanel`
edits a *part*. So every cabinet in a project occupies the same cubic metre of space, permanently,
unless the `.zimmu` file is hand-edited.

The obvious workaround does not exist either. `useSnap` calls `onUpdate(partId, …)` — it moves a
part, never a component (`useSnap.ts:19`) — and a driven part's position is re-derived on every
regeneration pass (`regenerateComponents.ts:109`), so snapping a generated side panel moves it until
the next commit and no further.

Two shipped claims are unreachable because of this:

- `CarcaseParams.frontReveal` is documented as governing "the gap between the doors of **two cabinets
  standing side by side**" (`types.ts:218`). Nothing can currently produce that arrangement, so
  nothing tests it.
- **Half-overlay**, excluded from the cabinet-assembly restructure, "exists to share a face-frame
  stile between neighbouring cabinets". Face frames without cabinet adjacency delivers only the
  frameless half of that slice. Placement is a genuine prerequisite, not a competing priority.

## Scope, and what is deliberately excluded

The user confirmed all three layout scopes are in: a **straight run** against one wall, an
**L-shape** with a corner, and **free placement** (islands, peninsulas, anything belonging to no
wall). That is one decision and three quite different amounts of work, so — following the precedent
this repository set with the cabinet-assembly restructure — it is specified as one design and
implemented as staged plans.

**In scope:** an `Anchor` on a carcase; a `resolvePlacement` pipeline stage; `carcaseBounds` as the
one statement of a cabinet's occupied box; runs derived from anchor chains; blind-unit corners; a
v19 file format; and three editing surfaces — sidebar fields, a scene-wide plan view, and a viewport
move gizmo.

**Excluded, deliberately:**

- **A `'top'` anchor side.** Stacking a wall unit onto a base unit is real, but none of the three
  layouts needs it, and a fourth side now would be speculative. Confirmed with the user.
- **A wall as an object.** Walls are drawn as context in the plan view, not modelled. A cabinet
  anchors to another cabinet, never to a wall.
- **Filler strips and scribes.** The corner policy is a blind unit; a filler is a different answer to
  the same question and is not built here.
- **Per-run operations beyond what a chain gives for free.** "Reverse this run" is not in scope.
- **Face frames and half-overlay.** Still their own slice. This design unblocks them.

## Decisions taken with the user

All taken in the 2026-09-14 session, in this order. Each was put as a question with the trade-off
stated; where the user chose against the recommendation it is marked.

| # | Question | Decision |
|---|---|---|
| 1 | Which layouts must be placeable? | **All three** — straight run, L-corner, free placement |
| 2 | Do neighbours move when a cabinet is resized? | **Stored** adjacency, not computed-once |
| 3 | How is stored adjacency represented? | **Anchors stored, runs derived** — no `RunComponent` |
| 4 | What happens in a corner? | A **blind unit** |
| 5 | Which editing surfaces? | **All three** — fields, plan view, gizmo *(gizmo against recommendation, which was to defer it)* |
| 6 | Anchor on the shell box or occupied bounds? | **Occupied bounds** |
| 7 | Default alignment within a face | `{0, 0}` — **front-flush and floor-flush** |
| 8 | Dangling anchor when the target is deleted | **Freeze in place**, become free-placed |
| 9 | Does drag-anchoring inherit the target's rotation? | **Yes**, as a UI default only |

## The local frame, verified

Every rule below depends on this, and it was read off the generator rather than assumed
(`carcaseRoles.ts:364-376`, `:218`, `:399`):

```
x ∈ [0, W]   left  → right
y ∈ [0, D]   front → back      (y = 0 is the front face)
z ∈ [0, H]   floor → top
```

`y = 0` being the front is consistent with an overlay front occupying `y ∈ [−FT, 0]` and an inset
front `y ∈ [0, FT]`.

A component's transform is `translate(position) ∘ rotate(Euler XYZ)` about its **local origin**, not
its centre (`transform.ts:8-47`), and a part's `position` is the **min corner** of its local box
(`carcaseRoles.ts:50`).

## The anchor

```ts
interface Anchor {
  to: ComponentId
  face: 'left' | 'right' | 'front' | 'back'   // a face of the TARGET
  gap: number                                  // along that face's normal
  offset: { u: number; v: number }             // within that face's plane
}
```

`anchor?: Anchor` lives on `CarcaseComponent` only — not on groups or drawers. A group's box would
have to be derived from its contents, which is a circularity nobody asked to buy.

`anchor === undefined` means free-placed, and `position` is the user's. An anchor means `position` is
**derived**. No `driven` flag is added: presence or absence of the anchor already expresses exactly
what `driven: false` expresses for a part.

### The meeting face is derived from rotation

> **The anchored cabinet meets the target with the face whose outward normal, in world space, most
> directly opposes the target face's outward normal.**

The tempting rule — *the opposite face meets it* — is wrong, and the corner is where it breaks. The
arithmetic, because it is the load-bearing claim in this document:

Wall 1 is the plane `y = 560` (run 1's backs against it); wall 2 is `x = 0`.

- **Blind cabinet**, run 1, rotation 0, origin `(0,0,0)`, 900 wide → world `x ∈ [0,900]`, `y ∈ [0,560]`.
- **Return run** needs its backs on wall 2, so local `+y` → world `−x`, which is `rotation.z = 90°`.
  A cabinet at origin `(X₀,Y₀)` then occupies world `x ∈ [X₀−D, X₀]`, `y ∈ [Y₀, Y₀+W]`. Back on the
  wall ⟹ `X₀ = 560`.
- Clearing the blind cabinet's `y ∈ [0,560]` ⟹ `Y₀ + W = 0`, and with a 600-wide return cabinet, `Y₀ = −600`.

The return cabinet's local `y = D` face — its **back** — is then at world `x = 0`, a plane of
constant **x**. The target's front is a plane of constant **y**. *They are perpendicular:* the
opposite-face rule cannot place this cabinet at all. What actually lands on the blind cabinet's front
plane (`y = 0`) is the return cabinet's local `x = W` face — its **right side**.

The normal rule gives the right answer in every case:

| Case | Target face → normal | Anchored rotation | Meeting face |
|---|---|---|---|
| Straight run | `right` → `+x` | 0° | `left` (`−x`) |
| Blind corner | `front` → `−y` | 90° | `right` (`+y`) |
| Back-to-back island | `back` → `+y` | 180° | `back` (`−y`) |

It degenerates to "the opposite face" exactly when the two rotations match — which is why **every
straight-run fixture would pass the broken rule.** Only a corner fixture can catch it.

**Rotation is never derived.** It is always the user's. The corner exists because a cabinet is turned
*and* anchored, and those are two separate facts.

### Occupied bounds, not the shell

`carcaseBounds(params, thicknessOf)` is the single statement of a cabinet's box, and it reports what
the cabinet **occupies**, not its structural shell. The shell is wrong in three ways:

- An **applied back** reaches `y ∈ [D, D + BT]` — behind `y = D` (`carcaseRoles.ts:399`).
- An **overlay front** reaches `y ∈ [−FT, 0]` — in front of `y = 0`.
- A **toe kick** occupies `z ∈ [0, KH]` while the shell starts at `z = floorZ`. Anchoring on the
  shell would leave every Base 600 **floating 100 mm off the floor.**

That last one settles it. Two cabinets butted together should touch where they actually have
material.

**`carcaseBounds` reads the cabinet's material *slots* and params only — never per-part overrides.**
Overrides live on parts, parts are emitted downstream of placement, and reading them would make
placement depend on generated output. CLAUDE.md already names this failure: *"an override must never
depend on a generated dimension, or the pass becomes a fixed-point iteration."* The deliberate
consequence: a per-part override thickening one back does **not** shove its neighbour.

A second consequence worth stating because it will surprise someone: **changing a material's
thickness moves anchored cabinets.** That is correct — the cabinet genuinely got deeper.

### `gap` fixes one axis; `offset` fixes the other two

A face is two-dimensional, so `gap` alone leaves a cabinet free on two axes. `offset` is a 2-vector
in the target face's plane, expressed in the **target's** local axes so that it stays stable when the
anchored cabinet rotates, taken in `x < y < z` order of the two non-normal axes.

`offset: {0, 0}` means flush at the **minimum corner of the target's occupied bounds** on each
in-plane axis — not at the local origin, which matters when something protrudes. Since the local
frame runs front→back and floor→top, that resolves to **front-flush and floor-flush for free**, which
is the common case: two cabinets in a run land with their front faces coplanar and both on the floor.
Where the target carries an overlay front its occupied minimum on `y` is `−FT`, so "front-flush"
means the door faces align, which is the intended reading.

Mixed depths are the case where the default is not what you want: a 330-deep wall unit anchored beside
a 560-deep base lands front-flush, not against the wall. The model keeps one rule; **the plan view's
drag writes a back-flush offset when depths differ**, because the wall is the physical constraint.
That is a UI choice, not a second model rule.

## `resolvePlacement`

```ts
reconcileJoints(regenerateComponents(regenerateDrawers(resolvePlacement(scene))))
```

Four stages, and **placement has to lead.** This document twice got that wrong in opposite
directions, so the correction is recorded rather than quietly replaced.

The first draft said placement *must* lead because it reads only parameters — true premise, invalid
inference. A review challenged it, a grep for `.position` across the three downstream stages came
back empty, and the claim was "corrected" to *order-independent — convention, not constraint*. That
correction is also false.

`regenerateDrawers` and `regenerateComponents` genuinely do not read a component's position. But
`reconcileJoints` does, **transitively**: `deriveJoint` resolves each part's world matrix through its
ancestors (`resolveWorldMatrix(housed, byId)` in `geom/dado.ts`), so a joint derived before its
cabinet has moved is derived against the wrong world placement. Running placement last leaves the
pipeline **non-idempotent** — the second call re-derives joint cuts the first got wrong — which is
how this was finally caught, by a mutation test rather than by reading.

The lesson worth carrying: a grep for a field name does not establish that nothing depends on it.
The dependency here runs through a matrix, and no amount of searching for `.position` would show it.

Pure and idempotent, like its three neighbours. Resolution is a topological walk: a target is
resolved before anything anchored to it.

**The anchor graph is a second graph over the same components.** `wouldCycle` and
`breakComponentCycles` guard `parentId`, not `to`, so they cannot be reused — they are the model for
a sibling pair, not the implementation. A cycle reachable only from a hand-edited file is repaired by
detaching, never by guessing.

A **dangling target** — the anchored-to cabinet was deleted — freezes the cabinet at its last
resolved position and makes it free-placed, mirroring `promoteOrphans`. Jumping to the origin is the
obvious bug and is the thing to test.

## File format v19

`anchor` is optional, so every v18 file parses untouched with every cabinet free-placed — which is
what they already are.

`useFile.ts` types `base.params` loosely, so `tsc` cannot see a file-format regression there.
`anchor` sits on the component rather than on params, but the lesson transfers: **this needs a
`parseFile` test, not just a typecheck.**

## Blind corners cost almost nothing

`Section.front` is **optional** and `FrontSpec` already includes `'false-front'` and `'panel'`
(`sectionTree.ts:38-42`, `:70`). So a blind unit needs **no new component kind and no new front
type**: it is an ordinary carcase, made wider, whose section tree splits into an accessible leaf
carrying a door and a blind leaf carrying a panel, a false front, or no front at all. The front
generator and the hardware BOM already handle a leaf with no door — a blind leaf lists no hinge,
exactly as a door too thin to bore already does.

What the corner actually demanded from this design was one enum value: **an anchor must be able to
name a `front` face**, which is how the return run butts into the blind portion.

**The blind portion must be at least as wide as the return run's cabinets are deep.** Narrower, and
the return run overhangs the accessible opening and the door fouls it. That is arithmetic, so the
plan view flags it rather than letting it reach a cutting list.

## Surfaces

| | Surface | Role |
|---|---|---|
| A | `ui/PlacementPanel.tsx` | Position, rotation and the anchor as fields. The only surface that can state an exact number; an anchored cabinet's position greys out as a driven part's dimensions do. |
| B | `ui/PlanView.tsx` | The whole job from above. Drag a cabinet near a neighbour's side and it lands anchored — the gesture that places it is the gesture that stores the relationship. The only surface where a run reads as a run, and where the blind-width check is surfaced. |
| C | `render/viewport.tsx` + `scene/useMoveGizmo.ts` | A move gizmo on the selected cabinet, snapping to a neighbour's face. |

B follows `SectionElevation`'s precedent closely: one interactive SVG over a coordinate flip, with
the flip written in exactly one function.

## Staging

1. **Placement primitive** — `Anchor`, `carcaseBounds`, `resolvePlacement`, the pipeline, v19,
   surface A. Ships free placement.
2. **Adjacency** — anchor editing, `runsOf`, surface B with drag-to-anchor. Ships straight runs.
3. **Corners** — rotation in the plan view, front-face anchors, blind-width validation. Ships
   L-shapes.
4. **Gizmo** — surface C. Last deliberately: it is the only stage nothing else depends on.

## Testing, and the mutations that matter

Fixtures must be **asymmetric**, for the reason `panelThickness.test.ts` exists: a run of identical
Base 600s survives almost every wrong rule. Cabinets in the run fixtures differ in width *and* depth.

| Mutation | Survives unless |
|---|---|
| Hardcode the opposite face instead of deriving from the normal | a **corner** fixture exists (90° rotation) |
| Derive rotation from the target rather than keeping it the user's | the **corner** fixture again |
| Use shell bounds instead of occupied bounds | a **toe-kick or applied-back** fixture exists |
| Resolve anchors in array order rather than topologically | the fixture **stores B before A** — a naturally-written fixture stores them in order and passes |
| Ignore `offset` | a fixture uses a **non-zero** offset |
| Let a dangling anchor fall back to the origin | a fixture **deletes a target** and asserts the survivor did not move |

Plus: `resolvePlacement` run twice equals run once; a v18 file parsing with every cabinet
free-placed; a v19 round-trip through `parseFile`.

## Risks

- **The blind-corner figures are mine, not a woodworker's.** A 900 blind unit against a 560 return
  leaves 340 mm accessible. Same class as the hinge table and the TANDEM figures: self-consistent,
  green in every test, and possibly not how you would actually build it. Confirm before cutting.
- **Surface C was chosen against recommendation.** It is the largest piece of new interaction code,
  it duplicates what the plan view does, and it competes with `OrbitControls` for the same mouse
  drag. Staged last so it cannot block the rest.
- **Two cycle guards now exist over the same component list.** Someone will eventually reuse one for
  the other. The anchor graph and the parent tree are different graphs.
- **Placement moves shipped exports.** STL and STEP change the moment a cabinet leaves the origin,
  because both compose world matrices. Re-measure them rather than assuming unchanged — the
  sheet-yield spec claimed a change re-baselined nothing when it re-baselined real rows. The cutting
  list, the nest and the per-cabinet projections are cabinet-local and should **not** move; assert
  that rather than assume it.
- **Rotation is about the local origin, not the centre.** A plan-view "Rotate 90°" swings a cabinet
  around its front-left-bottom corner. It must be a rotation *plus* a compensating translation, or
  cabinets fly across the room. An anchored cabinet is fixed up by the resolution pass anyway; a
  free-placed one is not.
- **A stale selection can outlive its cabinet.** Deleting a target detaches its dependants, which the
  scene tree and the plan view both have selections into. The section-pick rules learned this lesson
  once already.
