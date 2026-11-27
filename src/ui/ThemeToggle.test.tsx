import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { THEME_STORAGE_KEY, ThemeToggle } from './ThemeToggle'

afterEach(() => {
  cleanup()
  localStorage.removeItem(THEME_STORAGE_KEY)
  delete document.documentElement.dataset.theme
})

describe('ThemeToggle', () => {
  it('starts dark, switches to the light tokens and persists the choice', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Switch to light theme' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(document.documentElement.dataset.theme).toBeUndefined()

    fireEvent.click(button)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()
  })

  it('restores the saved light theme on a fresh mount', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    render(<ThemeToggle />)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
