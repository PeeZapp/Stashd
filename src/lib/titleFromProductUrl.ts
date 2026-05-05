/** Short readable title when saving a URL-only (quick add) row */
export function titleFromProductUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) {
      const decoded = decodeURIComponent(last.replace(/\+/g, ' ')).replace(/[-_]/g, ' ');
      const trimmed = decoded.slice(0, 120).trim();
      if (trimmed) return trimmed;
    }
    return u.hostname;
  } catch {
    return 'Saved link';
  }
}
