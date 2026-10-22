import { expect, it } from 'vitest'
import { cornerDraft } from './cornerPanels'
import { cornerDraftError, cornerLinkError, type CornerDraft } from './cornerRecipe'
import { cornerScene } from './__fixtures__/corners'
const valid = () => {
  const d = cornerDraft(cornerScene(), 'a')
  d.legs[1].run.memberIds = ['b']
  return d
}
it.each([
  [
    'name',
    (d: CornerDraft) => {
      d.label = ''
    },
    'Name',
  ],
  [
    'through',
    (d: CornerDraft) => {
      d.through = 3 as 0
    },
    'through',
  ],
  [
    'negative gap',
    (d: CornerDraft) => {
      d.gap = '-1'
    },
    'clearance',
  ],
  [
    'large gap',
    (d: CornerDraft) => {
      d.gap = '1001'
    },
    'clearance',
  ],
  [
    'missing leg',
    (d: CornerDraft) => {
      d.legs.pop()
    },
    'two',
  ],
  [
    'null leg',
    (d: CornerDraft) => {
      d.legs[0] = null!
    },
    'both',
  ],
  [
    'missing member',
    (d: CornerDraft) => {
      d.legs[0].run.memberIds = []
    },
    'one cabinet',
  ],
  [
    'duplicate member',
    (d: CornerDraft) => {
      d.legs[0].run.memberIds.push('a')
    },
    'one cabinet',
  ],
  [
    'member count',
    (d: CornerDraft) => {
      d.legs[0].run.memberIds = Array.from({ length: 101 }, (_, i) => `c${i}`)
    },
    '1–100',
  ],
  [
    'follow',
    (d: CornerDraft) => {
      d.legs[0].run.follow = false
    },
    'follow',
  ],
  [
    'dimension bound',
    (d: CornerDraft) => {
      d.legs[0].run.rear = '100001'
    },
    '100000',
  ],
  [
    'edge shape',
    (d: CornerDraft) => {
      d.legs[0].edges = [] as never
    },
    'edge',
  ],
  [
    'edge key',
    (d: CornerDraft) => {
      d.legs[0].edges = { bad: 'Stock' } as never
    },
    'edge',
  ],
  [
    'edge stock',
    (d: CornerDraft) => {
      d.legs[0].edges = { x0: '' }
    },
    'edge',
  ],
  [
    'end return',
    (d: CornerDraft) => {
      d.legs[0].endReturn = true
    },
    'vertical',
  ],
  [
    'profile',
    (d: CornerDraft) => {
      d.legs[1].run = {
        ...d.legs[1].run,
        profile: 'splashback',
        height: '100',
        heightMode: 'custom',
        setback: '0',
      }
    },
    'same profile',
  ],
  [
    'shared member',
    (d: CornerDraft) => {
      d.legs[1].run.memberIds = ['a']
    },
    'only one',
  ],
] as const)('rejects malformed %s', (_name, change, message) => {
  const d = valid()
  change(d)
  expect(cornerDraftError(d)).toEqual(expect.stringContaining(message))
})
it('checks link identity, version and return slots after validating its recipe', () => {
  const link = { version: 1, assemblyId: 'id', slot: 0, draft: valid() }
  expect(cornerLinkError(link)).toBeNull()
  expect(cornerDraftError(null)).toEqual(expect.stringContaining('settings'))
  expect(cornerLinkError(null)).toEqual(expect.stringContaining('object'))
  for (const change of [{ version: 2 }, { assemblyId: '' }, { slot: 4 }])
    expect(cornerLinkError({ ...link, ...change })).toEqual(
      expect.stringContaining('identity or version'),
    )
  expect(cornerLinkError({ ...link, draft: {} })).toEqual(expect.stringContaining('Name'))
  expect(cornerLinkError({ ...link, slot: 3 })).toEqual(expect.stringContaining('slot'))
})
