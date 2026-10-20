import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CabinetFinishingEditor } from './CabinetFinishingEditor'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { acceptFinishing, type FinishingPreview } from '../scene/finishingPanels'
import type { Scene } from '../scene/types'
afterEach(cleanup)
const sceneOf = (): Scene => ({
  components: [cabinet],
  parts: partsOfCarcase(cabinet.params, cabinet.id),
  materials: { ...PRESET_MATERIALS, Thick: { thickness: 30 }, Tape: { use: 'edge', thickness: 2 } },
  joints: [],
  hardware: [],
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const region = (name: string) => screen.getByRole('region', { name })
it('previews a real worktop in three projections with a board summary and adds only explicitly', () => {
  const s = sceneOf(),
    apply = vi.fn((_: FinishingPreview) => true)
  render(<CabinetFinishingEditor cabinet={cabinet} scene={s} onApply={apply} />)
  expect(screen.getByRole('button', { name: 'Add finishing board' }).hasAttribute('disabled')).toBe(
    true,
  )
  field('Left overhang', '10')
  field('Right overhang', '20')
  field('Front overhang', '30')
  field('Rear overhang', '40')
  field('Worktop vertical gap', '5')
  field('Finishing board name', 'Kitchen top')
  field('Finishing material', 'Thick')
  field('Finishing grain', 'width')
  click('Preview finishing board')
  expect(region('Finishing board size summary').textContent).toContain('630.00 × 648.00 × 30.00')
  for (const view of ['Front', 'Top', 'End'])
    expect(region(`Finishing ${view} preview`).querySelector('svg')).not.toBeNull()
  expect(apply).not.toHaveBeenCalled()
  click('Add finishing board')
  expect(apply).toHaveBeenCalledTimes(1)
  const next = acceptFinishing(s, apply.mock.lastCall![0], 'new')!
  expect(next.parts.at(-1)?.label).toBe('Kitchen top')
  expect(screen.getByRole('status').textContent).toContain('added')
})
it('supports all panel types, custom thickness, height, filler width and plinth setback', () => {
  render(<CabinetFinishingEditor cabinet={cabinet} scene={sceneOf()} onApply={() => true} />)
  field('Finishing panel type', 'left-filler')
  field('Panel height', '500')
  field('Filler width', '75')
  field('Bottom clearance', '10')
  field('Finishing thickness source', 'custom')
  field('Finishing custom thickness', '25')
  click('Preview finishing board')
  expect(region('Finishing board size summary').textContent).toContain('500.00 × 75.00 × 25.00')
  expect(region('Finishing board size summary').textContent).toContain('differs from stock')
  for (const kind of ['left-end', 'right-end', 'right-filler', 'plinth', 'splashback']) {
    field('Finishing panel type', kind)
    if (kind === 'plinth') field('Plinth setback', '50')
    if (kind === 'splashback') field('Splashback clearance', '10')
    click('Preview finishing board')
    expect(region('Finishing board size summary')).toBeTruthy()
  }
})
it('invalidates previews for edits, rejects invalid dimensions and resets or cancels without applying', () => {
  const apply = vi.fn()
  render(<CabinetFinishingEditor cabinet={cabinet} scene={sceneOf()} onApply={apply} />)
  click('Preview finishing board')
  field('Left overhang', '-1')
  expect(screen.queryByRole('region', { name: 'Finishing board preview' })).toBeNull()
  click('Preview finishing board')
  expect(screen.getByRole('alert').textContent).toContain('zero or greater')
  expect(screen.getByRole('button', { name: 'Add finishing board' }).hasAttribute('disabled')).toBe(
    true,
  )
  click('Fit to cabinet defaults')
  expect(screen.getByLabelText('Left overhang')).toHaveProperty('value', '0')
  field('Finishing board name', '')
  click('Preview finishing board')
  expect(screen.getByRole('alert').textContent).toContain('Name')
  click('Cancel finishing changes')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(apply).not.toHaveBeenCalled()
  field('Finishing material', '')
  click('Preview finishing board')
  expect(screen.getByRole('alert').textContent).toContain('panel material')
  click('Reset finishing draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('keeps previews for mesh updates, stales them for geometry and requires reset', () => {
  const s = sceneOf(),
    props = { cabinet, scene: s, onApply: () => true }
  const view = render(<CabinetFinishingEditor {...props} />)
  field('Left overhang', '50')
  click('Preview finishing board')
  view.rerender(
    <CabinetFinishingEditor
      {...props}
      scene={{ ...s, parts: s.parts.map((p) => ({ ...p, mesh: undefined })) }}
    />,
  )
  expect(region('Finishing board preview')).toBeTruthy()
  const updated = {
    ...s,
    parts: s.parts.map((p, i) => (i === 0 ? { ...p, length: p.length + 1 } : p)),
  }
  view.rerender(<CabinetFinishingEditor {...props} scene={updated} />)
  expect(screen.queryByRole('region', { name: 'Finishing board preview' })).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Preview finishing board' }).hasAttribute('disabled'),
  ).toBe(true)
  expect(screen.getByRole('group', { name: 'Finishing board' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByLabelText('Left overhang')).toHaveProperty('value', '50')
  click('Reset finishing draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('reports rejected Apply and accepts the reconciled scene after successful addition', () => {
  const s = sceneOf(),
    apply = vi.fn(() => false),
    view = render(<CabinetFinishingEditor cabinet={cabinet} scene={s} onApply={apply} />)
  click('Preview finishing board')
  click('Add finishing board')
  expect(screen.getByRole('alert').textContent).toContain('changed after preview')
  view.unmount()
  let added: Scene | null = null
  const success = (p: FinishingPreview) => {
    added = acceptFinishing(s, p, 'new')
    return !!added
  }
  const next = render(<CabinetFinishingEditor cabinet={cabinet} scene={s} onApply={success} />)
  click('Preview finishing board')
  click('Add finishing board')
  next.rerender(<CabinetFinishingEditor cabinet={cabinet} scene={added!} onApply={success} />)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Preview finishing board' }).hasAttribute('disabled'),
  ).toBe(false)
  click('Preview finishing board')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: 'Add finishing board' }).hasAttribute('disabled')).toBe(
    false,
  )
  field('Front overhang', '40')
  next.rerender(
    <CabinetFinishingEditor
      cabinet={cabinet}
      scene={{ ...added!, materials: { ...s.materials, New: { thickness: 22 } } }}
      onApply={success}
    />,
  )
  expect(screen.getByRole('alert').textContent).toContain('changed')
})
