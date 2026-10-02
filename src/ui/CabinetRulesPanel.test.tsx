import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CabinetRulesPanel } from './CabinetRulesPanel'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import type { RulePreview } from '../scene/ruleFlow'
import type { Scene } from '../scene/types'
const scene: Scene = { components: [], parts: [], joints: [], hardware: [], materials: PRESET_MATERIALS }
afterEach(cleanup)
describe('CabinetRulesPanel', () => {
  it('invalidates a preview after editing and reports stale acceptance', () => {
    const onApply = vi.fn<(preview: RulePreview) => boolean>(() => false)
    render(<CabinetRulesPanel scene={scene} onApply={onApply} />)
    fireEvent.change(screen.getByLabelText('Project Front reveal mm'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Preview project rules'))
    expect(screen.getByText('Apply project rules')).toBeTruthy()
    fireEvent.click(screen.getByText('Apply project rules'))
    expect(screen.getByRole('alert').textContent).toMatch(/design changed/)
    expect(onApply.mock.calls).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Project Front reveal mm'), { target: { value: '6' } })
    expect(screen.queryByText('Apply project rules')).toBeNull()
  })
  it('blocks invalid input and represents no edge band distinctly from inheritance', () => {
    const onApply = vi.fn<(preview: RulePreview) => boolean>(() => true)
    render(<CabinetRulesPanel scene={scene} onApply={onApply} />)
    fireEvent.change(screen.getByLabelText('Project Front reveal mm'), { target: { value: '-1' } })
    fireEvent.click(screen.getByText('Preview project rules'))
    expect((screen.getByText('Apply project rules') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Project Front reveal mm'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Project Edge band'), { target: { value: '__none__' } })
    fireEvent.click(screen.getByText('Preview project rules'))
    fireEvent.click(screen.getByText('Apply project rules'))
    expect(onApply.mock.calls[0][0].candidate.cabinetRules?.project.edgeMaterial).toBe('')
  })
})
