# Corner worktops and finishing returns

Implement the 50-task batch listed in docs/cabinet-corner-assemblies.md. Two perpendicular, upright cabinet runs in one container produce separately identified rectangular boards with explicit butt joints. Each leg can contain one or more cabinets. Preserve existing straight-run behaviour and manufacturing outputs.

Store a versioned recipe on each owned board, including common assembly ID and stable slot. Refuse incomplete/inconsistent groups; retain last geometry rather than silently recreating deleted parts. Exact scene signatures guard preview acceptance. Recompute at acceptance; one history commit for the entire assembly. Generate before worktop/joint/service machining. Keep cuts, operations, visibility and other user metadata when resizing existing slots. Invalid machining remains visible as diagnostics; never advertise installation/manufacturing approval.

Corner joins are square butt joints only. No mitres, connector routing, unsupported spans or structural certification. Use common-container coordinates for collision tests; ancestor transforms must not alter local results. Reject non-perpendicular or tilted runs, top mismatches, duplicate cabinets, unsupported materials, non-finite/oversized values and impossible joints. Explicitly report conservative envelope interference and potential support/coverage gaps. Exposed end returns are rectangular boards from the outward endpoint toward the opposite cabinet depth boundary.

Alternatives: a single L-shaped boolean solid would conceal separate stock pieces and grain; unrelated straight links cannot update a joint atomically. Use independent board links carrying one identical assembly recipe instead of introducing a new component kind or dependency.
