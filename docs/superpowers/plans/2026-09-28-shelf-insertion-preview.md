# Selected-shelf insertion preview

## Approved scope
Option 1: selected-shelf 3D preview, playback controls and clear status. Printable instructions remain deferred.

## Data and geometry
- Use the generator's existing `AdjustableShelfAccessResult`, including the exact shelf box and obstacle boxes passed to the solver.
- Do not recompute an independent route or mutate scene geometry, manufacturing data, visibility, history or saved files.
- Render a dedicated cabinet-relative inspection view with translucent fixed obstacles and a highlighted moving shelf.
- Use the solver's Rz * Ry * Rx rotation convention and linear pose interpolation. Fit the camera to structure and the complete motion envelope.
- Use the intended installed position in red when no route was verified; never animate a fabricated route.

## Interaction
- Launch from a selected generated adjustable shelf or the selected opening's Shelving panel.
- The requested-shelf selector includes declined shelves absent from the manufactured scene.
- Play/pause/replay, previous/next pose, restart and scrubbing. Stop at the end.
- Geometry or shelf changes reset playback. Closing/selection changes dispose timers, controls, GPU resources and the preview renderer.
- Native modal focus management and Escape dismissal; preview keystrokes must not trigger scene editing shortcuts.
- State assumptions: doors/fronts open or removed; hardware and other removable shelves omitted.

## Verification
- Pure render tests for exact obstacle extents, final pose, compound rotations, interpolation and immutability.
- UI tests for straight/angled/declined states, transport controls, resetting on changed inputs, modal close and timer cleanup.
- Integration coverage for section and selected-part launch points.
- Browser smoke coverage for opening a real WebGL preview, advancing it and closing it.
- Typecheck, lint, unit suite, build and E2E before completion.
