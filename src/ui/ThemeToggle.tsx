import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

// Keep this key in sync with the pre-hydration snippet in index.html. The theme is a user
// preference only: it never enters the scene file, manufacturing packet or release record.
export const THEME_STORAGE_KEY = 'zimmu:theme:v1'

export function ThemeToggle() {
  const [light, setLight] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'light'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (light) root.dataset.theme = 'light'
    else delete root.dataset.theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, light ? 'light' : 'dark')
    } catch {
      // Private browsing may block storage; the in-memory theme still applies for this session.
    }
  }, [light])

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLight((value) => !value)}
      // The accessible name must contain the visible word for axe's label-content-name rule.
      aria-label={light ? 'Light theme — switch to dark' : 'Dark theme — switch to light'}
      aria-pressed={light}
      title={light ? 'Light theme — switch to dark' : 'Dark theme — switch to light'}
      className="text-xs h-7 px-2 rounded flex-shrink-0"
    >
      {light ? 'Light' : 'Dark'}
    </Button>
  )
}
