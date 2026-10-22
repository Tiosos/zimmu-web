# Door and drawer opening motion

Open **File → Door & Drawer Motion…**. This nonmodal workspace keeps the 3D viewport visible. Filter by room/cabinet and select generated doors or drawers. Load a front's saved settings, or set a common maximum angle/travel and hinge-axis offset for the selected fronts, then stage. Paired leaves are independent; drawer fronts and all five box panels move together.

Use individual sliders or the selected-progress slider, open/close buttons, and animation with pause/resume. Plan shows the full opening path; elevation and target rows show front dimensions and current angle/travel. Closing the workspace or pressing Escape removes all temporary transforms. Viewport editing and keyboard shortcuts pause while it is open. Any scene/project edit invalidates the draft and clears poses; reset to reload current sources.

**Check opening paths** checks selected fronts simultaneously from closed to their configured maxima, including intermediate intervals. Findings identify and highlight affected fronts/boards; selecting a finding moves the selected group to that interval. Clearance is configurable. Fronts carrying pull drilling can use a conservative handle envelope with configurable projection. Checks include actual scene boards, linked fillers/finishing boards/worktops, other moving assemblies, and member-room walls/obstacles.

Checks are advisory conservative world boxes, including swept intervals (at most 2° per door step or 10 mm per drawer step) and arc-error inflation. They do not subtract machining, wall openings or intentional hinge contacts. Diagonal-wall boxes and full-front handle envelopes can over-report. Walls have unbounded height; room obstacles start at Z=0. The check follows simultaneous normalized travel; independently timed movements are not assessed. Select at most 50 fronts per check; 200 findings is explicitly reported as incomplete.

**Apply motion settings** saves only validated angle/travel/clearance settings in one scene undo step. Current open fractions are never saved, sent through geometry regeneration or used by exports, cutting lists, machining and manufacturing outputs. Saved settings use format 39; older files remain supported. Front IDs persist through regeneration. Missing or unsupported saved fronts remain diagnosable and can have settings removed. Newly edited settings require a supported live front. Reset/cancel discards staged edits.

Supported motion is generic rotation about a configurable side pivot and straight drawer travel. Detached fronts/boxes and tilted cabinets are unavailable. Drawer travel is bounded by the generated box length, with the generic nominal shown for context; this does not certify a runner's rated extension. Supplier-specific multi-link hinges, articulated fronts and physical handle models are outside this batch.

The 50-task implementation checklist:

1. Motion workspace.
2. Room/cabinet selection.
3. Supported-front listing.
4. Individual door selection.
5. Individual drawer selection.
6. Multiple moving fronts.
7. Unsupported/detached diagnostics.
8. Per-door opening settings.
9. Left-hinged doors.
10. Right-hinged doors.
11. Independent paired leaves.
12. Maximum angle.
13. Current angle preview.
14. Hinge-axis offset.
15. Angle/offset validation.
16. Maximum drawer travel.
17. Current drawer extension.
18. Runner nominal context.
19. Front/box movement together.
20. Usable travel validation.
21. Open/close controls.
22. Preview slider.
23. Opening animation.
24. Pause/resume.
25. Reset closed poses.
26. 3D viewport preview.
27. Plan door arcs.
28. Plan drawer travel.
29. Elevation dimensions.
30. Current angle/extension display.
31. Manufacturing geometry unchanged.
32. Door/cabinet checks.
33. Drawer/cabinet checks.
34. Linked filler checks.
35. Finishing/worktop checks.
36. Conservative handle envelopes.
37. Room-wall checks.
38. Room-obstacle checks.
39. Simultaneous door checks.
40. Simultaneous drawer checks.
41. Door/drawer checks.
42. Operating clearance.
43. Intermediate motion checks.
44. Conflict highlighting.
45. Findings linked to fronts.
46. Accuracy/unsupported explanations.
47. One-step apply.
48. Stale protection and undo/redo.
49. Save/reload/live-source refresh.
50. Geometry/history/UI/browser tests and documentation.
