# Cabinet assembly restructure — implementation notes

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md`
**Plan:** _(staged; written per stage)_

Living record of decisions that do not belong in the spec — why an approach was rejected, what was
discovered while designing, and anything that would surprise a future reader.

## 2026-08-27 — the design session

### The scope tripled twice, and both times for a good reason

The session opened as "suggest the next step" and landed on doors and drawer fronts, scoped to
"fronts plus their machining" — one spec, self-contained in a new module beside `carcaseRoles.ts`.
A full design section was written and approved on that basis.

The user then asked for the Cabinet Vision assembly method, which invalidated it: fronts are not a
parameter beside `dividers`, they are leaves of the same tree that *creates* the dividers. Then a
second round added per-part materials driving geometry, per-face joint overrides, screw fixing as the
default, and a five-subtab cabinet editor.

The first design is not in git; it was superseded in conversation. Recording its shape here because
someone will reasonably ask why the spec does not simply add a `fronts: FrontSpec[]` array beside
`dividers` — it did, and the answer is that two systems would then describe the same divisions.

### Four decisions went against the recommendation

Recorded because each carries a cost that will look like an oversight later:

- **Adjustable shelves are per-section in full**, not "count per section, geometry per cabinet". Every
  section therefore repeats `pitch`, `setback`, `backSetback` and `rows`. Mitigated by seeding new
  sections from the preset — the same pattern used for the front material — but a job that wants one
  pin setback everywhere has to set it everywhere. The alternative was rejected explicitly.
- **Carcase-side screw rows are generated now**, not deferred with the hardware model. The concern
  raised was that plate and slide geometry varies by manufacturer and nothing in the data model can
  yet record whose hardware a cabinet is built for. The user chose to generate them anyway; the
  mitigation is that every figure is a named constant in one module, explicitly marked as superseded
  by the hardware design. If those constants are wrong for a given shop, one file is wrong, not the
  generator.
- **Grain runs vertical on every front**, including drawer fronts. The common convention runs a
  bank of drawer fronts horizontally so they read as one board. Vertical throughout is simpler and
  matches the doors beside them; it will nest differently, because grain fixes `allowedRotations`.
- **The scene tree mirrors the section tree** rather than showing a Box group and a Fronts group.
  The concern was that a partition belongs to a split, not to either child. That was resolved rather
  than ignored — divisions are listed under the section whose split created them — but the tree is
  now as deep as the cabinet is subdivided.

### Three things turned out cheaper than expected

All three were checked against the code, not reasoned about:

- **A manual joint override needs no new concept.** Every member of the `Joint` union already carries
  `driven: boolean` and `sourceComponentId?`. `regenerateOne` today replaces every joint matching its
  component id unconditionally; respecting `driven: false` is one line, and mirrors exactly how a
  detached part is protected. The design very nearly invented a `part.overrides.joints[face]` map
  before this was checked.
- **Fronts need no special-casing in the joinery extension pass.** `carcaseRoles` extends panels by
  iterating `carcaseJoints`' descriptors. A front appears in no descriptor, so `extendToward` never
  reaches it. A front is a box no joint mentions, and it passes through face-to-face sized with no
  guard.
- **"Grain vertical on every front" collapses to an existing branch.** Fronts are thickness-on-y
  panels, exactly like `back`, and `grainAxisOf` already returns `'z'` for `back`. Fronts join that
  line verbatim; `grainFieldFor('y','z')` resolves to `'length'` through the existing
  `GRAIN_IN_PLANE.y` map. No new map entry, and no second copy of the role→field table.

### Two facts verified before being built on

- **`MaterialDef` has no thickness field** — only `costPerM2`, `costPerM`, `sheet`, `hasGrain`.
  Thickness lives on the part and is driven from `CarcaseParams.thickness`. So "change the material
  and parts resize" is not a re-wiring; it requires thickness to move onto the material and become
  the authority.
- **The three fastener methods emit nothing today.** `carcaseJoints` returns `[]` for `dowel`,
  `butt-screw` and `confirmat` (`carcaseRoles.ts:401`), with a comment that their geometry is
  hardware rather than a cut. Making screw fixing the default that *shows its holes* is new generator
  output, and it contradicts that comment — which should be updated rather than left to mislead.

### Rejected: a path-based section key

`s.0.2` was the obvious identity for a section. It was rejected because `regenerateOne` reconciles
parts by role key: inserting a section at index 0 would renumber every sibling, re-bind their parts,
and rebuild panels that did not change — losing their colours for a structural edit elsewhere in the
cabinet. A uuid costs nothing and matches every other identity in the codebase.

### The inversion nobody should undo

Overrides must be read *before* the layout resolves boxes, because a thickness override on a side is
what makes the bottom come out at `W − 50`. This makes `carcaseBoxes` a function of parameters *plus
the overrides currently on this cabinet's parts* — the generator reading from the parts it generates.

It stays a function, in one direction: overrides in, boxes out. The failure mode to guard against is
someone later making an override depend on a generated dimension, which would turn one pass into a
fixed-point iteration that may not converge. There is no test that catches this by accident; it needs
an explicit one.

### On Cabinet Vision

My knowledge of Cabinet Vision is general familiarity, not the product in front of me. The
characterisation was stated to the user before anything was built on it, and the two load-bearing
claims — the recursive front-elevation section tree, and per-part material overrides that resize
dependent parts — were confirmed. Everything else in the spec describes what Zimmu will do. Nobody
should cite this design as a description of Cabinet Vision's behaviour.

### The visual companion was not offered in its usual form

The brainstorming skill offers a browser companion served from a local URL. This session runs in a
remote container, so a local URL is not reachable from the user's machine; an Artifact was offered
instead as the equivalent. The user chose text-only, so overlay-versus-inset and the reveal model
were settled in prose. If the elevation editor in stage G needs design review, that is the point
where a visual is worth the tokens.
