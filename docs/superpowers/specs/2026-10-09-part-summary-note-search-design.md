# Part summary note search

Extend the existing part-summary query to match review notes belonging to detected part and operation changes. Keep literal normalized case-insensitive matching, IDs/labels, pending ordering, current selection, progress and complete exports. Exclude global review notes and output/limitation notes because those are not reliably associated with a part. Match current edits and resumed notes. Explain the expanded search beside the input.

Test part and operation notes, normalized literal text, live edits, unrelated-note exclusion and selection/export preservation. Mutation-test note inclusion and association.
