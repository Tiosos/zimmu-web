import 'fake-indexeddb/auto'
import { afterEach, vi } from 'vitest'
import { resetInputModality } from './src/lib/a11y'

// The last-input tracker is module state; a keydown in one test must not leave the next one thinking
// the user is on the keyboard.
afterEach(resetInputModality)

// @testing-library/dom detects fake timers by checking `typeof jest !== 'undefined'`.
// Vitest doesn't expose `jest` by default, so we alias it here so that waitFor()
// correctly uses the jest-fake-timers code path when vi.useFakeTimers() is active.
;(globalThis as unknown as { jest: typeof vi }).jest = vi
