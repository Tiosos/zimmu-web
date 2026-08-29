import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CabinetEditor, type CabinetTab } from './CabinetEditor'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import type { CarcaseComponent } from '../scene/types'

const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'cmp_1',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

const props = (over: Partial<ComponentProps<typeof CabinetEditor>> = {}) => ({
  component: cabinet,
  materials: PRESET_MATERIALS,
  tab: 'section' as CabinetTab,
  onTabChange: vi.fn(),
  selectedSectionId: null,
  onSelectSection: vi.fn(),
  onUpdate: vi.fn(),
  ...over,
})

describe('CabinetEditor', () => {
  afterEach(cleanup)

  it('offers the five subtabs a cabinet is described by', () => {
    render(<CabinetEditor {...props()} />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Section',
      'Front',
      'Top',
      'End',
      '3D',
    ])
  })

  // `getAttribute`, not jest-dom's `toHaveAttribute`: this project does not set jest-dom up, and
  // adding it for one assertion is a dependency for a string comparison.
  it('marks the tab it was given as selected', () => {
    render(<CabinetEditor {...props()} />)
    const selected = () =>
      screen
        .getAllByRole('tab')
        .filter((t) => t.getAttribute('aria-selected') === 'true')
        .map((t) => t.textContent)
    expect(selected()).toEqual(['Section'])
    cleanup()
    render(<CabinetEditor {...props({ tab: '3d' })} />)
    expect(selected()).toEqual(['3D'])
  })

  it('reports the tab upward so the viewport can show itself', async () => {
    const onTabChange = vi.fn()
    render(<CabinetEditor {...props({ onTabChange })} />)
    await userEvent.click(screen.getByRole('tab', { name: '3D' }))
    expect(onTabChange).toHaveBeenLastCalledWith('3d')
  })

  // A tab that silently shows nothing reads as broken. G2 builds these.
  it.each(['Front', 'Top', 'End'])(
    'says %s is not built yet rather than showing nothing',
    (name) => {
      const tab = name.toLowerCase() as CabinetTab
      render(<CabinetEditor {...props({ tab })} />)
      expect(screen.getByText(/not built yet/i)).toBeTruthy()
    },
  )

  // The 3D tab is the viewport, which lives outside this component precisely so it is never
  // unmounted — so the editor renders no panel of its own for it and App does the showing.
  it('renders no panel of its own for 3D', () => {
    render(<CabinetEditor {...props({ tab: '3d' })} />)
    expect(screen.queryByTestId('cabinet-editor-panel')).toBeNull()
  })

  it('names the cabinet it is editing', () => {
    render(<CabinetEditor {...props()} />)
    expect(screen.getByText('Base 600')).toBeTruthy()
  })
})
