import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// @testing-library/dom detects fake timers by checking `typeof jest !== 'undefined'`.
// Vitest doesn't expose `jest` by default, so we alias it here so that waitFor()
// correctly uses the jest-fake-timers code path when vi.useFakeTimers() is active.
;(globalThis as unknown as { jest: typeof vi }).jest = vi
