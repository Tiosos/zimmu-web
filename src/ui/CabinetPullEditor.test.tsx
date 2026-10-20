import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CabinetPullEditor } from './CabinetPullEditor'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { defaultInterior } from '../scene/sectionInterior'
import { applyPipeline } from '../scene/pipeline'
import { defaultPull } from '../scene/pullPattern'
import {
  acceptPulls,
  pullTargets,
  previewPulls,
  stagePull,
  type PullPreview,
} from '../scene/pullLayout'
import type { CarcaseComponent, Scene } from '../scene/types'
afterEach(cleanup)
const sceneOf = (): Scene =>
  applyPipeline({
    components: [
      {
        ...cabinet,
        params: {
          ...cabinet.params,
          section: {
            ...cabinet.params.section,
            front: { kind: 'door', leaves: 2, hinge: 'left' },
            interior: defaultInterior(0),
          },
        },
      },
    ],
    parts: [],
    materials: PRESET_MATERIALS,
    joints: [],
    hardware: [],
  })
const own = (s: Scene) => s.components[0] as CarcaseComponent
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const region = (name: string) => screen.getByRole('region', { name })
const withPulls = (s = sceneOf()) =>
  acceptPulls(
    s,
    previewPulls(
      s,
      cabinet.id,
      stagePull(
        s,
        cabinet.id,
        {},
        pullTargets(s, cabinet.id).map((t) => t.id),
        defaultPull(),
      ),
    ),
  )!

it('stages both leaves, previews real drilling in three views and applies only explicitly', () => {
  const s = sceneOf(),
    apply = vi.fn((_: PullPreview) => true)
  render(<CabinetPullEditor cabinet={own(s)} scene={s} onApply={apply} />)
  expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  click('Select all')
  click('Stage pull settings')
  expect(region('Cabinet hardware editor').textContent).toContain('2 selected; 2 staged')
  click('Preview hardware changes')
  expect(region('Pull fixing summary').textContent).toContain('diameter 5 mm; through 18 mm')
  expect(region('Pull hardware quantities').textContent).toContain('0 → 2')
  for (const view of ['Front', 'Top', 'End'])
    expect(region(`Hardware ${view} preview`).querySelector('svg')).not.toBeNull()
  expect(apply).not.toHaveBeenCalled()
  click('Apply hardware changes')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status').textContent).toContain('applied')
})
it('filters selection, retains staged edits, and resets/cancels without modifying the project', () => {
  const s = sceneOf(),
    apply = vi.fn()
  render(<CabinetPullEditor cabinet={own(s)} scene={s} onApply={apply} />)
  click('Select doors')
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(2)
  click('Stage pull settings')
  click('Select drawer fronts')
  expect(screen.queryAllByRole('checkbox', { checked: true })).toHaveLength(0)
  expect(region('Cabinet hardware editor').textContent).toContain('0 selected; 2 staged')
  click('Select configured pulls')
  click('Clear front selection')
  click('Cancel hardware changes')
  expect(region('Cabinet hardware editor').textContent).toContain('0 selected; 0 staged')
  click('Select all')
  click('Stage pull removal')
  click('Preview hardware changes')
  expect(region('Hardware layout preview').textContent).toContain('No changes')
  expect(screen.getByRole('button', { name: 'Apply hardware changes' })).toHaveProperty(
    'disabled',
    true,
  )
  click('Reset hardware draft')
  expect(screen.queryByRole('region', { name: 'Hardware layout preview' })).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})
it('validates form numbers and geometry, and supports knob controls and centre offsets', () => {
  const s = sceneOf()
  render(<CabinetPullEditor cabinet={own(s)} scene={s} onApply={() => true} />)
  click('Select all')
  field('Fixing diameter', '')
  click('Stage pull settings')
  expect(screen.getByRole('alert').textContent).toContain('finite')
  field('Fixing diameter', '5')
  field('Fixing pitch', '9999')
  click('Stage pull settings')
  click('Preview hardware changes')
  expect(screen.getByRole('alert').textContent).toContain('inside')
  field('Pull type', 'knob')
  expect(screen.getByLabelText('Fixing pitch')).toHaveProperty('disabled', true)
  expect(screen.getByLabelText('Pull orientation')).toHaveProperty('disabled', true)
  field('Pull horizontal reference', 'center')
  field('Horizontal offset', '-10')
  field('Pull vertical reference', 'center')
  field('Vertical offset', '0')
  click('Stage pull settings')
  click('Preview hardware changes')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(region('Pull hardware quantities').textContent).toContain('Knob')
})
it('loads existing settings, removes both pulls and accepts the updated scene signature', () => {
  let scene = withPulls()
  const apply = (p: PullPreview) => {
    const next = acceptPulls(scene, p)
    if (!next) return false
    scene = next
    return true
  }
  const view = render(<CabinetPullEditor cabinet={own(scene)} scene={scene} onApply={apply} />)
  fireEvent.click(screen.getAllByRole('checkbox')[0])
  field('Fixing pitch', '128')
  click('Load selected pull')
  expect(screen.getByLabelText('Fixing pitch')).toHaveProperty('value', '96')
  click('Select configured pulls')
  click('Stage pull removal')
  click('Preview hardware changes')
  expect(region('Pull hardware quantities').textContent).toContain('2 → 0')
  click('Apply hardware changes')
  view.rerender(<CabinetPullEditor cabinet={own(scene)} scene={scene} onApply={apply} />)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(region('Cabinet hardware editor').textContent).toContain('2 selected; 0 staged')
  expect(pullTargets(scene, cabinet.id).every((t) => !t.part.frontPull)).toBe(true)
})
it('keeps previews for mesh updates, invalidates geometry and reports rejected acceptance', () => {
  const s = sceneOf(),
    reject = vi.fn(() => false)
  const view = render(<CabinetPullEditor cabinet={own(s)} scene={s} onApply={reject} />)
  click('Select all')
  click('Stage pull settings')
  click('Preview hardware changes')
  view.rerender(
    <CabinetPullEditor
      cabinet={own(s)}
      scene={{ ...s, parts: s.parts.map((p) => ({ ...p, mesh: undefined })) }}
      onApply={reject}
    />,
  )
  expect(region('Hardware layout preview')).toBeTruthy()
  click('Apply hardware changes')
  expect(screen.getByRole('alert').textContent).toContain('changed after preview')
  click('Preview hardware changes')
  const changed = {
    ...s,
    parts: s.parts.map((p, i) => (i === 0 ? { ...p, length: p.length + 1 } : p)),
  }
  view.rerender(<CabinetPullEditor cabinet={own(changed)} scene={changed} onApply={reject} />)
  expect(screen.queryByRole('region', { name: 'Hardware layout preview' })).toBeNull()
  expect(screen.getByRole('group', { name: 'Front selection' })).toHaveProperty('disabled', true)
  click('Reset hardware draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('locks detached fronts and reports invalid current drilling while allowing staged repair', () => {
  const s = withPulls(),
    id = pullTargets(s, cabinet.id)[0].id
  const detached = { ...s, parts: s.parts.map((p) => (p.id === id ? { ...p, driven: false } : p)) }
  const view = render(
    <CabinetPullEditor cabinet={own(detached)} scene={detached} onApply={() => true} />,
  )
  expect(screen.getAllByRole('checkbox')[0]).toHaveProperty('disabled', true)
  view.unmount()
  const narrow = applyPipeline({
    ...s,
    components: s.components.map((c) =>
      c.kind === 'carcase' ? { ...c, params: { ...c.params, width: 80 } } : c,
    ),
  })
  render(<CabinetPullEditor cabinet={own(narrow)} scene={narrow} onApply={() => true} />)
  expect(region('Cabinet hardware editor').textContent).toContain(
    'Invalid pull drilling is omitted',
  )
  click('Select all')
  field('Pull type', 'knob')
  field('Horizontal offset', '10')
  field('Vertical offset', '200')
  click('Stage pull settings')
  click('Preview hardware changes')
  expect(within(region('Hardware layout preview')).queryByRole('alert')).toBeNull()
})
