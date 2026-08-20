import { test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { SuggestionsPanel } from './SuggestionsPanel'

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
    parentId: null,
    driven: false,
  }
  return {
    parts: [
      { ...base, id: 'A', label: 'Rail 1' },
      { ...base, id: 'B', label: 'Rail 2' },
      { ...base, id: 'C', label: 'Rail 3' },
    ],
    materials: {},
    components: [],
    hardware: [],
    joints: [],
  }
}

const suggestions: JointSuggestion[] = [
  { kind: 'halflap', neighborId: 'B', partAId: 'A', partBId: 'B' },
  {
    kind: 'dado',
    neighborId: 'B',
    housingPartId: 'A',
    housingFace: '+Z',
    housedPartId: 'B',
    housedEnd: '+X',
  },
]

test('renders a row per suggestion with the neighbour label', () => {
  render(
    <SuggestionsPanel
      suggestions={suggestions}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  expect(screen.getByText('Half-lap with Rail 2')).toBeTruthy()
  expect(screen.getByText('Dado with Rail 2')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(2)
})

test('clicking Add calls onApply with that suggestion', () => {
  const onApply = vi.fn()
  render(
    <SuggestionsPanel
      suggestions={suggestions}
      scene={scene()}
      onApply={onApply}
      onHoverSuggestion={vi.fn()}
    />,
  )
  fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1])
  expect(onApply).toHaveBeenCalledWith(suggestions[1])
})

test('renders nothing when there are no suggestions', () => {
  const { container } = render(
    <SuggestionsPanel
      suggestions={[]}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  expect(container.textContent).toBe('')
})

// Distinct neighbours, so a row reporting the *wrong* row's neighbour cannot pass.
const twoNeighbors: JointSuggestion[] = [
  { kind: 'halflap', neighborId: 'B', partAId: 'A', partBId: 'B' },
  {
    kind: 'dado',
    neighborId: 'C',
    housingPartId: 'A',
    housingFace: '+Z',
    housedPartId: 'C',
    housedEnd: '+X',
  },
]

test('each row reports its own suggestion on hover', () => {
  const onHoverSuggestion = vi.fn()
  render(
    <SuggestionsPanel
      suggestions={twoNeighbors}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={onHoverSuggestion}
    />,
  )
  fireEvent.mouseEnter(screen.getByText('Half-lap with Rail 2').closest('div')!)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(twoNeighbors[0])

  fireEvent.mouseEnter(screen.getByText('Dado with Rail 3').closest('div')!)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(twoNeighbors[1])
})

test('leaving a row clears the hover', () => {
  const onHoverSuggestion = vi.fn()
  render(
    <SuggestionsPanel
      suggestions={twoNeighbors}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={onHoverSuggestion}
    />,
  )
  fireEvent.mouseLeave(screen.getByText('Dado with Rail 3').closest('div')!)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(null)
})
