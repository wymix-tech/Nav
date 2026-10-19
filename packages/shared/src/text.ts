// This normalization also defines persisted named-view uniqueness. Keep its
// semantics stable; query-specific limits belong in the search layer.
export const normalizeTextKey = (s: string) =>
  s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
