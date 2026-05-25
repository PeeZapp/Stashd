import { useEffect, useRef, useState } from 'react';
import { Calendar, Camera, ExternalLink, Link2, MessageSquare, Package, Tag, Trash2, X } from 'lucide-react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { Product, StandardListComment, StandardListItem, StandardListPriority, StandardListRecurrence } from '../../lib/types';
import { storage } from '../../lib/firebase';
import { priorityLabel } from '../../lib/standardListUtils';

const MAX_ITEM_IMAGES = 8;
const MAX_FILE_BYTES = 7 * 1024 * 1024;

interface ItemDetailDrawerProps {
  item: StandardListItem;
  products: Product[];
  comments: StandardListComment[];
  currentUserName: string;
  onClose: () => void;
  onSave: (updates: Partial<StandardListItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddComment: (body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

export default function ItemDetailDrawer({
  item,
  products,
  comments,
  currentUserName,
  onClose,
  onSave,
  onDelete,
  onAddComment,
  onDeleteComment,
}: ItemDetailDrawerProps) {
  const [text, setText] = useState(item.text);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [tagsInput, setTagsInput] = useState(item.tags.join(', '));
  const [priority, setPriority] = useState<StandardListPriority>(item.priority);
  const [recurrence, setRecurrence] = useState<StandardListRecurrence>(item.recurrence);
  const [dueDate, setDueDate] = useState(
    item.due_at ? new Date(item.due_at).toISOString().slice(0, 10) : ''
  );
  const [linkUrl, setLinkUrl] = useState(item.link_url ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(item.image_urls);
  const [productId, setProductId] = useState(item.product_id ?? '');
  const [commentInput, setCommentInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(item.text);
    setNotes(item.notes ?? '');
    setTagsInput(item.tags.join(', '));
    setPriority(item.priority);
    setRecurrence(item.recurrence);
    setDueDate(item.due_at ? new Date(item.due_at).toISOString().slice(0, 10) : '');
    setLinkUrl(item.link_url ?? '');
    setImageUrls(item.image_urls);
    setProductId(item.product_id ?? '');
    setDeleteError('');
  }, [item]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean);
      await onSave({
        text: text.trim() || item.text,
        notes: notes.trim() || null,
        tags,
        priority,
        due_at: dueDate ? new Date(dueDate + 'T12:00:00').toISOString() : null,
        recurrence,
        link_url: linkUrl.trim() || null,
        link_title: linkUrl.trim() || null,
        image_urls: imageUrls,
        product_id: productId || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === productId) ?? null;

  const persistImages = async (urls: string[]) => {
    setImageUrls(urls);
    await onSave({ image_urls: urls });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError('');
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setUploadError('Only image files are allowed.');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setUploadError('Each image must be under 7 MB.');
        continue;
      }
      if (imageUrls.length >= MAX_ITEM_IMAGES) {
        setUploadError(`You can add up to ${MAX_ITEM_IMAGES} images per item.`);
        break;
      }
      const ext = file.type.includes('png') ? 'png' : 'jpg';
      const path = `users/${item.user_id}/standardListItems/${item.id}/${crypto.randomUUID()}.${ext}`;
      const storageRef = ref(storage, path);
      setUploading(true);
      try {
        await uploadBytes(storageRef, file, { contentType: file.type });
        const url = await getDownloadURL(storageRef);
        const next = [...imageUrls, url].slice(0, MAX_ITEM_IMAGES);
        await persistImages(next);
      } catch {
        setUploadError('Upload failed. Check Storage rules and your bucket config.');
      } finally {
        setUploading(false);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = async (url: string) => {
    await persistImages(imageUrls.filter((imageUrl) => imageUrl !== url));
  };

  const handleAddComment = async () => {
    const body = commentInput.trim();
    if (!body) return;
    await onAddComment(body);
    setCommentInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Item details</h3>
          <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Title</label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Due date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as StandardListPriority)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value={0}>None</option>
              <option value={1}>{priorityLabel(1)}</option>
              <option value={2}>{priorityLabel(2)}</option>
              <option value={3}>{priorityLabel(3)}</option>
              <option value={4}>{priorityLabel(4)}</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recurring</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as StandardListRecurrence)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" /> Tags
            </label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="groceries, urgent"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" /> Link
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              {linkUrl.trim() && (
                <a
                  href={linkUrl.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                  title="Open link"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> Attached wishlist product
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">No product attached</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
            {selectedProduct && (
              <a
                href={selectedProduct.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
              >
                {selectedProduct.image_url && (
                  <img src={selectedProduct.image_url} alt="" className="w-10 h-10 object-cover rounded" />
                )}
                <span className="text-sm text-gray-800 line-clamp-2 flex-1">{selectedProduct.title}</span>
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </a>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" /> Images
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {imageUrls.map((url) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group/image">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => void removeImage(url)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 flex items-center justify-center transition-opacity"
                    title="Remove image"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
              {imageUrls.length < MAX_ITEM_IMAGES && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-600 text-xs disabled:opacity-50"
                >
                  <Camera className="w-5 h-5 mb-1" />
                  {uploading ? 'Uploading…' : 'Add'}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">Up to {MAX_ITEM_IMAGES} images · max 7 MB each</p>
            {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y"
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> Comments
            </label>
            <div className="mt-2 space-y-2">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-lg bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{comment.author_name}</p>
                      <p className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleString()}</p>
                    </div>
                    {comment.author_name === currentUserName && (
                      <button
                        type="button"
                        onClick={() => void onDeleteComment(comment.id)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{comment.body}</p>
                </div>
              ))}
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                rows={2}
                placeholder="Add a comment"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y"
              />
              <button
                type="button"
                onClick={() => void handleAddComment()}
                disabled={!commentInput.trim()}
                className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Comment
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex flex-wrap gap-2">
          {deleteError && <p className="basis-full text-sm text-red-600">{deleteError}</p>}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirm('Delete this item and its subtasks?')) return;
              setDeleteError('');
              try {
                await onDelete();
              } catch (error) {
                setDeleteError(error instanceof Error ? error.message : 'Could not delete item.');
              }
            }}
            className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
