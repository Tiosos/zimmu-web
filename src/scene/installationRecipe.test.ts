import { expect, it } from 'vitest'
import { installationFixture } from './__fixtures__/installation'
import { installationDraft, wallFillerDraft } from './roomInstallation'
import {
  installationDraftError,
  wallFillerDraftError,
  wallBindingError,
  installationRunError,
  installationsError,
  wallFillerLinkError,
  type InstallationDraft,
  type WallFillerDraft,
} from './installationRecipe'
const run = () => {
  const f = installationFixture()
  return installationDraft(f.project, f.scene)
}
const filler = () => {
  const f = installationFixture()
  return wallFillerDraft(f.project, f.scene)
}
it.each([
  [
    'missing name',
    (d: InstallationDraft) => {
      d.label = ''
    },
    'Choose',
  ],
  [
    'empty members',
    (d: InstallationDraft) => {
      d.memberIds = []
    },
    'distinct',
  ],
  [
    'duplicate members',
    (d: InstallationDraft) => {
      d.memberIds = ['a', 'a']
    },
    'distinct',
  ],
  [
    'too many members',
    (d: InstallationDraft) => {
      d.memberIds = Array.from({ length: 101 }, (_, i) => `c${i}`)
    },
    'distinct',
  ],
  [
    'invalid side',
    (d: InstallationDraft) => {
      d.side = 'bad' as 'left'
    },
    'alignment',
  ],
  [
    'invalid order',
    (d: InstallationDraft) => {
      d.direction = 'bad' as 'forward'
    },
    'alignment',
  ],
  [
    'invalid reference',
    (d: InstallationDraft) => {
      d.from = 'bad' as 'start'
    },
    'alignment',
  ],
  [
    'invalid elevation',
    (d: InstallationDraft) => {
      d.elevationMode = 'bad' as 'base'
    },
    'alignment',
  ],
  [
    'anchor choice',
    (d: InstallationDraft) => {
      d.detach = undefined!
    },
    'anchor',
  ],
  [
    'datum type',
    (d: InstallationDraft) => {
      d.datumLevelId = undefined!
    },
    'datum',
  ],
  [
    'ceiling type',
    (d: InstallationDraft) => {
      d.ceiling = undefined!
    },
    'ceiling',
  ],
  [
    'blank clearance',
    (d: InstallationDraft) => {
      d.rear = ''
    },
    'finite',
  ],
  [
    'not a number',
    (d: InstallationDraft) => {
      d.offset = 'NaN'
    },
    'finite',
  ],
  [
    'infinite coordinate',
    (d: InstallationDraft) => {
      d.offset = 'Infinity'
    },
    'finite',
  ],
  [
    'dimension bound',
    (d: InstallationDraft) => {
      d.gap = '100001'
    },
    '100000',
  ],
  [
    'negative clearance',
    (d: InstallationDraft) => {
      d.rear = '-1'
    },
    'negative',
  ],
  [
    'inverted ceiling',
    (d: InstallationDraft) => {
      d.ceiling = '0'
    },
    'above',
  ],
] as const)('rejects run %s', (_name, change, message) => {
  const d = run()
  change(d)
  expect(installationDraftError(d)).toEqual(expect.stringContaining(message))
})
it.each([
  [
    'missing cabinet',
    (d: WallFillerDraft) => {
      d.cabinetId = ''
    },
    'Choose',
  ],
  [
    'invalid side',
    (d: WallFillerDraft) => {
      d.side = 'bad' as 'left'
    },
    'settings',
  ],
  [
    'invalid thickness mode',
    (d: WallFillerDraft) => {
      d.thicknessMode = 'bad' as 'stock'
    },
    'settings',
  ],
  [
    'invalid height mode',
    (d: WallFillerDraft) => {
      d.heightMode = 'bad' as 'custom'
    },
    'settings',
  ],
  [
    'invalid grain',
    (d: WallFillerDraft) => {
      d.grain = 'bad' as 'free'
    },
    'settings',
  ],
  [
    'blank width',
    (d: WallFillerDraft) => {
      d.minimum = ''
    },
    'finite',
  ],
  [
    'zero minimum',
    (d: WallFillerDraft) => {
      d.minimum = '0'
    },
    'positive',
  ],
  [
    'inverted limits',
    (d: WallFillerDraft) => {
      d.maximum = '1'
    },
    'maximum',
  ],
  [
    'zero thickness',
    (d: WallFillerDraft) => {
      d.thickness = '0'
    },
    'positive',
  ],
  [
    'zero height',
    (d: WallFillerDraft) => {
      d.height = '0'
    },
    'positive',
  ],
  [
    'negative setback',
    (d: WallFillerDraft) => {
      d.setback = '-1'
    },
    'negative',
  ],
  [
    'oversized board',
    (d: WallFillerDraft) => {
      d.height = '100001'
    },
    '100000',
  ],
  [
    'edge list',
    (d: WallFillerDraft) => {
      d.edges = [] as never
    },
    'edge',
  ],
  [
    'unknown edge',
    (d: WallFillerDraft) => {
      d.edges = { wrong: 'Stock' } as never
    },
    'edge',
  ],
  [
    'blank edge stock',
    (d: WallFillerDraft) => {
      d.edges = { x1: '' }
    },
    'edge',
  ],
] as const)('rejects filler %s', (_name, change, message) => {
  const d = filler()
  change(d)
  expect(wallFillerDraftError(d)).toEqual(expect.stringContaining(message))
})
it('allows signed datums and offsets, omitted ceilings and all real local edge keys', () => {
  expect(
    installationDraftError({
      ...run(),
      elevation: '-50',
      floor: '-100',
      offset: '-10',
      ceiling: '',
    }),
  ).toBeNull()
  expect(
    wallFillerDraftError({ ...filler(), edges: { x0: null, x1: 'Stock', y0: 'Stock', y1: null } }),
  ).toBeNull()
})
it('validates cached binding shape, finite coordinates and positive wall length', () => {
  const b = { start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, datum: 0 }
  expect(wallBindingError(b)).toBeNull()
  expect(wallBindingError(null)).toBeNull()
  expect(wallBindingError(undefined)).toEqual(expect.stringContaining('finite'))
  expect(wallBindingError({ ...b, end: { x: NaN, y: 0 } })).toEqual(
    expect.stringContaining('finite'),
  )
  expect(wallBindingError({ ...b, datum: 1000001 })).toEqual(expect.stringContaining('finite'))
  expect(wallBindingError({ ...b, end: b.start })).toEqual(expect.stringContaining('positive'))
})
it('requires unique run identities and ownership without requiring live references at parse time', () => {
  const r = { version: 1, id: 'run', draft: run(), binding: null }
  expect(installationRunError(r)).toBeNull()
  expect(installationsError([r])).toBeNull()
  expect(installationRunError({ ...r, version: 2 })).toEqual(expect.stringContaining('version'))
  expect(installationRunError({ ...r, id: '' })).toEqual(expect.stringContaining('identity'))
  expect(installationRunError({ ...r, sourceIssue: 3 })).toEqual(
    expect.stringContaining('diagnostic'),
  )
  expect(
    installationsError([
      ...Array.from({ length: 101 }, (_, i) => ({
        ...r,
        id: `r${i}`,
        draft: { ...r.draft, memberIds: [`c${i}`] },
      })),
    ]),
  ).toEqual(expect.stringContaining('100'))
  expect(installationsError([r, { ...r, draft: { ...r.draft, memberIds: ['other'] } }])).toEqual(
    expect.stringContaining('unique'),
  )
  expect(installationsError([r, { ...r, id: 'other' }])).toEqual(expect.stringContaining('unique'))
  expect(wallFillerLinkError({ version: 1, draft: filler(), binding: null })).toBeNull()
  expect(wallFillerLinkError({ version: 2, draft: filler(), binding: null })).toEqual(
    expect.stringContaining('version'),
  )
  expect(installationDraftError(null)).toEqual(expect.stringContaining('object'))
  expect(wallFillerDraftError(null)).toEqual(expect.stringContaining('object'))
})
