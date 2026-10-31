// Rust begrenzt Suchbegriffe nach UTF-8-Bytes, nicht nach JavaScript-Zeichen.
export const MAX_SEARCH_QUERY_BYTES = 4_096;

export function isSearchQueryWithinByteLimit(query: string): boolean {
  return query.length <= MAX_SEARCH_QUERY_BYTES
    && new TextEncoder().encode(query).length <= MAX_SEARCH_QUERY_BYTES;
}
