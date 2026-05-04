/** Protocol-relative URLs (//cdn.example/…) fail HTML5 type="url" inputs; normalize for storage and forms. */
export function normalizeProtocolRelativeUrl(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}
