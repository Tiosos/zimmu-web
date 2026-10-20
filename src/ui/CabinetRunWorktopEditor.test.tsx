import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { regenerateComponents } from '../scene/regenerateComponents'
import {
  acceptRunWorktop,
  previewRunWorktop,
  runWorktopDraft,
  type RunWorktopPreview,
} from '../scene/runWorktops'
import type { CarcaseComponent, Scene } from '../scene/types'
import { CabinetRunWorktopEditor } from './CabinetRunWorktopEditor'
import { CabinetFinishingWorkspace } from './CabinetFinishingWorkspace'
afterEach(cleanup)
const sceneOf = (): Scene =>
  regenerateComponents({
    components: [
      { ...cabinet, id: 'a', label: 'Left' },
      {
        ...cabinet,
        id: 'b',
        label: 'Right',
        position: { x: 600, y: 0, z: 0 },
        anchor: { to: 'a', face: 'right', gap: 0, offset: { u: 0, v: 0 } },
      },
    ],
    parts: [],
    materials: PRESET_MATERIALS,
    joints: [],
    hardware: [],
  })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
it('starts in single-cabinet mode and exposes run mode inside Finishing', () => {
  const s = sceneOf()
  render(
    <CabinetFinishingWorkspace
      cabinet={s.components[0] as CarcaseComponent}
      scene={s}
      onApply={() => true}
      onApplyRun={() => true}
    />,
  )
  expect(screen.getByRole('region', { name: 'Cabinet finishing editor' })).toBeTruthy()
  click('Run-spanning worktops')
  expect(screen.getByRole('region', { name: 'Run worktop editor' })).toBeTruthy()
  click('Single-cabinet panels')
  expect(screen.queryByRole('region', { name: 'Run worktop editor' })).toBeNull()
})
it('selects an anchored run, previews three complete views and applies only explicitly', () => {
  const s = sceneOf(),
    apply = vi.fn((_: RunWorktopPreview) => true)
  render(
    <CabinetRunWorktopEditor
      cabinet={s.components[0] as CarcaseComponent}
      scene={s}
      onApply={apply}
    />,
  )
  click('Select anchored run')
  field('Left overhang', '10')
  field('Right overhang', '20')
  click('Preview run worktop')
  expect(screen.getByRole('region', { name: 'Run worktop preview' }).textContent).toContain(
    '1230.00 × 598.00 × 18.00',
  )
  for (const view of ['Front', 'Top', 'End'])
    expect(
      screen.getByRole('region', { name: `Run worktop ${view} preview` }).querySelector('svg'),
    ).not.toBeNull()
  expect(apply).not.toHaveBeenCalled()
  click('Add run worktop')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(acceptRunWorktop(s, apply.mock.lastCall![0], 'new')?.parts.at(-1)?.label).toBe(
    'Run worktop',
  )
})
it('validates selection, invalidates preview on edits and resets without applying', () => {
  const s = sceneOf(),
    apply = vi.fn()
  render(
    <CabinetRunWorktopEditor
      cabinet={s.components[0] as CarcaseComponent}
      scene={s}
      onApply={apply}
    />,
  )
  click('Clear cabinet selection')
  click('Preview run worktop')
  expect(screen.getByRole('alert').textContent).toContain('two distinct')
  click('Select anchored run')
  click('Preview run worktop')
  field('Front overhang', '-1')
  expect(screen.queryByRole('region', { name: 'Run worktop preview' })).toBeNull()
  click('Preview run worktop')
  expect(screen.getByRole('alert').textContent).toContain('zero or greater')
  click('Cancel run worktop changes')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})
it('invalidates stale snapshots and recovers with reset', () => {
  const s = sceneOf(),
    apply = vi.fn(),
    c = s.components[0] as CarcaseComponent
  const view = render(<CabinetRunWorktopEditor cabinet={c} scene={s} onApply={apply} />)
  click('Select anchored run')
  click('Preview run worktop')
  view.rerender(
    <CabinetRunWorktopEditor
      cabinet={c}
      scene={{ ...s, materials: { ...s.materials, New: { thickness: 30 } } }}
      onApply={apply}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Run worktop preview' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Preview run worktop' }).hasAttribute('disabled')).toBe(
    true,
  )
  click('Reset run worktop draft')
  expect(screen.getByRole('button', { name: 'Preview run worktop' }).hasAttribute('disabled')).toBe(
    false,
  )
})
it('edits a stable-ID link and can detach or delete after source failure', () => {
  const s = sceneOf(),
    d = { ...runWorktopDraft(s, 'a'), memberIds: ['a', 'b'] }
  const next = acceptRunWorktop(s, previewRunWorktop(s, d), 'top')!,
    apply = vi.fn((_: RunWorktopPreview) => true)
  render(
    <CabinetRunWorktopEditor
      cabinet={next.components[0] as CarcaseComponent}
      scene={next}
      onApply={apply}
    />,
  )
  click('Edit run worktop')
  field('Left overhang', '50')
  click('Preview run worktop')
  click('Save run worktop')
  expect(apply.mock.lastCall![0].targetId).toBe('top')
  click('Detach run worktop')
  expect(apply.mock.lastCall![0].action).toBe('detach')
  click('Delete run worktop')
  expect(apply.mock.lastCall![0].action).toBe('delete')
})
it('keeps rejected application reviewable and asks for a new preview', () => {
  const s = sceneOf()
  render(
    <CabinetRunWorktopEditor
      cabinet={s.components[0] as CarcaseComponent}
      scene={s}
      onApply={() => false}
    />,
  )
  click('Select anchored run')
  click('Preview run worktop')
  click('Add run worktop')
  expect(screen.getByRole('status').textContent).toContain('changed after preview')
  expect(screen.queryByRole('region', { name: 'Run worktop preview' })).toBeNull()
})
