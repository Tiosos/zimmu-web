// A box cut thinner than this is treated as absent by the geometry exporter. Checks must agree with
// it, or a readiness finding would describe a cut the packet never manufactures.
export const MIN_CUT_SIZE_MM = 0.1
