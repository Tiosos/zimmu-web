import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DowelCutsPanel } from './DowelCutsPanel'
import type { CylinderPart, Part } from '../scene/types'

function dowel(): CylinderPart {
  return {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 8,
    length: 100,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [{ kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 }],
    visible: true,
  }
}

afterEach(() => cleanup())

describe('DowelCutsPanel', () => {
  it('renders an arm button for each tool and the existing cut row', () => {
    render(
      <DowelCutsPanel part={dowel()} dowelTool={null} armDowelTool={vi.fn()} onUpdate={vi.fn()} />,
    )
    // exact names: the row also has an "End: +Z" toggle, so a /end/i regex would be ambiguous
    expect(screen.getByRole('button', { name: 'End' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Notch' })).toBeTruthy()
    expect(screen.getByText(/End 1/)).toBeTruthy()
    // the end cut exposes an angle input
    expect(screen.getByLabelText(/angle/i)).toBeTruthy()
  })

  it('commits negative azimuth on blur without clamping to 0', () => {
    const onUpdate = vi.fn()
    const part = dowel()
    render(
      <DowelCutsPanel part={part} dowelTool={null} armDowelTool={vi.fn()} onUpdate={onUpdate} />,
    )

    const azimuthInput = screen.getByLabelText(/azimuth/i)
    fireEvent.change(azimuthInput, { target: { value: '-90' } })
    fireEvent.blur(azimuthInput)

    // onUpdate should have been called once (on blur) with a valid updater
    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [, updater] = onUpdate.mock.calls[0] as [string, (p: Part) => Part]
    const updated = updater(part)
    expect(
      updated.kind === 'cylinder' && updated.cuts[0].kind === 'end' && updated.cuts[0].azimuth,
    ).toBe(-90)
  })
})
