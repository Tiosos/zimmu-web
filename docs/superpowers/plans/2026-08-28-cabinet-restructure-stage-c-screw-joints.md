# Cabinet restructure Stage C — screw fixing as the default joint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make screw fixing a first-class joint that shows its holes, make it the default, and let a user override any single joint's kind without regeneration undoing it.

**Architecture:** The joint→cut pipeline is widened from `BoxCut` to `BoxCut | HoleArrayCut` first, so a joint can own a hole array. Then `ScrewJoint` joins the union like any other kind, `carcaseJoints` emits it for `butt-screw`, and the presets flip. A per-joint override reuses `driven: false`, exactly as a detached part does.

**Tech Stack:** TypeScript strict, Vitest, React 19. Pure modules plus two UI touches.

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md`
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
**Preceded by:** Stage A (`…stage-a-section-tree.md`), Stage B (`…stage-b-materials-own-thickness.md`)

---

## The finding that reshapes this stage

The spec says the two hole families "are `HoleArrayCut`s, so drawings and the nest handle them
already." That is true of *rendering* and false of *ownership*.

```ts
// src/geom/dado.ts:24
export type DerivedCut = { partId: PartId; cut: BoxCut }
```

```ts
// src/scene/types.ts — HoleArrayCut
sourceComponentId?: string // hole arrays are component-owned, never joint-owned
```

A screw joint owns hole arrays, which that comment says cannot happen. **Seven guards** assume
joint-owned cuts are boxes:

| file | what it guards |
|---|---|
| `reconcileJoints.ts:20` | strip cuts whose owning joint is gone |
| `reconcileJoints.ts:36` | strip this joint's cuts before re-deriving |
| `useScene.ts:463` | duplicating a part drops derived cuts |
| `useScene.ts:591` | a derived cut cannot be edited directly |
| `useScene.ts:746` | a derived cut cannot be removed directly |
| `useScene.ts:826` | derived cuts cannot be paired |
| `EditPanel.tsx:874` | a hole array is never rendered as joint-owned |

Left alone, screw holes would survive their joint's deletion, and would be freely editable and
removable in the UI — the exact contract every other derived cut has. **Group A exists to widen
that pipeline before any screw joint can reach it.**

---

## Commits are grouped by green boundaries

The gate is a Claude Code `PreToolUse` hook running `pnpm typecheck`; `--no-verify` is inert.
**Never** edit `.claude/settings.json` or `.claude/hooks/`.

| commit | covers | why it is green |
|---|---|---|
| **A** | widen the derived-cut pipeline to hole arrays | no joint emits one yet, so behaviour is unchanged and the whole suite must stay green |
| **B** | `ScrewJoint`, `defaultScrewJoint`, `deriveScrewJoint` | a new union member nothing emits |
| **C** | `carcaseJoints` emits screws; presets flip to `butt-screw` | the deliberate behaviour change |
| **D** | per-joint override, and the UI to set a joint's kind | |
| **E** | close-out — e2e, docs, notes | |

Group A's acceptance is unusual and important: **the full suite must pass unchanged.** Widening a
type that nothing yet uses should be invisible. If a test changes, the widening was not neutral and
that needs explaining before group B builds on it.

---

## Group A — widen the derived-cut pipeline

### A1: `sourceJointId` on `HoleArrayCut`

```ts
  // Set on hole arrays a Joint generates and owns (read-only in the UI), exactly as on a box cut.
  // Screw fixing is the first joint whose geometry is bores rather than a groove; before it, the
  // only joint-owned cut kind was 'box'.
  sourceJointId?: string
```

Replace the existing `sourceComponentId` comment — "hole arrays are component-owned, never
joint-owned" — because it stops being true here. Do not leave it to mislead.

### A2: widen `DerivedCut`

```ts
export type DerivedCut = { partId: PartId; cut: BoxCut | HoleArrayCut }
```

### A3: the seven guards

Each currently reads `c.kind === 'box' && c.sourceJointId …`. The question each is really asking is
*"is this cut owned by a joint?"*, so state that once and use it everywhere:

```ts
// src/scene/cutOwnership.ts — new
import type { CutDef } from './types'

// A joint owns a cut whichever kind it is. Asked in seven places — reconciliation, duplication,
// editing, removal, pairing, and the panel — and a copy that forgot a kind is how a stale bore
// survives its joint.
export function isJointOwned(cut: CutDef): boolean {
  return (cut.kind === 'box' || cut.kind === 'hole-array') && cut.sourceJointId !== undefined
}

export function isOwnedBy(cut: CutDef, jointId: string): boolean {
  return (cut.kind === 'box' || cut.kind === 'hole-array') && cut.sourceJointId === jointId
}
```

Update all seven call sites to use them. `EditPanel.tsx:874` currently renders `cut.kind ===
'hole-array' ? null : …` before it ever checks `sourceJointId` — a joint-owned bore must take the
same read-only branch a joint-owned box does.

**Test each guard.** The one that matters most: deleting a screw joint removes its bores. That
cannot be tested until group B exists, so group A's test is the narrower statement — `isJointOwned`
answers true for a hole array carrying a `sourceJointId` and false for one carrying only a
`sourceComponentId`.

- [ ] **Mutation check:** make `isJointOwned` return `cut.kind === 'box' && …` (its old behaviour).
      Confirm the hole-array test FAILS. Restore. **Grep after applying** — Prettier can reflow a
      line so a replacement silently matches nothing, and a no-op mutation looks like a survivor.

- [ ] **Acceptance:** `pnpm typecheck && pnpm lint && pnpm test` green, and the test count is
      unchanged apart from the guard tests you added. A behaviour change here means the widening
      was not neutral — stop and report rather than absorbing it.

---

## Group B — the screw joint

### B1: `ScrewJoint`

Shaped like the existing five — explicit numeric fields, nothing derived at read time:

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

Add to the `Joint` union and to `deriveJoint`'s switch (which is exhaustive over `joint.kind`, so
`tsc` will name every site that must handle it).

### B2: `defaultScrewJoint`

In `src/scene/defaultJoint.ts`, matching the signature style of `defaultDadoJoint`. The through
panel is the **housing** and the receiving panel is the **housed** one — you screw through the side
into the bottom's edge, which is the same pair a dado names, so the existing `JointDescriptor`
(`housingRole`, `housedRole`, `housingFace`, `housedEnd`) already carries everything needed.

**Screw count is derived from the joint's length**, not stored blindly: one screw at each end inset
by `endInset`, then intermediates added until no gap exceeds a documented maximum spacing. State
that maximum as a named constant with a comment saying it is a chosen figure, not a derived one —
the same honesty `MAX_LADDER_SPAN` uses.

### B3: `deriveScrewJoint`

New file `src/geom/screw.ts`, following `src/geom/dado.ts`'s shape: returns `DeriveResult | null`,
null when the joint is stale (missing or non-board parts). It emits **two** `HoleArrayCut`s:

- clearance: on the through panel's `throughFace`, running along the joint line, `diameter:
  clearanceDiameter`, depth through the panel.
- pilot: into the receiving panel's `receivingEnd`, same positions in world terms, `diameter:
  pilotDiameter`, `depth: pilotDepth`.

Both carry `sourceJointId`. **No seat** — screwing does not move a panel, unlike a dado which seats
the housed board into the groove. Returning a seat would shift the cabinet.

Tests: the two arrays land on the two different parts; the clearance depth passes through the
through panel; the pilot is blind (`depth < the receiving panel's extent along that axis`, which is
what makes the drawing viewer dash it); count and spacing obey the rule; a stale joint returns null.

- [ ] **Mutation check:** make the pilot depth equal the receiving panel's full extent. Confirm the
      "pilot is blind" test FAILS. Restore, report.

---

## Group C — screws become the default

### C1: `carcaseJoints` emits them

`carcaseJoints` currently returns `[]` for `dowel`, `butt-screw` and `confirmat`, with a comment
that their geometry is hardware rather than a cut. **That comment becomes false for `butt-screw`
and must be rewritten**, not left to mislead — `dowel` and `confirmat` still emit nothing.

The descriptor kind widens from `'dado' | 'finger'` to include `'screw'`, and `regenerateOne`'s
`kindLabel` and joint construction follow.

### C2: presets flip

`CARCASE_PRESETS` goes from `jointMethod: 'dado-rabbet'` to `'butt-screw'`. **This is a deliberate
behaviour change and it re-baselines every generated cabinet**: a dropped Base 600 comes out screwed
rather than dadoed, its panels are no longer extended into grooves, and its cutting-list dimensions
change accordingly.

Say so plainly in the notes. The sheet-yield spec's mistake was claiming a change re-baselined
nothing when it re-baselined real rows; do not repeat it.

### C3: the extension pass

`carcaseRoles` extends a housed panel to reach the groove floor. **A screwed butt joint has no
groove**, so a screw descriptor must extend nothing — the panels meet face to face. Check
`extendToward`'s caller: it currently switches on `d.kind === 'dado' ? dadoDepthFor(thickness) :
thickness`, and a `'screw'` kind must contribute zero.

**This is the highest-risk line in the stage.** Getting it wrong silently lengthens every housed
panel in every screwed cabinet. Pin it with a test that a screwed cabinet's bottom is exactly the
clear span between the sides, computed rather than typed.

---

## Group D — per-joint override

### D1: `regenerateOne` preserves a user-owned joint

It currently replaces every joint matching its `sourceComponentId` unconditionally:

```ts
joints: [...joints.filter((j) => j.sourceComponentId !== component.id), ...emitted]
```

A joint the user has taken is marked `driven: false` and must survive — the exact mirror of how a
detached part survives. Keep the user's joint and drop the generated one for that role pair, matched
on the deterministic id `joint_{componentId}_{housingRole}__{housedRole}`.

- [ ] **Mutation check:** remove the preservation. Confirm the "an overridden joint survives a
      cabinet width change" test FAILS. Restore, report.

### D2: choosing a joint's kind

In whatever panel already shows a selected joint (`JointsPanel.tsx` exists — read it first), let the
user change a joint's kind. Setting it marks the joint `driven: false`.

**Reject impossible pairings rather than generating nonsense.** A finger joint needs a corner where
two outer faces are coplanar — which is why `carcaseJoints` already refuses fingers at a toe-kick
corner. Offering finger on a mid-panel T-contact must not silently produce garbage geometry.

---

## Group E — close the stage

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green, exit codes read directly, **never piped
      through `tail`/`head`** — that makes the exit status the pipe's and a failure slips through.
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e` →
      15 passed. The image's Chromium is not the build `@playwright/test` pins; do **not** run
      `playwright install`. **Expect e2e failures from C2** — specs asserting a dadoed Base 600's
      dimensions will move. Fix the assertions to the new truth, and say in the notes which ones
      moved and why.
- [ ] `CLAUDE.md`: the joint list, the new `screw` kind, `cutOwnership.ts`, and an invariant that a
      joint-owned cut may be a box **or** a hole array.
- [ ] `node scripts/update-structure-html.mjs`
- [ ] Notes: the ownership-pipeline finding; that the preset flip re-baselines every cabinet;
      which e2e assertions moved; final counts.

## Acceptance

- [ ] Deleting a screw joint removes both its hole arrays — the guard that group A exists for
- [ ] A screwed cabinet's panels are **not** extended (no groove to reach)
- [ ] An overridden joint survives a cabinet parameter change
- [ ] A screw joint's pilot reads as blind on the shop drawing
- [ ] Every mutation check above was run and reported

## What Stage C deliberately does not do

- `dowel` and `confirmat` still emit nothing — they need the hardware model, not a cut.
- No counterbore. `HoleArrayCut` cannot express a stepped bore; it would need two concentric arrays
  or a new cut kind, and the spec excludes it.
- `adjustableShelves` still on `CarcaseParams` (Stage D); no fronts (Stage E).
