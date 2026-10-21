# Personal construction presets

Open a cabinet's **Construction** tab, then expand **Personal construction presets**. Change the construction draft, enter a name and optional description, and choose **Save construction preset**. Saving does not change the cabinet. Presets belong to this browser and are separate from company catalogue products and rules. Export JSON to keep a portable backup.

Choose a saved preset to inspect its settings and differences from the current draft. Select the groups to reuse: shell/back, base/toe kick, fronts, face frame, panel materials and joint method. **Stage construction preset** changes only those draft fields. Then choose **Preview construction** and **Apply construction**. Application uses the existing validation and creates one undo step. Reset or cancel construction changes to discard the staged values.

Presets never copy cabinet width/height/depth, opening layouts, drawer settings, frame opening layouts, placement, board overrides or catalogue identity/pins. Destination opening/frame layouts follow the existing construction editor's rules: removing a frame removes its independent layouts. Retained board overrides continue to take precedence over panel slots. The preview checks the destination's actual geometry and drawer fit. Selective reuse can create incompatible combinations, such as half overlay without a frame; repair the draft before applying.

Unavailable panel names are shown in the library and remain visible in the draft's material choices. Replace them with project panel stock, or deselect **Panel materials** before staging. Presets do not import materials or change company master rules. Joint method reuse selects the existing supported construction generator; it does not add new joinery algorithms or certify manufacturing readiness.

Search names/descriptions and sort by name or recent update. **Update preset details** changes name/description. **Replace preset from draft** updates settings while preserving the preset's identity and creation time. Duplicate makes an independent copy; delete asks for an inline confirmation. Library edits do not create scene history entries.

Export one preset or the whole library as JSON. Import appends independent copies with fresh IDs and suffixed names on conflicts. Version 1 files accept at most 100 presets and 256 KiB. Malformed, incompatible and oversized imports are rejected as a whole.

A storage failure leaves the visible library intact and reports that the change was not saved. Corrupt stored data is not overwritten automatically. Repair it externally and use **Reload construction presets**, or restore an exported backup after repairing storage. Changes from another tab refresh the list; a missed storage event is also checked before each write. Retry a conflicting action after reviewing the refreshed list. Clearing browser storage removes this personal library.
