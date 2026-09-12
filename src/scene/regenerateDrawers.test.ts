import { describe, expect, it } from 'vitest'
import { regenerateDrawers } from './regenerateDrawers'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { splitSection } from './editSection'
import { setFrontOn } from './sectionInterior'
import type { Section } from './sectionTree'
import type { CarcaseParams, ComponentId, DrawerComponent, Scene } from './types'

const sceneOf = (params: CarcaseParams, components: DrawerComponent[] = []): Scene => ({
  parts: [],
  materials: { ...PRESET_MATERIALS },
  hardware: [],
  joints: [],
  components: [
    {
      kind: 'carcase',
      id: 'cmp_1' as ComponentId,
      label: 'Base A',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params,
    },
    ...components,
  ],
})

const drawersOf = (s: Scene): DrawerComponent[] =>
  s.components.filter((c): c is DrawerComponent => c.kind === 'drawer')

const childrenOf = (s: Section): Section[] => (s.content.kind === 'split' ? s.content.children : [])

const withParams = (s: Scene, params: CarcaseParams): Scene => ({
  ...s,
  components: s.components.map((c) => (c.kind === 'carcase' ? { ...c, params } : c)),
})

const BASE = CARCASE_PRESETS[0].params
const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const

const withFront = (front: Parameters<typeof setFrontOn>[2]): CarcaseParams => ({
  ...BASE,
  section: setFrontOn(BASE.section, BASE.section.id, front),
})

const oneDrawer = (): CarcaseParams => withFront({ kind: 'drawer-front' })

// Two bays side by side. Two bays are what distinguish "the opening that asked" from "the first
// opening" — a single-bay fixture cannot.
const twoBays = (
  left: Parameters<typeof setFrontOn>[2],
  right: Parameters<typeof setFrontOn>[2],
): CarcaseParams => {
  let section = splitSection(BASE.section, BASE.section.id, 'vertical', 'panel', 2)
  const kids = childrenOf(section)
  section = setFrontOn(section, kids[0].id, left)
  section = setFrontOn(section, kids[1].id, right)
  return { ...BASE, section }
}

// The same two sections, swapped so each keeps its id and changes its place.
const swapBays = (params: CarcaseParams): CarcaseParams => {
  const content = params.section.content
  if (content.kind !== 'split') throw new Error('fixture is not split')
  return {
    ...params,
    section: {
      ...params.section,
      content: { ...content, children: [...content.children].reverse() },
    },
  }
}

describe('regenerateDrawers — component reconciliation', () => {
  it('creates one drawer per drawer-front opening', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0].parentId).toBe('cmp_1')
    expect(drawersOf(out)[0].sectionId).toBe(BASE.section.id)
    expect(drawersOf(out)[0].driven).toBe(true)
  })

  it('creates none for a door and none for a panel', () => {
    expect(drawersOf(regenerateDrawers(sceneOf(withFront(DOOR))))).toHaveLength(0)
    expect(drawersOf(regenerateDrawers(sceneOf(withFront({ kind: 'panel' }))))).toHaveLength(0)
  })

  // Every fixture in this file arrives with a front on every leaf, so nothing else reaches the
  // `front?.` with nothing to read — and a bare opening is the ordinary one, not an edge case: a
  // user splits a section long before deciding what covers it.
  it('creates none for an opening that wears nothing at all', () => {
    const bare = { ...BASE, section: { ...BASE.section, front: undefined } }
    expect(drawersOf(regenerateDrawers(sceneOf(bare)))).toHaveLength(0)
  })

  it('names the opening that asked, not the first one', () => {
    // Drawer on the RIGHT bay: `sectionOpenings` orders bottom-left first, so the first opening is
    // the door. A fixture with the drawer on the left would pass whether or not the id is read.
    const params = twoBays(DOOR, { kind: 'drawer-front' })
    const right = childrenOf(params.section)[1]
    const out = regenerateDrawers(sceneOf(params))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0].sectionId).toBe(right.id)
  })

  it('gives two drawer-front openings one drawer each', () => {
    const params = twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })
    const ids = childrenOf(params.section).map((s) => s.id)
    const out = regenerateDrawers(sceneOf(params))
    expect(
      drawersOf(out)
        .map((d) => d.sectionId)
        .sort(),
    ).toEqual([...ids].sort())
  })

  it('is idempotent: a second pass returns the very same scene', () => {
    const empty = regenerateDrawers(sceneOf(withFront(DOOR)))
    expect(regenerateDrawers(empty)).toBe(empty)

    const once = regenerateDrawers(
      sceneOf(twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })),
    )
    expect(regenerateDrawers(once)).toBe(once)
  })

  it('preserves an existing driven drawer rather than replacing it', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const twice = regenerateDrawers(once)
    expect(drawersOf(twice)[0]).toBe(drawersOf(once)[0])
  })

  it('removes a drawer whose opening stopped wearing a drawer front', () => {
    const withDrawer = regenerateDrawers(sceneOf(oneDrawer()))
    expect(drawersOf(withDrawer)).toHaveLength(1)
    expect(drawersOf(regenerateDrawers(withParams(withDrawer, withFront(DOOR))))).toHaveLength(0)
  })

  // A detached drawer is the user's. The component-level mirror of the detached-part rule.
  it('keeps a detached drawer even when its opening is gone', () => {
    const withDrawer = regenerateDrawers(sceneOf(oneDrawer()))
    const detached = {
      ...withDrawer,
      components: withDrawer.components.map((c) =>
        c.kind === 'drawer' ? { ...c, driven: false } : c,
      ),
    }
    const out = regenerateDrawers(withParams(detached, withFront(DOOR)))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0].driven).toBe(false)
  })

  // The other half of the same rule, and the half that says `driven` is read on the way IN as well
  // as on the way out: regeneration must not reach into a detached drawer to satisfy an opening, or
  // the user's copy would be silently re-adopted and edited.
  it('does not let a detached drawer claim its opening', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const mine = { ...drawersOf(once)[0], driven: false }
    const out = regenerateDrawers(sceneOf(oneDrawer(), [mine]))
    expect(drawersOf(out)).toHaveLength(2)
    expect(drawersOf(out).filter((d) => d.driven)).toHaveLength(1)
    expect(drawersOf(out).find((d) => !d.driven)).toBe(mine)
  })

  it('follows the section id when a section changes position', () => {
    const params = twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })
    const [leftId, rightId] = childrenOf(params.section).map((s) => s.id)
    const once = regenerateDrawers(sceneOf(params))

    // Mark the right-hand bay's drawer so it can be told from the left-hand one by its parameters.
    const marked = {
      ...once,
      components: once.components.map((c) =>
        c.kind === 'drawer' && c.sectionId === rightId
          ? { ...c, params: { ...c.params, boxHeight: 111 } }
          : c,
      ),
    }
    const out = regenerateDrawers(withParams(marked, swapBays(params)))

    expect(
      drawersOf(out)
        .map((d) => d.sectionId)
        .sort(),
    ).toEqual([leftId, rightId].sort())
    expect(drawersOf(out).find((d) => d.sectionId === rightId)?.params.boxHeight).toBe(111)
    expect(drawersOf(out).find((d) => d.sectionId === leftId)?.params.boxHeight).toBeNull()
  })

  // Array order is what the scene tree shows — `SceneTree` lists a cabinet's children by filtering
  // `components` — so the drawers come back in the openings' own order, bottom-left first, the
  // order `sectionOpenings` states. This is also the one claim that separates the element-wise
  // "nothing changed" check from a set-wise one: after a swap the list holds the same two drawer
  // objects, so equal length plus mutual membership calls the stale order unchanged and returns it.
  it('relists the drawers in the openings’ order after a swap', () => {
    const params = twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })
    const [leftId, rightId] = childrenOf(params.section).map((s) => s.id)
    const once = regenerateDrawers(sceneOf(params))
    expect(drawersOf(once).map((d) => d.sectionId)).toEqual([leftId, rightId])

    const swapped = withParams(once, swapBays(params))
    const out = regenerateDrawers(swapped)
    expect(out).not.toBe(swapped)
    expect(drawersOf(out).map((d) => d.sectionId)).toEqual([rightId, leftId])
  })

  // `regenerateOne` preserves the last good parts rather than emptying a cabinet mid-keystroke; a
  // drawer carries per-drawer parameters, so deleting and recreating one would lose them for a
  // width of `6` typed on the way to `600`.
  it('keeps a cabinet’s drawers while its parameters do not resolve', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const out = regenerateDrawers(withParams(once, { ...oneDrawer(), width: 6 }))
    expect(drawersOf(out)[0]).toBe(drawersOf(once)[0])
  })
})
