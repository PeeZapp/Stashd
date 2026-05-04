/**
 * Normalizes list share tokens from URL path segments (trim, slashes, decode).
 */
export function normalizeShareToken(raw: string): string {
  if (!raw) return '';
  let s = raw.trim().replace(/^\/+|\/+$/g, '');
  try {
    s = decodeURIComponent(s);
  } catch {
    // invalid % sequences — keep trimmed segment
  }
  return s.trim();
}
