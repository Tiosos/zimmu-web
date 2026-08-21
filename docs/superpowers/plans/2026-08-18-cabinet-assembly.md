# Cabinet Structure & Assembly Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Zimmu a nestable component tree and a parametric carcase generator, so a cabinet is a single editable object whose parts and joints regenerate when its parameters change, without ever destroying a part the user has detached.

**Architecture:** `Scene` gains a flat `components: Component[]` array; parts and components link upward by `parentId`, and the tree is an index derived on demand. A new pure stage, `regenerateComponents(scene)`, runs immediately before the existing `reconcileJoints(scene)`: carcases emit driven parts and driven joints, then `reconcileJoints` derives cuts and seats from those joints exactly as it does today. Regeneration reconciles against existing parts by **stable role key**, so ids survive (keeping the `shapeKey` geometry cache useful) and a `driven: false` part is never touched.

**Tech Stack:** React 19 · TypeScript strict · Vitest + happy-dom + @testing-library/react · Playwright · Three.js r184 · opencascade.js via Comlink worker · Tailwind v4 + Radix.

**Spec:** `docs/superpowers/specs/2026-08-18-cabinet-assembly-design.md`
**Notes:** `docs/superpowers/notes/2026-08-18-cabinet-assembly-notes.md` — update it whenever a decision deviates from the spec.

---

## Conventions for every task in this plan

- **Package manager is pnpm.** Never npm or yarn.
- **Run before every commit:** `pnpm typecheck && pnpm lint && pnpm test`. A pre-commit hook runs typecheck and will block a red commit.
- **TDD is mandatory here.** Write the failing test, run it, watch it fail for the stated reason, then implement.
- **No `any`.** `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` are on.
- **Comments explain *why*, never *what*.**
- **Never call live OCCT in a Vitest test.** Geometry logic under test must be pure.
- Branch: `claude/software-review-planning-a4rdw1` (or a fresh `claude/*` branch per phase if the reviewer prefers). Never commit on `main`.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/scene/componentTree.ts` | Pure tree helpers: index build, ancestor walk, descendant collection, cycle guard, orphan promotion, delete semantics. No React, no THREE. |
| `src/scene/componentTree.test.ts` | Tests for the above. |
| `src/scene/carcaseRoles.ts` | Pure: `CarcaseParams` → ordered `RoleSpec[]` (role key, dimensions, local position, rotation). The whole geometry of a carcase lives here. |
| `src/scene/carcaseRoles.test.ts` | Table-driven, one case per parameter. |
| `src/scene/regenerateComponents.ts` | Pure `Scene → Scene`. Reconciles carcase role specs against existing parts by role key; emits driven joints. Sibling of `reconcileJoints.ts`. |
| `src/scene/regenerateComponents.test.ts` | Reconciliation rules, detach preservation, idempotence property. |
| `src/scene/carcasePresets.ts` | `CARCASE_PRESETS` — named parameter bundles (Base 600, Wall 600, Tall 600). Data only. |
| `src/ui/SceneTree.tsx` | The sidebar hierarchy: expand/collapse, selection, visibility per node. |
| `src/ui/SceneTree.test.tsx` | Rendering, selection callbacks, driven/detached badges. |
| `src/ui/CarcasePanel.tsx` | Carcase parameter form in collapsible sections. |
| `src/ui/CarcasePanel.test.tsx` | Field→param wiring, validation display. |
| `src/ui/EditPanel.tsx` | Moved verbatim out of `sidebar.tsx`. |
| `e2e/carcase.spec.ts` | Standing end-to-end proof of Workflow C. |

### Modified

| File | Change |
|---|---|
| `src/scene/types.ts` | `Component`, `CarcaseParams`, `HoleArrayCut`; `parentId`/`driven`/`role` on `Part`; `sourceComponentId`/`driven` on `Joint`; `sourceComponentId` on `BoxCut`; `components` on `Scene`. |
| `src/geom/transform.ts` | Add `multiplyMatrix`, `resolveWorldMatrix`. `composeWorldMatrix` unchanged. |
| `src/geom/halflap.ts` | `worldAabb` memo keyed on part identity **and** resolved matrix. |
| `src/scene/useFile.ts` | `FILE_FORMAT_VERSION = 11`; migration; `newFile` seeds `components: []`. |
| `src/scene/useScene.ts` | Component CRUD, selection model, regeneration pipeline, detach. |
| `src/scene/utils.ts` | `shapeKey` handles `hole-array`. |
| `src/scene/jointChecklist.ts` | Group rows by owning component. |
| `src/geom/occt.ts`, `src/geom/occt.worker.ts` | Hole-array cutting tool as one compound boolean. |
| `src/geom/drawing.ts` | Render hole arrays in Face/Edge views. |
| `src/ui/sidebar.tsx` | Shrinks to a composition shell. |
| `src/ui/buildCsv.ts` | Component column in the cutting list. |
| `src/App.tsx` | Pass `mode.activeMode` instead of seven booleans; wire tree + carcase panel. |
| `src/render/viewport.tsx` | Place meshes by resolved world matrix. |
| `CLAUDE.md`, `README.md`, `project-structure.html`, `joinery_3d_software_plan.md` | Re-baseline (Phase 10). |

---

# Phase 1 — Component type, flat storage, v11 migration

**Outcome:** the data model can express a tree; nothing in the app behaves differently. Every existing test still passes untouched.

## Task 1.1: Add the `Component` and `CarcaseParams` types

**Files:**
- Modify: `src/scene/types.ts`

- [ ] **Step 1: Add the types**

Append to `src/scene/types.ts`, after the `HardwareItem` interface:

```ts
export type ComponentId = string

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
    pitch: 32 // literal, not number: 32 mm *is* the system being modelled
    setback: number
    startHeight: number
    count: number
  }
  jointMethod: 'dado-rabbet' | 'finger' | 'dowel' | 'butt-screw' | 'confirmat'
  dividers: number[] // fractions of width, 0..1, ascending
}

export interface Component {
  id: ComponentId // "cmp_<uuid>"
  kind: 'group' | 'carcase'
  label: string
  parentId: ComponentId | null
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
  params?: CarcaseParams // present iff kind === 'carcase'
}
```

- [ ] **Step 2: Extend `Part`, `Joint`, `BoxCut`, `Scene`**

In `src/scene/types.ts`, add to **`BoxCut`**, directly under its existing `sourceJointId` line:

```ts
  sourceComponentId?: string // set on cuts a component places directly (e.g. toe-kick notch)
```

Add to **both** `BoardPart` and `CylinderPart`, after their `visible: boolean` line:

```ts
  parentId: ComponentId | null
  driven: boolean
  role?: string // set only on driven parts; the regeneration identity key
```

Add to **every** joint interface (`DadoJoint`, `HalfLapJoint`, `MortiseTenonJoint`, `FingerJoint`, `TongueGrooveJoint`), after each one's `label` line:

```ts
  sourceComponentId?: string
  driven: boolean
```

Change `Scene`:

```ts
export interface Scene {
  parts: Part[]
  materials: Record<string, MaterialDef>
  hardware: HardwareItem[]
  joints: Joint[]
  components: Component[]
}
```

- [ ] **Step 3: Run typecheck and read the failures**

Run: `pnpm typecheck`
Expected: FAIL. Every literal that constructs a `Scene`, a `Part` or a `Joint` is now missing required fields. This is the intended blast radius — it is the compiler enumerating every construction site for you.

- [ ] **Step 4: Fix every construction site**

Work through the list the compiler produced. Three mechanical rules cover all of them:

- Scene literals: add `components: []`.
- Part literals: add `parentId: null, driven: false`.
- Joint literals: add `driven: false`.

The non-test sites are `src/scene/useScene.ts` (`makeDefaultBoard`, `useState` initialiser, duplicate-part path), `src/scene/useFile.ts` (`newFile`), and `src/scene/defaultJoint.ts` (five `default*Joint` creators — each gains `driven: false`).

- [ ] **Step 5: Verify green**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass. Test count unchanged from before this task — no behaviour changed.

- [ ] **Step 6: Commit**

```bash
git add src/scene/types.ts src/scene/useScene.ts src/scene/useFile.ts src/scene/defaultJoint.ts src
git commit -m "feat(types): add Component, CarcaseParams, and tree/driven fields"
```

## Task 1.2: Pure component-tree helpers

**Files:**
- Create: `src/scene/componentTree.ts`
- Test: `src/scene/componentTree.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/componentTree.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Component, BoardPart } from './types'
import {
  componentsById,
  ancestorsOf,
  descendantIds,
  wouldCycle,
  promoteOrphans,
} from './componentTree'

function cmp(id: string, parentId: string | null): Component {
  return {
    id,
    kind: 'group',
    label: id,
    parentId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
  }
}

function board(id: string, parentId: string | null): BoardPart {
  return {
    kind: 'board',
    id,
    label: id,
    length: 100,
    width: 50,
    thickness: 18,
    material: '',
    color: '#c8a97e',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId,
    driven: false,
  }
}

describe('componentsById', () => {
  it('indexes every component by id', () => {
    const map = componentsById([cmp('a', null), cmp('b', 'a')])
    expect(map.get('b')?.parentId).toBe('a')
    expect(map.size).toBe(2)
  })
})

describe('ancestorsOf', () => {
  it('returns root-last ancestors of a nested part', () => {
    const map = componentsById([cmp('a', null), cmp('b', 'a')])
    expect(ancestorsOf(board('p', 'b'), map).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('returns empty for a top-level part', () => {
    expect(ancestorsOf(board('p', null), componentsById([]))).toEqual([])
  })

  it('stops rather than looping when the chain is cyclic', () => {
    const map = componentsById([cmp('a', 'b'), cmp('b', 'a')])
    expect(() => ancestorsOf(board('p', 'a'), map)).toThrow(/depth/i)
  })
})

describe('descendantIds', () => {
  it('collects nested components and parts', () => {
    const components = [cmp('a', null), cmp('b', 'a'), cmp('c', null)]
    const parts = [board('p1', 'b'), board('p2', 'c')]
    const got = descendantIds('a', components, parts)
    expect(got.componentIds).toEqual(['b'])
    expect(got.partIds).toEqual(['p1'])
  })
})

describe('wouldCycle', () => {
  it('rejects reparenting a component into its own descendant', () => {
    const components = [cmp('a', null), cmp('b', 'a')]
    expect(wouldCycle(components, 'a', 'b')).toBe(true)
  })

  it('rejects reparenting a component into itself', () => {
    expect(wouldCycle([cmp('a', null)], 'a', 'a')).toBe(true)
  })

  it('allows an unrelated reparent', () => {
    const components = [cmp('a', null), cmp('b', null)]
    expect(wouldCycle(components, 'b', 'a')).toBe(false)
  })
})

describe('promoteOrphans', () => {
  it('promotes a part whose parentId does not resolve, never dropping it', () => {
    const scene = {
      parts: [board('p', 'ghost')],
      materials: {},
      hardware: [],
      joints: [],
      components: [],
    }
    const out = promoteOrphans(scene)
    expect(out.parts).toHaveLength(1)
    expect(out.parts[0].parentId).toBeNull()
  })

  it('promotes a component whose parent is gone', () => {
    const scene = {
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('b', 'ghost')],
    }
    expect(promoteOrphans(scene).components[0].parentId).toBeNull()
  })

  it('leaves a well-formed tree untouched by identity', () => {
    const scene = {
      parts: [board('p', 'a')],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('a', null)],
    }
    expect(promoteOrphans(scene)).toBe(scene)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/scene/componentTree.test.ts`
Expected: FAIL — `Failed to resolve import "./componentTree"`.

- [ ] **Step 3: Implement**

Create `src/scene/componentTree.ts`:

```ts
import type { Component, ComponentId, Part, Scene } from './types'

const MAX_DEPTH = 64

export function componentsById(components: Component[]): Map<ComponentId, Component> {
  return new Map(components.map((c) => [c.id, c]))
}

// Nearest parent first, root last. Throws rather than looping if the chain is cyclic —
// a cycle is a bug in a reparent guard, and silently truncating would place geometry wrongly.
export function ancestorsOf(
  node: Part | Component,
  byId: Map<ComponentId, Component>,
): Component[] {
  const chain: Component[] = []
  let parentId = node.parentId
  while (parentId !== null) {
    if (chain.length >= MAX_DEPTH) {
      throw new Error(`componentTree: parent chain exceeded max depth ${MAX_DEPTH} — cycle?`)
    }
    const parent = byId.get(parentId)
    if (!parent) break
    chain.push(parent)
    parentId = parent.parentId
  }
  return chain
}

export function descendantIds(
  rootId: ComponentId,
  components: Component[],
  parts: Part[],
): { componentIds: ComponentId[]; partIds: string[] } {
  const componentIds: ComponentId[] = []
  const frontier = [rootId]
  while (frontier.length > 0) {
    const current = frontier.pop()!
    for (const c of components) {
      if (c.parentId === current) {
        componentIds.push(c.id)
        frontier.push(c.id)
      }
    }
  }
  const owned = new Set([rootId, ...componentIds])
  const partIds = parts.filter((p) => p.parentId !== null && owned.has(p.parentId)).map((p) => p.id)
  return { componentIds, partIds }
}

export function wouldCycle(
  components: Component[],
  nodeId: ComponentId,
  newParentId: ComponentId | null,
): boolean {
  if (newParentId === null) return false
  if (newParentId === nodeId) return true
  const byId = componentsById(components)
  let cursor: ComponentId | null = newParentId
  let depth = 0
  while (cursor !== null) {
    if (cursor === nodeId) return true
    if (++depth > MAX_DEPTH) return true
    cursor = byId.get(cursor)?.parentId ?? null
  }
  return false
}

// A dangling parentId costs hierarchy, never parts. Returns the input by identity when
// nothing needed promoting, so callers can skip a state update.
export function promoteOrphans(scene: Scene): Scene {
  const ids = new Set(scene.components.map((c) => c.id))
  const dangling = (parentId: ComponentId | null) => parentId !== null && !ids.has(parentId)

  const needsWork =
    scene.parts.some((p) => dangling(p.parentId)) ||
    scene.components.some((c) => dangling(c.parentId))
  if (!needsWork) return scene

  return {
    ...scene,
    parts: scene.parts.map((p) => (dangling(p.parentId) ? { ...p, parentId: null } : p)),
    components: scene.components.map((c) => (dangling(c.parentId) ? { ...c, parentId: null } : c)),
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm vitest run src/scene/componentTree.test.ts`
Expected: PASS — 11 tests. Full-suite total becomes 54 files / 789 passed / 10 skipped.

- [ ] **Step 5: Commit**

```bash
git add src/scene/componentTree.ts src/scene/componentTree.test.ts
git commit -m "feat(scene): pure component-tree helpers with cycle guard and orphan promotion"
```

## Task 1.3: File format v10 → v11

**Files:**
- Modify: `src/scene/useFile.ts:5` (`FILE_FORMAT_VERSION`), `src/scene/useFile.ts` (`parseFile`, `newFile`)
- Test: `src/scene/useFile.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/useFile.test.ts`:

```ts
describe('v10 → v11 migration', () => {
  it('defaults components, parentId and driven on a v10 file', () => {
    const v10 = JSON.stringify({
      version: 10,
      name: 'Old',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'Board 1',
            length: 200,
            width: 100,
            thickness: 25,
            material: '',
            color: '#c8a97e',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            cuts: [],
            visible: true,
          },
        ],
        materials: {},
        hardware: [],
        joints: [{ kind: 'halflap', id: 'j1', label: 'Half-lap 1', partAId: 'b1', partBId: 'b1', split: 0.5, clearance: 0 }],
      },
    })

    const parsed = parseFile(v10)

    expect(parsed.scene.components).toEqual([])
    expect(parsed.scene.parts[0].parentId).toBeNull()
    expect(parsed.scene.parts[0].driven).toBe(false)
    expect(parsed.scene.joints[0].driven).toBe(false)
  })

  it('preserves an explicit v11 tree', () => {
    const v11 = JSON.stringify({
      version: 11,
      name: 'New',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [
          {
            id: 'cmp_1',
            kind: 'carcase',
            label: 'Base Cabinet',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            visible: true,
          },
        ],
      },
    })

    expect(parseFile(v11).scene.components[0].label).toBe('Base Cabinet')
  })

  it('promotes a part whose parentId names a component that is not in the file', () => {
    const broken = JSON.stringify({
      version: 11,
      name: 'Broken',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'Orphan',
            length: 200,
            width: 100,
            thickness: 25,
            material: '',
            color: '#c8a97e',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            cuts: [],
            visible: true,
            parentId: 'ghost',
            driven: false,
          },
        ],
        materials: {},
        hardware: [],
        joints: [],
        components: [],
      },
    })

    const parsed = parseFile(broken)
    expect(parsed.scene.parts).toHaveLength(1)
    expect(parsed.scene.parts[0].parentId).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/useFile.test.ts -t 'v10'`
Expected: FAIL — `expected undefined to equal []` on `scene.components`.

- [ ] **Step 3: Implement the migration**

In `src/scene/useFile.ts`, change line 5:

```ts
export const FILE_FORMAT_VERSION = 11
```

Add the import at the top of the file:

```ts
import { promoteOrphans } from './componentTree'
```

In `parseFile`, add `parentId`/`driven` to **both** branches of the part mapper — the board branch and the cylinder branch each gain these two lines alongside the existing `visible` and `material` defaults:

```ts
              parentId: p.parentId ?? null,
              driven: p.driven ?? false,
```

In the same `parseFile` return, add `driven` to the joint mapper by extending each of the five spread-defaults objects with `driven: false` **before** the `...j` spread, so an explicit value in the file wins. For example the tongue-groove branch becomes:

```ts
            ? ({ tongueThickness: 6, tongueDepth: 8, clearance: 0, driven: false, ...j } as unknown as Joint)
```

Apply the same `driven: false,` addition to the `finger`, `mortise-tenon`, `halflap` and default (dado) branches.

Add `components` to the returned scene, after `joints`:

```ts
      // v10→v11: component tree. Legacy files have no components and no parentage.
      components: (raw.scene.components ?? []).map((c) => ({
        ...c,
        parentId: c.parentId ?? null,
        visible: c.visible ?? true,
        rotationOrder: 'XYZ' as const,
      })),
```

Finally wrap the whole returned envelope's scene in `promoteOrphans`. Change the `return` statement of `parseFile` so the object literal is built into a local first:

```ts
  const scene: Scene = {
    parts: /* … existing part mapper … */,
    materials: (raw.scene.materials as Record<string, MaterialDef> | undefined) ?? {},
    hardware: raw.scene.hardware ?? [],
    joints: /* … existing joint mapper … */,
    components: /* … as above … */,
  }
  return { ...raw, scene: promoteOrphans(scene) }
```

In `newFile`, both scene literals gain `components: []`:

```ts
      scene: { parts: [], materials: {}, hardware: [], joints: [], components: [] },
```

and

```ts
    lastSavedSceneRef.current = JSON.stringify({
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
      components: [],
    })
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/scene/useFile.test.ts`
Expected: PASS, including the three new tests.

- [ ] **Step 5: Full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/useFile.ts src/scene/useFile.test.ts
git commit -m "feat(file): bump to v11 with component tree and driven-flag migration"
```

## Phase 1 verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — all green.
- [ ] `pnpm dev`, open http://localhost:5173. The app looks and behaves exactly as before: a default board, all seven interaction modes work, undo/redo works.
- [ ] Save a project, reopen it. Inspect the `.zimmu` file in a text editor: `"version": 11`, every part carries `"parentId": null, "driven": false`, and `"components": []` is present.
- [ ] **Regression proof:** open a `.zimmu` file saved *before* this phase. It loads with no console warnings and renders identically.

---

# Phase 2 — World transforms compose through the tree

**Outcome:** every consumer of a part's world placement resolves it through ancestors. Behaviour is still identical, because every part is still top-level.

**The safety property this phase must preserve:** for a part with `parentId: null`, `resolveWorldMatrix` returns exactly what `composeWorldMatrix` returns. Task 2.1's third test pins that.

## Task 2.1: `multiplyMatrix` and `resolveWorldMatrix`

**Files:**
- Modify: `src/geom/transform.ts`
- Test: `src/geom/transform.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/geom/transform.test.ts`:

```ts
import * as THREE from 'three'
import { multiplyMatrix, resolveWorldMatrix } from './transform'
import { componentsById } from '../scene/componentTree'
import type { Component, BoardPart } from '../scene/types'

function comp(id: string, parentId: string | null, pos: [number, number, number], rot: [number, number, number]): Component {
  return {
    id,
    kind: 'group',
    label: id,
    parentId,
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    rotationOrder: 'XYZ',
    visible: true,
  }
}

function part(parentId: string | null, pos: [number, number, number], rot: [number, number, number]): BoardPart {
  return {
    kind: 'board',
    id: 'p',
    label: 'p',
    length: 10,
    width: 10,
    thickness: 10,
    material: '',
    color: '#fff',
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId,
    driven: false,
  }
}

describe('multiplyMatrix', () => {
  it('matches THREE.Matrix4.multiply element-wise', () => {
    const a = new THREE.Matrix4().makeRotationX(0.4).setPosition(1, 2, 3)
    const b = new THREE.Matrix4().makeRotationZ(-0.7).setPosition(-4, 5, 6)
    const expected = a.clone().multiply(b)

    const got = multiplyMatrix(Float64Array.from(a.elements), Float64Array.from(b.elements))

    for (let i = 0; i < 16; i++) {
      expect(got[i]).toBeCloseTo(expected.elements[i], 10)
    }
  })
})

describe('resolveWorldMatrix', () => {
  it('is identical to composeWorldMatrix for a top-level part', () => {
    const p = part(null, [11, -22, 33], [10, 20, 30])
    const got = resolveWorldMatrix(p, componentsById([]))
    const base = composeWorldMatrix(p)
    for (let i = 0; i < 16; i++) expect(got[i]).toBe(base[i])
  })

  it('matches a nested THREE.Object3D chain three deep', () => {
    const a = comp('a', null, [100, 0, 0], [0, 0, 45])
    const b = comp('b', 'a', [0, 50, 0], [30, 0, 0])
    const p = part('b', [5, 6, 7], [0, 15, 0])

    const oa = new THREE.Object3D()
    oa.position.set(100, 0, 0)
    oa.rotation.set(0, 0, (45 * Math.PI) / 180, 'XYZ')
    const ob = new THREE.Object3D()
    ob.position.set(0, 50, 0)
    ob.rotation.set((30 * Math.PI) / 180, 0, 0, 'XYZ')
    const op = new THREE.Object3D()
    op.position.set(5, 6, 7)
    op.rotation.set(0, (15 * Math.PI) / 180, 0, 'XYZ')
    oa.add(ob)
    ob.add(op)
    oa.updateMatrixWorld(true)

    const got = resolveWorldMatrix(p, componentsById([a, b]))
    for (let i = 0; i < 16; i++) {
      expect(got[i]).toBeCloseTo(op.matrixWorld.elements[i], 9)
    }
  })

  it('resolves a component itself, not only a part', () => {
    const a = comp('a', null, [10, 0, 0], [0, 0, 0])
    const b = comp('b', 'a', [0, 20, 0], [0, 0, 0])
    const got = resolveWorldMatrix(b, componentsById([a, b]))
    expect(got[12]).toBeCloseTo(10, 10)
    expect(got[13]).toBeCloseTo(20, 10)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/geom/transform.test.ts`
Expected: FAIL — `multiplyMatrix is not a function`.

- [ ] **Step 3: Implement**

Append to `src/geom/transform.ts`:

```ts
import type { Component, ComponentId } from '../scene/types'
import { ancestorsOf } from '../scene/componentTree'

// Column-major, same layout and convention as composeWorldMatrix. Equivalent to
// THREE Matrix4.multiply (a * b).
export function multiplyMatrix(a: Float64Array, b: Float64Array): Float64Array {
  const m = new Float64Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      m[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3]
    }
  }
  return m
}

// A node's placement in world space, composing every ancestor component's local matrix.
// For parentId === null this returns exactly composeWorldMatrix(node) — the identity that lets
// the component tree land without changing any existing behaviour.
export function resolveWorldMatrix(
  node: Part | Component,
  byId: Map<ComponentId, Component>,
): Float64Array {
  let m = composeWorldMatrix(node)
  for (const ancestor of ancestorsOf(node, byId)) {
    m = multiplyMatrix(composeWorldMatrix(ancestor), m)
  }
  return m
}
```

Widen `composeWorldMatrix`'s parameter so it accepts a `Component` too — it only reads `position` and `rotation`, both of which `Component` has. Change its signature line:

```ts
export function composeWorldMatrix(part: Part | Component): Float64Array {
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/geom/transform.test.ts`
Expected: PASS. The "identical for a top-level part" test uses `toBe`, not `toBeCloseTo` — exact equality is the point.

- [ ] **Step 5: Commit**

```bash
git add src/geom/transform.ts src/geom/transform.test.ts
git commit -m "feat(geom): resolveWorldMatrix composes placement through ancestor components"
```

## Task 2.2: Fix the `worldAabb` memo before any consumer moves

**Files:**
- Modify: `src/geom/halflap.ts:19-45`
- Test: `src/geom/halflap.test.ts`

**Why this task comes before the consumer swap:** the existing `WeakMap` is keyed on part object identity only. Moving a *component* does not create new part objects, so a cached AABB would survive a move it should not. Fixing the cache after the consumers switch would mean shipping a known-stale-geometry window.

- [ ] **Step 1: Write the failing test**

Append to `src/geom/halflap.test.ts`:

```ts
describe('worldAabb caching under a moving ancestor', () => {
  it('recomputes when an ancestor component moves, even though the part object is identical', () => {
    const parent: Component = {
      id: 'cmp_1',
      kind: 'group',
      label: 'Cab',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
    }
    const b: BoardPart = { ...makeBoard(), parentId: 'cmp_1' }

    const before = worldAabb(b, componentsById([parent]))
    const moved = { ...parent, position: { x: 500, y: 0, z: 0 } }
    const after = worldAabb(b, componentsById([moved]))

    expect(before.min.x).toBeCloseTo(0, 6)
    expect(after.min.x).toBeCloseTo(500, 6)
  })

  it('still returns the same object for a repeat call with an unchanged tree', () => {
    const b = makeBoard()
    const byId = componentsById([])
    expect(worldAabb(b, byId)).toBe(worldAabb(b, byId))
  })
})
```

Use the file's existing board factory for `makeBoard()`; if it has none, add one mirroring the fixtures already in that test file, with `parentId: null, driven: false`.

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/geom/halflap.test.ts -t 'worldAabb caching'`
Expected: FAIL — `worldAabb` takes one argument, and the second test's stale entry returns `min.x === 0` for the moved case.

- [ ] **Step 3: Implement**

Replace the cache block in `src/geom/halflap.ts`:

```ts
// Keyed by board identity, but validated against the resolved world matrix: an ancestor component
// can move without producing a new part object, so identity alone would serve a stale box.
const aabbCache = new WeakMap<BoardPart, { matrix: Float64Array; box: { min: Vec3; max: Vec3 } }>()

function sameMatrix(a: Float64Array, b: Float64Array): boolean {
  for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false
  return true
}

export function worldAabb(
  b: BoardPart,
  byId: Map<ComponentId, Component>,
): { min: Vec3; max: Vec3 } {
  const m = resolveWorldMatrix(b, byId)
  const cached = aabbCache.get(b)
  if (cached && sameMatrix(cached.matrix, m)) return cached.box

  const d = boardDims(b)
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity }
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const cx of [0, d.x]) {
    for (const cy of [0, d.y]) {
      for (const cz of [0, d.z]) {
        const [wx, wy, wz] = applyMatrixToPoint(m, cx, cy, cz)
        if (wx < min.x) min.x = wx
        if (wx > max.x) max.x = wx
        if (wy < min.y) min.y = wy
        if (wy > max.y) max.y = wy
        if (wz < min.z) min.z = wz
        if (wz > max.z) max.z = wz
      }
    }
  }
  const box = { min, max }
  aabbCache.set(b, { matrix: m, box })
  return box
}
```

Update the two in-file callers at `src/geom/halflap.ts:72-73` and `:126-127` to thread `byId` through, widening their enclosing function signatures to take it.

- [ ] **Step 4: Run to confirm pass, then the file's whole suite**

Run: `pnpm vitest run src/geom/halflap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geom/halflap.ts src/geom/halflap.test.ts
git commit -m "fix(geom): validate the worldAabb memo against the resolved matrix"
```

## Task 2.3a: Swap the joint-geometry modules

**Files:**
- Modify: `src/geom/dado.ts` (3 calls), `src/geom/mortisetenon.ts` (4), `src/geom/tonguegroove.ts` (3), `src/geom/fingerjoint.ts` (3), `src/geom/halflap.ts` (3 remaining: `stackAxis`, `isAxisAligned`, `worldBoxToLocalCut`)

**Plan correction (2026-08-20).** The original Task 2.3 listed six consumer files. The true count is
eleven: the five joint-geometry modules above were missed entirely — 16 call sites. They are split
out here because they share one entry point (`deriveJoint` → `reconcileJoints`), which already holds
the whole `Scene`, so the threading terminates immediately.

**Why these genuinely need it, despite appearing not to.** Each of these derives cut geometry by
mapping between two parts' local frames through their world matrices. When both parts share the same
ancestors — every joint inside one carcase — the ancestor transforms cancel and `composeWorldMatrix`
gives the right answer *by accident*. It stops being right the moment the two parts have different
ancestry: a joint between two cabinets, or between a detached top-level part and a still-nested mate.
Phase 3 lets a user nest anything, so this cannot be deferred past Phase 2.

**A trap specific to `halflap.ts`.** Task 2.2 converted `worldAabb` to `resolveWorldMatrix` but left
its three siblings on `composeWorldMatrix`. The file is therefore internally inconsistent right now:
a nested board gets an ancestor-aware AABB and a top-level-only stack axis. Fixing all three is the
point of this task — do not leave one behind.

- [ ] **Step 1: Confirm the call sites before editing**

Run: `grep -n 'composeWorldMatrix(' src/geom/dado.ts src/geom/mortisetenon.ts src/geom/tonguegroove.ts src/geom/fingerjoint.ts src/geom/halflap.ts`
Expected: 16 hits. If the count differs, stop and reconcile before editing.

- [ ] **Step 2: Thread `byId` through each module**

In each file, replace `composeWorldMatrix(x)` with `resolveWorldMatrix(x, byId)` and add
`byId: Map<ComponentId, Component>` to the enclosing exported function. The `deriveX` functions all
take `(joint, parts)` — add `byId` as a third parameter.

`deriveJoint` in `src/geom/dado.ts` dispatches to all five, so it gains `byId` and forwards it.
`reconcileJoints(scene)` in `src/scene/reconcileJoints.ts` is the single caller and already holds the
scene: it builds `componentsById(scene.components)` once, outside its joint loop, and passes it down.

- [ ] **Step 3: Verify no behaviour changed**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS with **no edited expectations**. Call-site updates in test files are expected and fine;
a changed expected VALUE is a real finding — stop and report it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(geom): resolve joint geometry through the component tree"
```

## Task 2.3b: Swap the scene and export consumers

**Files:**
- Modify: `src/geom/stl.ts` (1), `src/scene/suggestJoints.ts` (2), `src/scene/cutFootprint.ts` (1), `src/scene/obbOverlap.ts` (1), `src/scene/fitCamera.ts` (1), `src/scene/useScene.ts` (2, the STEP export path)

- [ ] **Step 1: Confirm the call sites**

Run: `grep -rn 'composeWorldMatrix' src/ --include=*.ts --include=*.tsx | grep -v '\.test\.' | grep -v 'transform.ts'`
Expected: only the six files above. Anything else means Task 2.3a left work behind.

- [ ] **Step 2: Thread `byId` through each consumer**

Same mechanical change. For `src/scene/useScene.ts` (the STEP export callback), build the index once
at the top of the callback:

```ts
    const byId = componentsById(sceneRef.current.components)
```

and use it in both `matrix: Array.from(resolveWorldMatrix(p, byId))` lines.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS, no edited expectations.

Then confirm the swap is total:

Run: `grep -rn 'composeWorldMatrix' src/ --include=*.ts --include=*.tsx | grep -v '\.test\.' | grep -v 'transform.ts'`
Expected: **no output.** `composeWorldMatrix` is now an implementation detail of `transform.ts`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(scene): resolve world placement through the component tree everywhere"
```

## Task 2.4: Viewport places meshes by resolved matrix

**Files:**
- Modify: `src/render/viewport.tsx:499-540`

**Why this is not covered by 2.3:** the viewport does not use `composeWorldMatrix` at all — it sets `mesh.position` and `mesh.rotation` from the part directly (lines 511-512 and 531-532). It needs a different edit.

- [ ] **Step 1: Add the index**

At the top of the effect that walks `parts` (immediately before the `for (const part of parts)` loop), add:

```ts
    const byId = componentsById(components)
```

`components` is a new prop on `Viewport`; add it to the props interface as `components: Component[]` and pass `scene.components` from `App.tsx`.

- [ ] **Step 2: Replace both placement blocks**

For the **create** branch, replace:

```ts
        mesh.position.set(part.position.x, part.position.y, part.position.z)
        mesh.rotation.set(rx, ry, rz, part.rotationOrder)
```

with:

```ts
        mesh.matrixAutoUpdate = false
        mesh.matrix.fromArray(resolveWorldMatrix(part, byId))
```

and the edge-line copy below it:

```ts
        el.matrixAutoUpdate = false
        el.matrix.copy(mesh.matrix)
```

For the **update** branch, replace:

```ts
        existing.position.set(part.position.x, part.position.y, part.position.z)
        existing.rotation.set(rx, ry, rz, part.rotationOrder)
        const el = edgeLines.current.get(part.id)!
        el.position.copy(existing.position)
        el.rotation.copy(existing.rotation)
```

with:

```ts
        existing.matrix.fromArray(resolveWorldMatrix(part, byId))
        const el = edgeLines.current.get(part.id)!
        el.matrix.copy(existing.matrix)
```

Delete the now-unused `rx`/`ry`/`rz` locals above the loop (`noUnusedLocals` will flag them if you forget).

- [ ] **Step 3: Confirm the raycaster still works**

`matrixWorld` is what the raycaster reads (`viewport.tsx:133,140,143,152,171,185,188`), and Three.js keeps `matrixWorld` in sync from `matrix` for an object with no parent, so `matrixAutoUpdate = false` does not break face hits. Verify rather than trust:

Run: `pnpm dev`, click a board face with `C` (cut mode) active.
Expected: a cut is placed on the clicked face, in the right place.

- [ ] **Step 4: Full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/render/viewport.tsx src/App.tsx
git commit -m "refactor(viewport): place meshes by resolved world matrix"
```

## Task 2.5a: Consolidate the four hand-inlined `localDirToWorld` copies

**Added 2026-08-20.** Task 2.3b's success grep — no `composeWorldMatrix` callers outside
`transform.ts` — passes, but it proves less than it appears to. A sweep for the *computation* rather
than the symbol finds seven sites that compose a world pose by hand and therefore ignore ancestors.
Five are mechanical; they are this task. The two snap transforms need an inverse and are Task 2.5b.

Four of the five sit in the very files Task 2.3a "finished": it replaced every `composeWorldMatrix(`
call and left a private function computing the rotation half of the same thing three lines above.

**Files:**
- Modify: `src/geom/transform.ts` (add the shared helper), `src/geom/dado.ts`, `src/geom/mortisetenon.ts`, `src/geom/tonguegroove.ts`, `src/geom/fingerjoint.ts`, `src/scene/snapMath.ts` (`computeFaceCorners` only)

- [ ] **Step 1: Confirm the four copies are identical**

Run: `for f in dado mortisetenon tonguegroove fingerjoint; do sed -n '/function localDirToWorld/,/^}/p' src/geom/$f.ts | md5sum; done`
Expected: four identical hashes. If they differ, diff them before consolidating — a divergence is a finding.

- [ ] **Step 2: Write the failing test**

Append to `src/geom/transform.test.ts`. A direction transformed under a rotated ancestor must pick up
that ancestor's rotation:

```ts
describe('localDirToWorld', () => {
  it('applies an ancestor component rotation to the direction', () => {
    const cab = comp('a', null, [0, 0, 0], [0, 0, 90])
    const p = part('a', [0, 0, 0], [0, 0, 0])
    // local +X under a 90 degree yaw becomes world +Y
    const got = localDirToWorld(p, { x: 1, y: 0, z: 0 }, componentsById([cab]))
    expect(got.x).toBeCloseTo(0, 9)
    expect(got.y).toBeCloseTo(1, 9)
  })

  it('is unchanged for a top-level part', () => {
    const p = part(null, [0, 0, 0], [0, 0, 90])
    const got = localDirToWorld(p, { x: 1, y: 0, z: 0 }, componentsById([]))
    expect(got.x).toBeCloseTo(0, 9)
    expect(got.y).toBeCloseTo(1, 9)
  })
})
```

Reuse the `comp`/`part` helpers already in that file.

- [ ] **Step 3: Run and confirm failure**

Run: `pnpm vitest run src/geom/transform.test.ts`
Expected: FAIL — `localDirToWorld is not a function`.

- [ ] **Step 4: Implement the shared helper**

Add to `src/geom/transform.ts`. Derive the rotation from the resolved matrix rather than re-composing
Euler angles, so there is exactly one place that knows the rotation convention:

```ts
// A direction expressed in a part's local frame, rotated into world space. Reads the rotation
// block of the resolved matrix, so it picks up ancestor rotation without re-deriving Euler order.
export function localDirToWorld(
  node: Part | Component,
  dir: Vec3,
  byId: Map<ComponentId, Component>,
): THREE.Vector3 {
  const m = resolveWorldMatrix(node, byId)
  return new THREE.Vector3(
    m[0] * dir.x + m[4] * dir.y + m[8] * dir.z,
    m[1] * dir.x + m[5] * dir.y + m[9] * dir.z,
    m[2] * dir.x + m[6] * dir.y + m[10] * dir.z,
  )
}
```

Note this applies the rotation block only — no translation — which is what a direction requires.

Delete the four private copies and import the shared one. Thread `byId` to each call site; the
enclosing functions already have it from Task 2.3a.

- [ ] **Step 5: `computeFaceCorners` takes `byId`**

`src/scene/snapMath.ts:101` builds `new THREE.Matrix4().compose(position, quaternionFromEuler(rotation))`
— `composeWorldMatrix` inlined by hand. Replace with `resolveWorldMatrix(part, byId)` and add `byId`
to the signature. Follow the compiler to its callers (`viewport.tsx` highlight loops,
`suggestionOutline.ts`); both already hold a component map.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Baseline **809 passed, 10 skipped**; expect 811 (your 2 new tests). No existing expectation may change.

Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e`
Expected: 8 passed. `suggestion-highlight.spec.ts` exercises `computeFaceCorners` through the
highlight outline, so it is the spec that would catch a regression here.

- [ ] **Step 7: Commit** (explicit paths, never `git add -A`)

```bash
git add src/geom/transform.ts src/geom/transform.test.ts src/geom/dado.ts src/geom/mortisetenon.ts src/geom/tonguegroove.ts src/geom/fingerjoint.ts src/scene/snapMath.ts
git commit -m "refactor(geom): one localDirToWorld that resolves through the component tree"
```

## Task 2.5b: Snap transforms round-trip through the parent frame

**The deeper half of the same finding.** `computeSnapTransform` and `computeDowelSnapTransform` read
`sourcePart.rotation` — a **parent-local** value — under a comment calling it "current world
rotation", compute a world-space placement from world-space `FaceHit`s, and return it to be written
straight back into `part.position`/`part.rotation`, which are parent-local.

Every one of those steps is correct today because a top-level part's local frame *is* the world frame.
Under nesting, snapping a board inside a cabinet would write world coordinates into a local field and
the board would jump by the cabinet's transform.

**Files:**
- Modify: `src/scene/snapMath.ts`, `src/scene/useSnap.ts` (call sites)
- Test: `src/scene/snapMath.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('computeSnapTransform under a transformed ancestor', () => {
  it('returns a parent-local placement, not a world one', () => {
    // Cabinet translated 500mm in x. A snap that puts the board at world x=500
    // must return local x=0, because the parent already supplies the 500.
    const cab = comp('cmp_1', null, [500, 0, 0], [0, 0, 0])
    const byId = componentsById([cab])
    const nested = { ...boardFixture, parentId: 'cmp_1' }

    const flat = computeSnapTransform(sourceFace, targetFace, boardFixture, componentsById([]))
    const under = computeSnapTransform(sourceFace, targetFace, nested, byId)

    expect(under.position.x).toBeCloseTo(flat.position.x - 500, 6)
  })

  it('is identical to today for a top-level part', () => {
    const got = computeSnapTransform(sourceFace, targetFace, boardFixture, componentsById([]))
    expect(got).toEqual(computeSnapTransformLegacyExpectation)
  })
})
```

Build the fixtures from the file's existing ones. The second test is the Phase 2 contract restated:
for a top-level part the function must return exactly what it returns today.

- [ ] **Step 2: Run and confirm failure**

Expected: arity error, then a failing `flat.position.x - 500` assertion once the parameter exists.

- [ ] **Step 3: Implement the round-trip**

Read through the tree, then convert the world result back into the parent's frame before returning:

```ts
  const parentWorld = ancestorWorldMatrix(sourcePart, byId) // identity when parentId === null
  const localMatrix = new THREE.Matrix4()
    .copy(new THREE.Matrix4().fromArray(Array.from(parentWorld)))
    .invert()
    .multiply(worldResult)
```

then `decompose` into position and quaternion, and `Euler.setFromQuaternion(q, 'XYZ')` for the
returned degrees. Add `ancestorWorldMatrix(node, byId)` to `transform.ts` — the product of the
ancestors *excluding* the node's own local matrix — since both this task and any future local↔world
conversion need it, and `resolveWorldMatrix` can then be expressed in terms of it.

Apply the identical treatment to `computeDowelSnapTransform`.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test` — no edited expectations.
Run the e2e suite; snapping is exercised by the smoke specs.

- [ ] **Step 5: Commit**

```bash
git add src/scene/snapMath.ts src/scene/snapMath.test.ts src/scene/useSnap.ts
git commit -m "fix(scene): snap transforms return a parent-local placement"
```

## Phase 2 verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green, **with the same test count and no edited expectations** versus Phase 1.
- [ ] `pnpm test:e2e` (set `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` in a web session) — all 6 existing specs pass.
- [ ] `pnpm dev`: create three boards, rotate one 45° about Z, snap-align two, add a dado. Everything behaves as before the phase.
- [ ] Export STL and STEP; both contain correctly-placed geometry.

---

# Phase 3 — The tree in the sidebar

**Outcome:** you can see, select, and toggle the visibility of components. No generator yet — a component is an empty container you cannot create from the UI. `sidebar.tsx` shrinks.

## Task 3.1: Extract `EditPanel` into its own file

**Files:**
- Create: `src/ui/EditPanel.tsx`
- Modify: `src/ui/sidebar.tsx:494-813` (remove), `src/ui/sidebar.tsx` (import)

**This task changes no behaviour.** Keep it a pure move so the diff is reviewable; resist tidying anything on the way past.

- [ ] **Step 1: Move the code**

Cut `function EditPanel({...}) { … }` (currently `sidebar.tsx:494-813`) into a new `src/ui/EditPanel.tsx`, changing only the declaration to `export function EditPanel(`. Move with it any helper used *only* by `EditPanel` — check `DimInput` (`:88-139`), `NumInput` (`:141-181`), `CutRow` (`:191-365`), `MitreRow` (`:367-455`) and `ColorControl` (`:457-492`) with:

Run: `grep -n 'DimInput\|NumInput\|CutRow\|MitreRow\|ColorControl\|SectionHeader' src/ui/sidebar.tsx`

Anything referenced **only** inside the `EditPanel` body moves; anything also referenced by `Sidebar` stays in `sidebar.tsx` and gets exported for `EditPanel.tsx` to import.

- [ ] **Step 2: Import it back**

At the top of `src/ui/sidebar.tsx`:

```ts
import { EditPanel } from './EditPanel'
```

- [ ] **Step 3: Verify nothing changed**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass, **including `src/ui/sidebar.test.tsx` unedited**. If that file needs changes, the move was not pure — revert and redo.

- [ ] **Step 4: Confirm the size win**

Run: `wc -l src/ui/sidebar.tsx src/ui/EditPanel.tsx`
Expected: `sidebar.tsx` well under 800; the two together roughly the original 1118.

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidebar.tsx src/ui/EditPanel.tsx
git commit -m "refactor(ui): extract EditPanel from sidebar with no behaviour change"
```

## Task 3.2: Selection becomes part-or-component

**Files:**
- Modify: `src/scene/useScene.ts` (state, `onSelect`, `UseSceneResult`)
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/useScene.test.ts`:

```ts
describe('selection of parts and components', () => {
  it('selects a component and reports its kind', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onSelect({ kind: 'component', id: 'cmp_1' }))
    expect(result.current.selection).toEqual({ kind: 'component', id: 'cmp_1' })
  })

  it('exposes selectedId for a part selection and null for a component selection', () => {
    const { result } = renderHook(() => useScene())
    const partId = result.current.scene.parts[0].id
    act(() => result.current.onSelect({ kind: 'part', id: partId }))
    expect(result.current.selectedId).toBe(partId)
    act(() => result.current.onSelect({ kind: 'component', id: 'cmp_1' }))
    expect(result.current.selectedId).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/useScene.test.ts -t 'selection of parts'`
Expected: FAIL — `result.current.selection` is undefined.

- [ ] **Step 3: Implement**

In `src/scene/types.ts`:

```ts
export type Selection = { kind: 'part'; id: PartId } | { kind: 'component'; id: ComponentId }
```

In `src/scene/useScene.ts`, replace the `selectedId` state:

```ts
  const [selection, setSelection] = useState<Selection | null>(null)
```

Derive the old field so the many existing consumers keep working — this is what keeps the change small:

```ts
  const selectedId = selection?.kind === 'part' ? selection.id : null
```

Change `onSelect`'s signature to `(next: Selection | null) => void` and have it call `setSelection`. Add both `selection` and `onSelect`'s new type to `UseSceneResult`; keep `selectedId: PartId | null` in the result.

- [ ] **Step 4: Fix call sites**

Run: `pnpm typecheck`
Expected: FAIL at every `onSelect(id)` call. Replace each with `onSelect(id === null ? null : { kind: 'part', id })`. The sites are `src/App.tsx`, `src/ui/sidebar.tsx`, and `src/render/viewport.tsx`'s click handler.

- [ ] **Step 5: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

```bash
git add src/scene/types.ts src/scene/useScene.ts src/scene/useScene.test.ts src/App.tsx src/ui/sidebar.tsx src/render/viewport.tsx
git commit -m "feat(scene): selection addresses a part or a component"
```

## Task 3.3: Component CRUD in `useScene`

**Files:**
- Modify: `src/scene/useScene.ts`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('component CRUD', () => {
  it('adds a group component at top level', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    expect(result.current.scene.components).toHaveLength(1)
    expect(result.current.scene.components[0].parentId).toBeNull()
  })

  it('deletes driven descendants but promotes detached ones', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const cmpId = result.current.scene.components[0].id
    act(() =>
      result.current.replaceScene({
        ...result.current.scene,
        parts: [
          { ...result.current.scene.parts[0], id: 'driven1', parentId: cmpId, driven: true },
          { ...result.current.scene.parts[0], id: 'mine1', parentId: cmpId, driven: false },
        ],
      }),
    )
    act(() => result.current.onRemoveComponent(cmpId))

    const ids = result.current.scene.parts.map((p) => p.id)
    expect(ids).not.toContain('driven1')
    expect(ids).toContain('mine1')
    expect(result.current.scene.parts.find((p) => p.id === 'mine1')?.parentId).toBeNull()
  })

  it('refuses a reparent that would create a cycle', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const a = result.current.scene.components[0].id
    act(() => result.current.onAddComponent(a))
    const b = result.current.scene.components[1].id

    act(() => result.current.onReparentComponent(a, b))

    expect(result.current.scene.components.find((c) => c.id === a)?.parentId).toBeNull()
  })

  it('undoes a component deletion', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const id = result.current.scene.components[0].id
    act(() => result.current.onRemoveComponent(id))
    expect(result.current.scene.components).toHaveLength(0)
    act(() => result.current.undo())
    expect(result.current.scene.components.map((c) => c.id)).toEqual([id])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/useScene.test.ts -t 'component CRUD'`
Expected: FAIL — `onAddComponent is not a function`.

- [ ] **Step 3: Implement**

**Corrected 2026-08-20.** The first draft of this snippet took a `kind: Component['kind']` parameter
and built a single object literal. That **does not typecheck**: `Component` became a discriminated
union during Phase 1, and `CarcaseComponent` requires `params: CarcaseParams` — 17 fields with no
defaults, since `CARCASE_PRESETS` does not exist until Phase 4. A `kind` parameter could therefore
only ever be passed `'group'`, leaving a permanently unreachable branch, which the repo's own rule
forbids ("no error handling for cases that cannot occur").

Carcase creation has its own entry point by design — `onAddCarcase(preset)` in Task 4.6 — so this
function creates groups only and takes no `kind`.

Add to `src/scene/useScene.ts`, following the existing `onAdd`/`onRemove` closure-history pattern:

```ts
  const onAddComponent = useCallback(
    (parentId: ComponentId | null) => {
      const component: GroupComponent = {
        kind: 'group',
        id: `cmp_${crypto.randomUUID()}`,
        label: nextComponentLabel,
        parentId,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
      }
      setScene((prev) => ({ ...prev, components: [...prev.components, component] }))
      push({
        label: 'Add component',
        undo: () =>
          setScene((prev) => ({
            ...prev,
            components: prev.components.filter((c) => c.id !== component.id),
          })),
        redo: () => setScene((prev) => ({ ...prev, components: [...prev.components, component] })),
      })
    },
    [push],
  )

  const onRemoveComponent = useCallback(
    (id: ComponentId) => {
      const before = sceneRef.current
      const { componentIds, partIds } = descendantIds(id, before.components, before.parts)
      const doomedComponents = new Set([id, ...componentIds])
      const doomedParts = new Set(
        before.parts.filter((p) => partIds.includes(p.id) && p.driven).map((p) => p.id),
      )

      const after: Scene = {
        ...before,
        components: before.components.filter((c) => !doomedComponents.has(c.id)),
        // A detached part is the user's: it survives its container and returns to top level.
        parts: before.parts
          .filter((p) => !doomedParts.has(p.id))
          .map((p) =>
            p.parentId !== null && doomedComponents.has(p.parentId) ? { ...p, parentId: null } : p,
          ),
        joints: before.joints.filter(
          (j) => j.sourceComponentId === undefined || !doomedComponents.has(j.sourceComponentId),
        ),
      }

      setScene(after)
      push({ label: 'Delete component', undo: () => setScene(before), redo: () => setScene(after) })
    },
    [push],
  )

  const onReparentComponent = useCallback(
    (id: ComponentId, newParentId: ComponentId | null) => {
      const before = sceneRef.current
      if (wouldCycle(before.components, id, newParentId)) return
      const after: Scene = {
        ...before,
        components: before.components.map((c) => (c.id === id ? { ...c, parentId: newParentId } : c)),
      }
      setScene(after)
      push({ label: 'Move component', undo: () => setScene(before), redo: () => setScene(after) })
    },
    [push],
  )

  const onUpdateComponent = useCallback(
    (id: ComponentId, updater: (c: Component) => Component) => {
      const before = sceneRef.current
      const after: Scene = {
        ...before,
        components: before.components.map((c) => (c.id === id ? updater(c) : c)),
      }
      setScene(after)
      push({
        label: 'Edit component',
        coalesceKey: `component-${id}`,
        undo: () => setScene(before),
        redo: () => setScene(after),
      })
    },
    [push],
  )
```

Import `descendantIds` and `wouldCycle` from `./componentTree`, and add all four functions to `UseSceneResult` and the returned object.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/scene/useScene.test.ts -t 'component CRUD'`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat(scene): component add, remove, reparent and update with undo"
```

## Task 3.4: `SceneTree` and the `activeMode` cleanup

### Four items carried into this task

Earlier Phase 3 tasks each left something that only becomes reachable once the tree exists. They are
requirements of this task, not optional tidy-ups:

1. **Deleting a selected component must clear the selection.** `onRemove` already clears a *part*
   selection; `onRemoveComponent` deliberately does not, because until now no UI could select a
   component. The tree makes it reachable, and a `selection` pointing at a deleted component is a
   dangling reference the panel will try to render. Add the clear to `onRemoveComponent`, guarded on
   `kind === 'component'` so deleting a cabinet does not deselect a part, and test both directions.

2. **`onSelectPart` in `App.tsx` should disappear.** Task 3.2 introduced it as a deliberate stopgap:
   `Sidebar` and `Viewport` speak `PartId`, so `App` adapts. Once `SceneTree` selects components,
   `Sidebar` must speak `Selection` directly. Note this cascades — `sidebar.test.tsx` has
   `expect(onSelect).toHaveBeenCalledWith('board_t1')`, which becomes an object literal. **That is a
   legitimate expected-value change**: Phase 3 changes behaviour, unlike Phases 1–2. The
   no-edited-expectations rule does not apply here. Leave `Viewport` on `PartId` — clicking a mesh
   selects a part, and there is no component to click in the 3D scene.

3. **Components need numbered labels.** Every group is currently `'Group'`; two of them in a tree are
   indistinguishable. Boards use a `labelCounter` derived from existing labels (`/Board (\d+)/`) —
   mirror it for components rather than inventing a second scheme.

4. **`SidebarProps` is 49 props**, including six near-identical `xActive` / `onXToggle` / `xStatus`
   triples, one per joint tool. The seven-boolean collapse below is the minimum; replacing the block
   with a single `tools` array is the same change done once instead of six times, and Phase 5 adds
   another entry. Do this only if it stays mechanical.

Separately: `EditPanel`'s inline prop type re-declares **19 fields** that `SidebarProps` also
declares, with identical signatures. Exporting an `EditPanelProps` and having `SidebarProps`
`Pick<>` from it removes a drift-prone duplication — again, only if mechanical.

**Scope note added 2026-08-20**, from Task 3.1's report. `SidebarProps` currently carries **49 props**,
including six near-identical `xActive` / `onXToggle` / `xStatus` triples — one per joint tool. The
seven-boolean collapse below is the minimum; if the triples are still shaped that way when you get
here, replacing the block with a single `tools` array is the same change done once instead of six
times, and Phase 5 adds another entry to it.

Separately: `EditPanel`'s inline prop type re-declares **19 fields** that `SidebarProps` also declares,
with identical signatures. Now that `EditPanel` is its own module, exporting an `EditPanelProps` and
having `SidebarProps` `Pick<>` from it removes a drift-prone duplication. Do this only if it stays
mechanical — it is a tidy-up, not the task.


**Files:**
- Create: `src/ui/SceneTree.tsx`, `src/ui/SceneTree.test.tsx`
- Modify: `src/ui/sidebar.tsx`, `src/App.tsx:373-415`

- [ ] **Step 1: Write the failing test**

Create `src/ui/SceneTree.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneTree } from './SceneTree'
import type { Component, BoardPart } from '../scene/types'

const cabinet: Component = {
  id: 'cmp_1',
  kind: 'carcase',
  label: 'Base Cabinet 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
}

function board(id: string, label: string, parentId: string | null, driven: boolean): BoardPart {
  return {
    kind: 'board',
    id,
    label,
    length: 600,
    width: 560,
    thickness: 18,
    material: '',
    color: '#c8a97e',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId,
    driven,
  }
}

const props = {
  components: [cabinet],
  parts: [board('p1', 'Left Side', 'cmp_1', true), board('p2', 'Loose', null, false)],
  selection: null,
  onSelect: vi.fn(),
  onToggleVisible: vi.fn(),
}

describe('SceneTree', () => {
  it('nests a part under its component and keeps top-level parts at the root', () => {
    render(<SceneTree {...props} />)
    const cab = screen.getByTestId('node-cmp_1')
    expect(cab).toContainElement(screen.getByTestId('node-p1'))
    expect(cab).not.toContainElement(screen.getByTestId('node-p2'))
  })

  it('marks a driven part and does not mark a detached one', () => {
    render(<SceneTree {...props} />)
    expect(screen.getByTestId('node-p1')).toHaveAttribute('data-driven', 'true')
    expect(screen.getByTestId('node-p2')).toHaveAttribute('data-driven', 'false')
  })

  it('reports a component selection by kind', async () => {
    const onSelect = vi.fn()
    render(<SceneTree {...props} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Base Cabinet 600'))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'component', id: 'cmp_1' })
  })

  it('collapses a component so its children are no longer rendered', async () => {
    render(<SceneTree {...props} />)
    await userEvent.click(screen.getByLabelText('Collapse Base Cabinet 600'))
    expect(screen.queryByTestId('node-p1')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/ui/SceneTree.test.tsx`
Expected: FAIL — cannot resolve `./SceneTree`.

- [ ] **Step 3: Implement**

Create `src/ui/SceneTree.tsx`. Render recursively from `parentId`, one `<ul>` per level, `data-testid={`node-${id}`}` on every row, `data-driven` on part rows, a chevron button labelled `Collapse ${label}` / `Expand ${label}`, and an eye button calling `onToggleVisible`. Compose classes with `cn()` from `@/lib/utils` and match the existing sidebar row styling — copy the class strings from the part-row markup in `sidebar.tsx` rather than inventing new ones.

Props:

```tsx
export function SceneTree({
  components,
  parts,
  selection,
  onSelect,
  onToggleVisible,
}: {
  components: Component[]
  parts: Part[]
  selection: Selection | null
  onSelect: (s: Selection | null) => void
  onToggleVisible: (s: Selection) => void
}) 
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/ui/SceneTree.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Mount it and delete the seven booleans**

In `src/ui/sidebar.tsx`, replace the flat parts list with `<SceneTree … />`.

In `src/App.tsx:373-415`, delete these seven props from the `<Sidebar>` call:

```tsx
          snapActive={mode.activeMode === 'snap'}
          cutActive={mode.activeMode === 'cut'}
          jointActive={mode.activeMode === 'dado'}
          halfLapActive={mode.activeMode === 'halflap'}
          mortiseTenonActive={mode.activeMode === 'mortiseTenon'}
          fingerJointActive={mode.activeMode === 'finger'}
          tongueGrooveActive={mode.activeMode === 'tongueGroove'}
```

Replace with:

```tsx
          activeMode={mode.activeMode}
```

In `sidebar.tsx`, replace the seven boolean props with `activeMode: InteractionMode` (import the type from `../scene/useInteractionMode`) and change each use from e.g. `snapActive` to `activeMode === 'snap'`.

- [ ] **Step 6: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass. `src/ui/sidebar.test.tsx` will need its props factory updated — that is expected here, unlike in Task 3.1.

```bash
git add src/ui/SceneTree.tsx src/ui/SceneTree.test.tsx src/ui/sidebar.tsx src/ui/sidebar.test.tsx src/App.tsx
git commit -m "feat(ui): scene tree sidebar; collapse seven mode booleans into activeMode"
```

## Phase 3 verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green.
- [ ] `wc -l src/ui/sidebar.tsx` — under 400 lines.
- [ ] `grep -c 'Active=' src/App.tsx` — returns 0.
- [ ] `pnpm dev`: the sidebar shows boards as before (all top-level). Selecting, hiding, duplicating and deleting a board all still work, as do all seven interaction modes.

---

# Phase 4 — The carcase generator

**Outcome:** a pure function turns `CarcaseParams` into an ordered list of parts, joints and cuts, and a second pure function reconciles that list against what is already in the scene. Still no UI.

## The carcase coordinate frame

Carcase-local axes, origin at the **bottom-front-left** corner of the envelope:

- **+X** — left → right (`width`)
- **+Y** — front → back (`depth`)
- **+Z** — bottom → top (`height`)

A board part's local box is `[0,length] × [0,width] × [0,thickness]` (`BRepPrimAPI_MakeBox` from the local origin — see `src/geom/occt.ts:26` and `boardDims` in `src/geom/halflap.ts:13`). Its `position` is that local origin expressed in the parent's frame.

Every carcase part is an axis-aligned panel, so all three orientations reduce to one helper. The rotations below were derived against `composeWorldMatrix`'s Euler-XYZ convention (`R = Rx·Ry·Rz`) and each maps all three board axes onto carcase axes **positively**, which is why `position` is always the box's min corner:

| `thicknessAxis` | rotation (deg) | `length` | `width` | `thickness` |
|---|---|---|---|---|
| `'z'` (shelves, top, bottom) | `(0, 0, 0)` | `dx` | `dy` | `dz` |
| `'x'` (side panels, dividers) | `(0, 90, 90)` | `dy` | `dz` | `dx` |
| `'y'` (back panel) | `(-90, 0, -90)` | `dz` | `dx` | `dy` |

**These three rows are the contract, and Task 4.1's tests assert them via world AABBs rather than by comparing rotation triples** — so an alternative but equivalent rotation still passes, and a wrong one cannot.

## Task 4.1: `orientedPanel` and the role table

**Files:**
- Create: `src/scene/carcaseRoles.ts`, `src/scene/carcaseRoles.test.ts`

- [ ] **Step 1: Write the failing tests for `orientedPanel`**

Create `src/scene/carcaseRoles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { orientedPanel, carcaseRoles, validateCarcaseParams } from './carcaseRoles'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'
import type { CarcaseParams } from './types'

// World AABB of a panel spec, in carcase-local space. This is the assertion surface:
// it pins position and rotation together and is indifferent to which equivalent
// Euler triple the implementation chooses.
function aabb(p: ReturnType<typeof orientedPanel>) {
  const m = composeWorldMatrix({
    ...p,
    kind: 'board',
    id: 'x',
    label: 'x',
    material: '',
    color: '#fff',
    cuts: [],
    visible: true,
    parentId: null,
    driven: true,
  })
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const cx of [0, p.length])
    for (const cy of [0, p.width])
      for (const cz of [0, p.thickness]) {
        const [wx, wy, wz] = applyMatrixToPoint(m, cx, cy, cz)
        min.x = Math.min(min.x, wx); max.x = Math.max(max.x, wx)
        min.y = Math.min(min.y, wy); max.y = Math.max(max.y, wy)
        min.z = Math.min(min.z, wz); max.z = Math.max(max.z, wz)
      }
  return { min, max }
}

const box = { x0: 10, x1: 28, y0: 100, y1: 660, z0: 0, z1: 720 }

describe('orientedPanel', () => {
  it('fills the box exactly with thickness on Z', () => {
    const p = orientedPanel({ x0: 0, x1: 600, y0: 0, y1: 560, z0: 100, z1: 118 }, 'z')
    expect(p.thickness).toBeCloseTo(18, 9)
    const b = aabb(p)
    expect(b.min.x).toBeCloseTo(0, 9); expect(b.max.x).toBeCloseTo(600, 9)
    expect(b.min.y).toBeCloseTo(0, 9); expect(b.max.y).toBeCloseTo(560, 9)
    expect(b.min.z).toBeCloseTo(100, 9); expect(b.max.z).toBeCloseTo(118, 9)
  })

  it('fills the box exactly with thickness on X — a side panel', () => {
    const p = orientedPanel(box, 'x')
    expect(p.thickness).toBeCloseTo(18, 9)
    const b = aabb(p)
    expect(b.min.x).toBeCloseTo(10, 9); expect(b.max.x).toBeCloseTo(28, 9)
    expect(b.min.y).toBeCloseTo(100, 9); expect(b.max.y).toBeCloseTo(660, 9)
    expect(b.min.z).toBeCloseTo(0, 9); expect(b.max.z).toBeCloseTo(720, 9)
  })

  it('fills the box exactly with thickness on Y — a back panel', () => {
    const p = orientedPanel({ x0: 18, x1: 582, y0: 548, y1: 560, z0: 100, z1: 700 }, 'y')
    expect(p.thickness).toBeCloseTo(12, 9)
    const b = aabb(p)
    expect(b.min.x).toBeCloseTo(18, 9); expect(b.max.x).toBeCloseTo(582, 9)
    expect(b.min.y).toBeCloseTo(548, 9); expect(b.max.y).toBeCloseTo(560, 9)
    expect(b.min.z).toBeCloseTo(100, 9); expect(b.max.z).toBeCloseTo(700, 9)
  })

  // Corrected 2026-08-20. The first draft looped all three axes against the single shared `box`,
  // which is thin on X only — so asking it for 'y' or 'z' correctly returns a 560 or 720 mm
  // thickness and the assertion is false about the input, not about the function. A test that no
  // implementation can pass is a fixture defect. Each axis needs a box whose thin dimension is the
  // one being named; these three are the panels from the tests above.
  const thinBox = {
    x: box, // side panel
    y: { x0: 18, x1: 582, y0: 548, y1: 560, z0: 100, z1: 700 }, // back panel
    z: { x0: 0, x1: 600, y0: 0, y1: 560, z0: 100, z1: 118 }, // shelf
  }

  it('never reports a panel whose thickness is a face dimension', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const p = orientedPanel(thinBox[axis], axis)
      expect(p.thickness).toBeLessThan(p.length)
      expect(p.thickness).toBeLessThan(p.width)
    }
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts`
Expected: FAIL — cannot resolve `./carcaseRoles`.

- [ ] **Step 3: Implement `orientedPanel`**

Create `src/scene/carcaseRoles.ts`:

```ts
import type { CarcaseParams, Vec3 } from './types'

export interface LocalBox {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

export interface PanelSpec {
  length: number
  width: number
  thickness: number
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
}

// Every carcase part is an axis-aligned panel; only which axis carries the material thickness
// differs. Each rotation maps all three board axes onto carcase axes positively, so the board's
// local origin always lands on the box's min corner and `position` needs no compensation.
export function orientedPanel(b: LocalBox, thicknessAxis: 'x' | 'y' | 'z'): PanelSpec {
  const dx = b.x1 - b.x0
  const dy = b.y1 - b.y0
  const dz = b.z1 - b.z0
  const position = { x: b.x0, y: b.y0, z: b.z0 }
  const rotationOrder = 'XYZ' as const

  if (thicknessAxis === 'z') {
    return { length: dx, width: dy, thickness: dz, position, rotation: { x: 0, y: 0, z: 0 }, rotationOrder }
  }
  if (thicknessAxis === 'x') {
    // board x→carcase y, y→z, z→x
    return { length: dy, width: dz, thickness: dx, position, rotation: { x: 0, y: 90, z: 90 }, rotationOrder }
  }
  // board x→carcase z, y→x, z→y
  return { length: dz, width: dx, thickness: dy, position, rotation: { x: -90, y: 0, z: -90 }, rotationOrder }
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/carcaseRoles.ts src/scene/carcaseRoles.test.ts
git commit -m "feat(scene): orientedPanel maps a carcase-local box to a board with real thickness"
```

## Task 4.2: `validateCarcaseParams`

**Files:**
- Modify: `src/scene/carcaseRoles.ts`, `src/scene/carcaseRoles.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/carcaseRoles.test.ts`:

```ts
const base: CarcaseParams = {
  width: 600,
  height: 720,
  depth: 560,
  material: '18mm Ply',
  thickness: 18,
  hasTop: true,
  backMode: 'captured',
  backThickness: 12,
  baseMode: 'toe-kick',
  toeKickHeight: 100,
  toeKickSetback: 60,
  fixedShelves: 1,
  adjustableShelves: { rows: 2, pitch: 32, setback: 37, startHeight: 200, count: 10 },
  jointMethod: 'dado-rabbet',
  dividers: [],
}

describe('validateCarcaseParams', () => {
  it('accepts a sane base cabinet', () => {
    expect(validateCarcaseParams(base)).toEqual([])
  })

  it('rejects a carcase narrower than two side panels', () => {
    expect(validateCarcaseParams({ ...base, width: 30 })).toContain(
      'width must exceed 2 × thickness',
    )
  })

  it('rejects a toe kick taller than the carcase', () => {
    expect(validateCarcaseParams({ ...base, toeKickHeight: 800 })).toContain(
      'toeKickHeight must be less than height',
    )
  })

  it('rejects negative shelf counts', () => {
    expect(validateCarcaseParams({ ...base, fixedShelves: -1 })).toContain(
      'fixedShelves must be 0 or more',
    )
  })

  it('rejects dividers outside 0..1 or out of order', () => {
    expect(validateCarcaseParams({ ...base, dividers: [1.5] })).toContain(
      'dividers must lie strictly between 0 and 1',
    )
    expect(validateCarcaseParams({ ...base, dividers: [0.6, 0.3] })).toContain(
      'dividers must be ascending',
    )
  })

  it('rejects a back thicker than the depth it sits in', () => {
    expect(validateCarcaseParams({ ...base, backThickness: 600 })).toContain(
      'backThickness must be less than depth',
    )
  })

  it('accumulates every problem rather than stopping at the first', () => {
    expect(validateCarcaseParams({ ...base, width: 10, fixedShelves: -2 }).length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t 'validateCarcaseParams'`
Expected: FAIL — `validateCarcaseParams is not a function`.

- [ ] **Step 3: Implement**

Append to `src/scene/carcaseRoles.ts`:

```ts
export function validateCarcaseParams(p: CarcaseParams): string[] {
  const errors: string[] = []
  if (p.thickness <= 0) errors.push('thickness must be positive')
  if (p.width <= 2 * p.thickness) errors.push('width must exceed 2 × thickness')
  if (p.height <= 2 * p.thickness) errors.push('height must exceed 2 × thickness')
  if (p.depth <= p.thickness) errors.push('depth must exceed thickness')
  if (p.baseMode === 'toe-kick' && p.toeKickHeight >= p.height) {
    errors.push('toeKickHeight must be less than height')
  }
  if (p.baseMode === 'toe-kick' && p.toeKickSetback >= p.depth) {
    errors.push('toeKickSetback must be less than depth')
  }
  if (p.backMode !== 'none' && p.backThickness >= p.depth) {
    errors.push('backThickness must be less than depth')
  }
  if (p.fixedShelves < 0) errors.push('fixedShelves must be 0 or more')
  if (p.adjustableShelves.count < 0) errors.push('adjustable shelf count must be 0 or more')
  if (p.dividers.some((d) => d <= 0 || d >= 1)) {
    errors.push('dividers must lie strictly between 0 and 1')
  }
  if (p.dividers.some((d, i) => i > 0 && d <= p.dividers[i - 1])) {
    errors.push('dividers must be ascending')
  }
  return errors
}
```

- [ ] **Step 4: Run to confirm pass, then commit**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts`
Expected: PASS — 11 tests.

```bash
git add src/scene/carcaseRoles.ts src/scene/carcaseRoles.test.ts
git commit -m "feat(scene): validateCarcaseParams accumulates every problem"
```

## Task 4.3: `carcaseRoles` — the role table

**Files:**
- Modify: `src/scene/carcaseRoles.ts`, `src/scene/carcaseRoles.test.ts`

**The role table.** All values are carcase-local. `T` = `thickness`, `W`/`H`/`D` = width/height/depth, `BT` = `backThickness`, `KH`/`KS` = toe-kick height/setback. `carcaseZ0` = `baseMode === 'ladder' ? KH : 0` — where the *carcase box* starts. `floor` = `baseMode === 'toe-kick' ? KH : carcaseZ0` — where the bottom panel sits. `innerTop` = `hasTop ? H - T : H`. `backY0` = `backMode === 'captured' ? D - BT : D`. `H` is the **total** height from the ground, base included, in every mode.

| Role key | Box | thickness axis |
|---|---|---|
| `left-side` | `x:[0,T] y:[0,D] z:[carcaseZ0,H]` | `x` |
| `right-side` | `x:[W-T,W] y:[0,D] z:[carcaseZ0,H]` | `x` |
| `bottom` | `x:[T,W-T] y:[0,D] z:[floor,floor+T]` | `z` |
| `top` (iff `hasTop`) | `x:[T,W-T] y:[0,D] z:[H-T,H]` | `z` |
| `back` (iff `backMode !== 'none'`) | `x:[T,W-T] y:[backY0,backY0+BT] z:[floor+T,innerTop]` | `y` |
| `toe-kick` (iff `baseMode === 'toe-kick'`) | `x:[T,W-T] y:[KS,KS+T] z:[0,floor]` | `y` |
| `divider-{i}` | `x:[W·d-T/2, W·d+T/2] y:[0,backY0] z:[floor+T,innerTop]` | `x` |
| `shelf-{b}-{i}` | `x:[bayX0(b),bayX1(b)] y:[0,backY0] z:[zi,zi+T]` where `zi` divides `[floor+T, innerTop]` into `fixedShelves+1` equal bays | `z` |

### Two corrections, 2026-08-20 — found by the pairwise-overlap test

**Shelves are per vertical bay.** The first draft ran every shelf the full internal width,
`x:[T,W-T]`, while a divider ran the full internal height. Those two rows **interpenetrate by
construction** — a `dividers: [0.5]` carcase produced an 18 × 548 × 18 shared volume, and no
arithmetic in either row can separate them. A divider splits the carcase into vertical bays and
shelves live *inside* a bay; that is what a bookcase with a centre upright is. So:

```
bayEdges = [T, ...dividers.flatMap((d) => [W * d - T / 2, W * d + T / 2]), W - T]
// consecutive pairs are the bays: (bayEdges[0], bayEdges[1]), (bayEdges[2], bayEdges[3]), …
```

`fixedShelves` therefore means **shelves per bay**, not shelves in total — the reading a cabinetmaker
expects, and the one that keeps a divided carcase symmetrical. With no dividers there is exactly one
bay, `[T, W-T]`, so an undivided carcase is unchanged apart from the role key.

**Ladder mode raises the carcase.** The prose below called the ladder "a frame *under* the carcase"
while the formula left `floor` at 0 for that mode, so the rails at `z:[0,KH]` sat *inside* the sides
at `z:[0,H]` — an 18 × 18 × 100 shared volume per corner. Prose and formula disagreed and the prose
was right; `carcaseZ0` is the fix.

`baseMode: 'legs'` and `'none'` emit no extra part and put `floor` at 0. `baseMode: 'ladder'` emits four roles — `ladder-front`, `ladder-back`, `ladder-left`, `ladder-right` — forming a frame under the carcase: front/back are `x:[0,W] y:[KS,KS+T]` and `x:[0,W] y:[D-T,D]`, left/right are `x:[0,T] y:[KS+T,D-T]` and `x:[W-T,W] y:[KS+T,D-T]`, all `z:[0,KH]`, all thickness axis `y` for front/back and `x` for left/right.

**A third defect, same family.** `ladder-left`/`ladder-right` span `y:[KS+T, D-T]`, which **inverts**
when `KS + 2T >= D` — `depth: 100, toeKickSetback: 70, thickness: 18` yields `y:[88, 82]`, a negative
extent reaching OCCT as a degenerate solid. Validation only checks `KS < depth`. Add to
`validateCarcaseParams`, scoped to ladder mode since it is the only mode with side rails:

```ts
if (p.baseMode === 'ladder' && p.toeKickSetback + 2 * p.thickness >= p.depth) {
  errors.push('toeKickSetback leaves no room for the ladder side rails')
}
```

**Order matters** — the returned array's order is the build sequence the deliverables project will consume. Emit in the order of the table.

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/carcaseRoles.test.ts`:

```ts
function roleBox(roles: ReturnType<typeof carcaseRoles>, key: string) {
  const r = roles.find((x) => x.role === key)
  if (!r) throw new Error(`no role ${key}`)
  return aabb(r.panel)
}

describe('carcaseRoles', () => {
  it('emits the expected role set for a base cabinet', () => {
    expect(carcaseRoles(base).map((r) => r.role)).toEqual([
      'left-side',
      'right-side',
      'bottom',
      'top',
      'back',
      'toe-kick',
      'shelf-0-0',
    ])
  })

  it('places the side panels flush with the envelope and 18 mm thick', () => {
    const roles = carcaseRoles(base)
    const left = roleBox(roles, 'left-side')
    expect(left.min.x).toBeCloseTo(0, 9)
    expect(left.max.x).toBeCloseTo(18, 9)
    expect(left.min.z).toBeCloseTo(0, 9)
    expect(left.max.z).toBeCloseTo(720, 9)

    const right = roleBox(roles, 'right-side')
    expect(right.min.x).toBeCloseTo(582, 9)
    expect(right.max.x).toBeCloseTo(600, 9)
  })

  it('seats the bottom on top of the toe kick, between the sides', () => {
    const b = roleBox(carcaseRoles(base), 'bottom')
    expect(b.min.z).toBeCloseTo(100, 9)
    expect(b.max.z).toBeCloseTo(118, 9)
    expect(b.min.x).toBeCloseTo(18, 9)
    expect(b.max.x).toBeCloseTo(582, 9)
  })

  it('captures the back in the rear of the carcase', () => {
    const b = roleBox(carcaseRoles(base), 'back')
    expect(b.min.y).toBeCloseTo(548, 9)
    expect(b.max.y).toBeCloseTo(560, 9)
    expect(b.min.z).toBeCloseTo(118, 9)
    expect(b.max.z).toBeCloseTo(702, 9)
  })

  it('stops shelves short of a captured back', () => {
    const s = roleBox(carcaseRoles(base), 'shelf-0-0')
    expect(s.max.y).toBeCloseTo(548, 9)
  })

  it('centres one fixed shelf in the internal height', () => {
    const s = roleBox(carcaseRoles(base), 'shelf-0-0')
    // internal bay is z 118..702; one shelf splits it into two equal bays
    expect(s.min.z).toBeCloseTo(118 + (702 - 118 - 18) / 2, 6)
  })

  it('spaces two fixed shelves into three equal bays', () => {
    const roles = carcaseRoles({ ...base, fixedShelves: 2 })
    const a = roleBox(roles, 'shelf-0-0')
    const b = roleBox(roles, 'shelf-0-1')
    const bay1 = a.min.z - 118
    const bay2 = b.min.z - a.max.z
    expect(bay2).toBeCloseTo(bay1, 6)
  })

  it('omits the top when hasTop is false', () => {
    expect(carcaseRoles({ ...base, hasTop: false }).map((r) => r.role)).not.toContain('top')
  })

  it('omits the back and lets shelves run full depth when backMode is none', () => {
    const roles = carcaseRoles({ ...base, backMode: 'none' })
    expect(roles.map((r) => r.role)).not.toContain('back')
    expect(roleBox(roles, 'shelf-0-0').max.y).toBeCloseTo(560, 9)
  })

  it('drops the carcase to the floor when baseMode is none', () => {
    const roles = carcaseRoles({ ...base, baseMode: 'none' })
    expect(roles.map((r) => r.role)).not.toContain('toe-kick')
    expect(roleBox(roles, 'bottom').min.z).toBeCloseTo(0, 9)
  })

  it('emits a four-piece ladder base', () => {
    const roles = carcaseRoles({ ...base, baseMode: 'ladder' }).map((r) => r.role)
    expect(roles).toEqual(
      expect.arrayContaining(['ladder-front', 'ladder-back', 'ladder-left', 'ladder-right']),
    )
  })

  it('centres a divider on its width fraction', () => {
    const d = roleBox(carcaseRoles({ ...base, dividers: [0.5] }), 'divider-0')
    expect(d.min.x).toBeCloseTo(300 - 9, 9)
    expect(d.max.x).toBeCloseTo(300 + 9, 9)
  })

  it('emits nothing when the params are invalid', () => {
    expect(carcaseRoles({ ...base, width: 5 })).toEqual([])
  })

  it('returns roles in a stable order across repeated calls', () => {
    expect(carcaseRoles(base).map((r) => r.role)).toEqual(carcaseRoles(base).map((r) => r.role))
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t 'carcaseRoles'`
Expected: FAIL — `carcaseRoles is not a function`.

- [ ] **Step 3: Implement**

Append to `src/scene/carcaseRoles.ts`:

```ts
export interface RoleSpec {
  role: string
  label: string
  panel: PanelSpec
}

export function carcaseRoles(p: CarcaseParams): RoleSpec[] {
  if (validateCarcaseParams(p).length > 0) return []

  const T = p.thickness
  const { width: W, height: H, depth: D } = p
  const floor = p.baseMode === 'toe-kick' ? p.toeKickHeight : 0
  const innerTop = p.hasTop ? H - T : H
  const backY0 = p.backMode === 'captured' ? D - p.backThickness : D
  const shelfBackY = p.backMode === 'captured' ? backY0 : D
  const bayZ0 = floor + T

  const out: RoleSpec[] = []
  const add = (role: string, label: string, b: LocalBox, axis: 'x' | 'y' | 'z') =>
    out.push({ role, label, panel: orientedPanel(b, axis) })

  add('left-side', 'Left Side', { x0: 0, x1: T, y0: 0, y1: D, z0: 0, z1: H }, 'x')
  add('right-side', 'Right Side', { x0: W - T, x1: W, y0: 0, y1: D, z0: 0, z1: H }, 'x')
  add('bottom', 'Bottom', { x0: T, x1: W - T, y0: 0, y1: D, z0: floor, z1: floor + T }, 'z')
  if (p.hasTop) {
    add('top', 'Top', { x0: T, x1: W - T, y0: 0, y1: D, z0: H - T, z1: H }, 'z')
  }
  if (p.backMode !== 'none') {
    add(
      'back',
      'Back',
      { x0: T, x1: W - T, y0: backY0, y1: backY0 + p.backThickness, z0: bayZ0, z1: innerTop },
      'y',
    )
  }
  if (p.baseMode === 'toe-kick') {
    add(
      'toe-kick',
      'Toe Kick',
      { x0: T, x1: W - T, y0: p.toeKickSetback, y1: p.toeKickSetback + T, z0: 0, z1: floor },
      'y',
    )
  }
  if (p.baseMode === 'ladder') {
    const KS = p.toeKickSetback
    const KH = p.toeKickHeight
    add('ladder-front', 'Base Front', { x0: 0, x1: W, y0: KS, y1: KS + T, z0: 0, z1: KH }, 'y')
    add('ladder-back', 'Base Back', { x0: 0, x1: W, y0: D - T, y1: D, z0: 0, z1: KH }, 'y')
    add('ladder-left', 'Base Left', { x0: 0, x1: T, y0: KS + T, y1: D - T, z0: 0, z1: KH }, 'x')
    add('ladder-right', 'Base Right', { x0: W - T, x1: W, y0: KS + T, y1: D - T, z0: 0, z1: KH }, 'x')
  }
  p.dividers.forEach((d, i) => {
    add(
      `divider-${i}`,
      `Divider ${i + 1}`,
      { x0: W * d - T / 2, x1: W * d + T / 2, y0: 0, y1: shelfBackY, z0: bayZ0, z1: innerTop },
      'x',
    )
  })
  // Shelves split the internal height into fixedShelves+1 equal bays, each shelf sitting
  // at the top of its bay.
  const internal = innerTop - bayZ0
  const bay = (internal - p.fixedShelves * T) / (p.fixedShelves + 1)
  for (let i = 0; i < p.fixedShelves; i++) {
    const z0 = bayZ0 + (i + 1) * bay + i * T
    add(
      `shelf-${b}-${i}`,
      `Shelf ${i + 1}`,
      { x0: T, x1: W - T, y0: 0, y1: shelfBackY, z0, z1: z0 + T },
      'z',
    )
  }
  return out
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts`
Expected: PASS — 25 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/carcaseRoles.ts src/scene/carcaseRoles.test.ts
git commit -m "feat(scene): carcaseRoles turns parameters into an ordered panel table"
```

## Task 4.4: `regenerateComponents` — reconciliation by role key

**Files:**
- Create: `src/scene/regenerateComponents.ts`, `src/scene/regenerateComponents.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/regenerateComponents.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { regenerateComponents } from './regenerateComponents'
import type { Component, Scene, BoardPart, CarcaseParams } from './types'

const params: CarcaseParams = {
  width: 600,
  height: 720,
  depth: 560,
  material: '18mm Ply',
  thickness: 18,
  hasTop: true,
  backMode: 'captured',
  backThickness: 12,
  baseMode: 'none',
  toeKickHeight: 100,
  toeKickSetback: 60,
  fixedShelves: 1,
  adjustableShelves: { rows: 1, pitch: 32, setback: 37, startHeight: 200, count: 0 },
  jointMethod: 'dado-rabbet',
  dividers: [],
}

const cabinet: Component = {
  id: 'cmp_1',
  kind: 'carcase',
  label: 'Base Cabinet 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params,
}

const empty: Scene = { parts: [], materials: {}, hardware: [], joints: [], components: [cabinet] }

function partsOf(s: Scene) {
  return s.parts.filter((p) => p.parentId === 'cmp_1')
}

describe('regenerateComponents', () => {
  it('creates one part per role, all driven and parented to the carcase', () => {
    const out = regenerateComponents(empty)
    const roles = partsOf(out).map((p) => p.role)
    expect(roles).toEqual(['left-side', 'right-side', 'bottom', 'top', 'back', 'shelf-0-0'])
    expect(partsOf(out).every((p) => p.driven)).toBe(true)
  })

  it('keeps part ids stable across a regeneration that changes dimensions', () => {
    const first = regenerateComponents(empty)
    const idsBefore = partsOf(first).map((p) => p.id)

    const deeper = {
      ...first,
      components: [{ ...cabinet, params: { ...params, depth: 600 } }],
    }
    const second = regenerateComponents(deeper)

    expect(partsOf(second).map((p) => p.id)).toEqual(idsBefore)
  })

  it('resizes driven parts when a parameter changes', () => {
    const first = regenerateComponents(empty)
    const before = partsOf(first).find((p) => p.role === 'left-side') as BoardPart
    const second = regenerateComponents({
      ...first,
      components: [{ ...cabinet, params: { ...params, depth: 600 } }],
    })
    const after = partsOf(second).find((p) => p.role === 'left-side') as BoardPart

    expect(before.length).toBeCloseTo(560, 9)
    expect(after.length).toBeCloseTo(600, 9)
  })

  it('never touches a detached part', () => {
    const first = regenerateComponents(empty)
    const detached = {
      ...first,
      parts: first.parts.map((p) =>
        p.role === 'shelf-0-0' ? { ...p, driven: false, position: { x: 0, y: 0, z: 999 } } : p,
      ),
    }
    const second = regenerateComponents({
      ...detached,
      components: [{ ...cabinet, params: { ...params, height: 900 } }],
    })
    const shelf = partsOf(second).find((p) => p.id === detached.parts.find((q) => q.role === 'shelf-0-0')!.id)

    expect(shelf?.position.z).toBe(999)
    expect(shelf?.driven).toBe(false)
  })

  it('deletes a driven part whose role the params no longer imply', () => {
    const first = regenerateComponents(empty)
    const second = regenerateComponents({
      ...first,
      components: [{ ...cabinet, params: { ...params, hasTop: false } }],
    })
    expect(partsOf(second).map((p) => p.role)).not.toContain('top')
  })

  it('keeps a detached part whose role is gone, clearing its role', () => {
    const first = regenerateComponents(empty)
    const topId = partsOf(first).find((p) => p.role === 'top')!.id
    const detached = {
      ...first,
      parts: first.parts.map((p) => (p.id === topId ? { ...p, driven: false } : p)),
    }
    const second = regenerateComponents({
      ...detached,
      components: [{ ...cabinet, params: { ...params, hasTop: false } }],
    })
    const kept = second.parts.find((p) => p.id === topId)

    expect(kept).toBeDefined()
    expect(kept?.role).toBeUndefined()
    expect(kept?.parentId).toBe('cmp_1')
  })

  it('emits nothing and preserves last-good parts when params are invalid', () => {
    const first = regenerateComponents(empty)
    const broken = {
      ...first,
      components: [{ ...cabinet, params: { ...params, width: 5 } }],
    }
    const second = regenerateComponents(broken)
    expect(partsOf(second)).toHaveLength(partsOf(first).length)
  })

  it('is idempotent', () => {
    const once = regenerateComponents(empty)
    const twice = regenerateComponents(once)
    expect(twice).toEqual(once)
  })

  it('leaves a scene with no carcase components untouched by identity', () => {
    const flat: Scene = { parts: [], materials: {}, hardware: [], joints: [], components: [] }
    expect(regenerateComponents(flat)).toBe(flat)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/regenerateComponents.test.ts`
Expected: FAIL — cannot resolve `./regenerateComponents`.

- [ ] **Step 3: Implement**

Create `src/scene/regenerateComponents.ts`:

```ts
import type { BoardPart, Component, Part, Scene } from './types'
import { carcaseRoles } from './carcaseRoles'
import { PART_COLORS } from './palette'

function regenerateOne(component: Component, parts: Part[]): Part[] {
  if (component.kind !== 'carcase' || component.params === undefined) return parts

  const roles = carcaseRoles(component.params)
  // Invalid parameters produce no roles. Preserve the last good parts rather than emptying the
  // cabinet mid-keystroke — the same contract deriveJoint has when it returns null.
  if (roles.length === 0) return parts

  const mine = parts.filter((p) => p.parentId === component.id)
  const others = parts.filter((p) => p.parentId !== component.id)
  const byRole = new Map(mine.filter((p) => p.role !== undefined).map((p) => [p.role!, p]))
  const wanted = new Set(roles.map((r) => r.role))

  const kept: Part[] = []
  for (const p of mine) {
    if (p.role !== undefined && wanted.has(p.role)) continue // handled below
    if (p.driven && p.role !== undefined) continue // driven, no longer implied → delete
    // Detached, or never role-bound: the user's. Keep it, and release a stale role key.
    kept.push(p.role !== undefined ? { ...p, role: undefined } : p)
  }

  const generated: Part[] = roles.map((r, i) => {
    const existing = byRole.get(r.role)
    if (existing && !existing.driven) return existing
    const base: BoardPart = {
      kind: 'board',
      id: existing?.id ?? `board_${crypto.randomUUID()}`,
      label: existing?.label ?? r.label,
      length: r.panel.length,
      width: r.panel.width,
      thickness: r.panel.thickness,
      material: component.params!.material,
      color: existing?.color ?? PART_COLORS[i % PART_COLORS.length],
      position: r.panel.position,
      rotation: r.panel.rotation,
      rotationOrder: 'XYZ',
      cuts: existing?.kind === 'board' ? existing.cuts.filter((c) => c.sourceComponentId === undefined && c.kind === 'box' ? c.sourceJointId !== undefined : true) : [],
      visible: existing?.visible ?? true,
      parentId: component.id,
      driven: true,
      role: r.role,
    }
    return base
  })

  return [...others, ...kept, ...generated]
}

// Runs immediately before reconcileJoints: carcases emit driven parts here, reconcileJoints then
// derives cuts and seats from the joints. Pure and idempotent.
export function regenerateComponents(scene: Scene): Scene {
  const carcases = scene.components.filter((c) => c.kind === 'carcase')
  if (carcases.length === 0) return scene

  let parts = scene.parts
  for (const c of carcases) parts = regenerateOne(c, parts)
  return parts === scene.parts ? scene : { ...scene, parts }
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/scene/regenerateComponents.test.ts`
Expected: PASS — 9 tests. If the idempotence test fails, the usual cause is a fresh `crypto.randomUUID()` on the second pass, meaning role lookup missed — check that `byRole` is built from `mine`, not from `parts`.

- [ ] **Step 5: Commit**

```bash
git add src/scene/regenerateComponents.ts src/scene/regenerateComponents.test.ts
git commit -m "feat(scene): regenerateComponents reconciles carcase parts by stable role key"
```

## Task 4.5: The toe-kick notch

**Files:**
- Modify: `src/scene/carcaseRoles.ts`, `src/scene/carcaseRoles.test.ts`, `src/scene/regenerateComponents.ts`

**Why this task exists:** with `baseMode: 'toe-kick'` the side panels run to the floor, so the toe recess is blocked by the sides unless each one is notched at the front bottom. This is the cut the spec names as the motivating case for `sourceComponentId` on `BoxCut` — a cut a component places that no joint owns.

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/carcaseRoles.test.ts`:

```ts
describe('carcaseCuts', () => {
  it('notches both side panels for a toe kick', () => {
    expect(carcaseCuts(base, 'left-side')).toHaveLength(1)
    expect(carcaseCuts(base, 'right-side')).toHaveLength(1)
  })

  it('sizes the notch to the toe kick height and setback', () => {
    const [notch] = carcaseCuts(base, 'left-side')
    expect(notch.kind).toBe('box')
    if (notch.kind !== 'box') throw new Error('expected a box cut')
    // side panel local: length runs the depth axis, width the height axis, thickness across
    expect(notch.size.x).toBeCloseTo(base.toeKickSetback, 9)
    expect(notch.size.y).toBeCloseTo(base.toeKickHeight, 9)
    expect(notch.position.x).toBeCloseTo(0, 9)
    expect(notch.position.y).toBeCloseTo(0, 9)
  })

  it('cuts through the full panel thickness', () => {
    const [notch] = carcaseCuts(base, 'left-side')
    if (notch.kind !== 'box') throw new Error('expected a box cut')
    expect(notch.size.z).toBeGreaterThanOrEqual(base.thickness)
  })

  it('emits no notch for base modes other than toe-kick', () => {
    for (const m of ['none', 'legs', 'ladder'] as const) {
      expect(carcaseCuts({ ...base, baseMode: m }, 'left-side')).toEqual([])
    }
  })

  it('emits no notch for a role that is not a side panel', () => {
    expect(carcaseCuts(base, 'bottom')).toEqual([])
    expect(carcaseCuts(base, 'back')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t 'carcaseCuts'`
Expected: FAIL — `carcaseCuts is not a function`.

- [ ] **Step 3: Implement**

Append to `src/scene/carcaseRoles.ts`:

```ts
// Cuts a carcase places directly on a part, owned by the component rather than by any joint.
// The side panel's local frame comes from orientedPanel(..., 'x'): local x runs the carcase depth
// axis, local y runs the carcase height axis, local z is the material thickness.
export function carcaseCuts(p: CarcaseParams, role: string): CutDef[] {
  if (p.baseMode !== 'toe-kick') return []
  if (role !== 'left-side' && role !== 'right-side') return []
  if (p.toeKickSetback <= 0 || p.toeKickHeight <= 0) return []

  return [
    {
      kind: 'box',
      id: `toekick_${role}`,
      label: 'Toe kick notch',
      face: '-Z',
      position: { x: 0, y: 0, z: 0 },
      // z overshoots the thickness so the boolean is a clean through-cut rather than a
      // coincident-face subtraction, which OCCT resolves unreliably.
      size: { x: p.toeKickSetback, y: p.toeKickHeight, z: p.thickness * 2 },
      sourceComponentId: undefined, // stamped by regenerateComponents, which knows the id
    },
  ]
}
```

In `regenerateComponents.ts`, stamp the owner and merge these with the hole arrays when building each generated part's `cuts`:

```ts
      const componentCuts = [
        ...carcaseCuts(component.params!, r.role),
        ...carcaseHoleArrays(component.params!, r.role),
      ].map((c) => ({ ...c, sourceComponentId: component.id }))
```

Note the ordering requirement this creates: `regenerateComponents` writes cuts carrying `sourceComponentId`, and `reconcileJoints` writes cuts carrying `sourceJointId`. Neither may strip the other's. Confirm with:

Run: `grep -n 'sourceJointId' src/scene/reconcileJoints.ts`
Expected: every filter there tests `sourceJointId`, never a bare "has an owner" check. If one is found, tighten it before proceeding.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the two owners coexist**

Add to `src/scene/regenerateComponents.test.ts`:

```ts
it('keeps component-owned and joint-owned cuts on the same part', () => {
  const withKick = {
    ...empty,
    components: [{ ...cabinet, params: { ...params, baseMode: 'toe-kick' as const } }],
  }
  const out = reconcileJoints(regenerateComponents(withKick))
  const side = out.parts.find((p) => p.role === 'left-side')!
  if (side.kind !== 'board') throw new Error('expected a board')
  expect(side.cuts.some((c) => c.sourceComponentId !== undefined)).toBe(true)
  expect(side.cuts.some((c) => c.kind === 'box' && c.sourceJointId !== undefined)).toBe(true)
})
```

Run: `pnpm vitest run src/scene/regenerateComponents.test.ts`
Expected: PASS. **This is the test that proves the two pipeline stages do not delete each other's work** — it is worth more than the four notch-geometry tests above.

- [ ] **Step 6: Commit**

```bash
git add src/scene/carcaseRoles.ts src/scene/carcaseRoles.test.ts src/scene/regenerateComponents.ts src/scene/regenerateComponents.test.ts
git commit -m "feat(scene): notch the side panels for a toe kick as a component-owned cut"
```

## Task 4.6: Wire the pipeline into `useScene`

**Files:**
- Modify: `src/scene/useScene.ts`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('regeneration pipeline', () => {
  it('runs regenerateComponents before reconcileJoints on every mutation', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    expect(result.current.scene.parts.filter((p) => p.driven).length).toBeGreaterThan(0)
  })

  it('resizes driven parts when a carcase parameter changes', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const cmpId = result.current.scene.components[0].id
    const before = result.current.scene.parts.find((p) => p.role === 'left-side')!.length

    act(() =>
      result.current.onUpdateComponent(cmpId, (c) => ({
        ...c,
        params: { ...c.params!, depth: c.params!.depth + 40 },
      })),
    )

    expect(result.current.scene.parts.find((p) => p.role === 'left-side')!.length).toBeCloseTo(
      before + 40,
      6,
    )
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/useScene.test.ts -t 'regeneration pipeline'`
Expected: FAIL — `onAddCarcase is not a function`.

- [ ] **Step 3: Implement**

Create `src/scene/carcasePresets.ts`:

```ts
import type { CarcaseParams } from './types'

export interface CarcasePreset {
  name: string
  params: CarcaseParams
}

const shared = {
  material: '18mm Ply',
  thickness: 18,
  hasTop: true,
  backMode: 'captured' as const,
  backThickness: 12,
  toeKickHeight: 100,
  toeKickSetback: 60,
  adjustableShelves: { rows: 2 as const, pitch: 32 as const, setback: 37, startHeight: 200, count: 10 },
  jointMethod: 'dado-rabbet' as const,
  dividers: [],
}

export const CARCASE_PRESETS: CarcasePreset[] = [
  {
    name: 'Base 600',
    params: { ...shared, width: 600, height: 720, depth: 560, baseMode: 'toe-kick', fixedShelves: 1 },
  },
  {
    name: 'Wall 600',
    params: { ...shared, width: 600, height: 720, depth: 330, baseMode: 'none', fixedShelves: 1 },
  },
  {
    name: 'Tall 600',
    params: { ...shared, width: 600, height: 2100, depth: 560, baseMode: 'toe-kick', fixedShelves: 4 },
  },
]
```

In `src/scene/useScene.ts`, add a single pipeline function and route **every** scene mutation through it:

```ts
import { regenerateComponents } from './regenerateComponents'

// The one place scene mutations become geometry. Order is fixed: carcases emit parts and joints,
// then reconcileJoints derives cuts and seats from those joints.
function applyPipeline(scene: Scene): Scene {
  return reconcileJoints(regenerateComponents(scene))
}
```

Replace each existing `reconcileJoints(...)` call in `useScene.ts` with `applyPipeline(...)`.

Run: `grep -n 'reconcileJoints(' src/scene/useScene.ts` — every hit except the import must become `applyPipeline(`.

Add the carcase creator:

```ts
  const onAddCarcase = useCallback(
    (preset: CarcasePreset) => {
      const before = sceneRef.current
      const component: Component = {
        id: `cmp_${crypto.randomUUID()}`,
        kind: 'carcase',
        label: preset.name,
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
        params: preset.params,
      }
      const after = applyPipeline({ ...before, components: [...before.components, component] })
      setScene(after)
      push({ label: `Add ${preset.name}`, undo: () => setScene(before), redo: () => setScene(after) })
    },
    [push],
  )
```

Route `onUpdateComponent` (Task 3.3) through `applyPipeline` too, so a parameter edit regenerates:

```ts
      const after = applyPipeline({
        ...before,
        components: before.components.map((c) => (c.id === id ? updater(c) : c)),
      })
```

Add `onAddCarcase` to `UseSceneResult` and the returned object.

- [ ] **Step 4: Run to confirm pass, then the full suite**

Run: `pnpm vitest run src/scene/useScene.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts src/scene/carcasePresets.ts
git commit -m "feat(scene): regenerate carcases before reconciling joints on every mutation"
```

## Phase 4 verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green.
- [ ] Idempotence holds: `regenerateComponents.test.ts` has a passing `is idempotent` case.
- [ ] Detach preservation holds: the `never touches a detached part` case passes.
- [ ] In a Node REPL or a scratch test, `carcaseRoles(CARCASE_PRESETS[0].params)` returns 7 roles in the documented order.
- [ ] No OCCT call happens in any test added in this phase — `grep -rn 'initOCCT\|getOcct' src/scene/carcaseRoles.test.ts src/scene/regenerateComponents.test.ts` returns nothing.

---

# Phase 5 — Creating and editing a cabinet from the UI

**Outcome:** you can drop a cabinet from the menu and edit its parameters. Parts appear and resize live.

## Task 5.1: `CarcasePanel`

**Files:**
- Create: `src/ui/CarcasePanel.tsx`, `src/ui/CarcasePanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/CarcasePanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CarcasePanel } from './CarcasePanel'
import { CARCASE_PRESETS } from '../scene/carcasePresets'
import type { Component } from '../scene/types'

const cabinet: Component = {
  id: 'cmp_1',
  kind: 'carcase',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

describe('CarcasePanel', () => {
  it('shows the current width', () => {
    render(<CarcasePanel component={cabinet} onUpdate={vi.fn()} />)
    expect(screen.getByLabelText('Width')).toHaveValue(600)
  })

  it('reports a width edit through onUpdate', async () => {
    const onUpdate = vi.fn()
    render(<CarcasePanel component={cabinet} onUpdate={onUpdate} />)
    const field = screen.getByLabelText('Width')
    await userEvent.clear(field)
    await userEvent.type(field, '900')
    expect(onUpdate).toHaveBeenCalled()
    const updater = onUpdate.mock.calls.at(-1)![0] as (c: Component) => Component
    expect(updater(cabinet).params!.width).toBe(900)
  })

  it('shows a validation message for an impossible carcase and does not hide the field', () => {
    const broken = { ...cabinet, params: { ...cabinet.params!, width: 10 } }
    render(<CarcasePanel component={broken} onUpdate={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('width must exceed 2 × thickness')
    expect(screen.getByLabelText('Width')).toHaveValue(10)
  })

  it('groups parameters into four collapsible sections', () => {
    render(<CarcasePanel component={cabinet} onUpdate={vi.fn()} />)
    for (const s of ['Size', 'Structure', 'Shelving', 'Joinery']) {
      expect(screen.getByRole('button', { name: new RegExp(s) })).toBeInTheDocument()
    }
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx`
Expected: FAIL — cannot resolve `./CarcasePanel`.

- [ ] **Step 3: Implement**

Create `src/ui/CarcasePanel.tsx` with props `{ component: Component; onUpdate: (updater: (c: Component) => Component) => void }`. Four `Collapsible` sections from `@/components/ui/collapsible`, matching the `SectionHeader` pattern already in `sidebar.tsx`:

- **Size** — Width, Height, Depth, Thickness, Material
- **Structure** — Has top (checkbox), Back mode (select), Back thickness, Base mode (select), Toe-kick height, Toe-kick setback, Dividers (comma-separated fractions)
- **Shelving** — Fixed shelves, Adjustable rows, Setback, Start height, Count
- **Joinery** — Joint method (select)

Reuse `NumberField` from `src/ui/NumberField.tsx` and `useDebouncedCallback` from `src/ui/useDebouncedCallback.ts` for the numeric inputs, exactly as the dimension inputs in `EditPanel` do — the debounce is what makes typing into a dimension field cheap despite regeneration running on every change.

Render validation errors above the sections:

```tsx
      {errors.length > 0 && (
        <div role="alert" className="mb-2 rounded bg-red-950/40 px-2 py-1 text-xs text-red-300">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
```

where `const errors = validateCarcaseParams(component.params!)`.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/CarcasePanel.tsx src/ui/CarcasePanel.test.tsx
git commit -m "feat(ui): carcase parameter panel with grouped sections and inline validation"
```

## Task 5.2: "+ Cabinet" in the file menu

**Files:**
- Modify: `src/ui/FileMenu.tsx`, `src/App.tsx`, `src/ui/sidebar.tsx`
- Test: `src/ui/FileMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/ui/FileMenu.test.tsx`:

```tsx
it('offers every carcase preset and reports the chosen one', async () => {
  const onAddCarcase = vi.fn()
  render(<FileMenu {...props} onAddCarcase={onAddCarcase} />)
  await userEvent.click(screen.getByRole('button', { name: '+ Cabinet' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Wall 600' }))
  expect(onAddCarcase).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Wall 600' }),
  )
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/ui/FileMenu.test.tsx -t 'carcase preset'`
Expected: FAIL — no `+ Cabinet` button.

- [ ] **Step 3: Implement**

Add an `onAddCarcase: (preset: CarcasePreset) => void` prop to `FileMenu`, and a button next to the existing `+ Board` control that opens a menu built from `CARCASE_PRESETS`. **Add no keyboard shortcut** — `F/C/J/L/M/B/T/H` are taken and a new single letter would collide (see `docs/keyboard-shortcuts.md`).

In `src/App.tsx`, pass `onAddCarcase={scene.onAddCarcase}`.

In `src/ui/sidebar.tsx`, render `<CarcasePanel …/>` instead of `<EditPanel …/>` when `selection?.kind === 'component'` and that component's `kind === 'carcase'`.

- [ ] **Step 4: Verify in the browser**

Run: `pnpm dev`. Click **+ Cabinet → Base 600**.
Expected: seven boards appear as a cabinet; the tree shows them nested under "Base 600"; selecting the cabinet shows the parameter panel; changing Depth from 560 to 600 resizes the sides and shelf live.

- [ ] **Step 5: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/ui/FileMenu.tsx src/ui/FileMenu.test.tsx src/ui/sidebar.tsx src/App.tsx
git commit -m "feat(ui): drop a cabinet from a preset and edit it in the sidebar"
```

## Phase 5 verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green.
- [ ] Drop each of the three presets; each renders a plausible cabinet in the viewport.
- [ ] Set Width to 10; the panel shows the validation error and **the cabinet keeps its previous geometry** rather than disappearing.
- [ ] Undo after adding a cabinet removes the component *and* all seven parts in one step.
- [ ] Save, reload the page, reopen the file: the cabinet and its tree survive the round trip.

---

# Phase 6 — Detach

**Outcome:** editing a driven part's dimension is a decision, not a silent overwrite.

## Task 6.1: `onDetachPart` and push-to-parameter

**Files:**
- Modify: `src/scene/useScene.ts`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('detach', () => {
  it('detaches a driven part and stops regenerating it', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const shelf = result.current.scene.parts.find((p) => p.role === 'shelf-0-0')!

    act(() => result.current.onDetachPart(shelf.id))
    expect(result.current.scene.parts.find((p) => p.id === shelf.id)!.driven).toBe(false)

    const cmpId = result.current.scene.components[0].id
    act(() =>
      result.current.onUpdateComponent(cmpId, (c) => ({
        ...c,
        params: { ...c.params!, height: 900 },
      })),
    )
    const after = result.current.scene.parts.find((p) => p.id === shelf.id)!
    expect(after.position.z).toBeCloseTo(shelf.position.z, 9)
  })

  it('undoes a detach', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const id = result.current.scene.parts.find((p) => p.role === 'shelf-0-0')!.id
    act(() => result.current.onDetachPart(id))
    act(() => result.current.undo())
    expect(result.current.scene.parts.find((p) => p.id === id)!.driven).toBe(true)
  })

  it('maps a driven part dimension to the carcase parameter that controls it', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const left = result.current.scene.parts.find((p) => p.role === 'left-side')!

    // left-side length runs along the carcase depth axis
    expect(result.current.parameterFor(left.id, 'length')).toBe('depth')
    expect(result.current.parameterFor(left.id, 'thickness')).toBe('thickness')
    // its width is the carcase height, which the side panel spans exactly
    expect(result.current.parameterFor(left.id, 'width')).toBe('height')
  })

  it('returns null for a dimension no parameter controls', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const shelf = result.current.scene.parts.find((p) => p.role === 'shelf-0-0')!
    expect(result.current.parameterFor(shelf.id, 'thickness')).toBe('thickness')
    expect(result.current.parameterFor(shelf.id, 'width')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/useScene.test.ts -t 'detach'`
Expected: FAIL — `onDetachPart is not a function`.

- [ ] **Step 3: Implement**

Add to `src/scene/carcaseRoles.ts` — the dimension→parameter map is geometry knowledge and belongs beside the role table:

```ts
// Which carcase parameter, if any, a driven part's board dimension is a direct expression of.
// Derived by inspection of the role table: a side panel's `length` spans the depth axis, its
// `width` spans the full height, and every panel's `thickness` is the material thickness.
const DIMENSION_PARAM: Record<string, Partial<Record<'length' | 'width' | 'thickness', keyof CarcaseParams>>> = {
  'left-side': { length: 'depth', width: 'height', thickness: 'thickness' },
  'right-side': { length: 'depth', width: 'height', thickness: 'thickness' },
  bottom: { width: 'depth', thickness: 'thickness' },
  top: { width: 'depth', thickness: 'thickness' },
  back: { thickness: 'backThickness' },
  'toe-kick': { thickness: 'thickness' },
}

export function parameterForRole(
  role: string | undefined,
  dimension: 'length' | 'width' | 'thickness',
): keyof CarcaseParams | null {
  if (role === undefined) return null
  if (role.startsWith('shelf-') || role.startsWith('divider-')) {
    return dimension === 'thickness' ? 'thickness' : null
  }
  return DIMENSION_PARAM[role]?.[dimension] ?? null
}
```

In `src/scene/useScene.ts`:

```ts
  const onDetachPart = useCallback(
    (id: PartId) => {
      const before = sceneRef.current
      const after: Scene = {
        ...before,
        parts: before.parts.map((p) => (p.id === id ? { ...p, driven: false } : p)),
      }
      setScene(after)
      push({ label: 'Detach part', undo: () => setScene(before), redo: () => setScene(after) })
    },
    [push],
  )

  const parameterFor = useCallback(
    (id: PartId, dimension: 'length' | 'width' | 'thickness'): keyof CarcaseParams | null => {
      const part = sceneRef.current.parts.find((p) => p.id === id)
      if (!part || !part.driven) return null
      return parameterForRole(part.role, dimension)
    },
    [],
  )
```

Add both to `UseSceneResult` and the returned object.

- [ ] **Step 4: Run to confirm pass, then commit**

Run: `pnpm vitest run src/scene/useScene.test.ts -t 'detach'`
Expected: PASS — 4 tests.

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts src/scene/carcaseRoles.ts
git commit -m "feat(scene): detach a driven part and map dimensions back to carcase parameters"
```

## Task 6.2: The inline detach prompt

**Files:**
- Modify: `src/ui/EditPanel.tsx`
- Test: `src/ui/EditPanel.test.tsx` (create if absent)

Audit note (2026-08-20): `src/ui/DowelCutsPanel.tsx` also consumes `onUpdate`. It edits dowel cuts,
not board dimensions, so the detach prompt does not apply to it — but if `onUpdate`'s signature
changes rather than just its behaviour, that file is a call site.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('driven part editing', () => {
  it('offers both outcomes when the dimension maps to a parameter', async () => {
    render(<EditPanel {...props} part={drivenLeftSide} parameterFor={() => 'depth'} />)
    await userEvent.clear(screen.getByLabelText('Length'))
    await userEvent.type(screen.getByLabelText('Length'), '600')
    expect(screen.getByRole('button', { name: 'Change the cabinet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Detach this part' })).toBeInTheDocument()
  })

  it('offers only detach when no parameter controls the dimension', async () => {
    render(<EditPanel {...props} part={drivenShelf} parameterFor={() => null} />)
    await userEvent.clear(screen.getByLabelText('Width'))
    await userEvent.type(screen.getByLabelText('Width'), '400')
    expect(screen.queryByRole('button', { name: 'Change the cabinet' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Detach this part' })).toBeInTheDocument()
  })

  it('shows no prompt at all for a detached part', async () => {
    render(<EditPanel {...props} part={{ ...drivenShelf, driven: false }} parameterFor={() => null} />)
    await userEvent.clear(screen.getByLabelText('Width'))
    await userEvent.type(screen.getByLabelText('Width'), '400')
    expect(screen.queryByRole('button', { name: 'Detach this part' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/ui/EditPanel.test.tsx -t 'driven part editing'`
Expected: FAIL — no such buttons.

- [ ] **Step 3: Implement**

Add props `parameterFor`, `onDetachPart`, `onUpdateComponent` to `EditPanel`. When the edited part has `driven === true`, do **not** apply the edit directly; hold the pending value in local state and render the strip beneath the field:

```tsx
{pending && (
  <div className="mt-1 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1.5 text-xs">
    <div className="mb-1.5 text-amber-200">
      {part.label} is driven by {ownerLabel}.
    </div>
    <div className="flex gap-1.5">
      {pending.param !== null && (
        <Button size="sm" variant="secondary" onClick={applyToCabinet}>
          Change the cabinet
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={detachAndApply}>
        Detach this part
      </Button>
    </div>
  </div>
)}
```

`applyToCabinet` calls `onUpdateComponent(part.parentId!, (c) => ({ ...c, params: { ...c.params!, [pending.param!]: pending.value } }))`. `detachAndApply` calls `onDetachPart(part.id)` then the existing `onUpdate` with the new dimension.

- [ ] **Step 4: Run to confirm pass, then commit**

Run: `pnpm vitest run src/ui/EditPanel.test.tsx`
Expected: PASS.

```bash
git add src/ui/EditPanel.tsx src/ui/EditPanel.test.tsx src/ui/sidebar.tsx src/App.tsx
git commit -m "feat(ui): inline change-the-cabinet or detach prompt on a driven dimension"
```

## Phase 6 verification

- [x] `pnpm typecheck && pnpm lint && pnpm test` — green (60 files, 975 passed, 10 skipped).
- [x] Change a driven Length → the panel offers "Change the cabinet" / "Detach this part" rather than writing the value (`EditPanel.test.tsx`), and the tree marks the detached part (`SceneTree.test.tsx`).
- [x] After detaching, change the cabinet Depth: the detached side keeps its own size; every other driven part follows. Covered end to end in a real browser by `e2e/carcase.spec.ts` — "a detached part keeps its own size when the cabinet changes".
- [x] Delete the cabinet: the detached side survives at top level; the driven parts are gone (`useScene.test.ts`, "leaves a detached part behind when its cabinet is deleted").

The manual `pnpm dev` walkthroughs were replaced by the automated equivalents above; the e2e is the one that matters, since both Phase 6 defects (see notes) were invisible to happy-dom.

---

# Phase 7 — The carcase emits real joints

**Outcome:** a dropped Base 600 reads as `12 / 12` on the joint checklist, and the checklist stays readable with six cabinets in the scene.

> **This phase was re-derived against the running generator on 2026-08-21, before implementation.** The original text asserted a joint table and a `12 / 12` count from reasoning alone; probing `regenerateComponents` + `buildJointChecklist` showed a Base 600 has **14** touching pairs, not 12, and that four of the table's rows were geometrically impossible. The corrected table, the two product decisions behind it, and the empirical pair lists are below. Do not re-derive them from the old text — it is gone.

**Scope note, stated because it will look like an omission:** this phase emits joint *geometry* for `jointMethod: 'dado-rabbet'` and `'finger'` only. `'dowel'`, `'butt-screw'` and `'confirmat'` are fastener methods whose geometry is hardware (dowel pins, screws, cam locks) — they emit no joints in this slice and the checklist correctly shows those pairs as open. Record this in the notes file when you implement it.

## Ground truth: what actually touches

Measured, not reasoned. Reproduce by regenerating a preset and running `boardsTouch` over every board pair.

| Cabinet | Parts | Touching pairs | Joints | Contact-only |
|---|---|---|---|---|
| Base 600 (toe kick, 1 shelf) | 7 | 14 | 12 | 2 |
| Wall 600 (no base, 1 shelf) | 6 | 11 | 10 | 1 |
| Base 600 + 1 divider | 9 | 20 | 16 | 4 |

**Two decisions taken with the user, 2026-08-21:**

1. **Contact pairs are declared, not jointed.** The toe kick's top edge meets the bottom panel's underside, and a shelf's (or divider's) rear edge meets the back panel's front face. Both touch; neither is joinery — a shelf stops at the back, it is not housed in it. The carcase declares these pairs deliberately unjointed and the checklist renders them muted as "no joint needed", excluded from the count. This is what makes `12 / 12` true rather than `12 / 14`.
2. **Finger joints go only at genuinely flush corners.** A corner is flush when the two panels' outer faces are coplanar. `left-side`/`right-side` × `top` always is. × `bottom` is flush only when `baseMode !== 'toe-kick'` — a toe kick insets the bottom to `z ∈ [toeKickHeight, toeKickHeight + T]` while the sides still run to the floor. So a wall unit gets four finger corners and a toe-kick base gets two; the rest stay dado. The suggestion engine already refuses to offer `finger` for the inset pairs, so this keeps the generator and the panel in agreement instead of emitting two joints the panel would never have proposed.

## The corrected joint table

`P(role)` is the part carrying that role. Every row is a dado unless the finger rule above replaces it.

| Housing | Housed | Why it is this way round |
|---|---|---|
| `left-side`, `right-side` | `bottom`, `top`, `back`, `toe-kick` | sides are the outer shell; everything lands in them |
| `left-side`, `right-side` | the bay-edge shelves only (see below) | |
| `bottom`, `top` | `back` | the back sits **on** the bottom (`z0 = floor + T`) and **under** the top (`z1 = H - T`), so they house it — **not** the other way round, which is what the original table said |
| `bottom`, `top` | every `divider-*` | a divider spans `bayZ0 → innerTop`, floor to ceiling of the bay. **It never touches a side**, so the original "sides house every divider" row is impossible |
| `divider-(b-1)` | shelves of bay `b`, at their `-x` edge | |
| `divider-b` | shelves of bay `b`, at their `+x` edge | |

**Shelves are housed in their bay's two edges, not in both sides.** `bayEdges = [T, ...dividers.flatMap(d => [W*d - T/2, W*d + T/2]), W - T]`. For bay `b` the left edge is `left-side` when `b === 0` and `divider-(b-1)` otherwise; the right edge is `right-side` in the last bay and `divider-b` otherwise. With no dividers there is one bay and every shelf is housed in both sides — which is why the original table looked right and was still wrong.

**Contact pairs (declared, never jointed):** `bottom`↔`toe-kick`, `back`↔ every `shelf-*-*`, `back`↔ every `divider-*`.

### The faces, and where they come from

`defaultDadoJoint` needs a `housingFace` and a `housedEnd`; `defaultFingerJoint` needs `endA` and `endB`. The original `JointDescriptor` carried neither — it had role names only, and would not have compiled against either creator. Faces are **board-local**, so they depend on the panel's `thicknessAxis`. From `orientedPanel`, carcase direction → board face:

| thicknessAxis | +x | +y | +z |
|---|---|---|---|
| `'z'` (bottom, top, shelves) | `+X` | `+Y` | `+Z` |
| `'x'` (sides, dividers) | `+Z` | `+X` | `+Y` |
| `'y'` (back, toe kick) | `+Y` | `+Z` | `+X` |

Negate the board face for a negative carcase direction. Applying that:

| Pair | housingFace | housedEnd |
|---|---|---|
| `left-side` houses a `'z'` panel (bottom/top/shelf) | `+Z` | `-X` |
| `left-side` houses a `'y'` panel (back/toe-kick) | `+Z` | `-Y` |
| `right-side` houses a `'z'` panel | `-Z` | `+X` |
| `right-side` houses a `'y'` panel | `-Z` | `+Y` |
| `bottom` houses `back` | `+Z` | `-X` |
| `top` houses `back` | `-Z` | `+X` |
| `bottom` houses a divider | `+Z` | `-Y` |
| `top` houses a divider | `-Z` | `+Y` |
| `divider` houses a shelf on its `-x` side | `-Z` | `+X` |
| `divider` houses a shelf on its `+x` side | `+Z` | `-X` |

Finger corners: `side.endA` is the side's own end at that corner — `+Y` at the top, `-Y` at the bottom (sides are `'x'`). `top.endB` / `bottom.endB` is `-X` for the left side and `+X` for the right.

**Do not trust this table either.** Step 1 below tests it against the parts' actual positions rather than against these letters; that test is the reason a fourth defect would be caught.

## Task 7.1: `carcaseJoints` and `carcaseContactPairs`

**Files:**
- Modify: `src/scene/carcaseRoles.ts`, `src/scene/carcaseRoles.test.ts`

- [ ] **Step 1: Write the failing tests**

The first test is the important one: it checks the emitted faces against geometry, so it fails if the face table above is wrong, rather than agreeing with it.

```ts
describe('carcaseJoints', () => {
  const base = CARCASE_PRESETS[0].params

  // Self-checking: a housing face must point *at* the part it houses, and the housed end must
  // point back. Asserting the letters from the table would only prove the table matches itself.
  it('points every joint face at the part it joins', () => {
    const roles = new Map(carcaseRoles(base).map((r) => [r.role, r.panel]))
    const centre = (s: PanelSpec) => /* box centre in carcase coords */
    for (const d of carcaseJoints(base, 'cmp_1')) {
      const housing = roles.get(d.housingRole)!
      const housed = roles.get(d.housedRole)!
      const toHoused = sub(centre(housed), centre(housing))
      expect(dot(faceDirInCarcase(housing, d.housingFace), toHoused)).toBeGreaterThan(0)
      expect(dot(faceDirInCarcase(housed, d.housedEnd), toHoused)).toBeLessThan(0)
    }
  })

  it('emits twelve joints and two contact pairs for a base cabinet', () => {
    expect(carcaseJoints(base, 'cmp_1')).toHaveLength(12)
    expect(carcaseContactPairs(base)).toHaveLength(2)
  })

  it('covers every touching pair exactly once, as either a joint or a contact pair', () => {
    // The completeness check. Regenerate the cabinet, find every pair boardsTouch reports, and
    // demand the union of joints and contact pairs equals it — no pair unaccounted for, none
    // invented for panels that do not meet. This is what catches a missing divider row.
  })

  it('houses dividers in the bottom and top, never in a side', () => {
    const withDivider = { ...base, dividers: [0.5] }
    const ds = carcaseJoints(withDivider, 'cmp_1').filter((d) => d.housedRole.startsWith('divider-'))
    expect(ds.map((d) => d.housingRole).sort()).toEqual(['bottom', 'top'])
  })

  it('houses each shelf in its own bay edges, not in both sides', () => {
    const withDivider = { ...base, dividers: [0.5] }
    const js = carcaseJoints(withDivider, 'cmp_1')
    const housingsOf = (role: string) =>
      js.filter((d) => d.housedRole === role).map((d) => d.housingRole).sort()
    expect(housingsOf('shelf-0-0')).toEqual(['divider-0', 'left-side'])
    expect(housingsOf('shelf-1-0')).toEqual(['divider-0', 'right-side'])
  })

  it('tags every joint with the owning component and marks it driven', () => {
    const joints = carcaseJoints(base, 'cmp_1')
    expect(joints.every((j) => j.sourceComponentId === 'cmp_1')).toBe(true)
    expect(joints.every((j) => j.driven)).toBe(true)
  })

  it('fingers only the flush corners: two on a toe-kick base, four on a wall unit', () => {
    const kick = carcaseJoints({ ...base, jointMethod: 'finger' }, 'cmp_1')
    expect(kick.filter((j) => j.kind === 'finger')).toHaveLength(2)
    const wall = carcaseJoints({ ...CARCASE_PRESETS[1].params, jointMethod: 'finger' }, 'cmp_1')
    expect(wall.filter((j) => j.kind === 'finger')).toHaveLength(4)
  })

  it('emits nothing for fastener methods', () => {
    for (const m of ['dowel', 'butt-screw', 'confirmat'] as const) {
      expect(carcaseJoints({ ...base, jointMethod: m }, 'cmp_1')).toEqual([])
    }
  })

  it('scales with shelf count', () => {
    const one = carcaseJoints(base, 'cmp_1').length
    const three = carcaseJoints({ ...base, fixedShelves: 3 }, 'cmp_1').length
    expect(three - one).toBe(4) // two extra shelves, each housed in both sides (no dividers)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t 'carcaseJoints'`
Expected: FAIL — `carcaseJoints is not a function`.

- [ ] **Step 3: Implement**

```ts
export interface JointDescriptor {
  kind: 'dado' | 'finger'
  housingRole: string
  housedRole: string
  housingFace: Face
  housedEnd: Face
  sourceComponentId: string
  driven: true
}
```

Descriptors are keyed by **role**, not part id, because part ids are only known after reconciliation. Both functions return `[]` when `validateCarcaseParams(p).length > 0`, matching `carcaseRoles`, so a transient invalid state emits nothing rather than garbage. `carcaseJoints` additionally returns `[]` for the three fastener methods; **`carcaseContactPairs` does not** — a shelf still merely abuts the back whatever holds the cabinet together.

Derive the bay edges with the same expression `carcaseRoles` uses (`bayEdges`), so a change to bay layout cannot desynchronise the two. Do not copy the literal — export it from a shared helper if that is what it takes.

- [ ] **Step 4: Run to confirm pass, then commit**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts`
Expected: PASS.

```bash
git add src/scene/carcaseRoles.ts src/scene/carcaseRoles.test.ts
git commit -m "feat(scene): carcaseJoints describes the joint set a carcase implies"
```

## Task 7.2: Materialise joints in `regenerateComponents`

**Files:**
- Modify: `src/scene/regenerateComponents.ts`, `src/scene/regenerateComponents.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('joint emission', () => {
  it('creates twelve driven joints for a base cabinet', () => {
    const out = regenerateComponents(baseScene)
    expect(out.joints.filter((j) => j.sourceComponentId === 'cmp_1')).toHaveLength(12)
  })

  it('keeps joint ids stable across a regeneration', () => {
    const first = regenerateComponents(baseScene)
    const before = first.joints.map((j) => j.id).sort()
    const second = regenerateComponents({
      ...first,
      components: [{ ...cabinet, params: { ...params, depth: 600 } }],
    })
    expect(second.joints.map((j) => j.id).sort()).toEqual(before)
  })

  it('removes joints whose roles the params no longer imply', () => {
    const first = regenerateComponents(baseScene)
    const second = regenerateComponents({
      ...first,
      components: [{ ...cabinet, params: { ...params, hasTop: false } }],
    })
    expect(second.joints.length).toBeLessThan(first.joints.length)
  })

  it('leaves hand-made joints alone', () => { /* as before */ })

  it('is idempotent over joints as well as parts', () => {
    const once = regenerateComponents(baseScene)
    expect(regenerateComponents(once)).toEqual(once)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/regenerateComponents.test.ts -t 'joint emission'`
Expected: FAIL — no joints emitted.

- [ ] **Step 3: Implement**

Extend `regenerateOne` to return `{ parts, joints }`, with a **deterministic id derived from the component and role pair** so stability needs no lookup:

```ts
const jointId = (componentId: string, d: JointDescriptor) =>
  `joint_${componentId}_${d.housingRole}__${d.housedRole}`
```

Build each joint through `defaultDadoJoint` / `defaultFingerJoint` in `src/scene/defaultJoint.ts` so parameter seeding stays in one place. Note their real signatures — both take the **reconciled `BoardPart`s**, the faces, then `id` and `label`; `defaultDadoJoint` also takes `byId: Map<ComponentId, Component>` because `computeDadoOffset` resolves world placement. Set `sourceComponentId` and override `driven: true` on the result (both creators hardcode `driven: false`). Skip a descriptor whose housing or housed part is missing from the reconciled list.

Label them `"Dado — Left Side / Bottom"` using the roles' `label` fields, not their keys.

Replace the component's previous driven joints wholesale:

```ts
  const ownedIds = new Set(
    scene.joints.filter((j) => j.sourceComponentId !== undefined).map((j) => j.id),
  )
  const joints = [...scene.joints.filter((j) => !ownedIds.has(j.id)), ...emitted]
```

**Pipeline order matters here.** `applyPipeline = reconcileJoints(regenerateComponents(scene))`, so the joints emitted in this step are handed straight to `reconcileJoints`, which derives their cut geometry. That is why the faces must be right: a wrong `housingFace` produces a groove on the outside of the cabinet, and nothing downstream will object.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run src/scene/regenerateComponents.test.ts`
Expected: PASS. If idempotence fails, the joint ids are not deterministic — check `jointId`.

- [ ] **Step 5: Commit**

```bash
git add src/scene/regenerateComponents.ts src/scene/regenerateComponents.test.ts
git commit -m "feat(scene): carcases emit driven joints with deterministic ids"
```

## Task 7.3: Contact rows and grouping by component

**Files:**
- Modify: `src/scene/jointChecklist.ts`, `src/ui/SceneSuggestionsPanel.tsx`
- Test: `src/scene/jointChecklist.test.ts`

**The signature does not change.** The original plan said `buildJointChecklist` takes two arguments and proposed widening it to `(parts, joints, components)`. It already takes four — `(parts, joints, suggestions, byId)` — and dropping `suggestions` would strip every row's `options`. `byId` already carries the components, and parts carry `role` and `parentId`, so contact pairs and groups both resolve from what is in hand.

- [ ] **Step 1: Write the failing tests**

```ts
describe('contact rows', () => {
  it('marks a shelf against the back as contact, not open', () => {
    const row = rowFor('back', 'shelf-0-0')
    expect(row.state).toBe('contact')
  })

  it('leaves a fully jointed base cabinet reading 12 / 12', () => {
    const cl = buildJointChecklist(parts, joints, sugg, byId)
    expect(cl.jointedCount).toBe(12)
    expect(cl.actionableTotal).toBe(12)
  })

  it('still marks contact pairs when the cabinet uses a fastener method', () => {
    // carcaseContactPairs ignores jointMethod: the shelf abuts the back either way.
  })
})

describe('checklist grouping by component', () => {
  it('groups rows whose both parts belong to the same component', () => { /* 12 rows under cmp_1 */ })
  it('reports a fully jointed group as complete', () => { /* complete === true, jointedCount === rows.length */ })
  it('keeps a cross-component pair at top level, not inside either group', () => { /* two cabinets touching at x = 600 */ })
  it('keeps a loose part pair at top level', () => { /* groups empty, one ungrouped row */ })
})
```

Build fixtures by calling `regenerateComponents` on a real preset — never by hand-writing parts. A hand-written fixture is how the original `12` survived this long.

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts -t 'contact rows'`
Expected: FAIL — no `contact` state, no `groups`.

- [ ] **Step 3: Implement**

Add `'contact'` to `PairState` and a `contact: ChecklistRow[]` bucket beside `unresolved`. A pair is contact when both parts share a carcase parent and their `{role, role}` pair is in that carcase's `carcaseContactPairs`. Classify **before** the `groups.get(key)` lookup, so a contact pair never becomes an open row. Contact rows are excluded from `actionableTotal` and `jointedCount` — that exclusion is what makes `12 / 12` true.

Do **not** reuse `'no-offer'`. It means "the engine has nothing to propose"; here the engine proposes a dado and the carcase declines it. Rendering them the same would be a lie the muted styling hides.

Then add grouping:

```ts
export interface ChecklistGroup {
  componentId: ComponentId
  label: string
  rows: ChecklistRow[]
  jointedCount: number
  complete: boolean
}
```

A row belongs to a group when **both** parts resolve to the same nearest component ancestor (`ancestorsOf(...)[0]`). Everything else — cross-component pairs and loose parts — stays in `rows`. Keep the existing distance ordering within each bucket, and keep `MAX_ACTIONABLE_ROWS` / `MAX_NOOFFER_ROWS` applying to the ungrouped rows and `unresolved`; a complete group is one collapsed line, so it does not consume that budget.

In `SceneSuggestionsPanel.tsx`, render each group as a `Collapsible`, **defaulted closed when `complete`** and open otherwise, header `✓ Base 600 — 12 / 12`.

- [ ] **Step 4: Run to confirm pass, then full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/scene/jointChecklist.ts src/scene/jointChecklist.test.ts src/ui/SceneSuggestionsPanel.tsx
git commit -m "feat(scene): contact rows and per-component joint checklist groups"
```

## Phase 7 verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green.
- [ ] Base 600 reads `✓ Base 600 — 12 / 12` as one collapsed line, with two muted "no joint needed" rows for the kick-to-bottom and shelf-to-back pairs.
- [ ] Wall 600 reads `10 / 10`; Base 600 with one divider reads `16 / 16`. These three numbers are the measured pair counts minus the contact pairs — if any disagrees, the joint table is wrong, not the number.
- [ ] Six cabinets show six collapsed lines, not ~72 rows.
- [ ] Two loose touching boards appear at top level, not inside any cabinet group.
- [ ] Switch a Base 600 to **Finger**: two corner joints change kind (the top pair), the bottom pair stays dado, and the viewport shows meshing fingers. A Wall 600 changes all four.
- [ ] Switch to **Dowel**: the group drops to `0 / 12` open, contact rows unchanged — the documented, intended behaviour for fastener methods.

---

# Phase 8 — Shelf-pin hole arrays

**Outcome:** adjustable shelving works, and it does not make the app slow. The performance argument is the whole reason this is a new cut kind rather than N box cuts.

## Task 8.1: The `HoleArrayCut` type and `shapeKey`

**Files:**
- Modify: `src/scene/types.ts`, `src/scene/utils.ts`
- Test: `src/scene/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/utils.test.ts`:

```ts
describe('shapeKey with hole arrays', () => {
  const holeArray: HoleArrayCut = {
    kind: 'hole-array',
    id: 'h1',
    label: 'Shelf pins L',
    face: '+X',
    axis: 'V',
    start: { x: 0, y: 37, z: 200 },
    pitch: 32,
    count: 10,
    diameter: 5,
    depth: 12,
  }

  it('encodes a hole array', () => {
    const part = { ...board, cuts: [holeArray] }
    expect(shapeKey(part)).toContain('h:')
  })

  it('changes when the hole count changes', () => {
    const a = shapeKey({ ...board, cuts: [holeArray] })
    const b = shapeKey({ ...board, cuts: [{ ...holeArray, count: 11 }] })
    expect(a).not.toBe(b)
  })

  it('changes when the pitch changes', () => {
    const a = shapeKey({ ...board, cuts: [holeArray] })
    const b = shapeKey({ ...board, cuts: [{ ...holeArray, pitch: 25 }] })
    expect(a).not.toBe(b)
  })

  it('is stable across repeated calls', () => {
    expect(shapeKey({ ...board, cuts: [holeArray] })).toBe(shapeKey({ ...board, cuts: [holeArray] }))
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/utils.test.ts -t 'hole arrays'`
Expected: FAIL — type error on `kind: 'hole-array'`.

- [ ] **Step 3: Implement**

In `src/scene/types.ts`, add the interface and widen `CutDef`:

```ts
export interface HoleArrayCut {
  kind: 'hole-array'
  id: CutId
  label: string
  face: Face // which face the holes are drilled into
  axis: 'U' | 'V' // which of that face's two axes the row runs along
  start: Vec3 // first hole centre, part-local
  pitch: number // mm between hole centres
  count: number
  diameter: number
  depth: number
  sourceComponentId?: string // hole arrays are component-owned, never joint-owned
}

export type CutDef = BoxCut | MitreCut | HoleArrayCut
```

In `src/scene/utils.ts`, add the branch to the board cut mapper:

```ts
        c.kind === 'box'
          ? `b:${c.position.x},${c.position.y},${c.position.z}|${c.size.x},${c.size.y},${c.size.z}`
          : c.kind === 'hole-array'
            ? `h:${c.face}|${c.axis}|${c.start.x},${c.start.y},${c.start.z}|${c.pitch}|${c.count}|${c.diameter}|${c.depth}`
            : `m:${c.end}|${c.axis}|${c.angle}`,
```

- [ ] **Step 4: Enumerate every discrimination site — do NOT rely on the compiler**

**Audit finding, 2026-08-20.** The original wording of this step assumed `pnpm typecheck` would flag
every site that discriminates on `CutDef`. **It will not.** Two shapes exist in this codebase and only
one of them errors:

| Shape | Example | Compiler catches a new member? |
|---|---|---|
| Property access in an `else` branch | `src/scene/utils.ts:9-11` — `c.kind === 'box' ? … : \`m:${c.end}…\`` | **Yes** — `c.end` does not exist on `HoleArrayCut` |
| `filter` with a type predicate | `src/geom/drawing.ts:261-262` — `p.cuts.filter((c): c is BoxCut => c.kind === 'box')` | **No** — hole arrays are silently dropped from both lists |

The second shape is the dangerous one: it compiles clean, and the symptom is a hole array that simply
never appears in a shop drawing, with nothing to indicate why. Relying on the compiler here would have
shipped that.

So enumerate explicitly first:

Run: `grep -rn "'box'\|'mitre'" src/ --include=*.ts --include=*.tsx | grep -v '\.test\.'`

Expected: 15 production files. Most only *construct* cuts (`kind: 'box'`), which a widened union does
not affect. Triage each hit into construct / discriminate-by-property / discriminate-by-filter, and
list the result in your report. Then run `pnpm typecheck` and treat its output as a **subset** of the
work, never the whole of it.

For each discrimination site, add an explicit `'hole-array'` branch — `continue`, `null`, or an empty
list as appropriate — and leave a `// handled in Task 8.x` marker where a later step owns the real
behaviour. Never let a hole array fall into a `mitre` branch by default.

- [ ] **Step 5: Run to confirm pass and commit**

Run: `pnpm vitest run src/scene/utils.test.ts && pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/scene/types.ts src/scene/utils.ts src/scene/utils.test.ts src/
git commit -m "feat(types): hole-array cut kind with shapeKey encoding"
```

## Task 8.2: One boolean per hole array in the kernel

**Files:**
- Modify: `src/geom/occt.ts`
- Test: `e2e/geom-kernel.spec.ts` (live OCCT belongs in Playwright, never Vitest)

- [ ] **Step 1: Write the failing e2e assertion**

Append to `e2e/geom-kernel.spec.ts`, following the file's existing in-page evaluation pattern:

```ts
test('a hole array removes material and stays one boolean operation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { initOCCT, makeShape } = await import('/src/geom/occt.ts')
    const oc = await initOCCT()
    const plain = makeShape(oc, { length: 600, width: 560, thickness: 18, cuts: [] })
    const drilled = makeShape(oc, {
      length: 600,
      width: 560,
      thickness: 18,
      cuts: [
        {
          kind: 'hole-array',
          id: 'h1',
          label: 'pins',
          face: '+Z',
          axis: 'U',
          start: { x: 50, y: 37, z: 18 },
          pitch: 32,
          count: 10,
          diameter: 5,
          depth: 12,
        },
      ],
    })
    const vol = (s: unknown) => {
      const props = new oc.GProp_GProps_1()
      oc.BRepGProp.VolumeProperties_1(s, props, false, false, false)
      const v = props.Mass()
      props.delete()
      return v
    }
    return { plain: vol(plain), drilled: vol(drilled) }
  })

  expect(result.drilled).toBeLessThan(result.plain)
  // ten 5 mm holes, 12 mm deep ≈ 10 · π · 2.5² · 12 ≈ 2356 mm³
  expect(result.plain - result.drilled).toBeGreaterThan(2000)
  expect(result.plain - result.drilled).toBeLessThan(2700)
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e e2e/geom-kernel.spec.ts`
Expected: FAIL — volumes are equal, because `makeShape` currently skips `'hole-array'`.

- [ ] **Step 3: Implement**

Add to `src/geom/occt.ts`:

```ts
// One boolean, not N. A 720 mm side at 32 mm pitch is ~20 holes; two rows per side across six
// cabinets is ~480 subtractions if each hole is its own operation. Compounding the cylinders first
// turns that into one BRepAlgoAPI_Cut per array.
export function makeHoleArrayCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  dims: { length: number; width: number; thickness: number },
  cut: HoleArrayCut,
): TopoDS_Shape {
  if (cut.count <= 0 || cut.diameter <= 0 || cut.depth <= 0) return shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any

  const { axis: drillAxis, sign } = faceDrillAxis(cut.face) // '+Z' → { axis: 'z', sign: -1 }
  const step = stepVector(cut.face, cut.axis, cut.pitch) // unit step in part-local space

  const builder = new O.BRep_Builder()
  const compound = new O.TopoDS_Compound()
  builder.MakeCompound(compound)

  for (let i = 0; i < cut.count; i++) {
    const cx = cut.start.x + step.x * i
    const cy = cut.start.y + step.y * i
    const cz = cut.start.z + step.z * i
    const axisDir = new O.gp_Dir_4(
      drillAxis === 'x' ? sign : 0,
      drillAxis === 'y' ? sign : 0,
      drillAxis === 'z' ? sign : 0,
    )
    const origin = new O.gp_Pnt_3(cx, cy, cz)
    const ax2 = new O.gp_Ax2_3(origin, axisDir)
    const cyl = new O.BRepPrimAPI_MakeCylinder_3(ax2, cut.diameter / 2, cut.depth)
    builder.Add(compound, cyl.Shape())
    cyl.delete()
    ax2.delete()
    origin.delete()
    axisDir.delete()
  }

  const op = new O.BRepAlgoAPI_Cut_3(shape, compound, new O.Message_ProgressRange_1())
  op.Build(new O.Message_ProgressRange_1())
  if (!op.IsDone()) {
    console.warn('makeHoleArrayCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    op.delete()
    return shape
  }
  const out = op.Shape()
  op.delete()
  return out
}
```

Add both helpers in the same file. They are written out here rather than delegated to `faceAxes` in `src/scene/snapMath.ts`, because that function returns THREE-typed axes for a different purpose; duplicating six lines is cheaper than widening it, and the duplication is bounded by a total function over six faces:

```ts
// A face's inward drilling direction: the hole is bored INTO the part, so the sign is opposite
// the outward face normal.
function faceDrillAxis(face: Face): { axis: 'x' | 'y' | 'z'; sign: 1 | -1 } {
  switch (face) {
    case '+X':
      return { axis: 'x', sign: -1 }
    case '-X':
      return { axis: 'x', sign: 1 }
    case '+Y':
      return { axis: 'y', sign: -1 }
    case '-Y':
      return { axis: 'y', sign: 1 }
    case '+Z':
      return { axis: 'z', sign: -1 }
    case '-Z':
      return { axis: 'z', sign: 1 }
  }
}

// The in-face axis a row of holes marches along. U is the first non-normal axis in x,y,z order;
// V is the second.
function stepVector(face: Face, rowAxis: 'U' | 'V', pitch: number): Vec3 {
  const normal = faceDrillAxis(face).axis
  const inFace = (['x', 'y', 'z'] as const).filter((a) => a !== normal)
  const axis = rowAxis === 'U' ? inFace[0] : inFace[1]
  return { x: axis === 'x' ? pitch : 0, y: axis === 'y' ? pitch : 0, z: axis === 'z' ? pitch : 0 }
}
```

Wire it into `makeShape`'s cut loop, replacing the temporary `continue` from Task 8.1:

```ts
    } else if (cut.kind === 'hole-array') {
      current = makeHoleArrayCut(oc, current, dims, cut)
    } else {
```

- [ ] **Step 4: Run to confirm pass**

Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e e2e/geom-kernel.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geom/occt.ts e2e/geom-kernel.spec.ts
git commit -m "feat(geom): drill a hole array as one boolean against a cylinder compound"
```

## Task 8.3: The carcase emits shelf-pin rows

**Files:**
- Modify: `src/scene/carcaseRoles.ts`, `src/scene/carcaseRoles.test.ts`, `src/scene/regenerateComponents.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('shelf-pin hole arrays', () => {
  it('puts two rows on each side panel', () => {
    const cuts = carcaseHoleArrays(base, 'left-side')
    expect(cuts).toHaveLength(2)
    expect(cuts.every((c) => c.kind === 'hole-array')).toBe(true)
  })

  it('honours the configured count and pitch', () => {
    const [row] = carcaseHoleArrays(base, 'left-side')
    expect(row.count).toBe(10)
    expect(row.pitch).toBe(32)
  })

  it('emits nothing when the adjustable count is zero', () => {
    expect(carcaseHoleArrays({ ...base, adjustableShelves: { ...base.adjustableShelves, count: 0 } }, 'left-side')).toEqual([])
  })

  it('emits nothing for a role that is not a side or divider', () => {
    expect(carcaseHoleArrays(base, 'bottom')).toEqual([])
  })

  it('drills no deeper than the panel is thick', () => {
    for (const c of carcaseHoleArrays(base, 'left-side')) {
      expect(c.depth).toBeLessThan(base.thickness)
    }
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t 'shelf-pin'`
Expected: FAIL — `carcaseHoleArrays is not a function`.

- [ ] **Step 3: Implement**

```ts
const PIN_DIAMETER = 5

export function carcaseHoleArrays(p: CarcaseParams, role: string): HoleArrayCut[] {
  const a = p.adjustableShelves
  if (a.count <= 0) return []
  if (role !== 'left-side' && role !== 'right-side' && !role.startsWith('divider-')) return []

  // Two thirds of the panel thickness: deep enough to seat a pin, never a through hole.
  const depth = Math.min(12, (p.thickness * 2) / 3)
  const face: Face = role === 'left-side' ? '+X' : '-X'

  return Array.from({ length: a.rows }, (_, r) => ({
    kind: 'hole-array' as const,
    id: `holes_${role}_${r}`,
    label: `Shelf pins ${r + 1}`,
    face,
    axis: 'V' as const,
    start: {
      x: 0,
      y: r === 0 ? a.setback : p.depth - a.setback,
      z: a.startHeight,
    },
    pitch: a.pitch,
    count: a.count,
    diameter: PIN_DIAMETER,
    depth,
  }))
}
```

In `regenerateComponents.ts`, attach the arrays to each generated part's `cuts`, tagged with `sourceComponentId`, alongside the joint-derived cuts the part already carries.

- [ ] **Step 4: Run to confirm pass and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/scene/carcaseRoles.ts src/scene/carcaseRoles.test.ts src/scene/regenerateComponents.ts
git commit -m "feat(scene): carcases drill shelf-pin rows into sides and dividers"
```

## Task 8.4: Hole arrays in shop drawings

**Files:**
- Modify: `src/geom/drawing.ts`, `src/ui/buildSvg.ts`, `src/ui/buildDxf.ts`
- Test: `src/geom/drawing.test.ts`, `src/ui/buildSvg.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// A side panel carrying one 10-hole pin row, built from the generator so the geometry is real.
const sideWithPins = regenerateComponents({
  parts: [],
  materials: {},
  hardware: [],
  joints: [],
  components: [
    {
      id: 'cmp_1',
      kind: 'carcase',
      label: 'Base 600',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params: { ...CARCASE_PRESETS[0].params, adjustableShelves: { rows: 1, pitch: 32, setback: 37, startHeight: 200, count: 10 } },
    },
  ],
}).parts.find((p) => p.role === 'left-side')! as BoardPart

it('projects a hole array as one circle per hole in the face view', () => {
  const sheet = buildDrawingSheet(sideWithPins)
  const face = sheet.views.find((v) => v.name === 'Face')!
  expect(face.circles).toHaveLength(10)
  expect(face.circles[0].r).toBeCloseTo(2.5, 6)
})

it('spaces the projected circles by the pitch', () => {
  const face = buildDrawingSheet(sideWithPins).views.find((v) => v.name === 'Face')!
  const gap = Math.abs(face.circles[1].cy - face.circles[0].cy)
  expect(gap).toBeCloseTo(32, 6)
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/geom/drawing.test.ts -t 'hole array'`
Expected: FAIL — `face.circles` is undefined.

- [ ] **Step 3: Implement**

Add `circles: { cx: number; cy: number; r: number }[]` to `DrawingView`, populated from every `hole-array` cut on the part, projected into each view's plane. In `buildSvg.ts` emit `<circle>`; in `buildDxf.ts` emit `CIRCLE` entities. Replace the temporary `'hole-array'` skip added in Task 8.1.

- [ ] **Step 4: Run to confirm pass and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/geom/drawing.ts src/geom/drawing.test.ts src/ui/buildSvg.ts src/ui/buildSvg.test.ts src/ui/buildDxf.ts
git commit -m "feat(drawing): render shelf-pin hole arrays in views and exports"
```

## Phase 8 verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green.
- [ ] `PW_CHROMIUM_EXECUTABLE=… pnpm test:e2e` — all specs pass, including the new kernel volume check.
- [ ] `pnpm dev`: drop Base 600, set adjustable shelf count to 20. Hole rows appear on both sides. **Dragging the count field feels responsive** — if it does not, confirm `makeHoleArrayCut` is being reached once per array, not once per hole, by adding a temporary counter.
- [ ] Open shop drawings for a side panel: the pin rows render as circles at 32 mm spacing.
- [ ] `grep -c 'BRepAlgoAPI_Cut' src/geom/occt.ts` — the hole-array path contributes exactly one.

---

# Phase 9 — Cabinets in the cutting list

**Outcome:** the fabricator gets parts grouped by the cabinet they belong to.

## Task 9.1: Component column in `groupParts`

**Files:**
- Modify: `src/ui/buildCsv.ts`, `src/ui/CuttingList.tsx`, `src/ui/BomModal.tsx` (audit 2026-08-20: `BomModal` also calls `groupParts` and was missed in the original list)
- Test: `src/ui/buildCsv.test.ts`, `src/ui/CuttingList.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// Fixtures, built from the generator so ownership is genuine rather than hand-stitched.
import { regenerateComponents } from '../scene/regenerateComponents'
import { CARCASE_PRESETS } from '../scene/carcasePresets'
import type { Component } from '../scene/types'

function makeCarcase(id: string, label: string, x: number): Component {
  return {
    id,
    kind: 'carcase',
    label,
    parentId: null,
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: CARCASE_PRESETS[0].params,
  }
}

const one = regenerateComponents({
  parts: [],
  materials: {},
  hardware: [],
  joints: [],
  components: [makeCarcase('cmp_1', 'Base Cabinet 600', 0)],
})
const parts = one.parts
const components = one.components
const cabinet = components[0]

const two = regenerateComponents({
  parts: [],
  materials: {},
  hardware: [],
  joints: [],
  components: [makeCarcase('cmp_1', 'Cab A', 0), makeCarcase('cmp_2', 'Cab B', 700)],
})
const twoCabinets = two.components
// Both cabinets' left sides: identical dimensions, different owners.
const twoIdenticalSidesInDifferentCabinets = two.parts.filter((p) => p.role === 'left-side')
// Both sides of one cabinet are the same size, so they merge.
const twoIdenticalSidesInOneCabinet = parts.filter(
  (p) => p.role === 'left-side' || p.role === 'right-side',
)
const looseBoard = { ...parts[0], id: 'loose', parentId: null, driven: false, role: undefined }

describe('grouping by component', () => {
  it('labels each row with its owning cabinet', () => {
    const rows = groupParts(parts, components)
    expect(rows[0].component).toBe('Base Cabinet 600')
  })

  it('labels a top-level part with an empty component', () => {
    const rows = groupParts([looseBoard], [])
    expect(rows[0].component).toBe('')
  })

  it('does not merge identical parts from different cabinets into one row', () => {
    const rows = groupParts(twoIdenticalSidesInDifferentCabinets, twoCabinets)
    expect(rows).toHaveLength(2)
  })

  it('still merges identical parts within one cabinet', () => {
    const rows = groupParts(twoIdenticalSidesInOneCabinet, [cabinet])
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(2)
  })

  it('puts the component first in the CSV header', () => {
    expect(buildCuttingListCsv(groupParts(parts, components)).split('\n')[0]).toMatch(/^Cabinet,/)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/ui/buildCsv.test.ts -t 'grouping by component'`
Expected: FAIL — `groupParts` takes one argument.

- [ ] **Step 3: Implement**

Widen `groupParts(parts, components)`; resolve each part's nearest component ancestor via `ancestorsOf` and add its label to the grouping key **and** to the row as `component: string`. Add a `Cabinet` column to `CuttingList.tsx` and make it the first CSV column.

- [ ] **Step 4: Run to confirm pass and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/ui/buildCsv.ts src/ui/buildCsv.test.ts src/ui/CuttingList.tsx src/ui/CuttingList.test.tsx
git commit -m "feat(bom): group the cutting list by owning cabinet"
```

## Task 9.2: Hardware links to a component

**Files:**
- Modify: `src/scene/types.ts`, `src/ui/HardwareEditPanel.tsx`
- Test: `src/ui/HardwareEditPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('links a hardware item to a component', async () => {
  const onChange = vi.fn()
  render(<HardwareEditPanel {...props} components={[cabinet]} onChange={onChange} />)
  await userEvent.click(screen.getByLabelText('Base Cabinet 600'))
  expect(onChange.mock.calls.at(-1)![0].linkedComponentIds).toEqual(['cmp_1'])
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run src/ui/HardwareEditPanel.test.tsx -t 'links a hardware item to a component'`
Expected: FAIL — no such checkbox.

- [ ] **Step 3: Implement**

Add `linkedComponentIds: string[]` to `HardwareItem`; default it to `[]` in `parseFile`'s hardware mapper (no version bump needed — v11 already covers this release). Render a component checkbox list beside the existing part list in `HardwareEditPanel`.

- [ ] **Step 4: Run to confirm pass and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/scene/types.ts src/scene/useFile.ts src/ui/HardwareEditPanel.tsx src/ui/HardwareEditPanel.test.tsx
git commit -m "feat(bom): hardware items link to cabinets as well as parts"
```

## Phase 9 verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green.
- [ ] `pnpm dev`, drop two Base 600 cabinets, open the BOM: rows are grouped per cabinet and identical parts from *different* cabinets are not merged.
- [ ] Download the CSV; the first column is `Cabinet` and every generated part names its cabinet.

---

# Phase 10 — Re-baseline the documentation, and measure

**Outcome:** the docs describe the software that now exists, and there is a number for how long a rebuild takes.

## Task 10.1: The standing end-to-end proof

**Files:**
- Create: `e2e/carcase.spec.ts`

This is Workflow C in one spec, and it is the test a regression in any of Phases 4–8 must fail.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test'

test('a cabinet regenerates on a depth change and leaves a detached part alone', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '+ Cabinet' }).click()
  await page.getByRole('menuitem', { name: 'Base 600' }).click()

  // Seven driven parts, and the joint checklist reads complete.
  await expect(page.getByTestId('node-cmp-part')).toHaveCount(7)
  await expect(page.getByText(/Base 600 — 12 \/ 12/)).toBeVisible()

  // Detach the shelf by giving it a width no parameter controls.
  await page.getByText('Shelf 1').click()
  const width = page.getByLabelText('Width')
  await width.fill('400')
  await page.getByRole('button', { name: 'Detach this part' }).click()
  await expect(page.getByTestId('node-shelf-0-0')).toHaveAttribute('data-driven', 'false')

  // Workflow C: change the cabinet depth two days before docs are due.
  await page.getByText('Base 600').click()
  await page.getByLabelText('Depth').fill('600')

  // Driven parts follow; the detached one does not.
  await page.getByText('Left Side').click()
  await expect(page.getByLabelText('Length')).toHaveValue('600')
  await page.getByText('Shelf 1').click()
  await expect(page.getByLabelText('Width')).toHaveValue('400')
})
```

- [ ] **Step 2: Run it and confirm it passes**

Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e e2e/carcase.spec.ts`
Expected: PASS. Add the `data-testid` attributes the spec needs if they are missing rather than loosening the selectors.

- [ ] **Step 3: Prove the spec bites**

Temporarily change `regenerateComponents.ts` so a detached part is regenerated like any other (drop the `!existing.driven` guard). Re-run.
Expected: FAIL at the final assertion — the shelf width snaps back. **Revert the change and confirm green again.** A test that cannot fail is not coverage; this step is what makes it coverage.

- [ ] **Step 4: Commit**

```bash
git add e2e/carcase.spec.ts src/
git commit -m "test(e2e): pin cabinet regeneration and detach against the live app"
```

## Task 10.2: WASM performance baseline

**Files:**
- Modify: `src/scene/useScene.ts`, `src/geom/occt.worker.ts`

This closes the Phase 0.5 item the strategic plan has carried as pending since June 2026, and it is what tells you whether this feature made rebuilds slower.

- [ ] **Step 1: Instrument the worker**

In `occt.worker.ts`'s `buildPart`, wrap the body:

```ts
    const t0 = performance.now()
    // … existing build …
    const ms = performance.now() - t0
    if (import.meta.env.DEV) console.debug(`zimmu: buildPart ${spec.kind} ${ms.toFixed(1)}ms`)
```

- [ ] **Step 2: Record the numbers**

Run: `pnpm dev`, open the console, and record in the notes file:

- cold `initOCCT` time
- `buildPart` for a plain 600×560×18 panel
- `buildPart` for the same panel with two 20-hole arrays
- total wall time to drop one Base 600 (7 parts)
- total wall time to change its depth by 40 mm
- the same for a scene of six cabinets

- [ ] **Step 3: Commit**

```bash
git add src/geom/occt.worker.ts docs/superpowers/notes/2026-08-18-cabinet-assembly-notes.md
git commit -m "chore(geom): instrument buildPart and record the first WASM baseline"
```

## Task 10.3: Re-baseline the docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `project-structure.html`, `joinery_3d_software_plan.md`

- [ ] **Step 1: Fix the drift found before this work started**

Every one of these is currently wrong:

- `README.md` and `joinery_3d_software_plan.md` say `FILE_FORMAT_VERSION = 2`. It is now **11**.
- Both say "374 tests across 25 files". Get the real number from `pnpm test` and `find src e2e -name '*.test.ts*' -o -name '*.spec.ts' | wc -l`.
- `CLAUDE.md`'s architecture tree predates the joint engine, the suggestion engine and the checklist, and describes `Scene` as parts + materials + hardware. It now has `joints` **and** `components`.

- [ ] **Step 2: Document the new architecture**

Add to `CLAUDE.md`: the `src/scene/` entries for `componentTree.ts`, `carcaseRoles.ts`, `regenerateComponents.ts`, `carcasePresets.ts`; the `src/ui/` entries for `SceneTree.tsx`, `CarcasePanel.tsx`, `EditPanel.tsx`. Add a **Key Invariants** entry:

> - **The regeneration pipeline order is fixed.** `regenerateComponents(scene)` runs before `reconcileJoints(scene)`, always, via `applyPipeline` in `useScene.ts`. Carcases emit parts and joints; `reconcileJoints` derives cuts and seats from those joints. Both stages are pure and idempotent.
> - **A detached part is the user's.** `driven: false` means no regeneration and no deletion — a parameter change, a role disappearing, and deleting the whole component all preserve it.
> - **`resolveWorldMatrix` is the single source of world placement.** For `parentId: null` it is byte-identical to `composeWorldMatrix`; never call `composeWorldMatrix` directly outside `transform.ts`.

- [ ] **Step 3: Regenerate the autogen blocks**

Run: `node scripts/update-structure-html.mjs`
Expected: the `AUTOGEN:src-tree`, `AUTOGEN:docs-tree`, `AUTOGEN:test-file-count` and `AUTOGEN:date` blocks in `project-structure.html` update. Then hand-edit its prose and data-flow diagrams to include the component tree.

- [ ] **Step 4: Update the strategic plan**

In `joinery_3d_software_plan.md`, update the "Current state" box, mark the Phase 0.5 WASM-baseline item done, and add a note under §17 Phase 1 that the browser prototype now carries the component model and parametric generator that Phase 1 and Phase 2 assign to the Rust build — which sharpens Open Question 9 rather than answering it.

- [ ] **Step 5: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && PW_CHROMIUM_EXECUTABLE=… pnpm test:e2e`

```bash
git add CLAUDE.md README.md project-structure.html joinery_3d_software_plan.md
git commit -m "docs: re-baseline for the component tree and clear the v2/374-test drift"
```

## Phase 10 verification

- [ ] Every check green: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`.
- [ ] `grep -rn 'FILE_FORMAT_VERSION = 2\|374 tests' README.md joinery_3d_software_plan.md CLAUDE.md` returns nothing.
- [ ] `grep -n 'composeWorldMatrix' src/ --include=*.ts --include=*.tsx -r | grep -v transform` returns only test files.
- [ ] `project-structure.html` lists every file created in this plan.
- [ ] The notes file carries the measured performance numbers.

---

# Whole-plan acceptance

Run all of these on the final branch before opening a PR:

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green.
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e` — all specs green, including `carcase.spec.ts`.
- [ ] `pnpm build` — production bundle succeeds.
- [ ] **Workflow C by hand:** drop Base 600, detach one shelf, change depth 560 → 600, confirm the driven parts follow and the shelf does not, undo four times back to an empty scene, redo forward again.
- [ ] **Round trip:** save, hard-reload, reopen. Tree, parameters, driven flags and detached parts all survive.
- [ ] **Backward compatibility:** open a `.zimmu` file saved before Phase 1. It loads flat, renders identically, and saves back as v11.
- [ ] `wc -l src/ui/sidebar.tsx` — under 400.
- [ ] The notes file has an entry for every place the implementation deviated from this plan.
