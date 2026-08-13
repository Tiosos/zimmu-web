import { test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { SceneSuggestionsPanel } from './SceneSuggestionsPanel'

afterEach(cleanup)

function scene(): Scene {
  const base = {
    kind: 'board' as const,
    length: 100,
    width: 40,
    thickness: 18,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ' as const,
    cuts: [],
    visible: true,
  }
  return {
    parts: [
      { ...base, id: 'A', label: 'Left Side' },
      { ...base, id: 'B', label: 'Bottom' },
      { ...base, id: 'C', label: 'Top' },
    ],
    materials: {},
    hardware: [],
    joints: [],
  }
}

const dado = (housing: string, housed: string): JointSuggestion => ({
  kind: 'dado',
  neighborId: housed,
  housingPartId: housing,
  housingFace: '+Z',
  housedPartId: housed,
  housedEnd: '-X',
})

const mortiseTenon = (mortise: string, tenon: string): JointSuggestion => ({
  kind: 'mortise-tenon',
  neighborId: tenon,
  mortisePartId: mortise,
  mortiseFace: '+Z',
  tenonPartId: tenon,
  tenonEnd: '-X',
})

// Interleaved on purpose — the ordering suggestJointsForScene actually produces.
const interleaved = [dado('A', 'B'), dado('A', 'C'), mortiseTenon('A', 'B'), mortiseTenon('A', 'C')]

test('renders one row per pair, not one per suggestion', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/All possible joints/))
  expect(screen.getByText('Left Side + Bottom')).toBeTruthy()
  expect(screen.getByText('Left Side + Top')).toBeTruthy()
})

test('the header counts pairs, not suggestions', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  expect(screen.getByText(/All possible joints \(2\)/)).toBeTruthy()
})

test('clicking a chip applies that exact suggestion', () => {
  const onApply = vi.fn()
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={onApply}
      onHoverSuggestion={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/All possible joints/))
  fireEvent.click(screen.getAllByRole('button', { name: 'M&T' })[0])
  expect(onApply).toHaveBeenCalledWith(interleaved[2])
})

test('hovering a chip reports that exact suggestion, and leaving clears it', () => {
  const onHoverSuggestion = vi.fn()
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={onHoverSuggestion}
    />,
  )
  fireEvent.click(screen.getByText(/All possible joints/))
  const chip = screen.getAllByRole('button', { name: 'Dado' })[1]
  fireEvent.mouseEnter(chip)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(interleaved[1])
  fireEvent.mouseLeave(chip)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(null)
})

test('renders nothing when there are no suggestions', () => {
  const { container } = render(
    <SceneSuggestionsPanel
      suggestions={[]}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  expect(container.textContent).toBe('')
})
