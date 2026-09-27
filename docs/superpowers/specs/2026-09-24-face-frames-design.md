# Face frames and half-overlay — design

**Status:** designed, not built. Brainstormed 2026-09-24. Implemented as four staged plans; see
[Staging](#staging).

**Notes:** `docs/superpowers/notes/2026-09-24-face-frames-notes.md`

---

## Why this exists

Three shipped specs defer this slice, and each says the same thing in different words:

- The cabinet-assembly restructure (2026-08-27): *"Face frames and half-overlay. This generator is
  frameless. Half-overlay exists to share a face-frame stile between neighbouring cabinets and has
  no meaning without one."*
- The drawer-box design (2026-09-12): *"Face frames and half-overlay need a face frame first, which
  is its own slice."*
- The cabinet-placement design (2026-09-14): *"Face frames and half-overlay. Still their own slice.
  **This design unblocks them.**"*

Placement named **two shipped claims that were unreachable without it**. One was
`CarcaseParams.frontReveal`'s documented gap between the doors of two cabinets standing side by
side; that is now closed by `adjacentFronts.test.ts`, which measured the gap at exactly one reveal.
**Half-overlay is the other, and it is still open.** Placement is its prerequisite because a shared
stile needs two cabinets standing next to each other, and until stages 1–4 of that design shipped,
nothing could produce that arrangement.

So this is not a feature chosen because it seemed valuable. It is the last item on a list the
repository has been carrying for a month, and its blocker was removed on purpose.

## Scope, and what is deliberately excluded

**In scope:** a face frame as a driven child component; frame openings derived from the section
tree; doors mounted to the frame in overlay, half-overlay and inset; the frame narrowing the clear
opening that shelves and drawers are sized to; face-frame hinge machining and its hardware keys; a
v20 file format.

**Excluded, deliberately:**

- **Frame overhang for scribing.** Real face-frame cabinets often run the frame proud of the carcase
  side so it can be scribed to a wall. Nobody asked for it, and `CLAUDE.md` forbids configurability
  that was not requested. The frame sits flush with the carcase's outer faces. A parameter now would
  be a number with no consumer.
- **Applied end panels and finished ends.** A different answer to the same "what does the outside of
  the run look like" question, and not built here.
- **Frame joinery detail.** The stiles and rails are joined — mortise and tenon, pocket screws,
  dowels — but which is a `jointMethod` question for the existing joint machinery, not a new one.
  The frame declares its internal contacts so the joinery checklist does not report them as open;
  it does not invent a joint kind.
- **Arched or shaped rails.** Every member is a rectangle.
- **A frame on anything but a carcase.** Drawers and groups do not get frames.

## Decisions taken with the user

All taken in the 2026-09-24 session, in this order, each put as a question with the trade-off
stated.

| # | Question | Decision |
|---|---|---|
| 1 | Which construction? | **Full face-frame cabinets** — not trim, not frameless half-overlay |
| 2 | Where do the frame's openings come from? | **The section tree drives the frame** |
| 3 | Is the frame a component or carcase roles? | **A child component with its own generator** |
| 4 | Does a half-overlay door depend on its neighbour? | **No — each door covers half of its own stile** |
| 5 | Does the frame narrow the clear opening? | **Yes**, with the geometry stated once |
| 6 | How do hinges work? | **Face-frame hinges, plate into the stile** |
| 7 | How is it staged? | **Four vertical slices**, each correct for a growing subset |

Decision 2 preserves a stated invariant — *the section tree is the only description of a cabinet's
interior division* — at a real cost: a centre stile cannot appear on the face without a partition
behind it. That constraint is accepted rather than worked around, because two trees that can
disagree is the exact failure the section-tree design was written to end.

Decision 4 is the load-bearing one, and it is discussed below.

## The model

`CarcaseParams` gains:

```ts
frameMode: 'frameless' | 'framed'
frame?: FaceFrameParams          // present when framed, absent otherwise

interface FaceFrameParams {
  stileWidth: number             // the outer stiles, left and right
  railWidth: number              // the top and bottom rails
  midStileWidth: number          // a stile from a vertical split      (stage 2)
  midRailWidth: number           // a rail from a horizontal split     (stage 2)
  material: string               // its own material slot, seeded from the carcase
}
```

A mid stile is a separate figure from an outer one because two half-overlay doors must each cover
half of it — a centre stile is customarily wider than an edge stile for exactly that reason.

**All four widths land in the type at v20**, in one format bump rather than two: a second bump in
stage 2 would make a stage-1 file unreadable by a stage-2 build for no reason. Stage 1 simply does
not *read* the two mid figures, because it declines a cabinet with splits; they become live in
stage 2. They are required fields with stated defaults, not optionals, so no consumer has to ask
whether a framed cabinet has them.

`frontMount` gains a third value:

```ts
frontMount: 'overlay' | 'half-overlay' | 'inset'
```

`'half-overlay'` is legal **only** on a framed cabinet. `validateCarcaseParams` rejects it on a
frameless one rather than silently treating it as overlay, for the same reason every other
validation exists: a parameter that is quietly reinterpreted is worse than one that is refused.

`Component` gains a fourth kind:

```ts
export type Component = GroupComponent | CarcaseComponent | DrawerComponent | FaceFrameComponent
```

`FaceFrameComponent` carries `driven`, exactly as `DrawerComponent` does and for the same reason: a
detached frame is the user's — no regeneration and no deletion. Carcases and groups deliberately do
not carry it, because a detached carcase has no defined meaning; a detached frame does.

## `faceFrame.ts` — the one statement of frame geometry

```ts
export interface FrameMember {
  role: string                   // 'stile-left' | 'rail-top' | `stile-${sectionId}` | …
  rect: Rect                     // on the cabinet's front face, in carcase x/z
}

export interface FrameGeometry {
  members: FrameMember[]
  openings: Map<SectionId, Rect> // the clear opening of each leaf, inside the frame
}

export function faceFrameGeometry(
  params: CarcaseParams,
  tree: ResolvedTree,
  thicknessOf: RoleThickness,
): FrameGeometry | null
```

Pure. No React, no THREE, no components. A function of the section tree, the frame parameters and
the materials — **all of which exist before any generator runs**.

**This is the cycle answer, and it is `drawerBoxMetrics`' shape reused.** Three consumers read it:

| Consumer | Reads it for |
|---|---|
| `regenerateFaceFrames` | the stile and rail boards to emit |
| `regenerateDrawers` | the framed opening a box must pass through |
| `frontCells` | the rectangle a door covers |

**None of them reads another's output.** That is the whole reason the frame, the drawers and the
doors do not form a cycle, and it is the same discipline the drawer-box design used to keep the
carcase and the drawer apart. A second copy of the frame's geometry is how the drawer and the
opening it must fit through come to disagree.

### It declines rather than guessing

`faceFrameGeometry` returns `null` when the frame cannot be built — stiles wider than the cabinet,
rails taller than it, an opening that vanishes. A framed cabinet then emits **no frame**, and the
validation surfaces why.

This is the rule the codebase already applies twice: a drawer box with no runner emits no boards,
and a door too thin to bore lists no hinge. A frame that half-exists is worse than one that refuses.

## The frame from the section tree

Decision 2, stated concretely:

| Section tree | Frame member |
|---|---|
| the cabinet's own edges | `stile-left`, `stile-right`, `rail-top`, `rail-bottom` |
| a **vertical** split | `stile-{parentId}-{index}` between the children |
| a **horizontal** split | `rail-{parentId}-{index}` between the children |
| a leaf | one opening in `openings` |

Note the axis convention, which has caught people before and is stated once in `CLAUDE.md`:
`axis: 'vertical'` puts children **side by side** separated by a vertical partition, so it is the
axis that produces a **stile**. `'horizontal'` stacks them and produces a **rail**.

The role keys follow the existing families exactly. `division-{parentId}-{index}` already names the
section that was *split*, and a divider belongs to the carcase rather than to an opening; a mid
stile is the face's counterpart of that divider and is named the same way. `sectionNodes.ts` remains
the only place a role key is taken apart to recover a section id inside it.

## Doors, reveals, and half-overlay

`frontCells.ts` keeps stating the reveal rule once and gains a framed branch. Today it answers for
two mounts against the carcase; it will answer for three against the frame:

- **Inset** — the door sits inside the frame opening, clear of the frame by a full reveal on every
  side. The frame stays visible all round.
- **Overlay** — the door covers the frame opening and laps onto the surrounding members, giving back
  half a reveal where it meets another door.
- **Half-overlay** — the door laps its stile by half the stile's width, less half a reveal.

### Why half-overlay needs no neighbour

The restructure spec's wording — *"share a face-frame stile between neighbouring cabinets"* — reads
as though a door's size depends on whether a cabinet stands next to it. **It does not, and building
it that way would be a mistake.**

A half-overlay door laps its own stile by a fixed amount, whatever is beside it. That is the real
cabinetmaking rule, and it has a property worth more than the appearance: `regenerateComponents`
stays a **pure function of one cabinet's own parameters**. It has never read a neighbour, and this
slice does not teach it to.

The shared stile is then a *consequence* rather than a rule. Two butted cabinets each present an
outer stile half-covered by their own door; the two half-covered stiles stand together and read as
one shared stile with a reveal down the middle. Nothing had to be negotiated between the cabinets to
produce it.

This is the same shape as the claim `adjacentFronts.test.ts` just pinned: the gap between two
cabinets' doors is exactly one reveal, and neither cabinet knows the other exists.

## The pipeline becomes five stages

```
resolvePlacement → regenerateFaceFrames → regenerateDrawers → regenerateComponents → reconcileJoints
```

`applyPipeline` in `useScene.ts` is the one place this order is written.

Frames lead drawers for the reason drawers lead carcases: **the frame reads nothing either of them
emits.** Its inputs are the section tree, the frame parameters and the materials. All five stages
stay pure and idempotent.

Two standing invariants need rewording, and the implementation must not leave them stale:

- *"The regeneration pipeline order is fixed, and it is three stages"* became four with placement and
  becomes **five** here.
- *"`regenerateDrawers` is the only pass that adds or removes components"* becomes **two** passes.

## Machining and hardware

A face-frame hinge's plate screws to the **stile**, not the side panel. `frontMachining.ts` gains a
framed branch, and the standing invariant — *plate screws go in the upright the door is hinged on
and no other* — is re-stated with the stile as that upright on a framed cabinet.

`hardwareCatalogue.ts` gains face-frame hinge keys, and `hingeKeyFor` learns `frameMode`. Note what
does **not** change: **quantity still comes from the bores**. A framed cabinet's hinge count is the
cups it emitted, exactly as now; only the *variant* is read from the cabinet. That is what makes a
door too thin to bore list no hinge, and the rule survives this slice untouched.

Drawer slides are the subtler case. Because the frame narrows the opening (decision 5), a
side-mount runner in a framed cabinet would otherwise be screwed to a side panel the drawer can no
longer reach past. The box is therefore sized to the **framed** opening via `faceFrame.ts`, and the
slide row follows the box — which is already how `carcaseMachining` places it.

## File format v20

v20 adds `frameMode`, the `frame` parameter bag, the `FaceFrameComponent` kind, and
`'half-overlay'` on `frontMount`. A v19 file parses with every cabinet frameless, which is the
default and therefore a no-op migration.

`useFile.ts` types `base.params` loosely, so **`tsc` cannot see a regression here**. A change to
`CarcaseParams` needs a `parseFile` test, not just a typecheck — the standing warning applies to
this slice directly, because it adds two required fields.

## Surfaces

| | Surface | Role |
|---|---|---|
| A | `ui/CarcasePanel.tsx` | A Frame section: mode, stile and rail widths, material. Collapsed when frameless. |
| B | `ui/SectionElevation.tsx` | The elevation already draws divisions as bars; on a framed cabinet those bars *are* the stiles and rails, drawn at their real widths. |
| C | `ui/CuttingList.tsx` | Frame members are boards and appear without special-casing. Solid stock rather than sheet goods, so `isNestable` must exclude them. |

Surface C carries the one non-obvious consequence: a face frame is hardwood, not ply, and the nest
is a sheet-goods layout. A stile in the nest would be a plausible-looking answer to a question
nobody asked.

## Staging

Four vertical slices. Each is **end-to-end correct for the cabinets it claims** and refuses what it
cannot yet build, rather than shipping something that looks buildable and is not.

1. **A framed cabinet with one opening and a door.** `faceFrame.ts`, `FaceFrameComponent`,
   `regenerateFaceFrames`, stiles and rails as boards, doors mounted to the frame, the cutting list,
   v20. A framed cabinet with splits or drawers **declines**.
2. **Divisions.** Stiles from vertical splits, rails from horizontal, `midStileWidth`/`midRailWidth`,
   and half-overlay.
3. **The interior follows the frame.** Drawers and shelves sized to the framed opening through
   `faceFrame.ts`.
4. **Machining and hardware.** Face-frame hinges, plate into the stile, catalogue keys.

**Framed is opt-in at every stage**, and that is verifiable rather than merely intended: a frameless
cabinet's output must be **byte-identical** before and after each stage.

## Testing, and the mutations that matter

Fixtures must be **asymmetric**, for the reason `panelThickness.test.ts` exists: a frame whose
stiles and rails are all one width survives almost every wrong rule. Stile and rail widths differ in
every fixture, and so do the two mid figures.

| Mutation | Survives unless |
|---|---|
| Emit a stile where the tree splits horizontally | a fixture splits **both** ways |
| Use the outer stile width for a mid stile | the two widths **differ** in the fixture |
| Size the door to the carcase opening, not the frame's | a fixture asserts the door against the **framed** rect |
| Half-overlay laps the whole stile rather than half | a fixture measures the **lap**, not just the reveal |
| Size the drawer box to the carcase opening | a **framed** drawer fixture exists (stage 3) |
| Bore the hinge plate into the side panel | a **framed** machining fixture exists (stage 4) |
| Include frame members in the nest | a framed cabinet reaches the **Sheets** tab in a test |

Plus, at every stage: a frameless cabinet's parts are byte-identical to `main`'s; `faceFrameGeometry`
run twice equals run once; a v19 file parses with every cabinet frameless; a v20 round trip through
`parseFile`.

The e2e suite carries the claim no unit test can make — that a framed cabinet **renders** and
reaches the cutting list. `viewport.tsx` has no unit test, `App.test.tsx` mocks it wholesale, and
happy-dom has no WebGL.

## Risks

- **Three figures are stated, not derived, and no test in this repository can falsify them:**
  face-frame hinge geometry, the default stile and rail widths, and the half-overlay lap. Same class
  as the existing hinge table and the TANDEM drawer figures — a wrong number yields a perfectly
  self-consistent cabinet that does not work. **Confirm with a woodworker before cutting.** A green
  suite says nothing about them.
- **Decision 2 forbids a face division the interior does not have.** A centre stile without a
  partition is a real thing to want and this design cannot express it. If that turns out to matter
  more than the single-tree invariant, the answer is a per-leaf frame override — explicitly
  considered and rejected here as a second place to describe the face.
- **The frame narrows the opening, so every interior figure moves on a framed cabinet.** Shelves,
  drawer boxes and the clear internal depth all shift. Stage 3 is where that lands, and the
  measurements it re-baselines should be taken rather than predicted.
- **`isNestable` is the easiest thing to forget.** Frame members are solid stock; a nest that lays a
  stile out on a sheet is wrong in a way that looks entirely reasonable on screen.
- **Two passes now add and remove components.** `regenerateDrawers` was the only one. A reconciler
  that assumes it still is will orphan frames.
