# Rotation Flash Indicator — Implementation Notes

**Date:** 2026-06-14 (notes backfilled 2026-06-15 from a plan/code cross-check)
**Spec:** `docs/superpowers/specs/2026-06-14-rotation-flash-indicator-design.md`
**Plan:** `docs/superpowers/plans/2026-06-14-rotation-flash-indicator.md`

Living record of decisions/deviations. This file was missing and is reconstructed from the shipped code.

## Status

Fully implemented, plus two follow-up fixes that go beyond the spec. A rotation-changing snap flashes the source mesh emissive from blue (`#60a5fa`) to black over 400 ms; pure-translation snaps do not flash.

## Decisions / deviations

- **`onRotationSnap` callback.** `useSnap` gained an optional `onRotationSnap?(id)` param, fired after `onUpdate` only when the rotation actually changed (`> 0.001` on any axis). `App.tsx` turns this into a `flashTarget = { id, seq }` state (where `seq = performance.now()` forces re-fire even when the same part flashes twice), passed to `<Viewport>`.
- **`handleRotationSnap` is memoized.** The plan inlined the callback; the implementation extracted a `useCallback` for a stable identity. Harmless improvement.
- **Animation via the existing `animate()` loop.** `viewport.tsx` keeps a `flashMap` ref (part id → flash start time) and lerps emissive each frame; entries are deleted at `t >= 1`. Deleted parts are also purged from `flashMap`.

## Flash vs. selection emissive — the spec's accepted bug was actually fixed

The spec **accepted** a known bug: flashing the *selected* part would leave its emissive black and never restore the `0x222244` selection glow. Two follow-up commits fixed it correctly, so the spec section describing this limitation is now stale:

1. **Don't let the mesh-management effect clobber the flash.** The parts/`selectedId` effect re-runs mid-flash (the snap mutates `parts`); it now skips emissive assignment for any part with an active flash (`if (flashMap.current.has(id)) continue`). Color updates still apply — only emissive is gated.
2. **Restore a selection-aware terminal emissive.** When `t >= 1`, the animate loop sets emissive to `0x222244` if the part is selected (read via a `selectedIdRef` to avoid a stale closure in the once-mounted loop) else `0x000000`, then deletes the flash entry.

Net effect: flash → black → (restored selection glow if selected), with no clobbering during the animation.

## Minor

- The rotation-delta comparison is computed twice in `onFaceClick` (once for `noMove`, once for `rotationChanged`), with the same `0.001` threshold. Redundant but correct; left as-is.
