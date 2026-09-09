// Compatibility facade. New code should import the narrow domain module under ./carcase/.
// Keeping this path stable lets the architecture split land without repository-wide import churn
// or any change to the cabinet algorithms themselves.
export * from './carcaseRolesCore'
