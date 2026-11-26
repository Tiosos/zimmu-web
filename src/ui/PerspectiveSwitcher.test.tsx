import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PerspectiveSwitcher, type Perspective } from './PerspectiveSwitcher'
import { WorkbenchStatusBar } from './WorkbenchStatusBar'

afterEach(() => cleanup())

describe('PerspectiveSwitcher (S1 shell)', () => {
  it('renders all five perspectives and marks the active one', () => {
    render(<PerspectiveSwitcher active="workbench" onChange={vi.fn()} />)
    expect(screen.getByRole('navigation', { name: 'Workspace perspectives' })).toBeTruthy()
    for (const label of ['Workbench', 'Cabinet Editor', 'Viewport Modes', 'Manufacturing', 'Project & Room']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: /Workbench/ }).getAttribute('aria-current')).toBe('page')
  })

  it('reports a chosen perspective once every stage is implemented', () => {
    const onChange = vi.fn()
    render(<PerspectiveSwitcher active="workbench" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Manufacturing/ }))
    expect(onChange).toHaveBeenCalledWith('manufacture' as Perspective)
    // S2: Cabinet Editor is implemented, so it is no longer labelled as coming later.
    expect(screen.queryByRole('button', { name: /Cabinet Editor \(coming in a later stage/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Cabinet Editor/ })).toBeTruthy()
    // S4: Manufacturing is implemented, so it is no longer labelled as coming later.
    expect(screen.queryByRole('button', { name: /Manufacturing \(coming in a later stage/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Manufacturing/ })).toBeTruthy()
    // S3: Viewport Modes is implemented, so it is no longer labelled as coming later.
    expect(screen.queryByRole('button', { name: /Viewport Modes \(coming in a later stage/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Viewport Modes/ })).toBeTruthy()
    // S5: Project & Room is implemented, so no perspective is marked as upcoming.
    expect(screen.queryByRole('button', { name: /coming in a later stage/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Project & Room/ }))
    expect(onChange).toHaveBeenLastCalledWith('project' as Perspective)
  })
})

describe('WorkbenchStatusBar (S1 shell)', () => {
  it('reports engine state, counts, mode and dirty state', () => {
    render(
      <WorkbenchStatusBar
        occtReady
        partCount={42}
        jointCount={8}
        activeMode="dado"
        dirty
      />,
    )
    const bar = screen.getByLabelText('Workbench status')
    expect(bar.textContent).toContain('OCCT Ready')
    expect(bar.textContent).toContain('42 parts · 8 joints')
    expect(bar.textContent).toContain('Dado (J)')
    expect(bar.textContent).toContain('Unsaved')
  })

  it('keeps the legacy Select (V) label for the none mode', () => {
    render(
      <WorkbenchStatusBar
        occtReady={false}
        partCount={0}
        jointCount={0}
        activeMode="none"
        dirty={false}
      />,
    )
    expect(screen.getByLabelText('Workbench status').textContent).toContain('Select (V)')
  })
})
