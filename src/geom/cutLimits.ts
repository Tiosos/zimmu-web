// A box cut thinner than this is treated as absent by the geometry exporter. Checks must agree with
// it, or a readiness finding would describe a cut the packet never manufactures.
export const MIN_CUT_SIZE_MM = 0.1

// Two cuts that leave less solid material between their walls than this are reviewed as thin webs.
// A web tears out under a router or drill and collapses in handling, but ordinary joinery puts
// features close together on purpose, so the finding is advisory rather than blocking.
export const MIN_REMAINING_WEB_MM = 3.0
