# Interaction-Mode Refactor — Implementation Notes

**Date:** 2026-07-25

- Behavior-preserving refactor: the six exclusive viewport modes (snap, cut, dado, half-lap,
  mortise-tenon, finger) now route through one `useInteractionMode` coordinator hook instead of six
  parallel booleans with N² cross-cancellation.
- `useInteractionMode` composes the six gesture hooks unchanged, derives one `activeMode`, and
  exposes a toggle-aware exclusive `setMode` (cancel the others, toggle the target — behaviour-exact
  vs the old `handleActivate<X>`), plus a normalized `{ onFaceClick, onFaceHover, sourceFace,
  hoveredFace, interactionActive, snapPhase }` bundle and pass-throughs (`statuses`,
  `lastPlacedCutId`, `dowelTool`, `armDowelTool`).
- `Viewport` went from ~36 props (29 mode-specific) to 13 (6 mode-specific); its click routing keeps
  the normal-mode `else` selection branch (deselect-on-miss) — only the six mode-branches collapsed.
  `snapPhase` is kept distinct (still a prop), not derived away from `sourceFace`.
- `Sidebar` keeps its prop shape, fed from the coordinator (`snapActive={activeMode==='snap'}`, …) —
  its tests were untouched.
- The old Viewport `jointHousingFace` prop (dado source-highlight, fed from the dado hook's
  `pendingHousing`) is now routed through the normalized `sourceFace` (which returns
  `joint.pendingHousing` in dado mode) — same face, same styling.
- Adding a 7th mode is now: new gesture hook + one registry entry in `useInteractionMode` + a
  keyboard case + Sidebar props/button. **Viewport needs zero changes.**
- Success criterion was the entire existing suite green with no existing-test changes; the only new
  tests are `useInteractionMode.test.ts` (7). Net: −411/+70 lines across App.tsx + viewport.tsx.
