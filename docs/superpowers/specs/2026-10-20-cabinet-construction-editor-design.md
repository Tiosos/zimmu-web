# Cabinet construction editor

Add a Construction tab for coordinated parameter edits: dimensions, top, carcase/back/front/frame material slots, back/base modes, toe-kick dimensions, front mount/reveal, frame geometry and joint method. Preserve section structure, cabinet identity/placement and unrelated params. Existing sidebar controls remain available.

Keep input strings in an isolated draft so empty/unfinished numeric fields cannot reach the model. Preview parses finite values, uses actual role overrides and canonical opening/drawer validation, and shows the proposed elevation. Summarize before/after outer dimensions, clear root opening, generated carcase panel count and counts by effective material. Do not imply these counts include drawer boxes or manufacturing readiness.

Frame edits retain independent frame layouts while the frame remains enabled; disabling removes the frame and its independent layouts, disclosed beside the toggle. Half-overlay without a frame remains invalid. Material choices offer project panel materials with positive thickness; missing existing slots remain visible but are validated when used. New frame geometry starts from existing DEFAULT_FRAME; no new dimensional presets.

Preview captures exact cabinet params, materials, role overrides and drawer parameters. Changes to these invalidate it. External params changes leave the user's draft visible, block preview/application and require an explicit Reset to the current model. Apply guards cabinet ID/current base and creates a single labeled undo step; unchanged drafts do not create history. Reset/Cancel touch no scene state. Drafts are scoped to this tab and discarded when leaving it.

Validate finite numerical inputs including inactive stored toe-kick/reveal settings, positive widths/heights/depth and frame members, valid modes, actual generated panel geometry, fit of current drawer boxes and face frames. Inspect material resolution using the canonical role resolver, not a second mapping. Preview can show invalid errors without drawing invalid geometry.

Verify pure draft construction/geometry summaries, all field groups, frame transitions, overrides/drawers, stale updates, reset/cancel and separate undo in unit/browser tests. Mutation-test new guards from backups; final checks include typecheck, lint, full unit suite, Chromium workflows and both builds.
