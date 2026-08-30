# Cabinet projections — Front / Top / End

Stage G2 of the cabinet-assembly restructure.
Parent spec: `2026-08-27-cabinet-assembly-restructure-design.md`
Notes: `../notes/2026-08-27-cabinet-assembly-restructure-notes.md`

## What this is

`CabinetEditor` ships five subtabs. Section is the interactive elevation (G1). 3D is the viewport.
Front, Top and End currently say "not built yet". This stage builds them: **whole-cabinet
orthographic projections that are dimensioned, exportable, and clickable.**

Clicking a part selects it and opens its properties in the sidebar. The same projection is also a
sheet in the drawings deck, so a cabinet's assembly drawing prints and exports alongside its
per-part sheets.

## Correcting the parent spec

The restructure spec says:

> `buildDrawingSheet` generalises from one part to a part set rather than growing a second projector
> that would drift from the first.

That instruction does not survive contact with the code, and this spec deliberately departs from it.

`drawing.ts` is a **shop-drawing sheet builder**, not a projector. `buildBoardSheet` lays one part
flat in *board* axes, projects its *cuts* onto three views, adds dimension lines and cut labels,
selects a standard scale, and fits the result onto a fixed 297×210 sheet. A cabinet projection works
in *carcase* axes, draws *part silhouettes*, must be clickable back to a part id, and lives in a
resizable pane. They share `Rect2D` and `DimLine` and nothing else. Merging them would run an
`if (kind === 'assembly')` through the middle of a 652-line module that currently does one thing.

The instinct behind the sentence is right, and this design honours it a different way: **there is one
projector, and it is a pure function returning data.** Two consumers read that data — the interactive
pane and a new sheet variant. Neither contains projection logic, so neither can drift.

## Decisions

| # | question | decision |
|---|---|---|
| 1 | What is the tab for? | Selection **and** a dimensioned, exportable elevation |
| 2 | Overlapping parts | Hidden-line removal — occluded edges dashed |
| 3 | Parts that are not axis-aligned boxes | True outline, exempt from occlusion in both directions |
| 4 | Which dimensions | Overall per view, plus one opening chain per axis |
| 5 | Where exported from | Both: a sheet in the deck, and buttons on the tab |
| 6 | Module arrangement | A new pure projector, two consumers |
| 7 | Which cabinet is open | The one containing the selection |
| 8 | Cuts | Through-cuts shape the silhouette; internal cuts drawn dashed |
| 9 | Thickness overrides | Fixed in the projector **and** in the two existing call sites |
| 10 | Staging | Six groups; the projector splits into B1 (geometry) and B2 (cuts) |
| 11 | Top and End are unreadable under pure HLR | Near-half cull: they are section views; Front is not |
| 12 | Which way End faces | From **+x**, matching `buildBoardSheet` |
| 13 | Sheet layout | Three views in a **row**, not stacked |

## Architecture

```
src/geom/hiddenLine.ts        Span, subtractIntervals — the occlusion rule, pure
src/geom/assembly.ts          AssemblyView, buildAssemblyViews — the projector, pure, mm
src/geom/drawing.ts           + { kind: 'assembly' } sheet variant (a thin wrapper)
src/ui/CabinetProjection.tsx  the interactive pane
src/ui/sheetFilename.ts       lifted out of DrawingViewer, shared with the tab
src/ui/buildSvg.ts            + one branch at the existing dispatch (line 365)
src/ui/buildDxf.ts            + one branch at the existing dispatch (line 331)
src/ui/buildPdf.ts            + one branch at the existing dispatch (line 360)
```

### The projector's contract

```ts
buildAssemblyViews(
  parts: Part[],            // every visible part under the cabinet, from descendantIds —
                            // including those inside groups nested within it
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): [AssemblyView, AssemblyView, AssemblyView]   // Front, Top, End
```

```ts
export interface AssemblyView {
  label: 'Front' | 'Top' | 'End'
  bounds: Rect2D                 // the cabinet's extent in this view, mm
  parts: AssemblyPart[]          // nearest first — the hit-test order
  dims: DimLine[]
}

export interface AssemblyPart {
  partId: PartId
  label: string
  color: string
  rects: Rect2D[]                // silhouette after through-cuts; also the occluder and hit shape
  outline?: Point2D[]            // replaces rects for a part that is not an axis-aligned box
  solid: Segment[]               // visible edges
  hidden: Segment[]              // occluded edges, drawn dashed
  circles: DrawCircle[]          // bores square-on to this view
  cutRects: DrawRect[]           // internal cuts, dashed, clipped to the silhouette
}
```

**Output is millimetres, unscaled.** `DrawingView` bakes `scale` into every rect, which is right
when there is one consumer with a fixed sheet area. Here there are two, and they need different
scale rules: the pane fits to whatever size it is, the sheet picks from `STANDARD_SCALES`. If the
projector scaled, the pane would have to pass a scale it computes from a size it does not know at
render time.

### Getting into cabinet space

Each part's eight local corners → world via `resolveWorldMatrix(part, byId)` → cabinet-relative via
`applyInverseToPoint(M_cabinet, …)`, where `M_cabinet = resolveWorldMatrix(cabinet, byId)`.

Both functions are exported from `transform.ts`, so this respects the standing invariant —
`resolveWorldMatrix` is the single source of world placement and `composeWorldMatrix` is never
called outside that module — and it is correct for a cabinet rotated in the scene, or nested inside
a group.

### The three planes

| view | u | v | depth | nearer | culled |
|---|---|---|---|---|---|
| Front | x | z | y | smaller y (y = 0 is the front face) | — |
| Top | x | −y | −z | larger z | z > H/2 |
| End | −y | z | −x | larger x — the cabinet's front on the **right** | x > W/2 |

**Depth is emitted pre-oriented so that smaller means nearer.** Top's and End's inversions are
resolved once, in the projector, so no consumer carries a per-view sign.

**End looks from +x**, matching `buildBoardSheet`, which builds its End view from `['+X', '-X']` and
places it to the right. A cabinet's End view and a part's End view sit in the same deck; they must
mean the same thing. Looking from +x with +z up puts screen-right at −y, so the cabinet's front
appears on the right of the view.

### Axis-aligned or not, decided by geometry

If a part's eight cabinet-space corners form an axis-aligned box within ε, it is a rectangle **and**
an occluder. Otherwise it is the convex hull of its projected corners, drawn solid, occluding
nothing and occluded by nothing.

This is read off the corners, never off `rotation`. A part rotated 180° about z is still an
axis-aligned box, and a `rotation === 0` test would misclassify it. That is the Stage E
contact-rule failure again — the rule must follow the geometry it describes, not the input that
usually produces it.

A `CylinderPart` has no corners: it projects to a rectangle seen side-on and a circle seen end-on,
computed the way `buildDowelViews` already computes them, and is never an occluder.

## Occlusion

### One function is the whole rule

```ts
export interface Span { a: number; b: number }
export function subtractIntervals(span: Span, holes: Span[]): Span[]
```

Every rectangle edge is axis-aligned, so an occluder covers a contiguous run of it.

```
visible = subtractIntervals(edge, covered)
hidden  = subtractIntervals(edge, visible)   // the complement, from the same function
```

Two answers, one implementation, no second copy to disagree with the first.

It carries an **epsilon of 1e-6 mm** — a nanometre, far below any real dimension and far above the
float noise. Panel edges are computed by float arithmetic, so two edges that should coincide can
differ by ~1e-13; without a tolerance those produce hairline slivers of "visible" edge that render
as noise along every butt joint. The same ε serves the occlusion comparator and the
axis-alignment test, stated once and imported, rather than three literals that could drift.

Its test cases are the ones that make interval code wrong: a hole outside the span; a hole touching
an endpoint (must not emit a zero-length span); a hole exactly equal to the span; a hole strictly
inside (two results); overlapping holes; holes supplied out of order.

### The occlusion test

**Q occludes P iff `Q.depthMax ≤ P.depthMin + ε` and their view rects overlap in area.**

Checked against the cabinets the generator actually produces:

- Overlay door `y ∈ [−18, 0]` vs. left side `y ∈ [0, 560]` → `0 ≤ 0` ✓, rects overlap → the door
  hides the side. Correct: that is what overlay means.
- Inset door `y ∈ [0, 18]` vs. the same side → `18 > 0`, no occlusion — and their rects do not
  overlap either, because an inset door sits *between* the sides.
- Inset door vs. the shelf behind it `y ∈ [20, 537]` → `18 ≤ 20` ✓. That 20 is Stage E's
  `max(SHELF_FRONT_SETBACK, insetFrontThickness + SHELF_CLEARANCE)`; the clearance rule already
  guarantees the non-interpenetration this test needs.

Where two parts genuinely interpenetrate in depth — reachable only by moving a detached part by
hand — neither occludes the other and both draw solid. Visibly odd rather than silently wrong, the
same posture as the rotated-part rule.

An occluder is a **list** of rectangles, not one, so that a part with a through-cut occludes
everywhere except through the cut. `subtractIntervals` takes a list of holes already, so this costs
nothing.

## The near-half cull

Pure hidden-line removal of a closed box produces a solid rectangle with everything dashed behind
it. Measured on a Base 600, in the End view:

```
left-side   x[0,18]     y[0,560]   z[0,720]     <- the entire End-view rectangle
right-side  x[582,600]  y[0,560]   z[0,720]     HIDDEN
bottom      x[18,582]   y[0,560]   z[100,118]   HIDDEN
top         x[18,582]   y[0,560]   z[702,720]   HIDDEN
back        x[18,582]   y[548,560] z[118,702]   HIDDEN
toe-kick    x[18,582]   y[60,78]   z[0,100]     HIDDEN
adj-shelf   x[20,580]   y[5,546]   z[310,328]   HIDDEN

6 of 7 other parts completely hidden
```

That is correct output and a useless drawing. So **Top and End are section views**:

- A cut plane at the **midpoint of that view's depth axis**, taken from the cabinet's own parameters
  (`x = W/2` for End, `z = H/2` for Top) rather than from the parts' bounding box — otherwise one
  stray detached part moves the plane and culls a shelf.
- Parts lying **entirely** on the near side of the plane are omitted.
- Parts **crossing** the plane are drawn whole. No partial-cutting geometry is needed, and everything
  that crosses is what you want to read in elevation anyway.

Checked: End culls only `right-side` and leaves the far side, bottom, top, back, shelf, toe kick and
the door edge all drawn. Top culls only `top` and leaves the rest, whose rectangles do not overlap,
so nothing dashes needlessly.

**Front is not culled.** A front elevation must show its doors, and it does not need culling — the
same probe shows the toe kick below the door, slivers of both sides past its edges, and the carcase
correctly dashed behind it. The asymmetry is deliberate and is the whole point: a front elevation is
a view, a plan and an end are sections.

Three consequences to hold:

- **The cull lives in the projector**, not in either consumer, so the pane and the printed sheet
  cannot diverge about which parts exist.
- **Dimensions are unaffected.** Overall figures come from `CarcaseParams` and the chains from
  `resolveSections`, never from the surviving parts — so a culled view still dimensions the whole
  cabinet.
- **A culled part is not clickable in that view.** It remains reachable in Front and in the scene
  tree, the same escape hatch a fully occluded part has.

## Cuts

### Through in one view, internal in another

A cut is **through** in a given view when its span along that view's depth axis covers the part's
span. That question is asked **per view**, not once per cut, and the toe-kick notch is the case that
proves it:

The notch is a `BoxCut` on the side panels (`carcaseRoles.ts:carcaseCuts`), not a change to any box.
The sides run to the floor. In carcase space the notch occupies `y ∈ [0, setback]`,
`z ∈ [0, toeKickHeight]`, and the full side thickness in x.

- **End view** (depth = x): the notch spans the side's full thickness → through. The silhouette
  becomes an L and the side stops occluding through the recess. This is the view a joiner reads a
  toe kick from, and a silhouette-only projector draws it solid to the floor — wrong.
- **Front view** (depth = y): the notch spans `y ∈ [0, setback]` while the side spans `y ∈ [0, D]`,
  so there is still material behind it. Not through. The full rectangle is **correct** here.

Any implementation that classifies a cut once, rather than once per view, gets one of these two
wrong. This is the stage's headline test.

### Which cuts, and how

Internal cuts draw dashed over the silhouette. Measured cost, from the presets:

| preset | bores | box cuts |
|---|---|---|
| Base 600 | 46 | 2 |
| Wall 600 | 46 | 0 |
| Tall 600 | 64 | 2 |

The worst single view is 28 dashed circles on a Tall side seen face-on — a normal drawing. Those two
box cuts per base preset are the toe-kick notches, and are the **only** box cuts a generated cabinet
has today, because every joint defaults to screws. The general rule earns itself the moment a joint
is switched to a dado.

A bore seen edge-on draws nothing, matching the convention `drawing.ts` already states.

Cuts live in **board** axes (`position` is the min corner, `size` the extent), so each must be
transformed board → part-local → cabinet, through the same matrices the silhouettes use.

**A cut rectangle is clipped to its part's silhouette.** Cuts routinely overshoot the part on
purpose: the toe-kick notch is built at `position.z = −T/2, size.z = 2T` precisely so OCCT resolves
it as an unambiguous through-cut rather than leaving a coplanar face. Projected unclipped into the
Front view of an 18 mm side, that notch spans `x ∈ [−9, 27]` against a panel occupying `x ∈ [0, 18]`
— a dashed box hanging 9 mm past the panel on both sides. Clip on the way in, not on the way out:
a consumer that had to clip would be a second place the rule lived.

The per-kind branch is an **exhaustive switch with a `never` check**, copying `buildBoardSheet`: a
new `CutDef` member must become a compile error, not a shape that silently vanishes from every
drawing.

| kind | treatment |
|---|---|
| `box` | through in this view → subtract from silhouette and occluder; else dashed rectangle |
| `hole-array` | dashed circles in the view whose normal is the drill axis; nothing in the others |
| `mitre` | reshapes the silhouette via `mitreFaceOutline`, which `drawing.ts` already uses |

## Dimensions

### Collision is prevented by construction

Each family gets its own side of the view and its own offset ring:

| family | side | offset |
|---|---|---|
| overall width | below | 1 |
| opening chain, horizontal | above | 1 |
| overall height | right | 1 |
| opening chain, vertical | left | 1 |
| toe kick | left | 2 |

No two dimension lines can share a side *and* an offset, so nothing collides and no placement search
is needed. This is what makes "dimensioned" affordable — non-colliding placement is most of what
`drawing.ts`'s complexity actually is, and this design sidesteps it rather than reproducing it.

`DimLine` already carries `axis` / `start` / `end` / `offset` / `label`, so the renderers need no new
primitive.

### Where the numbers come from

Chains read `resolveSections` leaf rectangles: collect their distinct edges along one axis, sort,
take consecutive gaps. Well-defined at any tree depth, and derived from the resolver rather than
re-walked — so a chain cannot disagree with the elevation drawn from the same rectangles.

Per view: Front carries both chains; Top carries overall W and D only (nothing divides in y); End
carries overall D, H and the toe kick.

**Unverified convention.** The opening chain lists *opening* sizes and deliberately does not sum to
the overall — a two-bay 600 reads `273 | 273` under an overall `600`, with the three 18 mm panels
implied by the material spec rather than dimensioned. This is believed to be normal cabinet shop
practice, but like the Stage F hinge figures it is a claim about the trade that no test here can
falsify. **Owes a woodworker's eye.**

## Thickness overrides

The projector resolves thickness with `roleThicknessFor(cabinet.params, materials, overridesOf(parts, cabinet.id))`.

Two existing call sites pass an empty `Map` and are wrong today:

- `SectionElevation.tsx:29` — the elevation ignores per-part thickness overrides, so a cabinet with a
  25 mm side draws openings that do not match its boards.
- `CarcasePanel.tsx:70` (`panelThickness`) — the same, wrapped in a swallow-to-0 for mid-keystroke
  states.

Both are corrected in this stage, in the same group as the projector, because a Section tab and a
Front tab drawing the same cabinet's openings differently is a worse symptom than one wrong tab. The
projector adopts `panelThickness`'s swallow-to-0 wrapper for the same reason it exists there: the
pane renders in states the validator rejects.

`__fixtures__/resolve.ts` keeps its empty map — a fixture states its own inputs.

## Selection

`App.tsx:82` derives `selectedCarcase` as `selection?.kind !== 'component' ? null : …`. Selecting a
**part** therefore nulls it, unmounting `CabinetEditor` and revealing the viewport — so clicking a
part in a projection would destroy the surface it was clicked in.

The open cabinet becomes **the cabinet containing the selection**: walk the selection's ancestry with
`ancestorsOf(node, byId)` and take the nearest carcase. Selecting a cabinet, or any part inside one,
opens that cabinet's editor.

Consequences, all intended:

- No new state, so the scene tree and the projection cannot disagree about which cabinet is open.
- Clicking a cabinet's board **in the scene tree** now opens the cabinet editor, where today it shows
  the viewport. This is a deliberate behaviour change.
- `selectedSectionId` is keyed on `selectedCarcase?.id`, which does not change when the selection
  moves from the cabinet to one of its parts — so a section pick survives clicking a board, which is
  what a user would expect.

A click selects the **nearest** part whose rect contains the point, and sets the existing scene
`selectedId`, so the sidebar's `EditPanel` opens with no new machinery. A fully hidden part is not
clickable in that view; it is reachable from the other two views and from the scene tree.

Hit-testing reads the **same rectangle list as occlusion**, so a through-cut is not a hit target: a
click inside a toe-kick recess falls through to whatever is behind it, exactly as the drawing shows.
One list, two questions — the alternative is a hit shape that can disagree with the drawn one.

## The pane, and the sheet

**The pane** uses a millimetre `viewBox` with `preserveAspectRatio="xMidYMid meet"`, like
`SectionElevation`. Unlike the elevation it draws text, so labels are sized as a fraction of the view
extent and strokes carry `vector-effect="non-scaling-stroke"`; otherwise a 3 mm label on a 720 mm
cabinet renders at under two pixels. Fit-to-pane means no scale label. The projection is memoised.

A cabinet whose parameters do not build renders the same "no elevation to draw" message
`SectionElevation` already shows, rather than throwing — the params are mid-keystroke, not wrong.

**The sheet** reuses `STANDARD_SCALES` and `toScaleLabel`, but needs its own scale selector and its
own layout. `selectScale` is board-shaped — it assumes the third dimension is a thickness. A
cabinet's is 560 mm, and stacking Front over Top costs `H + D` against 120 mm of usable height:

```
                       stacked            in a row
Base 600      1:20   30 x  36 mm      1:10   60 x  72 mm
Wall 600      1:10   60 x  72 mm      1:10   60 x  72 mm
Tall 600      1:20   30 x 105 mm      1:20   30 x 105 mm
```

A Base 600 stacked comes out smaller than its own dimension labels. So the three views go **in a
row** — Front, End, Top — and

```ts
selectAssemblyScale = min((AREA_W - 2 * GAP) / (W + D + W), AREA_H / max(H, D))
```

This keeps Front and End aligned horizontally, which is the alignment that matters for reading
heights across two views. It gives up Top sitting under Front on a shared width axis; that is the
stated cost of doubling the drawing for the commonest preset. A fitted non-standard scale was
rejected on the numbers — 1:10.7 at 56 × 68 mm is *worse* than the row layout's rounded 1:10 at
60 × 72 mm, and it would put a scale nobody can measure against on a shop drawing.

`buildDrawingSheets` gains an **optional** third parameter (the cabinets and their materials).
Optional rather than required: there are **52 existing call sites** across five test files plus
`App.tsx`, all passing two arguments. Widening the signature would spend a whole commit on churn to
no behavioural benefit. `App` passes the extra; one assembly sheet
per cabinet is inserted after the cover, ahead of the per-part sheets.

`DrawingViewer`'s label is `Part ${idx} of ${sheets.length - 1}`, which assumes sheet 0 is the cover
and every other sheet is a part. Assembly sheets in between make that lie, so the label is derived
from the sheet's own `kind` instead of from its index.

`sheetFilename` moves out of `DrawingViewer` so the tab's own export buttons share it. It also needs
a branch: an assembly sheet has no `partLabel`, so its filename comes from the cabinet's label. Both consumers
call the same `buildSvg(sheet)` / `buildDxf(sheet)` on the same object — "both places" costs two
buttons and one moved helper, not a second plumbing stack.

## Testing

All four affected serializers already have test files — `drawing.test.ts`, `buildSvg.test.ts`,
`buildDxf.test.ts`, `buildPdf.test.ts` — so the new variant lands in an existing harness.

**Fixtures are asymmetric on purpose.** G1 taught this twice: a symmetric cabinet passes everything.
The projector's fixture has W ≠ D ≠ H, an uneven section tree, and — following the
`panelThickness.test.ts` precedent — a 25 mm side beside an 18 mm one.

### Mutations, each with a predicted victim

| # | mutation | should fail |
|---|---|---|
| 1 | drop `subtractIntervals`' zero-length guard | the touching-endpoint case |
| 2 | flip the occlusion comparator | overlay door stops hiding the side **and** inset door starts hiding it — both, or the rule reads one case |
| 3 | drop Top's depth inversion | the top panel stops occluding the shelf below it |
| 4 | decide axis-alignment from `rotation === 0` | a part rotated **180°**, which is still an axis-aligned box |
| 5 | classify a cut as through once, not per view | the toe-kick notch: End goes solid, or Front goes L-shaped. One mutation, two failures |
| 6 | chain the section tree's percentages instead of the resolved rectangles | the uneven fixture's chain drifts |
| 7 | set End's `u` axis to `x` | End becomes Front — invisible unless depth ≠ width |
| 8 | pass an empty override map in the projector | the 25 mm-side fixture's opening chain |
| 9 | disable the near-half cull | the End view regains `right-side`, and 6 of 7 parts go hidden |
| 10 | cull Front as well as Top and End | the door disappears from the front elevation |
| 11 | look from −x instead of +x | the cull takes the *far* side: `left-side` survives, `right-side` does not |
| 12 | drop the clip of a cut rect to its silhouette | the toe-kick notch's dashed rect exceeds the side panel by 9 mm in Front |

Mutations 9 and 11 need the **same** fixture to distinguish them, which is why the cabinet is
asymmetric in x: with `left-side` and `right-side` at equal thickness, culling the wrong one looks
identical. Give one side 25 mm and the other 18 mm and the two mutations separate.

### e2e

- Select a cabinet, open Front, click a part → it is selected, the sidebar shows it, **and the Front
  tab is still open**. That last clause is the regression this stage's selection change exists to
  prevent.
- The drawings modal carries an assembly sheet for a cabinet, ahead of its part sheets, and its
  navigation label names it as an assembly rather than counting it as a part.
- The End tab shows more than one part. A unit test can assert the cull by role; only the browser
  proves the tab is worth opening, which is the defect that made the cull necessary.

## Staging

Six groups, each green.

| group | content |
|---|---|
| **A** | `hiddenLine.ts` — `subtractIntervals` and its epsilon. Pure, no consumers |
| **B1** | `assembly.ts` geometry — three planes, axis-alignment, occlusion, the near-half cull, dimension chains. A complete projector for a cabinet with no cuts |
| **B2** | cuts — board→cabinet transform, per-view through-detection, silhouette and occluder subtraction, dashed internal detail, the exhaustive switch |
| **C** | `CabinetProjection.tsx`, the three tabs, the selection change, the override fixes |
| **D** | the `assembly` sheet variant, three serializers, `sheetFilename`, both export paths |
| **E** | close: e2e, `CLAUDE.md`, `project-structure.html`, notes |

B splits because the whole projector in one commit would be the largest group in the restructure, and
the piece most likely to need a second pass — the through-cut rule — would be buried inside it. Split,
B2 lands with its own mutation checks rather than sharing them with six other claims.

**The honest risk is group D.** `buildPdf.ts` is 372 lines of pdf-lib coordinate work and is the least
pleasant of the three to extend. Groups A–C deliver a working, dimensioned, clickable pane on their
own, so D can slip without leaving the stage half-built.

## What this stage deliberately does not do

- **No per-part dimensions in a projection.** Twenty dimension chains on a tall unit is unreadable,
  and per-part sizes already have a sheet each.
- **No exploded or isometric view.** A different projector, not a parameter of this one.
- **No user-positioned cut plane.** Top and End cull the near half at a fixed midpoint, which is
  enough to make them readable, but the plane is not placeable and nothing is drawn *cut* — a part
  crossing it is drawn whole. A true sectional view, with a plane the user drags and hatched cut
  faces, is a further feature. (Note the word "section" is overloaded here: the Section tab is the
  elevation editor over the section *tree*, unrelated to a sectional view.)
- **No scene-wide assembly sheet.** One sheet per cabinet; parts belonging to no cabinet keep their
  own sheets and appear on no assembly drawing.
- **No dimension editing from the drawing.** Dimensions are read-only; sizes are typed in the panel.
