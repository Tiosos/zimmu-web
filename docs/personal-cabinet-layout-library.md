# Personal cabinet layout library

Open a cabinet's Section tab and expand **Personal layout library** below the opening design tools.

Enter a **Layout name**, then save either the **selected opening** or the **cabinet layout**. A saved design is an independent snapshot of its divisions, fronts, shelving and shelf-pin settings. It does not include independent face-frame layouts, materials, drawer parameters or board overrides. Source cabinet dimensions are shown as a reference and are not applied to the destination.

Select a saved entry to rename, duplicate or delete it. Delete requires an inline confirmation. Search filters by name without regard to case. Sort by name, recent updates or oldest first. Each entry summarizes its opening, door, drawer-front and shelf counts. Duplicating and importing create fresh library IDs and unique names.

Choose **Selected opening** or **Whole cabinet**, then **Preview saved layout**. The preview uses the destination cabinet's current dimensions, material thicknesses, board overrides and retained drawer parameters. Geometry or drawer-box fit errors disable Apply. Cancel leaves the model untouched. Design, selection, material and thickness changes expire a preview; mesh updates alone do not.

**Apply saved layout** replaces the target subtree and its independent face-frame layouts, retaining the target's ID and size. Descendants receive fresh IDs; new drawers use default settings. Existing destination overrides attached to retained identities remain in place. Each application is a separate undo/redo step. Whole-cabinet application changes the root opening layout, keeping cabinet dimensions, placement and material slots.

**Export selected layout** writes one entry as JSON; **Export layout library** writes all entries. **Import layout JSON** appends validated entries without replacing existing ones. Files are versioned and limited to 512 KiB, libraries to 100 entries, and individual designs to 256 nodes and 16 nested divisions. Invalid files leave the current library unchanged.

The library is stored in this browser and is available when switching cabinets or reloading the app. It is separate from project files and company catalogue products. Export JSON for a portable backup or to transfer layouts to another browser. Storage failures are reported without claiming a successful save. Unreadable stored data is not overwritten automatically; **Reload local layouts** retries loading it. Changes from another tab refresh the list; a detected storage conflict rejects the attempted write so you can retry against the refreshed library.
