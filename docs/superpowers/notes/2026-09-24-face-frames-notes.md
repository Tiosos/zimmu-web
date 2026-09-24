# Face frames and half-overlay — implementation notes

**Spec:** `docs/superpowers/specs/2026-09-24-face-frames-design.md`
**Plans:** one per stage, `docs/superpowers/plans/YYYY-MM-DD-face-frames-stage-N-*.md`

Living record of decisions that do not belong in the spec — why an approach was rejected, what was
discovered during implementation, and anything that would surprise a future reader.

## 2026-09-24 — how this slice was chosen

Not from a roadmap entry. Three shipped specs defer it in almost the same words, and the most recent
of them — cabinet placement — says outright *"This design unblocks them."* Placement completed the
same day (stages 1–4, PRs #48, #49, #50, #51), so the blocker named in writing was removed on
purpose rather than incidentally.

Placement also justified itself partly by naming **two shipped claims that were unreachable without
it**. The first, `frontReveal`'s documented gap between the doors of two cabinets standing side by
side, was closed immediately afterwards by `adjacentFronts.test.ts` (PR #52) — and closing it
corrected a derivation: reasoning from the stated midline rule predicts a gap of `thickness +
reveal`, while the generator gives exactly `reveal`, because an overlay cell reaches the cabinet's
*outer edge* at the cabinet boundary. **Half-overlay is the second claim, and this slice is what
closes it.**

## 2026-09-24 — the decision that matters most, and why the spec's own wording is misleading

The cabinet-assembly restructure describes half-overlay as existing *"to share a face-frame stile
between neighbouring cabinets"*. Read literally, that says a door's size depends on whether a
cabinet stands next to it — which would make `regenerateComponents` read a neighbour, something it
has never done and which would end its being a pure function of one cabinet's parameters.

That reading was put to the user explicitly as an option and **rejected in favour of the
per-cabinet rule**: a half-overlay door laps its own stile by a fixed amount regardless of what is
beside it. The shared stile is then a *consequence* of two cabinets standing together, not a rule
either of them follows.

Recorded because the literal reading is the one a future implementer will reach for — it is what
the older spec appears to say — and because the argument for rejecting it is architectural rather
than cosmetic.

## 2026-09-24 — what decision 2 costs, stated so it is not rediscovered

The section tree drives the frame, which keeps *the section tree is the only description of a
cabinet's interior division* true. The price is real: **a centre stile cannot appear on the face
without a partition behind it**, and real face-frame cabinets sometimes want exactly that.

A per-leaf frame override was considered and rejected as a second place to describe the face. If
that constraint turns out to matter more than the single-tree invariant, the override is where to
look — but it should be a decision taken deliberately, not a patch applied when the first awkward
cabinet appears.

## Open questions carried into implementation

- **Three figures are stated, not derived**, and no test here can falsify them: face-frame hinge
  geometry, the default stile and rail widths, and the half-overlay lap. Same class as the hinge
  table and the TANDEM figures. They want a woodworker's eye.
- **`isNestable` must exclude frame members.** They are solid stock, and the nest is a sheet-goods
  layout. Flagged in the spec's risks because it is the easiest consequence to miss.
- **Two passes will add and remove components** once `regenerateFaceFrames` lands;
  `regenerateDrawers` was the only one, and that invariant is stated in `CLAUDE.md`.
