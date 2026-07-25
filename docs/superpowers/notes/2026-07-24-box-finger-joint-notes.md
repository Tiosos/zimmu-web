# Box / Finger Joint (JP6) — Implementation Notes

**Date:** 2026-07-24

- Sixth joint type; first interlocking corner and first with a variable integer count
  (`fingerCount`). Symmetric-ish (both boards get finger slots); one board (B) auto-seats. Mirrors
  the M&T slice. `Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint`.
- `fingerjoint.ts` is self-contained (no runtime import from `dado.ts`, which imports
  `deriveFingerJoint` back). The gesture/creation code imports the exported `isValidFingerJoint`
  directly — create gate = derive gate (carrying forward the JP5 fix), so no dead joints.
- **World-parity interlock (the subtle bit):** finger removal is by WORLD segment index, not local
  index. When the two boards' `fingerAxis` run anti-parallel (reachable by rotating B), the seat
  aligns physical spans so a world segment maps to a *reversed* local index on B. `deriveFingerJoint`
  computes `flip = fA·fB < 0` and passes it to `computeFingerCuts`, which removes local `i` iff
  `(flip ? N-1-i : i) % 2 === removeParity`. A removes world-odd, B removes world-even → complementary.
  The L99 review caught this before implementation; a flip fixture (B rotated to `fA·fB = -1`) covers it.
- Each finger slot cuts to depth = the MATING board's thickness (that's the overlap extent along the
  board's seat axis), spans full thickness, one segment along `fingerAxis`. Clearance widens each
  slot by `clearance/2` per interior edge (both boards widen → ≈`clearance` per-side meshed gap).
- The corner seat is a 3-axis flush placement in A's orthonormal frame; the corner side (which of
  A's thickness faces) is chosen nearest B's current end, so the move is minimal and idempotent.
- Fingers minimum is 3 (a 1-finger "joint" is a degenerate lap). Requires equal joint widths.
- 6th exclusive viewport mode. **Shortcut is `B` (box joint), not `F`** — `F` was already bound to
  snap mode, so the plan's original `f` collided and was corrected to `b` during Task 5. The
  `activeMode`-enum refactor (six modes now) is deferred to its own slice (L99 finding D1).
- No OCCT/mesh/export/drawing change — ordinary `BoxCut`s. Interactive 3D verification is a human
  step (OCCT WASM doesn't boot headless).
