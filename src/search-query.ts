// Rust begrenzt Suchbegriffe nach UTF-8-Bytes, nicht nach JavaScript-Zeichen.
// TextEncoder ersetzt isolierte UTF-16-Surrogate still durch U+FFFD; das verhindern wir.
export const MAX_SEARCH_QUERY_BYTES = 4_096;

export function isSearchQueryWithinByteLimit(query: string): boolean {
  return query.length <= MAX_SEARCH_QUERY_BYTES
    && !/[\uD800-\uDFFF]/u.test(query)
    && new TextEncoder().encode(query).length <= MAX_SEARCH_QUERY_BYTES;
}
