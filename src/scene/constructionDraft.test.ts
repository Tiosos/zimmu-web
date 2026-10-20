import { expect, it } from 'vitest'
import { cabinet, partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS, DEFAULT_FRAME } from './carcasePresets'
import {
  constructionDraft,
  constructionCandidate,
  constructionErrors,
  constructionSummary,
} from './constructionDraft'
import { openingLayout } from './openingLayouts'
import { regenerateDrawers } from './regenerateDrawers'

it('round trips construction values and preserves the section, independent frame layout and unrelated settings', () => {
  const base = {
    ...cabinet.params,
    frame: {
      ...DEFAULT_FRAME,
      layout: {
        [cabinet.params.section.id]: {
          id: 'frame-zone',
          size: { kind: 'equal' as const },
          content: { kind: 'leaf' as const },
        },
      },
    },
    edgeMaterial: 'Tape',
  }
  const draft = constructionDraft(base)
  const next = constructionCandidate(base, { ...draft, width: '750', stileWidth: '45' }).params
  expect(next.width).toBe(750)
  expect(next.frame?.stileWidth).toBe(45)
  expect(next.frame?.layout).toBe(base.frame.layout)
  expect(next.section).toBe(base.section)
  expect(next.edgeMaterial).toBe('Tape')
  expect(constructionCandidate(cabinet.params, constructionDraft(cabinet.params)).params).toEqual(
    cabinet.params,
  )
})
it.each(['', 'NaN', 'Infinity', '-1', '0'])(
  'refuses invalid positive dimensions %s before resolving geometry',
  (value) => {
    const draft = { ...constructionDraft(cabinet.params), width: value }
    expect(constructionCandidate(cabinet.params, draft).errors.join()).toContain('width')
    expect(
      constructionErrors(cabinet.params, draft, PRESET_MATERIALS, [], cabinet.id, []).join(),
    ).toContain('width')
  },
)
it('checks non-negative settings and enabled frame members, ignoring inactive frame member draft text', () => {
  const draft = constructionDraft(cabinet.params)
  for (const key of ['toeKickHeight', 'toeKickSetback', 'frontReveal'] as const)
    expect(
      constructionCandidate(cabinet.params, { ...draft, [key]: '-1' }).errors.join(),
    ).toContain(key)
  expect(
    constructionCandidate(cabinet.params, { ...draft, toeKickHeight: '' }).errors.join(),
  ).toContain('toeKickHeight')
  expect(constructionCandidate(cabinet.params, { ...draft, stileWidth: '' }).errors).toEqual([])
  expect(
    constructionCandidate(cabinet.params, {
      ...draft,
      frameEnabled: true,
      stileWidth: '',
    }).errors.join(),
  ).toContain('stileWidth')
})
it('removes frames deliberately and validates half-overlay only when framed', () => {
  const base = { ...cabinet.params, frame: { ...DEFAULT_FRAME } }
  expect(
    constructionCandidate(base, { ...constructionDraft(base), frameEnabled: false }).params.frame,
  ).toBeUndefined()
  const draft = { ...constructionDraft(cabinet.params), frontMount: 'half-overlay' as const }
  expect(
    constructionErrors(cabinet.params, draft, PRESET_MATERIALS, [], cabinet.id, []).join(),
  ).toContain('face frame')
  expect(
    constructionErrors(
      cabinet.params,
      { ...draft, frameEnabled: true },
      PRESET_MATERIALS,
      [],
      cabinet.id,
      [],
    ),
  ).toEqual([])
})
it('resolves panel counts and effective materials using actual board overrides', () => {
  const parts = partsOfBase600().map((part) =>
    part.kind === 'board' && part.role === 'left-side'
      ? { ...part, overrides: { material: 'Custom', thickness: 25 } }
      : part,
  )
  const materials = { ...PRESET_MATERIALS, Custom: { thickness: 25 } }
  const before = constructionSummary(cabinet.params, materials, parts, cabinet.id)!
  expect(before.opening).toBe('557 × 584 mm')
  expect(before.materials.Custom).toBe(1)
  const changed = constructionSummary(
    { ...cabinet.params, hasTop: false, backMode: 'none' },
    materials,
    parts,
    cabinet.id,
  )!
  expect(changed.panels).toBe(before.panels - 2)
  expect(
    constructionSummary({ ...cabinet.params, width: 1 }, materials, parts, cabinet.id),
  ).toBeNull()
})
it('uses retained drawer settings when validating construction depth changes', () => {
  const p = openingLayout(cabinet.params, cabinet.params.section.id, 'drawers')
  const scene = regenerateDrawers({
    parts: [],
    materials: PRESET_MATERIALS,
    components: [{ ...cabinet, params: p }],
    joints: [],
    hardware: [],
  })
  const drawers = scene.components.filter((c) => c.kind === 'drawer')
  expect(
    constructionErrors(
      p,
      { ...constructionDraft(p), depth: '150' },
      PRESET_MATERIALS,
      scene.parts,
      cabinet.id,
      drawers,
    ).join(),
  ).toContain('drawer boxes do not fit')
  const invalid = drawers.map((drawer) => ({
    ...drawer,
    params: { ...drawer.params, boxHeight: 1 },
  }))
  expect(
    constructionErrors(
      p,
      constructionDraft(p),
      PRESET_MATERIALS,
      scene.parts,
      cabinet.id,
      invalid,
    ).join(),
  ).toContain('drawer boxes do not fit')
})
