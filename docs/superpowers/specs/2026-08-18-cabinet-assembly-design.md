# Cabinet Structure & Assembly Model — Design Spec

Status: **decided**, not yet implemented (2026-08-18).

Notes: `docs/superpowers/notes/2026-08-18-cabinet-assembly-notes.md`

## Overview

Zimmu's scene is a flat array of parts. Every board is a peer of every other board, so there is
no object called "the cabinet" — you cannot select one, move one, duplicate one, or change its
depth. The strategic plan's Workflow C ("client changes cabinet depth 560 → 600 two days before
docs are due; one edit, everything follows") has nothing to edit.

This spec introduces a **nestable component tree** and a **parametric carcase generator** on top of
it, with a `driven | detached` contract that makes regeneration safe for hand edits.

```
▾ 🗄  Base Cabinet 600            👁
   ▾ ⚙ Carcase                    [params]
        🔗 Left Side       600×560×18
        🔗 Right Side      600×560×18
        ⛓️‍💥 Bottom          596×560×18   detached
        🔗 Shelf 1         596×544×18
   ▸ 🚪 Door (component)
   📄 Loose board                        ← parts with parentId: null still live at scene level
```

## Scope

This spec covers three of the four layers the user asked for:

| Layer | In this spec |
|---|---|
| 1. Grouping / hierarchy | ✅ |
| 2. Parametric cabinet generator | ✅ |
| 3. Construction method as a parameter | ✅ |
| 4. Assembly output (exploded views, build order, per-cabinet sheets) | ❌ — deferred to the deliverables project |

Layer 4 is output that *consumes* the structure. It is deferred, but this spec is obliged to leave
the data it needs in place: part→component ownership, joint→component ownership, and a
deterministic part order per carcase (the role-key order in §"Role keys"). The deliverables project
must not need a second migration to build an exploded view.

## Decisions

Six decisions were settled with the user before design began. Each is recorded with the rejected
alternatives, because each rejection is the kind that looks tempting again later.

### 1. Live regeneration with explicit detach

A part inside a carcase is `driven` by default: a parameter change recomputes its dimensions and
position. Editing a driven part's dimension by hand offers two outcomes — push the change up to the
cabinet parameter, or **detach** the part, after which it is never touched by regeneration again.

- **Rejected — fully live, no hand edits.** Generated parts read-only, everything via parameters.
  Cleanest to build and the model can never drift from its definition. Rejected because the first
  non-standard part forces you to delete the cabinet and rebuild by hand, or the parameter set grows
  forever chasing real-world exceptions.
- **Rejected — one-shot template.** Generator drops boards and joints once, then walks away. By far
  the cheapest, and it builds on what exists. Rejected because Workflow C then does not work, which
  is the exact SketchUp pain the strategic plan says the product exists to fix.
- **Rejected (deferred) — live with per-part overrides.** A hand edit recorded as an override layer
  that survives regeneration. Most powerful, no detach cliff. Rejected for now because overrides go
  stale when the thing they reference changes shape, and that staleness needs UI to show, edit and
  clear. It is the natural v2 evolution of detach, not a competitor to it.

### 2. Nestable component tree, any depth

Scene → Component → Component → … → Part. A door is a child component with its own generator, not
four parts owned by the carcase. Matches the strategic plan §7 (`Component` has "sub-parts **and
sub-components**").

- **Rejected — two fixed levels** (Scene → Cabinet → Part). Much cheaper: one level of transform
  composition, flat iteration everywhere. Rejected because doors and drawer boxes could not be
  authored once and reused, and going nestable later means migrating the same selection, transform,
  BOM and drawing code a second time.
- **Rejected — three fixed levels** (Scene → Run → Cabinet → Part). A fixed depth is an arbitrary
  ceiling — a door with a glazed sub-frame hits it — for nearly the complexity of the general tree.

### 3. One carcase generator, presets on top

A single `carcase` component kind with a parameter set. "Base cabinet", "wall cabinet", "tall unit"
are **saved presets over the same generator**, not separate code paths.

- **Rejected — named types** (BaseCabinet, WallCabinet, TallCabinet, DrawerBank, OpenShelf as
  distinct generators). Closest to how a cabinetmaker talks, and every panel is tight. Rejected
  because it is five generators sharing ~80% of their logic; every new construction option must be
  threaded through all five or silently exists in some and not others.
- **Rejected — carcase engine + specialised subtypes** that lock or hide parameters per preset.
  Rejected because the preset-override layer is real code with its own rules, and that layer is
  where the bugs would live. Presets are data here, not behaviour.

Secondary benefit: this keeps the open-core line clean. The engine is core; presets are content.

### 4. Construction controls: joinery method, back/base, shelving

The carcase's construction vocabulary for v1:

- **Carcase joinery method** — one setting picks how every corner and shelf is joined; the generator
  emits those joints. `dado-rabbet | finger | dowel | butt-screw | confirmat`. Dado, finger and
  half-lap geometry already exist, so this is mostly wiring.
- **Back and base treatment** — back `captured | applied | none`; base `toe-kick | ladder | legs |
  none`.
- **Shelving and the 32 mm system** — fixed shelves (housed in dados) and adjustable shelves
  (shelf-pin hole rows at 32 mm pitch, configurable setback, start height, count).

**Frameless only. Face-frame is explicitly out of v1** — frameless dominates the Australian market
the plan targets first, and face-frame changes carcase width, door sizing and hinge type together,
which is its own slice.

Fronts (doors, drawer boxes) are **child components with their own generators**, not carcase
parameters. That is what the nestable tree buys, and it keeps overlay/reveal logic out of the
carcase panel. No front generator ships in this slice; the tree supports one.

### 5. Generated joints are real joints

A carcase's dados and rabbets become ordinary `Joint` objects in `scene.joints`, tagged
`sourceComponentId` and marked `driven: true`.

- **Rejected — private to the cabinet** (emit cuts directly, never create Joints). Zero interaction
  risk with the joint engine. Rejected because it forks the model: a hand-made dado and a
  cabinet-made dado become different kinds of thing, the joint checklist reports a fully-built
  cabinet as `0 / 12`, and the suggestion engine offers joints for pairs that are already joined.
- **Rejected — real joints, fully editable, no driven flag.** Simplest mental model. Rejected
  because it contradicts the detach rule chosen for parts, and regeneration would either silently
  discard joint edits or have to merge them — the override problem already declined in decision 1.

Payoff: dropping in a cabinet lights the joint checklist to `12 / 12` using code already shipped,
and `suggestJointsForScene` already skips jointed pairs, so duplicate offers are suppressed for free.

### 6. Flat arrays with `parentId`, tree derived on demand

- **Rejected — true nested tree** (`Component.children: (Component | Part)[]`). Orphans become
  structurally impossible and recursion is natural. Rejected because it rewrites every consumer of
  `scene.parts`, turns part-lookup-by-id into a tree walk, changes the serialized shape, and
  `geometriesRef` is keyed by part id so a flattening pass is needed regardless. Same behaviour,
  several times the blast radius, for an invariant a guard function provides.
- **Rejected (deferred) — definitions + instances** (CAD block semantics: components authored once
  in a library, placed as instances). Genuinely better reuse. Rejected for now because it collides
  with decision 1: if a part is detached inside one instance of a door, it is undefined which
  instance owns the edit. Named as the v2 evolution — once presets show which components people
  actually reuse, instancing becomes an additive change rather than a guess.

## Data model

```ts
export interface Component {
  id: string                       // "cmp_<uuid>"
  kind: 'group' | 'carcase'        // 'group' = plain container, no generator
  label: string
  parentId: string | null          // null = top level
  position: Vec3                   // relative to parent
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
  params?: CarcaseParams           // present iff kind === 'carcase'
}

export interface CarcaseParams {
  width: number
  height: number
  depth: number
  material: string
  thickness: number
  hasTop: boolean
  backMode: 'captured' | 'applied' | 'none'
  backThickness: number
  baseMode: 'toe-kick' | 'ladder' | 'legs' | 'none'
  toeKickHeight: number
  toeKickSetback: number
  fixedShelves: number
  adjustableShelves: {
    rows: 1 | 2
    pitch: 32                      // literal, not a number: 32 mm *is* the system being modelled
    setback: number
    startHeight: number
    count: number
  }
  jointMethod: 'dado-rabbet' | 'finger' | 'dowel' | 'butt-screw' | 'confirmat'
  dividers: number[]               // fractions of width, 0..1, ascending
}
```

Additions to existing types:

- `Part` (both `BoardPart` and `CylinderPart`) gains `parentId: string | null`,
  `driven: boolean`, and `role?: string` (set only on driven parts — see §"Role keys").
- `Joint` (every kind) gains `sourceComponentId?: string` and `driven: boolean`.
- `BoxCut` gains `sourceComponentId?: string`, alongside its existing `sourceJointId?`. A carcase
  places some cuts that are **not** joint-derived — the toe-kick notch is the clear case — and they
  need an owner so they can be stripped when the component stops implying them. The two fields are
  mutually exclusive: `sourceJointId` cuts are owned by `reconcileJoints`, `sourceComponentId` cuts
  by `regenerateComponents`. A cut with neither is hand-made and owned by nobody.
- `Scene` gains `components: Component[]`.

Everything remains a flat array. The tree is an index built on demand.

`rotationOrder: 'XYZ'` on `Component` is fixed for the same reason it is fixed on `Part` — see the
`composeWorldMatrix` invariant in CLAUDE.md. Any other order requires revisiting the matrix code.

## World transforms

`composeWorldMatrix(part)` today reads `part.position`/`part.rotation` and is element-wise
parity-tested against `THREE.Matrix4`. **It is not changed.** It becomes the *local* matrix. Two new
functions join it in `src/geom/transform.ts`:

```ts
multiplyMatrix(a: Float64Array, b: Float64Array): Float64Array
resolveWorldMatrix(node: Part | Component, componentsById: Map<string, Component>): Float64Array
```

`resolveWorldMatrix` walks `parentId` to the root, composing local matrices outward-in. Every
current consumer of `composeWorldMatrix` swaps to it:

- `src/geom/stl.ts` (`buildBinaryStl`)
- `src/render/viewport.tsx` (mesh placement)
- `src/geom/occt.worker.ts` STEP export path
- `src/scene/suggestJoints.ts`, `src/scene/jointChecklist.ts`, `src/scene/obbOverlap.ts`,
  `src/geom/halflap.ts` (`worldAabb`)
- `src/geom/drawing.ts`

**For a part with `parentId: null`, `resolveWorldMatrix` returns exactly what
`composeWorldMatrix` returns today.** That identity is what makes the migration safe: every existing
file and every existing test passes unchanged after the swap.

`worldAabb`'s existing `WeakMap` memoization (keyed on part object identity) still holds — parts are
stored immutably, so an edit yields a new object. But the cached AABB now also depends on ancestor
transforms, so the key must become the part object *and* the resolved matrix, or the memo must be
invalidated when any ancestor changes. **Decision: key the WeakMap on the part object and store the
matrix alongside the AABB, recomputing when the stored matrix differs.** A component move creates
new part objects only if we choose to; it does not today, so identity alone is insufficient.

## The regeneration pipeline

Two pure, idempotent stages, run in this order on every scene mutation:

```
regenerateComponents(scene)   // carcases emit driven parts + driven joints
        ↓
reconcileJoints(scene)        // existing, unchanged — derives cuts + seats from joints
```

`regenerateComponents` is a sibling of `reconcileJoints` in shape: `Scene → Scene`, pure, no React,
no OCCT, no THREE. Ordering is fixed and tested — the generator emits *joints*, and
`reconcileJoints` then derives their cuts through the existing `deriveJoint` path with no changes to
that function.

### Role keys

For each `kind: 'carcase'` component, the generator computes the part set the params imply, each
tagged with a **stable role key**: `left-side`, `right-side`, `top`, `bottom`, `back`,
`divider-0`, `shelf-fixed-0`, `shelf-adj-0`, `toe-kick`, … Role keys are deterministic and ordered;
that order is also the part order the deliverables project will use for build sequence.

The role key is stored on the part (`role?: string`, set only on driven parts) and is what
regeneration reconciles against — **not** freshly generated ids.

### Reconciliation rules

| Situation | Action |
|---|---|
| Role present, part `driven` | Overwrite dimensions and position; **keep its id**, colour and label |
| Role present, part `driven: false` | Leave completely alone |
| Role absent | Create the part, `driven: true` |
| Part has a role the params no longer imply, `driven: true` | Delete |
| Part has a role the params no longer imply, `driven: false` | **Keep**, clear its `role`, re-parent to the component as a plain child |

Keeping ids stable across regeneration is what lets `shapeKey`'s geometry cache do its job: changing
`fixedShelves` from 2 to 3 rebuilds one shelf in OCCT, not the whole carcase.

The last row is load-bearing: **a parameter change must never destroy a detached part.** A detached
part is the user's.

## Shelf-pin holes: a new cut kind

Shelf-pin arrays are the performance risk in this feature. A 720 mm side at 32 mm pitch is ~20
holes; two rows per side, two sides, six cabinets ≈ 480 boolean subtractions per regeneration.

Mitigated in the data model rather than in the worker:

```ts
export interface HoleArrayCut {
  kind: 'hole-array'
  id: CutId
  label: string
  face: Face
  axis: 'U' | 'V'                  // which face axis the row runs along
  start: Vec3                      // first hole centre, part-local
  pitch: number                    // mm between holes
  count: number
  diameter: number
  depth: number
  sourceComponentId?: string       // hole arrays are component-owned, never joint-owned
}
```

One entry in `part.cuts`, one entry in `shapeKey`, and **one** `BRepAlgoAPI_Cut` in the worker
against a compound of N cylinders — not N sequential booleans. 480 holes becomes ~12 boolean
operations.

`HoleArrayCut` joins `CutDef` (`BoxCut | MitreCut | HoleArrayCut`). `shapeKey` gains a case;
`drawing.ts` gains a case (holes render as circles in the Face view, dashed centre-lines in Edge).

## UI

### Sidebar becomes a tree

New files, so the change does not land in an already-oversized module:

- **new** `src/ui/SceneTree.tsx` — the tree: expand/collapse, selection, visibility per node
- **new** `src/ui/CarcasePanel.tsx` — carcase parameters in collapsible sections
  (Size · Structure · Shelving · Joinery), so decision 3's "options accumulate" cost is paid up front
- **move** `EditPanel` (currently `sidebar.tsx:494–813`) → `src/ui/EditPanel.tsx`, mechanically, no
  behaviour change, in its own commit so the diff is reviewable
- `sidebar.tsx` (currently 1118 lines) ends at ~250 as a composition shell

### Targeted fix in `App.tsx`

`App.tsx` threads seven `snapActive` / `cutActive` / `jointActive` / … booleans into `Sidebar`, all
derived from `mode.activeMode` two lines earlier. This work would add an eighth. Pass
`mode.activeMode` and delete the seven. In scope because this change is what makes it worse.

### Selection

`selectedId: PartId` becomes `selection: { kind: 'part' | 'component'; id: string } | null`.
Selecting a component emissive-highlights every descendant mesh and points the edit panel at the
component.

**No transform gizmo in this slice.** Moving a cabinet uses the numeric position/rotation fields
parts use today. Recorded as a known gap, not a hidden one.

### The detach moment

Editing a driven part's dimension shows an inline two-button strip under the field — no modal:

> **Bottom is driven by Base Cabinet 600.**  [ Change the cabinet ] [ Detach this part ]

"Change the cabinet" appears **only when the edited field maps to a parameter** (part width ←
carcase width). Where there is no mapping — nudging one shelf — only "Detach this part" shows. Both
are ordinary undoable history entries via `onUpdate`.

### Creating a cabinet

`FileMenu` gains **+ Cabinet** with a preset dropdown (Base 600×720×560, Wall 600×720×330, Tall
600×2100×560). Dropped at the origin. **No new single-letter shortcut** — F/C/J/L/M/B/T/H are taken.

### Two knock-on effects

**The joint checklist will flood.** A 7-part carcase produces ~12 pairs; six cabinets is ~72 rows,
all `✓` the instant they are created, on a panel currently capped at `MAX_ACTIONABLE_ROWS = 200`.
Fix in this slice: **group checklist rows by owning component, collapsed by default when the group
is complete.** Six cabinets read as six green one-liners; loose parts and cross-cabinet pairs stay
at top level, which is where a real joinery decision lives.

**The cutting list gains a cabinet column.** `groupParts` groups by material today; it gains
component ownership, so the fabricator reads "Base Cabinet 600 → 2 × Side 600×560×18". Hardware
items may link to a component as well as to parts.

## File format: v10 → v11

Additive and total:

- `scene.components = []`
- every part: `parentId: null`, `driven: false`
- every joint: `driven: false`

A v10 file opens and behaves **identically** — see the `resolveWorldMatrix` identity above.

Forward compatibility follows existing behaviour: `useFile.ts` already warns when `raw.version >
FILE_FORMAT_VERSION` and attempts to parse. A v11 file opened by a v10 build loads parts flat and
loses the tree. Accepted; not worth a compatibility shim at prototype stage.

## Failure modes

The repo's existing instinct is preserved: `reconcileJoints` keeps last-good cuts when `deriveJoint`
returns null rather than deleting. The same philosophy applies throughout.

| Failure | Behaviour |
|---|---|
| Cycle in `parentId` (component reparented into its own descendant) | Rejected at the reparent operation. `resolveWorldMatrix` additionally depth-caps and throws rather than looping |
| Dangling `parentId` on load | Node is **promoted to top level**, never dropped. A corrupt tree costs hierarchy, never parts |
| Invalid params (`depth < 2 × thickness`, shelves that do not fit, negative counts) | `validateCarcaseParams` returns errors; the generator emits nothing and **preserves last-good parts**, mirroring `deriveJoint` returning null. Panel shows the error inline |
| Deleting a component | Driven descendants deleted with it; **detached descendants promoted to top level and kept** |
| Regeneration non-idempotent | Property test: `regen(regen(s))` deep-equals `regen(s)` |

## Testing

Repo conventions: co-located `*.test.ts(x)`, pure-seam-first, no live OCCT in Node.

- `src/scene/regenerateCarcase.test.ts` — table-driven, one case per parameter; the bulk of the suite
- `src/scene/componentTree.test.ts` — index build, cycle guard, orphan promotion, delete semantics
- `src/geom/transform.test.ts` extended — `multiplyMatrix` and a 3-deep `resolveWorldMatrix` chain,
  element-wise against nested `THREE.Object3D`, matching how `composeWorldMatrix` is already proven
- `src/scene/useFile.test.ts` — v10 → v11 migration round-trip
- `src/scene/useScene.test.ts` — detach, and undo of a detach
- `src/ui/SceneTree.test.tsx`, `src/ui/CarcasePanel.test.tsx`
- `src/scene/jointChecklist.test.ts` extended — component grouping and collapse-when-complete
- **one standing e2e**, `e2e/carcase.spec.ts`: drop the Base 600 preset → assert 7 parts and
  `12 / 12` on the checklist → change depth 560 → 600 → assert driven parts resized and **the
  detached one did not move**. Workflow C in a single spec. Precedent: the 2026-08-18 joint-checklist
  follow-up, where a feature's whole point earned a permanent test rather than a throwaway.
- **perf**: a bench pinning 6-cabinet regeneration to a budget, plus the `performance.mark` WASM
  baseline that the strategic plan's Phase 0.5 list has carried as pending since June 2026.

## Phasing

Steps 1–2 are pure refactors with no observable behaviour change: the structural move lands green
before any feature rides on it.

1. `Component` type, flat storage, v11 migration — no UI
2. `multiplyMatrix` + `resolveWorldMatrix`, swap all consumers — behaviour identical, tree-capable
3. `SceneTree` + selection model + `EditPanel` extraction
4. `regenerateCarcase` pure function + `validateCarcaseParams` — TDD, largest single chunk
5. `CarcasePanel` + create-cabinet menu + presets
6. Driven/detach semantics + the inline prompt
7. Joint emission via `jointMethod` + checklist grouping by component
8. `hole-array` cut kind (geom → worker → `shapeKey` → drawing) + shelf pins
9. Cutting list component column + hardware→component links
10. Docs re-baseline — CLAUDE.md architecture tree, README, `project-structure.html`, strategic plan
    §7 and §17

Step 10 also clears documentation drift found while grounding this spec: README, CLAUDE.md and the
strategic plan all state `FILE_FORMAT_VERSION = 2` (actual: 10) and "374 tests across 25 files"
(actual: 59 test files); CLAUDE.md's architecture tree predates the joint engine, the suggestion
engine and the checklist entirely.

## Explicitly not in this slice

Face-frame construction · door and drawer *generators* (the tree supports them as child components;
no generator ships) · component instancing / definitions · transform gizmo · exploded views and
build order · per-cabinet drawing sheets · imperial units.

## Open questions this spec does not settle

- **Strategic Open Question 9** (browser prototype vs. Rust/Tauri transition timing) becomes sharper
  after this work, not before: the browser build will then carry the component model and the
  parametric generator, which the plan assigns to Rust Phases 1–2.
- **Strategic Open Question 10** (`.zimmu` vs `.zmu`) is untouched. This spec bumps to v11 within
  `.zimmu`; renaming the extension remains a separate decision.
