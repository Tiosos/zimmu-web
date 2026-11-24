import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CarcaseComponent, Component, ComponentId } from '../scene/types'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'
import { CabinetGroupNav } from './CabinetGroupNav'
import { ALL_CABINET_TABS } from './cabinetTabGroups'
import { CabinetEditorWorkspace } from './CabinetEditorWorkspace'
import type { CabinetTab } from './CabinetEditor'

afterEach(() => cleanup())

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

const EXPECTED_ORDER: CabinetTab[] = [
  'section', 'construction', 'placement', 'layout',
  'finishing', 'fronts', 'interiors', 'materials', 'edgebanding',
  'appliances', 'services', 'hardware',
  'front', 'top', 'end', '3d',
]

describe('CabinetGroupNav (S2 shell)', () => {
  it('lists all sixteen tabs in the sign-off order, grouped', () => {
    render(<CabinetGroupNav active="section" onTabChange={vi.fn()} />)
    expect(ALL_CABINET_TABS).toEqual(EXPECTED_ORDER)
    const nav = screen.getByLabelText('Cabinet editor tabs')
    expect(nav.querySelectorAll('button')).toHaveLength(16)
    for (const group of ['Structure', 'Appearance', 'Services', 'Views']) {
      expect(screen.getByText(group)).toBeTruthy()
    }
  })

  it('marks the active tab and reports a click upward', async () => {
    const onTabChange = vi.fn()
    render(<CabinetGroupNav active="section" onTabChange={onTabChange} />)
    const active = screen.getByRole('button', { name: /Section/ })
    expect(active.getAttribute('aria-current')).toBe('true')
    await userEvent.click(active)
    expect(onTabChange).toHaveBeenCalledWith('section')
  })
})

describe('CabinetEditorWorkspace (S2 shell)', () => {
  const parts = partsOfBase600()
  const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

  const workspace = (tab: CabinetTab = 'section') => {
    const onTabChange = vi.fn()
    const el = (
      <CabinetEditorWorkspace
        tab={tab}
        onTabChange={onTabChange}
        preview={{
          cabinet,
          parts,
          byId,
          materials: PRESET_MATERIALS,
          selectedPartId: null,
          onSelectPart: vi.fn(),
          selectedSectionId: null,
          onSelectSection: vi.fn(),
        }}
      >
        <div data-testid="real-editor">editor slot</div>
      </CabinetEditorWorkspace>
    )
    return { el, onTabChange }
  }

  it('hosts the real editor child and derives a live preview from scene data', () => {
    render(workspace().el)
    expect(screen.getByTestId('real-editor')).toBeTruthy()
    expect(screen.getByLabelText('Live cabinet preview')).toBeTruthy()
    expect(screen.getByLabelText('Cabinet editor workspace')).toBeTruthy()
  })

  it('reports tab position and geometry sync in the footer', () => {
    render(workspace('fronts').el)
    const foot = screen.getByRole('status')
    expect(foot.textContent).toContain('Geometry in sync')
    expect(foot.textContent).toContain('fronts · 6 / 16')
    expect(foot.textContent).toContain(`${parts.length} parts`)
  })

  it('keeps exploded and section reversible — preview only, never persisted', async () => {
    render(workspace().el)
    const modes = screen.getByRole('group', { name: 'Preview mode' })
    const exploded = within(modes).getByRole('button', { name: 'Exploded' })
    await userEvent.click(exploded)
    expect(exploded.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/preview only, reversible, not written to the file/i)).toBeTruthy()
    // Selecting another mode reverts the exploded state cleanly.
    const front = within(modes).getByRole('button', { name: 'Front' })
    await userEvent.click(front)
    expect(exploded.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByText(/preview only, reversible/i)).toBeNull()
  })

  it('switches the preview mode label without touching the tab', async () => {
    render(workspace().el)
    const modes = screen.getByRole('group', { name: 'Preview mode' })
    await userEvent.click(within(modes).getByRole('button', { name: 'Top' }))
    const preview = screen.getByLabelText('Live cabinet preview')
    expect(preview.textContent).toContain('Top')
    expect(screen.getByRole('status').textContent).toContain('view: top')
  })
})
