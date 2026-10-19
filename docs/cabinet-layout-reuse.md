# Reuse and refine cabinet openings

Select an opening in the cabinet Section editor. **Reuse opening design** contains these fifteen additions:

1. **Copy opening design** takes an in-memory snapshot of the selected opening and all its descendants.
2. **Paste opening layout** replaces the target subtree while retaining the target's ID and size. Copied descendants receive fresh IDs.
3. **Paste opening front** copies only a leaf opening's front, including absence of a front.
4. **Paste opening shelving** copies only its shelving and pin settings, including absence of shelving.
5. **Mirror opening left/right** reverses vertical splits recursively and exchanges left/right handing on single doors.
6. **Mirror opening top/bottom** reverses horizontal splits recursively without changing door handing.
7. **Remove opening fronts** removes fronts throughout the selected subtree.
8. **Remove opening shelving** removes interior shelves and shelf-pin rows throughout that subtree.
9. **Clear opening contents** removes both, retaining all structural divisions and sizes.
10. **Repeat front to siblings** replaces the front on every sibling of the selected leaf.
11. **Repeat shelving to siblings** replaces shelving on those siblings. Repeat is available only when every sibling is a leaf; it does not flatten nested designs.
12. **Lock current opening sizes** turns the selected group's immediate children (or a leaf's siblings) into fixed sizes using actual resolved dimensions and division thicknesses.
13. **Equalize nested openings** makes every descendant size Equal, preserving the selected group's own size and all contents.
14. **Previous opening** selects the preceding leaf in tree order.
15. **Next opening** selects the following leaf; from a selected group it starts at the cabinet's first leaf. Neither command wraps.

Vertical groups are ordered left to right; horizontal groups bottom to top. Mirroring moves identities, sizes and contents together. Two mirrors restore the original section tree, except removed independent face-frame overrides.

The clipboard stays in memory while the cabinet editor is mounted. It is not saved in the project or local storage. It contains section structure, fronts and interior settings, not cabinet dimensions, materials, drawer parameters or per-board overrides. Destination cabinet materials remain in use; existing destination overrides attached to retained identities remain in place. Fresh descendants generate new boards and default drawer configurations.

Full paste, mirroring, and front removal/replacement remove independent face-frame layouts only within the affected openings, so those layouts cannot override the requested change. Shelving-only edits preserve them. These effects are described beside the controls.

Every modifying command validates cabinet geometry and generated drawer boxes before writing and creates a separate undo step. Existing drawer configurations are used during fit checks; newly introduced drawers use defaults. An invalid edit displays a reason and leaves the design untouched. Copy and navigation do not modify the design. This checks model geometry; manufacturing readiness still uses the production assessment.
