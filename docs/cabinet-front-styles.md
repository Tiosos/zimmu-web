# Door and drawer-front styles (slab and shaker)

Implementation checklist:

1. Front style on a door spec.
2. Front style on a drawer-front spec.
3. Absent style reads as a flat slab.
4. Cover panels and false fronts stay single boards.
5. Default frame width.
6. Default panel recess.
7. Default panel thickness.
8. Frame width in millimetres.
9. Panel recess in millimetres.
10. Panel thickness in millimetres.
11. Two stiles, full height.
12. Two rails between the stiles.
13. Panel filling the frame's opening.
14. Panel set back from the outer face.
15. Panel kept inside the front's depth.
16. Frame keeps the front material's thickness.
17. Panel is the thinner board.
18. Grain up a stile.
19. Grain across a rail.
20. Grain up the panel.
21. Cutting-list rows per piece.
22. Per-piece labels carrying the door's ordinal.
23. Front material carried to every piece.
24. Edge banding read per piece.
25. Hinge cup bored into the hinge stile.
26. Cup edge distance measured from the door's outer edge.
27. Cup refused where the stile is too narrow.
28. Plate screws in the upright the door is hinged on.
29. Plate screw heights carried through carcase space.
30. No cups on the handle-side stile.
31. Opening count unchanged by a style change.
32. Visible reveals unchanged by a style change.
33. Outer door extent unchanged by a style change.
34. Door assembly pieces declared as contacts.
35. No new unjoined rows on the joinery checklist.
36. Refusal when the frame leaves no panel across.
37. Refusal when the frame leaves no panel down.
38. Refusal when the panel does not fit the front's depth.
39. Refusal for a zero or negative frame.
40. Refusal for a zero or negative panel.
41. Refusal reported at the gesture that set it.
42. Refused style emits a flat door, never a partial assembly.
43. Staged edits separate from applied state.
44. Preview before apply.
45. Atomic apply.
46. Undo and redo.
47. Stale draft rejected when the cabinet changes.
48. Save and reload.
49. File format version 43 with a history entry.
50. Unit, browser and documentation coverage.

## Use the workspace

Open a cabinet, choose **Fronts & Drawers**, select the openings you want, then use **Stage door and
drawer-front construction**. A shaker front is five boards: two stiles, two rails and a panel set back
between them. The frames keep the front material's thickness; the panel is the thinner board and
states its own.

Press **Preview fronts and drawers** to see the proposed elevation and the per-board changes, then
**Apply fronts and drawers**. Reset and Cancel both discard the draft.

## The five boards

| Piece | Size |
|---|---|
| `stile-l`, `stile-r` | full height × frame width × front thickness |
| `rail-b`, `rail-t` | clear width × frame width × front thickness |
| `panel` | clear width × clear height × stated panel thickness |

The roles are the door's own role with a piece suffix — `front-<section>-<leaf>-panel` — so the
opening still owns them. A style change therefore changes the *boards*, never the *openings*: the
opening count, the visible reveals and the door's outer extent are identical to the flat door's.

The panel's outer face sits `panelRecess` behind the frame's outer face and its back stays inside the
front's depth, so it never protrudes into the cabinet. A left-hinged door bores its cups into the
left stile, a right-hinged door into the right one, at the same edge distance the flat door used.

## What a made front changes

- **Cutting list**: five rows where there was one, in the front material, with the panel at its own
  thickness. The panel is the only row whose thickness differs from the material's nominal board.
- **Joinery checklist**: the ten piece pairs inside a door are declared contacts, exactly as a face
  frame's stiles and rails are. Switching a door between flat and shaker adds no unjoined row.
- **Hardware**: hinge cups and plate screws are unchanged in kind and count — only the panel they are
  bored into moves from the door to the stile.

## Refusals

A style the cabinet cannot build is refused where it is set, with the reason, and the opening keeps
its flat front in the file so that an older or edited file still opens:

- frame narrower than 40 mm, so the hinge cup would not fit in the stile (35 / 2 + 22.5 mm);
- a frame that leaves no panel across the door's width;
- a frame that leaves no panel down the door's height;
- a panel whose recess plus thickness exceeds the front material's thickness;
- a zero or negative frame width, panel thickness or recess.

The same rules run again at preview, so a style that was valid when staged and is not valid now is
still reported rather than applied.

## Limits

- Door corner joinery is not generated: the pieces are declared contacts, not mortise-and-tenon or
  dowel joints. How a door is put together remains a workshop decision.
- A made door does not carry a per-door hinge layout; cups follow the default hinge table.
- Drawing sheets draw the five boards as boards. A panel-and-frame outline on the elevation is not
  added yet.
- No applied mouldings, profiled door faces, glass, grilles or curved doors.
- The panel keeps the front material's name and states its own thickness, so its cutting-list row
  reads e.g. `18mm Ply` at 6 mm. A dedicated panel material slot is a separate change.
