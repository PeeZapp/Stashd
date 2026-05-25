import { ExternalLink, Star } from 'lucide-react';
import type { SavedLink, SavedLinkCollection } from '../../lib/types';
import { linkTypeLabel, statusLabel } from '../../lib/savedLinkUtils';

interface SavedLinkCardProps {
  link: SavedLink;
  collections: SavedLinkCollection[];
  onOpen: () => void;
  onOpenUrl: () => void;
}

export default function SavedLinkCard({
  link,
  collections,
  onOpen,
  onOpenUrl,
}: SavedLinkCardProps) {
  const collectionNames = link.collection_ids
    .map((id) => collections.find((c) => c.id === id)?.name)
    .filter(Boolean);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 hover:shadow-md transition-all cursor-pointer text-left flex flex-col h-full"
    >
      <div className="aspect-[16/9] bg-gray-100 relative overflow-hidden">
        {link.image_url ? (
          <img src={link.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
            No preview
          </div>
        )}
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-white/90 text-xs font-medium text-gray-700 shadow-sm">
          {linkTypeLabel(link.link_type)}
        </span>
        {link.status === 'try_next' && (
          <span className="absolute top-2 right-2 p-1 rounded-full bg-amber-100 text-amber-700">
            <Star className="w-3.5 h-3.5 fill-current" />
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1 gap-1.5">
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 leading-snug">{link.title}</h3>
        {(link.site_name || link.metadata.platform) && (
          <p className="text-xs text-gray-500 truncate">
            {link.metadata.platform ?? link.site_name}
          </p>
        )}
        {link.description && (
          <p className="text-xs text-gray-500 line-clamp-2">{link.description}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
            {statusLabel(link.status)}
          </span>
          {collectionNames.slice(0, 2).map((name) => (
            <span
              key={name}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-100"
            >
              {name}
            </span>
          ))}
          {link.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] text-gray-400">
              #{tag}
            </span>
          ))}
          {link.link_type === 'video' && link.timestamp_notes.length > 0 && (
            <span className="text-[10px] text-gray-400">
              {link.timestamp_notes.length} timestamp{link.timestamp_notes.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenUrl();
          }}
          className="mt-1 inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        >
          <ExternalLink className="w-3 h-3" />
          Open link
        </button>
      </div>
    </article>
  );
}
