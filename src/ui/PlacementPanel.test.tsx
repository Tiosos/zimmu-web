import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PlacementPanel } from './PlacementPanel'
import { CARCASE_PRESETS } from '../scene/carcasePresets'
import { freshSectionIds } from '../scene/sectionTree'
import type { CarcaseComponent, ComponentId } from '../scene/types'

function cabinet(id: string, over: Partial<CarcaseComponent> = {}): CarcaseComponent {
  return {
    kind: 'carcase',
    id: id as ComponentId,
    label: id,
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: {
      ...CARCASE_PRESETS[0].params,
      section: freshSectionIds(CARCASE_PRESETS[0].params.section),
    },
    ...over,
  }
}

function renderPanel(component: CarcaseComponent, components = [component], onUpdate = vi.fn()) {
  render(<PlacementPanel component={component} components={components} onUpdate={onUpdate} />)
  return onUpdate
}

describe('PlacementPanel', () => {
  afterEach(cleanup)

  it('commits an X position on blur', () => {
    const a = cabinet('cmp_a')
    const onUpdate = renderPanel(a)
    const field = screen.getByLabelText('X')
    fireEvent.change(field, { target: { value: '1800' } })
    fireEvent.blur(field)
    expect(onUpdate).toHaveBeenCalledWith({ position: { x: 1800, y: 0, z: 0 } })
  })

  it('accepts a negative position', () => {
    const a = cabinet('cmp_a')
    const onUpdate = renderPanel(a)
    const field = screen.getByLabelText('Y')
    fireEvent.change(field, { target: { value: '-600' } })
    fireEvent.blur(field)
    expect(onUpdate).toHaveBeenCalledWith({ position: { x: 0, y: -600, z: 0 } })
  })

  it('commits Rotation Z', () => {
    const a = cabinet('cmp_a')
    const onUpdate = renderPanel(a)
    const field = screen.getByLabelText('Rotation Z')
    fireEvent.change(field, { target: { value: '90' } })
    fireEvent.blur(field)
    expect(onUpdate).toHaveBeenCalledWith({ rotation: { x: 0, y: 0, z: 90 } })
  })

  it('disables the position fields when anchored', () => {
    const a = cabinet('cmp_a')
    const b = cabinet('cmp_b', {
      anchor: { to: 'cmp_a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
    renderPanel(b, [a, b])
    expect((screen.getByLabelText('X') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Y') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Z') as HTMLInputElement).disabled).toBe(true)
  })

  it('leaves Rotation Z enabled when anchored — rotation is never derived', () => {
    const a = cabinet('cmp_a')
    const b = cabinet('cmp_b', {
      anchor: { to: 'cmp_a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
    renderPanel(b, [a, b])
    expect((screen.getByLabelText('Rotation Z') as HTMLInputElement).disabled).toBe(false)
  })

  it('does not offer the cabinet itself as an anchor target', () => {
    const a = cabinet('cmp_a')
    renderPanel(a, [a])
    const select = screen.getByLabelText('Anchored to') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).not.toContain('cmp_a')
  })

  it('does not offer a cabinet under a different parent as an anchor target', () => {
    const a = cabinet('cmp_a')
    const other = cabinet('cmp_other', { parentId: 'cmp_group' as ComponentId })
    renderPanel(a, [a, other])
    const select = screen.getByLabelText('Anchored to') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).not.toContain('cmp_other')
  })

  it('commits an anchor with documented defaults when a target is chosen', () => {
    const a = cabinet('cmp_a')
    const b = cabinet('cmp_b')
    const onUpdate = renderPanel(b, [a, b])
    const select = screen.getByLabelText('Anchored to') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'cmp_a' } })
    expect(onUpdate).toHaveBeenCalledWith({
      anchor: { to: 'cmp_a', face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
  })

  it('detach commits only anchor: undefined, leaving position alone', () => {
    const a = cabinet('cmp_a')
    const b = cabinet('cmp_b', {
      position: { x: 600, y: 0, z: 0 },
      anchor: { to: 'cmp_a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
    const onUpdate = renderPanel(b, [a, b])
    fireEvent.click(screen.getByRole('button', { name: /detach/i }))
    expect(onUpdate).toHaveBeenCalledWith({ anchor: undefined })
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('labels the offset fields Depth/Height for a left face', () => {
    const a = cabinet('cmp_a')
    const b = cabinet('cmp_b', {
      anchor: { to: 'cmp_a' as ComponentId, face: 'left', gap: 0, offset: { u: 0, v: 0 } },
    })
    renderPanel(b, [a, b])
    expect(screen.getByLabelText('Depth')).toBeTruthy()
    expect(screen.getByLabelText('Height')).toBeTruthy()
  })

  it('labels the offset fields Depth/Height for a right face', () => {
    const a = cabinet('cmp_a')
    const b = cabinet('cmp_b', {
      anchor: { to: 'cmp_a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
    renderPanel(b, [a, b])
    expect(screen.getByLabelText('Depth')).toBeTruthy()
    expect(screen.getByLabelText('Height')).toBeTruthy()
  })

  it('labels the offset fields Across/Height for a front face', () => {
    const a = cabinet('cmp_a')
    const b = cabinet('cmp_b', {
      anchor: { to: 'cmp_a' as ComponentId, face: 'front', gap: 0, offset: { u: 0, v: 0 } },
    })
    renderPanel(b, [a, b])
    expect(screen.getByLabelText('Across')).toBeTruthy()
    expect(screen.getByLabelText('Height')).toBeTruthy()
    expect(screen.queryByLabelText('Depth')).toBeNull()
  })

  it('labels the offset fields Across/Height for a back face', () => {
    const a = cabinet('cmp_a')
    const b = cabinet('cmp_b', {
      anchor: { to: 'cmp_a' as ComponentId, face: 'back', gap: 0, offset: { u: 0, v: 0 } },
    })
    renderPanel(b, [a, b])
    expect(screen.getByLabelText('Across')).toBeTruthy()
    expect(screen.getByLabelText('Height')).toBeTruthy()
    expect(screen.queryByLabelText('Depth')).toBeNull()
  })
})
