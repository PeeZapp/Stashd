import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import type { SavedLink, SavedLinkCollection, SavedLinkStatus, SavedLinkType } from '../../lib/types';
import { scrapeLink } from '../../lib/scrapeLink';
import { canonicalizeUrl, parseTagsInput } from '../../lib/savedLinkUtils';
import { findSavedLinkByCanonicalUrl } from '../../lib/firestore';

interface AddSavedLinkModalProps {
  userId: string;
  collections: SavedLinkCollection[];
  initialUrl?: string;
  initialCollectionId?: string;
  onClose: () => void;
  onSaved: (link: SavedLink) => void;
  onOpenExisting: (link: SavedLink) => void;
  onCreate: (params: {
    url: string;
    canonical_url: string;
    title: string;
    description: string | null;
    image_url: string | null;
    site_name: string | null;
    favicon_url: string | null;
    link_type: SavedLinkType;
    status: SavedLinkStatus;
    collection_ids: string[];
    tags: string[];
    notes: string | null;
    metadata: SavedLink['metadata'];
  }) => Promise<SavedLink>;
  onAddToCollection: (linkId: string, collectionIds: string[]) => Promise<void>;
}

export default function AddSavedLinkModal({
  userId,
  collections,
  initialUrl = '',
  initialCollectionId,
  onClose,
  onSaved,
  onOpenExisting,
  onCreate,
  onAddToCollection,
}: AddSavedLinkModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [linkType, setLinkType] = useState<SavedLinkType>('other');
  const status: SavedLinkStatus = 'saved';
  const [tagsInput, setTagsInput] = useState('');
  const [collectionIds, setCollectionIds] = useState<string[]>(
    initialCollectionId ? [initialCollectionId] : collections[0]?.id ? [collections[0].id] : []
  );
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<SavedLink['metadata']>({});
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState<SavedLink | null>(null);

  useEffect(() => {
    if (initialUrl.trim()) void handleFetchPreview(initialUrl.trim());
  }, []);

  const handleFetchPreview = async (raw?: string) => {
    const target = (raw ?? url).trim();
    if (!target) {
      setError('Enter a URL');
      return;
    }
    if (!collectionIds[0]) {
      setError('Choose a collection first');
      return;
    }
    try {
      new URL(target);
    } catch {
      setError('Enter a valid URL');
      return;
    }
    setError('');
    setDuplicate(null);
    setScraping(true);
    try {
      const canon = canonicalizeUrl(target);
      setCanonicalUrl(canon);
      const existing = await findSavedLinkByCanonicalUrl(userId, canon);
      if (existing) {
        setDuplicate(existing);
      }
      const scraped = await scrapeLink(target);
      setTitle(scraped.title ?? target);
      setDescription(scraped.description ?? '');
      setPreviewImage(scraped.image_url);
      setSiteName(scraped.site_name);
      setFaviconUrl(scraped.favicon_url);
      setLinkType(scraped.link_type);
      setMetadata(scraped.metadata);
      if (scraped.canonical_url) setCanonicalUrl(canonicalizeUrl(scraped.canonical_url));
      const existing2 = await findSavedLinkByCanonicalUrl(
        userId,
        canonicalizeUrl(scraped.canonical_url ?? canon)
      );
      if (existing2) setDuplicate(existing2);
    } catch {
      setError('Could not fetch preview. You can still save manually.');
      setTitle(target);
      setCanonicalUrl(canonicalizeUrl(target));
    } finally {
      setScraping(false);
    }
  };

  const handleSave = async () => {
    const target = url.trim();
    if (!target) {
      setError('Enter a URL');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let nextTitle = title;
      let nextDescription = description;
      let nextImage = previewImage;
      let nextSiteName = siteName;
      let nextFavicon = faviconUrl;
      let nextType = linkType;
      let nextMetadata = metadata;
      let canon = canonicalUrl || canonicalizeUrl(target);
      let existingDuplicate = duplicate;

      if (!nextTitle && !nextImage) {
        const scraped = await scrapeLink(target);
        nextTitle = scraped.title ?? target;
        nextDescription = scraped.description ?? '';
        nextImage = scraped.image_url;
        nextSiteName = scraped.site_name;
        nextFavicon = scraped.favicon_url;
        nextType = scraped.link_type;
        nextMetadata = scraped.metadata;
        canon = canonicalizeUrl(scraped.canonical_url ?? canon);
        existingDuplicate = await findSavedLinkByCanonicalUrl(userId, canon);
      }
      if (existingDuplicate) {
        const merged = [...new Set([...existingDuplicate.collection_ids, ...collectionIds])];
        if (merged.length !== existingDuplicate.collection_ids.length) {
          await onAddToCollection(existingDuplicate.id, merged);
        }
        onOpenExisting({ ...existingDuplicate, collection_ids: merged });
        onClose();
        return;
      }
      const link = await onCreate({
        url: target,
        canonical_url: canon,
        title: nextTitle.trim() || target,
        description: nextDescription.trim() || null,
        image_url: nextImage,
        site_name: nextSiteName,
        favicon_url: nextFavicon,
        link_type: nextType,
        status,
        collection_ids: collectionIds,
        tags: parseTagsInput(tagsInput),
        notes: null,
        metadata: nextMetadata,
      });
      onSaved(link);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const selectedCollectionName =
    collections.find((collection) => collection.id === collectionIds[0])?.name ?? 'Choose collection';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Save a link</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
            <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="button"
              disabled={scraping}
              onClick={() => void handleFetchPreview()}
              className="px-3 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 shrink-0"
            >
              {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Preview'}
            </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Paste the link. Stashd will pull the title, image, platform, and type automatically.
            </p>
          </div>

          {duplicate && (
            <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Already saved</p>
                <p className="text-amber-800 mt-0.5">{duplicate.title}</p>
                <button
                  type="button"
                  className="mt-2 text-amber-900 underline font-medium"
                  onClick={() => {
                    onOpenExisting(duplicate);
                    onClose();
                  }}
                >
                  Open existing save
                </button>
                <p className="text-xs text-amber-700 mt-1">
                  Saving again will add selected collections to the existing item.
                </p>
              </div>
            </div>
          )}

          {(previewImage || title) && (
            <div className="flex gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50">
              {previewImage && (
                <img src={previewImage} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 text-sm line-clamp-2">{title}</p>
                {siteName && <p className="text-xs text-gray-500">{siteName}</p>}
                {description && <p className="mt-1 text-xs text-gray-600 line-clamp-2">{description}</p>}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Collection</label>
            <select
              value={collectionIds[0] ?? ''}
              onChange={(e) => setCollectionIds(e.target.value ? [e.target.value] : [])}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Choose collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            {collectionIds[0] && (
              <p className="text-xs text-gray-400 mt-1">Saving to {selectedCollectionName}.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tags optional</label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="recipe, dinner, research"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t border-gray-200 px-5 py-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || scraping}
            onClick={() => void handleSave()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {duplicate ? 'Add to collections' : 'Save link'}
          </button>
        </div>
      </div>
    </div>
  );
}
