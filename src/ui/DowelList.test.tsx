import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DowelList } from './DowelList'
import type { Part } from '../scene/types'

afterEach(cleanup)

function dowel(id: string, material: string): Part {
  return {
    kind: 'cylinder',
    id,
    label: id,
    diameter: 8,
    length: 100,
    material,
    color: '#888888',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
  }
}

describe('DowelList', () => {
  it('renders a row per dowel group', () => {
    render(<DowelList parts={[dowel('d1', 'Beech'), dowel('d2', 'Beech')]} materials={{}} />)
    expect(screen.getByText('Beech')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('opens the $/m popover and saves costPerM merged with existing def', () => {
    const onMaterialCostChange = vi.fn()
    render(
      <DowelList
        parts={[dowel('d1', 'Beech')]}
        materials={{ Beech: { costPerM2: 12 } }}
        onMaterialCostChange={onMaterialCostChange}
      />,
    )
    fireEvent.click(screen.getByText('Beech'))
    const input = screen.getByDisplayValue('') as HTMLInputElement
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onMaterialCostChange).toHaveBeenCalledWith('Beech', { costPerM2: 12, costPerM: 5 })
  })
})
