import { useEffect, useState } from 'react';
import { ExternalLink, Trash2, X } from 'lucide-react';
import type {
  SavedLink,
  SavedLinkCollection,
  SavedLinkPriority,
  SavedLinkStatus,
  SavedLinkTimestampNote,
  SavedLinkType,
} from '../../lib/types';
import {
  SAVED_LINK_STATUSES,
  SAVED_LINK_TYPES,
  parseTagsInput,
} from '../../lib/savedLinkUtils';

interface SavedLinkDetailDrawerProps {
  link: SavedLink;
  collections: SavedLinkCollection[];
  onClose: () => void;
  onSave: (updates: Partial<SavedLink>) => Promise<void>;
  onDelete: () => Promise<void>;
}

function parseTimecodeSeconds(raw: string): number | null {
  const parts = raw
    .trim()
    .split(':')
    .map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part)) || parts.length === 0 || parts.length > 3) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export default function SavedLinkDetailDrawer({
  link,
  collections,
  onClose,
  onSave,
  onDelete,
}: SavedLinkDetailDrawerProps) {
  const [title, setTitle] = useState(link.title);
  const [notes, setNotes] = useState(link.notes ?? '');
  const [description, setDescription] = useState(link.description ?? '');
  const [tagsInput, setTagsInput] = useState(link.tags.join(', '));
  const [status, setStatus] = useState<SavedLinkStatus>(link.status);
  const [linkType, setLinkType] = useState<SavedLinkType>(link.link_type);
  const [priority, setPriority] = useState<SavedLinkPriority>(link.priority);
  const [collectionIds, setCollectionIds] = useState<string[]>(link.collection_ids);
  const [ingredients, setIngredients] = useState(
    (link.metadata.ingredients ?? []).join('\n')
  );
  const [cookTime, setCookTime] = useState(
    link.metadata.cook_time_minutes != null ? String(link.metadata.cook_time_minutes) : ''
  );
  const [cuisine, setCuisine] = useState(link.metadata.cuisine ?? '');
  const [creator, setCreator] = useState(link.metadata.creator ?? '');
  const [duration, setDuration] = useState(link.metadata.duration ?? '');
  const [author, setAuthor] = useState(link.metadata.author ?? '');
  const [timestampNotes, setTimestampNotes] = useState<SavedLinkTimestampNote[]>(
    link.timestamp_notes
  );
  const [newTimestamp, setNewTimestamp] = useState('');
  const [newTimestampLabel, setNewTimestampLabel] = useState('');
  const [newTimestampNote, setNewTimestampNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(link.title);
    setNotes(link.notes ?? '');
    setDescription(link.description ?? '');
    setTagsInput(link.tags.join(', '));
    setStatus(link.status);
    setLinkType(link.link_type);
    setPriority(link.priority);
    setCollectionIds(link.collection_ids);
    setIngredients((link.metadata.ingredients ?? []).join('\n'));
    setCookTime(
      link.metadata.cook_time_minutes != null ? String(link.metadata.cook_time_minutes) : ''
    );
    setCuisine(link.metadata.cuisine ?? '');
    setCreator(link.metadata.creator ?? '');
    setDuration(link.metadata.duration ?? '');
    setAuthor(link.metadata.author ?? '');
    setTimestampNotes(link.timestamp_notes);
    setNewTimestamp('');
    setNewTimestampLabel('');
    setNewTimestampNote('');
    setError('');
  }, [link]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const metadata: SavedLink['metadata'] = {};
      if (link.metadata.platform) metadata.platform = link.metadata.platform;
      if (link.metadata.embed_url) metadata.embed_url = link.metadata.embed_url;
      if (link.metadata.published_at) metadata.published_at = link.metadata.published_at;

      if (linkType === 'recipe') {
        const list = ingredients
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        if (list.length > 0) metadata.ingredients = list;
        const mins = cookTime ? parseInt(cookTime, 10) : null;
        metadata.cook_time_minutes = mins != null && !Number.isNaN(mins) ? mins : null;
        metadata.cuisine = cuisine.trim() || null;
      } else if (linkType === 'video') {
        metadata.creator = creator.trim() || null;
        metadata.duration = duration.trim() || null;
      } else if (linkType === 'article') {
        metadata.author = author.trim() || null;
      }

      await onSave({
        title: title.trim() || link.title,
        notes: notes.trim() || null,
        description: description.trim() || null,
        tags: parseTagsInput(tagsInput),
        status,
        link_type: linkType,
        priority,
        collection_ids: collectionIds,
        timestamp_notes: linkType === 'video' ? timestampNotes : [],
        metadata,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  const toggleCollection = (id: string) => {
    setCollectionIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const addTimestampNote = () => {
    const timecode = newTimestamp.trim();
    const note = newTimestampNote.trim();
    if (!timecode && !note) return;
    setTimestampNotes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: newTimestampLabel.trim(),
        timecode,
        seconds: timecode ? parseTimecodeSeconds(timecode) : null,
        note,
        created_at: new Date().toISOString(),
      },
    ]);
    setNewTimestamp('');
    setNewTimestampLabel('');
    setNewTimestampNote('');
  };

  const removeTimestampNote = (id: string) => {
    setTimestampNotes((prev) => prev.filter((note) => note.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-lg bg-white shadow-xl flex flex-col max-h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Save details</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {link.image_url && (
            <img src={link.image_url} alt="" className="w-full rounded-lg object-cover max-h-40" />
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            {link.url}
          </a>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as SavedLinkType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {SAVED_LINK_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SavedLinkStatus)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {SAVED_LINK_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priority (0–4)</label>
            <input
              type="number"
              min={0}
              max={4}
              value={priority}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setPriority((n >= 0 && n <= 4 ? n : 0) as SavedLinkPriority);
              }}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Collections</label>
            <div className="flex flex-wrap gap-2">
              {collections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCollection(c.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    collectionIds.includes(c.id)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="pasta, dinner, high protein"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          {linkType === 'video' && (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Timestamp notes</p>
              <p className="text-xs text-gray-500">
                Save moments from videos. Examples: 1:24, 12:03, 1:02:15.
              </p>
            </div>
            {timestampNotes.length > 0 && (
              <div className="space-y-2">
                {timestampNotes
                  .slice()
                  .sort((a, b) => (a.seconds ?? Number.MAX_SAFE_INTEGER) - (b.seconds ?? Number.MAX_SAFE_INTEGER))
                  .map((timestampNote) => (
                    <div
                      key={timestampNote.id}
                      className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {timestampNote.timecode && (
                            <span className="font-mono text-xs font-semibold text-gray-900">
                              {timestampNote.timecode}
                            </span>
                          )}
                          {timestampNote.label && (
                            <span className="text-xs font-medium text-gray-700">
                              {timestampNote.label}
                            </span>
                          )}
                        </div>
                        {timestampNote.note && (
                          <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                            {timestampNote.note}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTimestampNote(timestampNote.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        aria-label="Remove timestamp note"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newTimestamp}
                  onChange={(e) => setNewTimestamp(e.target.value)}
                  placeholder="Timestamp, e.g. 2:14"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <input
                  value={newTimestampLabel}
                  onChange={(e) => setNewTimestampLabel(e.target.value)}
                  placeholder="Label, e.g. Sauce"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <textarea
                value={newTimestampNote}
                onChange={(e) => setNewTimestampNote(e.target.value)}
                placeholder="Note for this moment"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={addTimestampNote}
                disabled={!newTimestamp.trim() && !newTimestampNote.trim()}
                className="px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                Add timestamp note
              </button>
            </div>
          </div>
          )}
          {linkType === 'recipe' && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-800">Recipe</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ingredients (one per line)</label>
                <textarea
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cook time (min)</label>
                  <input
                    value={cookTime}
                    onChange={(e) => setCookTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cuisine</label>
                  <input
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          )}
          {linkType === 'video' && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-800">Video</p>
              <input
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                placeholder="Creator / channel"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Duration"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}
          {linkType === 'article' && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-800 mb-2">Article</p>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}
        </div>
        <div className="border-t border-gray-200 p-4 flex gap-2">
          {error && <p className="mr-auto self-center text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => void onDelete()}
            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm inline-flex items-center gap-1"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
