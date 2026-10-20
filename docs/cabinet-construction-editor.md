# Cabinet Construction tab

Select a cabinet and open **Construction** to stage coordinated changes without editing the model immediately. The tab covers cabinet dimensions, carcase material/top, back construction/material, base construction, toe-kick dimensions, front material/mount/reveal, face-frame geometry/material and joint method.

Input fields belong to a draft. Empty, non-finite, negative or impossible dimensions cannot be applied. Material choices list project panel materials with positive thickness; a missing current slot stays visible so it can be replaced. Existing part material/thickness overrides still take precedence over the cabinet's slots.

**Preview construction** validates the proposed dimensions, actual resolved sections, generated panels, face-frame apertures and drawer boxes, including retained drawer settings. Half-overlay fronts require a face frame. Removing a frame removes its independent front layouts; changing its member widths preserves them. The section tree and its fronts/shelving, cabinet placement and unrelated settings are retained.

A valid preview shows the proposed elevation plus current/proposed outer dimensions, clear root opening, generated carcase panel count and panels by effective material. Counts include the shell, shelves, fronts and face frame; they exclude drawer boxes. They describe generated model panels and do not replace production assessment or manufacturing checks.

**Apply construction** creates one separate undo step for all staged changes. An unchanged draft cannot create a history entry. **Close construction preview** retains the draft. **Reset construction draft** and **Cancel construction changes** reload the current cabinet values without writing to the scene. Leaving the tab discards its draft.

An external cabinet edit leaves the draft visible but blocks preview/apply until Reset loads the current cabinet. Material, role override and drawer-parameter changes invalidate an existing preview. Generated mesh updates alone do not. Preview again to assess the current materials and drawer settings.
