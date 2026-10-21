import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CabinetMotionEditor } from './CabinetMotionEditor'
import { CabinetHardwareWorkspace } from './CabinetHardwareWorkspace'
import { motionScene } from '../scene/__fixtures__/motion'
import type { CarcaseComponent, Scene } from '../scene/types'
import type { MotionPreview } from '../scene/motionHardware'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const mount = (s = motionScene(), apply = vi.fn((_: MotionPreview) => true)) =>
  render(
    <CabinetMotionEditor cabinet={s.components[0] as CarcaseComponent} scene={s} onApply={apply} />,
  )
it('keeps Pulls default and exposes the motion workspace inside Hardware', () => {
  const s = motionScene()
  render(
    <CabinetHardwareWorkspace
      cabinet={s.components[0] as CarcaseComponent}
      scene={s}
      onApply={() => true}
      onApplyMotion={() => true}
    />,
  )
  expect(
    screen.getByRole('button', { name: 'Hinges & Runners' }).getAttribute('aria-pressed'),
  ).toBe('false')
  click('Hinges & Runners')
  expect(screen.getByRole('region', { name: 'Hinges and runners editor' })).toBeTruthy()
})
it('stages multiple leaves, previews actual cups and applies explicitly', () => {
  const apply = vi.fn((_: MotionPreview) => true)
  mount(motionScene('pair'), apply)
  click('Select all door leaves')
  field('Hinge count mode', 'manual')
  field('Manual hinge count', '3')
  field('Hinge inset mode', 'manual')
  field('Hinge end inset', '75')
  click('Stage hinge layout')
  click('Preview hinges and runners')
  expect(screen.getByRole('region', { name: 'Hinges and runners preview' }).textContent).toContain(
    '3 cups',
  )
  for (const view of ['Front', 'Top', 'End'])
    expect(
      screen.getByRole('region', { name: `Motion ${view} preview` }).querySelector('svg'),
    ).not.toBeNull()
  expect(apply).not.toHaveBeenCalled()
  click('Apply hinges and runners')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(Object.keys(apply.mock.lastCall![0].draft.hinges)).toHaveLength(2)
})
it('reports invalid spacing and cancels without changing the project', () => {
  const apply = vi.fn((_: MotionPreview) => true)
  mount(motionScene(), apply)
  click('Select all door leaves')
  field('Hinge inset mode', 'manual')
  field('Hinge end inset', '1')
  click('Stage hinge layout')
  click('Preview hinges and runners')
  expect(screen.getByRole('alert').textContent).toContain('fit')
  expect(
    screen.getByRole('button', { name: 'Apply hinges and runners' }).hasAttribute('disabled'),
  ).toBe(true)
  click('Cancel hardware changes')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})
it('stages runner family, nominal, height, offset and material through the drawer list', () => {
  const apply = vi.fn((_: MotionPreview) => true)
  mount(motionScene('drawer'), apply)
  click('Select all drawer openings')
  field('Motion runner nominal', '400')
  field('Motion box height', '100')
  click('Stage box height')
  field('Motion runner offset', '20')
  click('Stage side-mount offset')
  field('Motion box material', 'inherit')
  click('Preview hinges and runners')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('region', { name: 'Hinges and runners preview' }).textContent).toContain(
    '400',
  )
  click('Apply hinges and runners')
  expect(Object.values(apply.mock.lastCall![0].draft.drawers)[0]).toMatchObject({
    nominal: 400,
    boxHeight: 100,
    runnerOffset: 20,
  })
})
it('keeps face-frame hinge models read-only and explains the restriction', () => {
  mount(motionScene('door', true))
  expect(
    screen.getByRole('button', { name: 'Select all door leaves' }).hasAttribute('disabled'),
  ).toBe(true)
  expect(
    screen.getByText(
      'Face-frame hinges retain their modeled application; custom positioning is read-only.',
    ),
  ).toBeTruthy()
})
it('invalidates stale drafts and resets selection and previews', () => {
  const s = motionScene(),
    c = s.components[0] as CarcaseComponent,
    apply = vi.fn(),
    view = mount(s, apply)
  click('Select all door leaves')
  click('Stage hinge layout')
  click('Preview hinges and runners')
  const next: Scene = { ...s, materials: { ...s.materials, Other: { thickness: 30 } } }
  view.rerender(<CabinetMotionEditor cabinet={c} scene={next} onApply={apply} />)
  expect(screen.queryByRole('region', { name: 'Hinges and runners preview' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('project changed')
  click('Reset hardware draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('handles a rejected apply without losing the staged settings', () => {
  mount(
    motionScene(),
    vi.fn(() => false),
  )
  click('Select all door leaves')
  field('Hinge count mode', 'manual')
  field('Manual hinge count', '3')
  click('Stage hinge layout')
  click('Preview hinges and runners')
  click('Apply hinges and runners')
  expect(screen.getByRole('alert').textContent).toContain('changed after preview')
  expect(screen.queryByRole('region', { name: 'Hinges and runners preview' })).toBeNull()
})
