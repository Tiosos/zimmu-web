import { expect, it } from 'vitest'
import {
  defaultPull,
  pullHardwareDef,
  pullHardwareKey,
  pullPattern,
  pullSpecError,
} from './pullPattern'
import type { HoleArrayCut } from './types'
const panel = { length: 600, width: 400, thickness: 18 }

it('places a vertical pair from the free edge and mirrors right-hinged doors', () => {
  const left = pullPattern(panel, defaultPull(), 'left', 'door')
  expect(left.errors).toEqual([])
  expect(left.cut).toMatchObject({
    id: 'pull_door',
    face: '+Z',
    axis: 'U',
    start: { x: 452, y: 350, z: 18 },
    pitch: 96,
    count: 2,
    diameter: 5,
    depth: 18,
  })
  expect(pullPattern(panel, defaultPull(), 'right', 'door').cut?.start.y).toBe(50)
})
it('places horizontal bars and single-hole knobs with complete through drilling', () => {
  const bar = pullPattern(
    panel,
    {
      ...defaultPull(),
      orientation: 'horizontal',
      horizontal: 'center',
      horizontalOffset: 0,
      vertical: 'center',
      verticalOffset: 0,
    },
    undefined,
    'drawer',
  )
  expect(bar.cut).toMatchObject({
    axis: 'V',
    start: { x: 300, y: 152, z: 18 },
    count: 2,
    depth: 18,
  })
  const knob = pullPattern(
    panel,
    { ...defaultPull(), kind: 'knob', orientation: 'horizontal', pitch: 5000 },
    'right',
    'door',
  )
  expect(knob.cut).toMatchObject({ start: { x: 500, y: 50, z: 18 }, count: 1, pitch: 1 })
})
it('uses auto centre on drawers and supports edge references and signed centre offsets', () => {
  expect(pullPattern(panel, defaultPull(), undefined, 'drawer').cut?.start.y).toBe(250)
  expect(
    pullPattern(
      panel,
      { ...defaultPull(), horizontal: 'left', vertical: 'bottom' },
      undefined,
      'drawer',
    ).cut?.start,
  ).toEqual({ x: 52, y: 50, z: 18 })
  expect(
    pullPattern(
      panel,
      {
        ...defaultPull(),
        horizontal: 'center',
        horizontalOffset: -20,
        vertical: 'center',
        verticalOffset: -30,
      },
      undefined,
      'drawer',
    ).cut?.start,
  ).toEqual({ x: 222, y: 180, z: 18 })
  expect(
    pullPattern(panel, { ...defaultPull(), horizontalOffset: -1 }, 'left', 'door').errors.join(),
  ).toContain('Free-edge')
})
it('rejects off-board, overflowing, overlapping and nonfinite drilling without a partial pattern', () => {
  for (const patch of [
    { horizontalOffset: 1 },
    { verticalOffset: 20 },
    { pitch: 2000 },
    { horizontalOffset: 1000 },
    { horizontal: 'center' as const, horizontalOffset: 1e308 },
    { pitch: 2, diameter: 5 },
    { pitch: 1e-320, diameter: 1e-320 },
  ])
    expect(pullPattern(panel, { ...defaultPull(), ...patch }, 'left', 'door').cut).toBeNull()
  for (const patch of [{ length: 0 }, { width: -1 }, { thickness: NaN }, { length: Infinity }])
    expect(
      pullPattern({ ...panel, ...patch }, defaultPull(), 'left', 'door').errors.join(),
    ).toContain('positive finite')
})
it('tests hinge-cup collision against the nearest bore in both array directions', () => {
  const cup: HoleArrayCut = {
    kind: 'hole-array',
    id: 'cups_door',
    label: 'Hinge cups',
    face: '+Z',
    axis: 'U',
    start: { x: 100, y: 22.5, z: 18 },
    count: 3,
    pitch: 200,
    diameter: 35,
    depth: 12.5,
  }
  const s = {
    ...defaultPull(),
    kind: 'knob' as const,
    horizontal: 'left' as const,
    horizontalOffset: 22.5,
    vertical: 'bottom' as const,
    verticalOffset: 300,
  }
  expect(pullPattern({ ...panel, cuts: [cup] }, s, 'left', 'door').errors.join()).toContain(
    'hinge cup',
  )
  expect(
    pullPattern(
      { ...panel, cuts: [{ ...cup, axis: 'V', start: { x: 300, y: 22.5, z: 18 } }] },
      s,
      'left',
      'door',
    ).cut,
  ).toBeNull()
  expect(
    pullPattern({ ...panel, cuts: [cup] }, { ...s, horizontalOffset: 100 }, 'left', 'door').errors,
  ).toEqual([])
  expect(
    pullPattern({ ...panel, cuts: [{ ...cup, id: 'manual' }] }, s, 'left', 'door').errors,
  ).toEqual([])
})
it('validates every persisted setting and accepts signed centre offsets', () => {
  for (const value of [
    null,
    [],
    'bad',
    { ...defaultPull(), version: 2 },
    ...[
      { kind: 'bad' },
      { orientation: 'bad' },
      { horizontal: 'bad' },
      { vertical: 'bad' },
      { pitch: 0 },
      { diameter: -1 },
      { diameter: Number.MIN_VALUE },
      { diameter: '5' },
      { pitch: Infinity },
      { horizontalOffset: NaN },
      { verticalOffset: '0' },
      { horizontal: 'left', horizontalOffset: -1 },
      { verticalOffset: -1 },
    ].map((patch) => ({ ...defaultPull(), ...patch })),
  ]) {
    expect(() => pullSpecError(value)).not.toThrow()
    expect(pullSpecError(value)).not.toBeNull()
  }
  expect(
    pullSpecError({
      ...defaultPull(),
      horizontal: 'center',
      horizontalOffset: -10,
      vertical: 'center',
      verticalOffset: -20,
    }),
  ).toBeNull()
})
it('keeps product identities distinct by drilling dimensions and ignores placement', () => {
  expect(pullHardwareKey(defaultPull())).toBe('pull-bar-p96-d5')
  expect(pullHardwareKey({ ...defaultPull(), kind: 'knob' })).toBe('pull-knob-d5')
  expect(
    pullHardwareKey({ ...defaultPull(), horizontalOffset: 60, orientation: 'horizontal' }),
  ).toBe(pullHardwareKey(defaultPull()))
  expect(pullHardwareDef('pull-bar-p128-d4')).toEqual({
    name: '128 mm bar pull — 4 mm fixing holes',
    unit: 'pcs',
  })
  expect(pullHardwareDef('pull-knob-d5')?.name).toContain('Knob')
  for (const key of [
    'unknown',
    'pull-knob-p96-d5',
    'pull-bar-d5',
    'pull-bar-p0-d5',
    'pull-knob-dNaN',
    'pull-knob-d-1',
    'pull-bar-p096-d5',
  ]) {
    expect(() => pullHardwareDef(key)).not.toThrow()
    expect(pullHardwareDef(key)).toBeUndefined()
  }
})
