import type { SavedLink, SavedLinkStatus, SavedLinkType } from './types';

export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    let path = u.pathname.replace(/\/+$/, '') || '/';
    u.pathname = path;
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be') {
      /* keep short form */
    } else if (host.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
    if (host.startsWith('www.')) u.hostname = host.slice(4);
    return u.href;
  } catch {
    return raw.trim();
  }
}

export type SavedLinkSort = 'newest' | 'updated' | 'title' | 'priority' | 'status' | 'type';

export const SAVED_LINK_STATUSES: { id: SavedLinkStatus; label: string }[] = [
  { id: 'saved', label: 'Saved' },
  { id: 'try_next', label: 'Try next' },
  { id: 'tried', label: 'Tried' },
  { id: 'liked', label: 'Liked' },
  { id: 'not_for_me', label: 'Not for me' },
  { id: 'archived', label: 'Archived' },
];

export const SAVED_LINK_TYPES: { id: SavedLinkType; label: string }[] = [
  { id: 'recipe', label: 'Recipe' },
  { id: 'video', label: 'Video' },
  { id: 'article', label: 'Article' },
  { id: 'tool', label: 'Tool' },
  { id: 'place', label: 'Place' },
  { id: 'product', label: 'Product' },
  { id: 'other', label: 'Other' },
];

export function linkTypeLabel(type: SavedLinkType): string {
  return SAVED_LINK_TYPES.find((t) => t.id === type)?.label ?? 'Link';
}

export function statusLabel(status: SavedLinkStatus): string {
  return SAVED_LINK_STATUSES.find((s) => s.id === status)?.label ?? status;
}

export function filterAndSortSavedLinks(
  links: SavedLink[],
  opts: {
    search?: string;
    collectionId?: string | null;
    type?: SavedLinkType | null;
    status?: SavedLinkStatus | null;
    tag?: string | null;
    platform?: string | null;
    hideArchived?: boolean;
    sort?: SavedLinkSort;
  }
): SavedLink[] {
  let out = [...links];
  const q = opts.search?.trim().toLowerCase();
  if (q) {
    out = out.filter((link) => {
      const hay = [
        link.title,
        link.description,
        link.notes,
        link.site_name,
        link.url,
        ...link.tags,
        ...link.timestamp_notes.flatMap((note) => [note.label, note.timecode, note.note]),
        link.metadata.creator,
        link.metadata.author,
        link.metadata.cuisine,
        ...(link.metadata.ingredients ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (opts.collectionId) {
    out = out.filter((l) => l.collection_ids.includes(opts.collectionId!));
  }
  if (opts.type) out = out.filter((l) => l.link_type === opts.type);
  if (opts.status) out = out.filter((l) => l.status === opts.status);
  if (opts.tag) out = out.filter((l) => l.tags.includes(opts.tag!.toLowerCase()));
  if (opts.platform) {
    const p = opts.platform.toLowerCase();
    out = out.filter(
      (l) =>
        (l.metadata.platform ?? '').toLowerCase() === p ||
        (l.site_name ?? '').toLowerCase() === p
    );
  }
  if (opts.hideArchived) out = out.filter((l) => l.status !== 'archived');

  const sort = opts.sort ?? 'newest';
  out.sort((a, b) => {
    switch (sort) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'priority':
        return b.priority - a.priority || b.updated_at.localeCompare(a.updated_at);
      case 'status':
        return a.status.localeCompare(b.status);
      case 'type':
        return a.link_type.localeCompare(b.link_type);
      case 'updated':
        return b.updated_at.localeCompare(a.updated_at);
      case 'newest':
      default:
        return b.created_at.localeCompare(a.created_at);
    }
  });
  return out;
}

export function collectSavedLinkTags(links: SavedLink[]): string[] {
  const set = new Set<string>();
  links.forEach((l) => l.tags.forEach((t) => set.add(t)));
  return [...set].sort();
}

export function collectPlatforms(links: SavedLink[]): string[] {
  const set = new Set<string>();
  links.forEach((l) => {
    if (l.metadata.platform) set.add(l.metadata.platform);
    else if (l.site_name) set.add(l.site_name);
  });
  return [...set].sort();
}

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,\s#]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}
