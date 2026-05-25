import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, FolderPlus, Plus, Search, Trash2 } from 'lucide-react';
import type { SavedLink, SavedLinkCollection } from '../lib/types';
import {
  collectSavedLinkTags,
  filterAndSortSavedLinks,
} from '../lib/savedLinkUtils';
import {
  createSavedLink,
  createSavedLinkCollection,
  deleteSavedLink,
  deleteSavedLinkCollection,
  getUserSavedLinkCollections,
  getUserSavedLinks,
  updateSavedLink,
} from '../lib/firestore';
import SavedLinkCard from './savedLinks/SavedLinkCard';
import SavedLinkDetailDrawer from './savedLinks/SavedLinkDetailDrawer';
import AddSavedLinkModal from './savedLinks/AddSavedLinkModal';

interface SavedLinksPanelProps {
  userId: string;
}

const REMOVED_DEFAULT_COLLECTION_NAMES = new Set(['Recipes', 'Watch later', 'Articles', 'Tools']);

export default function SavedLinksPanel({ userId }: SavedLinksPanelProps) {
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [collections, setCollections] = useState<SavedLinkCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [detailLink, setDetailLink] = useState<SavedLink | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewCollection, setShowNewCollection] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, allLinks] = await Promise.all([
        getUserSavedLinkCollections(userId),
        getUserSavedLinks(userId),
      ]);
      const collectionIdsInUse = new Set(allLinks.flatMap((link) => link.collection_ids));
      const emptyRemovedDefaults = cols.filter(
        (collection) =>
          REMOVED_DEFAULT_COLLECTION_NAMES.has(collection.name) &&
          !collectionIdsInUse.has(collection.id)
      );
      await Promise.all(emptyRemovedDefaults.map((collection) => deleteSavedLinkCollection(collection.id)));
      setCollections(cols.filter((collection) => !emptyRemovedDefaults.some((removed) => removed.id === collection.id)));
      setLinks(allLinks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId]
  );

  const collectionLinks = useMemo(
    () =>
      filterAndSortSavedLinks(links, {
        search,
        collectionId: selectedCollectionId,
        tag: tagFilter,
        hideArchived: true,
        sort: 'newest',
      }),
    [links, search, selectedCollectionId, tagFilter]
  );

  const globalMatches = useMemo(
    () =>
      search.trim()
        ? filterAndSortSavedLinks(links, {
            search,
            hideArchived: true,
            sort: 'newest',
          })
        : [],
    [links, search]
  );

  const visibleTags = useMemo(
    () => collectSavedLinkTags(selectedCollectionId ? links.filter((l) => l.collection_ids.includes(selectedCollectionId)) : links),
    [links, selectedCollectionId]
  );

  const handleSaveDetail = async (updates: Partial<SavedLink>) => {
    if (!detailLink) return;
    const linkId = detailLink.id;
    const updatedAt = new Date().toISOString();
    const nextLink = { ...detailLink, ...updates, updated_at: updatedAt };

    setLinks((prev) =>
      prev.map((link) => (link.id === linkId ? { ...link, ...updates, updated_at: updatedAt } : link))
    );
    setDetailLink(nextLink);

    await updateSavedLink(linkId, updates);
    const freshLinks = await getUserSavedLinks(userId);
    setLinks(freshLinks);
  };

  const handleDelete = async (link: SavedLink) => {
    if (!confirm('Delete this saved link?')) return;
    await deleteSavedLink(link.id);
    setDetailLink(null);
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
  };

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    const c = await createSavedLinkCollection({
      user_id: userId,
      name,
      position: collections.length,
    });
    setCollections((prev) => [...prev, c]);
    setNewCollectionName('');
    setShowNewCollection(false);
  };

  const handleDeleteCollection = async (collection: SavedLinkCollection) => {
    const collectionLinks = links.filter((link) => link.collection_ids.includes(collection.id));
    const message =
      collectionLinks.length === 0
        ? `Delete "${collection.name}"?`
        : `Delete "${collection.name}"? Saves that only belong to this collection will be deleted. Saves in other collections will be kept.`;
    if (!confirm(message)) return;

    const linksToDelete = collectionLinks.filter((link) => link.collection_ids.length <= 1);
    const linksToKeep = collectionLinks.filter((link) => link.collection_ids.length > 1);

    await Promise.all([
      ...linksToDelete.map((link) => deleteSavedLink(link.id)),
      ...linksToKeep.map((link) =>
        updateSavedLink(link.id, {
          collection_ids: link.collection_ids.filter((id) => id !== collection.id),
        })
      ),
      deleteSavedLinkCollection(collection.id),
    ]);

    setLinks((prev) =>
      prev
        .filter((link) => !linksToDelete.some((deleted) => deleted.id === link.id))
        .map((link) =>
          link.collection_ids.includes(collection.id)
            ? { ...link, collection_ids: link.collection_ids.filter((id) => id !== collection.id) }
            : link
        )
    );
    setCollections((prev) => prev.filter((item) => item.id !== collection.id));
    if (selectedCollectionId === collection.id) closeCollection();
  };

  const openCollection = (collectionId: string) => {
    setSelectedCollectionId(collectionId);
    setSearch('');
    setTagFilter(null);
  };

  const closeCollection = () => {
    setSelectedCollectionId(null);
    setSearch('');
    setTagFilter(null);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        {selectedCollection && (
          <button
            type="button"
            onClick={closeCollection}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Collections
          </button>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              selectedCollection
                ? `Search ${selectedCollection.name}...`
                : 'Search all saves and collections...'
            }
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          disabled={collections.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Save link
        </button>
      </div>

      {!selectedCollection && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Collections</h2>
              <p className="text-sm text-gray-500">Organize saved links by category, like Recipes, Watch later, Articles, or Tools.</p>
            </div>
            {showNewCollection ? (
              <div className="flex items-center gap-1">
                <input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection name"
                  className="px-2 py-1 border border-gray-300 rounded text-sm w-40"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void handleCreateCollection()}
                  className="px-2 py-1 bg-gray-900 text-white rounded text-xs"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCollection(false);
                    setNewCollectionName('');
                  }}
                  className="text-xs text-gray-500"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewCollection(true)}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <FolderPlus className="w-4 h-4" />
                New collection
              </button>
            )}
          </div>

          {collections.length === 0 && (
            <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-2xl">
              <Bookmark className="w-14 h-14 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Create your first collection</h3>
              <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
                Saves starts empty. Make a collection like Recipes, Watch later, Research, or Home ideas, then add links to it.
              </p>
              <button
                type="button"
                onClick={() => setShowNewCollection(true)}
                className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
              >
                New collection
              </button>
            </div>
          )}

          {search.trim() && globalMatches.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Matching saves</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {globalMatches.slice(0, 8).map((link) => (
                  <SavedLinkCard
                    key={link.id}
                    link={link}
                    collections={collections}
                    onOpen={() => setDetailLink(link)}
                    onOpenUrl={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                  />
                ))}
              </div>
            </div>
          )}

          {collections.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {collections.map((collection) => {
              const collectionLinksRaw = links.filter((link) => link.collection_ids.includes(collection.id));
              const matches = search.trim()
                ? filterAndSortSavedLinks(collectionLinksRaw, { search, hideArchived: true })
                : collectionLinksRaw.filter((link) => link.status !== 'archived');
              const cover = collectionLinksRaw.find((link) => link.image_url)?.image_url;
              return (
                <div
                  key={collection.id}
                  className="relative bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 hover:shadow-md transition-all"
                >
                  <button
                    type="button"
                    onClick={() => openCollection(collection.id)}
                    className="w-full text-left"
                  >
                    <div className="aspect-[16/9] bg-gray-100">
                      {cover ? (
                        <img src={cover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Bookmark className="w-10 h-10 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 pr-8">{collection.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {collectionLinksRaw.length} save{collectionLinksRaw.length !== 1 ? 's' : ''}
                        {search.trim() ? ` · ${matches.length} match${matches.length !== 1 ? 'es' : ''}` : ''}
                      </p>
                      <div className="flex -space-x-2 mt-3">
                        {collectionLinksRaw.slice(0, 4).map((link) =>
                          link.image_url ? (
                            <img
                              key={link.id}
                              src={link.image_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover border-2 border-white bg-gray-100"
                            />
                          ) : null
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCollection(collection)}
                    className="absolute right-2 bottom-2 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    aria-label={`Delete ${collection.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
          )}
        </>
      )}

      {selectedCollection && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{selectedCollection.name}</h2>
              <p className="text-sm text-gray-500">
                {links.filter((link) => link.collection_ids.includes(selectedCollection.id)).length} saved link
                {links.filter((link) => link.collection_ids.includes(selectedCollection.id)).length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleDeleteCollection(selectedCollection)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
              Delete collection
            </button>
          </div>
          {visibleTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className={`px-2.5 py-1 rounded-full text-xs ${
                  !tagFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                All tags
              </button>
              {visibleTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`px-2.5 py-1 rounded-full text-xs ${
                    tagFilter === tag ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {selectedCollection && collectionLinks.length === 0 ? (
        <div className="text-center py-16">
          <Bookmark className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No saves in this collection yet</h3>
          <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
            Paste a recipe, video, article, or tool URL and Stashd will fetch the useful details.
          </p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            Save a link
          </button>
        </div>
      ) : selectedCollection ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {collectionLinks.map((link) => (
            <SavedLinkCard
              key={link.id}
              link={link}
              collections={collections}
              onOpen={() => setDetailLink(link)}
              onOpenUrl={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
            />
          ))}
        </div>
      ) : null}

      {showAdd && (
        <AddSavedLinkModal
          userId={userId}
          collections={collections}
          initialCollectionId={selectedCollectionId ?? undefined}
          onClose={() => setShowAdd(false)}
          onSaved={(link) => {
            setLinks((prev) => [link, ...prev]);
          }}
          onOpenExisting={(link) => setDetailLink(link)}
          onCreate={async (params) => {
            const link = await createSavedLink({ user_id: userId, ...params });
            return link;
          }}
          onAddToCollection={async (linkId, ids) => {
            await updateSavedLink(linkId, { collection_ids: ids });
            setLinks((prev) =>
              prev.map((l) => (l.id === linkId ? { ...l, collection_ids: ids } : l))
            );
          }}
        />
      )}

      {detailLink && (
        <SavedLinkDetailDrawer
          link={detailLink}
          collections={collections}
          onClose={() => setDetailLink(null)}
          onSave={handleSaveDetail}
          onDelete={() => handleDelete(detailLink)}
        />
      )}
    </div>
  );
}
