import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { ViewportModesNav, ViewportModesPanel, ViewportModesOverlay } from './ViewportModes'
import {
  MODES, MODE_GROUPS, ALL_MODE_IDS, CLASS_A_IDS, CLASS_B_IDS,
} from './viewportModeData'

afterEach(() => cleanup())

const CLASS_A_KEYS: Record<string, string> = {
  snap: 'F', cut: 'C', dado: 'J', halflap: 'L',
  mortiseTenon: 'M', finger: 'B', tongueGroove: 'T',
}

describe('viewportModeData (S3 spec)', () => {
  it('contains exactly 15 modes split into 7 Class A and 8 Class B', () => {
    expect(ALL_MODE_IDS).toHaveLength(15)
    expect(CLASS_A_IDS).toHaveLength(7)
    expect(CLASS_B_IDS).toHaveLength(8)
    expect(new Set(ALL_MODE_IDS).size).toBe(15)
    expect(MODE_GROUPS.flatMap((g) => g.ids)).toEqual(ALL_MODE_IDS)
  })

  it('uses the authoritative key map for Class A and no keys for Class B', () => {
    for (const id of CLASS_A_IDS) {
      expect(MODES[id].key).toBe(CLASS_A_KEYS[id])
      expect(MODES[id].interactionMode).toBeTruthy()
      expect(MODES[id].wiring).toBe('wired')
    }
    for (const id of CLASS_B_IDS) {
      expect(MODES[id].key).toBeUndefined()
      expect(MODES[id].interactionMode).toBeUndefined()
    }
    // M is mortise & tenon, never Measure.
    expect(MODES.mortiseTenon.key).toBe('M')
    expect(MODES.measure.wiring).toBe('advisory')
    expect(MODES.measure.advisory).toMatch(/`M` key opens Mortise/)
  })

  it('every mode has three steps and states advisory limits where not wired', () => {
    for (const id of ALL_MODE_IDS) {
      expect(MODES[id].steps).toHaveLength(3)
      if (MODES[id].wiring === 'advisory') {
        expect(MODES[id].advisory).toBeTruthy()
      }
    }
  })
})

describe('ViewportModesNav (S3 shell)', () => {
  it('lists all 15 modes in four groups and marks the active one', () => {
    render(<ViewportModesNav activeId="snap" onSelectMode={vi.fn()} activeInteraction="snap" />)
    const nav = screen.getByLabelText('Viewport mode list')
    expect(nav.querySelectorAll('button')).toHaveLength(15)
    for (const g of ['Navigation', 'Editing', 'Joinery', 'Display']) {
      expect(screen.getByText(g)).toBeTruthy()
    }
    const snap = screen.getByRole('button', { name: /Face Snap/ })
    expect(snap.getAttribute('aria-current')).toBe('true')
  })

  it('reports a click and shows the authoritative key badges for Class A', () => {
    const onSelectMode = vi.fn()
    render(<ViewportModesNav activeId="select" onSelectMode={onSelectMode} activeInteraction="none" />)
    fireEvent.click(screen.getByRole('button', { name: /Face Snap/ }))
    expect(onSelectMode).toHaveBeenCalledWith('snap')
    const nav = screen.getByLabelText('Viewport mode list')
    expect(within(nav).getByText('F')).toBeTruthy()
    expect(within(nav).getByText('M')).toBeTruthy()
  })
})

describe('ViewportModesPanel (S3 shell)', () => {
  const panel = (activeId: string) => (
    <ViewportModesPanel
      activeId={activeId}
      onActivateInteraction={vi.fn()}
      onToolAction={vi.fn()}
      interactionStatus={null}
    />
  )

  it('shows steps, parameters, live state and gizmo readout for the active mode', () => {
    render(panel('dado'))
    expect(screen.getByLabelText('Workflow steps').querySelectorAll('li')).toHaveLength(3)
    expect(screen.getByLabelText('Mode parameters').textContent).toContain('Housing')
    expect(screen.getByText('8 / 15')).toBeTruthy()
  })

  it('Apply activates a real Class A interaction mode', () => {
    const onActivateInteraction = vi.fn()
    const onToolAction = vi.fn()
    render(
      <ViewportModesPanel
        activeId="cut"
        onActivateInteraction={onActivateInteraction}
        onToolAction={onToolAction}
        interactionStatus={null}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Activate Mode' }))
    expect(onActivateInteraction).toHaveBeenCalledWith('cut')
    expect(onToolAction).not.toHaveBeenCalled()
  })

  it('Apply runs a real Class B tool action', () => {
    const onActivateInteraction = vi.fn()
    const onToolAction = vi.fn()
    render(
      <ViewportModesPanel
        activeId="addPart"
        onActivateInteraction={onActivateInteraction}
        onToolAction={onToolAction}
        interactionStatus={null}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Model' }))
    expect(onToolAction).toHaveBeenCalledWith('addPart')
  })

  it('advisory modes disable Apply and state their limit', () => {
    render(panel('measure'))
    const apply = screen.getByRole('button', { name: 'Not available in 3D yet' }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    expect(screen.getByRole('note').textContent).toMatch(/Mortise/)
  })

  it('renders the live status when the real mode is active', () => {
    render(
      <ViewportModesPanel
        activeId="snap"
        onActivateInteraction={vi.fn()}
        onToolAction={vi.fn()}
        interactionStatus="Source picked — choose the target face"
      />,
    )
    expect(screen.getByText(/Source picked/)).toBeTruthy()
  })
})

describe('ViewportModesOverlay (S3 shell)', () => {
  it('shows the active mode name and wiring class', () => {
    const { container } = render(<ViewportModesOverlay activeId="measure" />)
    expect(container.textContent).toContain('Measure')
    expect(container.textContent).toContain('Class B')
  })
})
