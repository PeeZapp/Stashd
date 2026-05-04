import { useState, useRef, useEffect } from 'react';
import { X, Camera, Trash2, Check, Plus } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import type { Outfit, Product } from '../lib/types';
import {
  updateOutfit,
  deleteOutfit,
  addProductToOutfit,
  removeProductFromOutfit,
} from '../lib/firestore';

const MAX_IMAGES = 12;
const MAX_FILE_BYTES = 7 * 1024 * 1024;

interface OutfitModalProps {
  userId: string;
  outfit: Outfit;
  /** Owned products in your stash (outfits only link here — deleting an outfit never removes these). */
  stashProducts: Product[];
  linkedProducts: Product[];
  onClose: () => void;
  onChanged: () => void;
}

export default function OutfitModal({
  userId,
  outfit,
  stashProducts,
  linkedProducts,
  onClose,
  onChanged,
}: OutfitModalProps) {
  const [name, setName] = useState(outfit.name);
  const [imageUrls, setImageUrls] = useState<string[]>(outfit.image_urls);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(() => new Set(linkedProducts.map((p) => p.id)));
  const [showPicker, setShowPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(outfit.name);
    setImageUrls(outfit.image_urls);
    setLinkedIds(new Set(linkedProducts.map((p) => p.id)));
  }, [outfit.id, outfit.name, outfit.image_urls, linkedProducts]);

  const persistImages = async (urls: string[]) => {
    await updateOutfit(outfit.id, { image_urls: urls });
    onChanged();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed.');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError('Each image must be under 7 MB.');
        continue;
      }
      if (imageUrls.length >= MAX_IMAGES) {
        setError(`You can add up to ${MAX_IMAGES} photos per outfit.`);
        break;
      }
      const ext = file.type.includes('png') ? 'png' : 'jpg';
      const path = `users/${userId}/outfitLooks/${outfit.id}/${crypto.randomUUID()}.${ext}`;
      const storageRef = ref(storage, path);
      setUploading(true);
      try {
        await uploadBytes(storageRef, file, { contentType: file.type });
        const url = await getDownloadURL(storageRef);
        const next = [...imageUrls, url].slice(0, MAX_IMAGES);
        setImageUrls(next);
        await persistImages(next);
      } catch {
        setError('Upload failed. Check Storage rules and your bucket in .env.local.');
      } finally {
        setUploading(false);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeImage = async (url: string) => {
    const next = imageUrls.filter((u) => u !== url);
    setImageUrls(next);
    await persistImages(next);
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === outfit.name) {
      setName(outfit.name);
      return;
    }
    setSavingName(true);
    setError('');
    try {
      await updateOutfit(outfit.id, { name: trimmed });
      onChanged();
    } catch {
      setError('Could not save name.');
    } finally {
      setSavingName(false);
    }
  };

  const toggleProduct = async (productId: string) => {
    const inOutfit = linkedIds.has(productId);
    setError('');
    try {
      if (inOutfit) {
        await removeProductFromOutfit({ user_id: userId, outfit_id: outfit.id, product_id: productId });
        setLinkedIds((prev) => {
          const n = new Set(prev);
          n.delete(productId);
          return n;
        });
      } else {
        await addProductToOutfit({ user_id: userId, outfit_id: outfit.id, product_id: productId });
        setLinkedIds((prev) => new Set(prev).add(productId));
      }
      onChanged();
    } catch {
      setError('Could not update outfit items.');
    }
  };

  const handleDeleteOutfit = async () => {
    if (
      !confirm(
        'Delete this outfit? Items stay in your stash — only this outfit and its links are removed. Uploaded files in Storage are not deleted automatically.'
      )
    )
      return;
    try {
      await deleteOutfit(outfit.id, userId);
      onChanged();
      onClose();
    } catch {
      setError('Could not delete outfit.');
    }
  };

  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const productById = new Map<string, Product>();
  stashProducts.forEach((p) => productById.set(p.id, p));
  linkedProducts.forEach((p) => productById.set(p.id, p));
  const linkedList = [...linkedIds]
    .map((id) => productById.get(id))
    .filter((p): p is Product => Boolean(p));
  const pickerList = stashProducts;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-y-contain shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pt-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit outfit</h2>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => e.key === 'Enter' && void saveName()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="e.g. Summer wedding guest"
              />
              <button
                type="button"
                disabled={savingName}
                onClick={() => void saveName()}
                className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Photos of you / your look</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <div className="flex flex-wrap gap-2 mb-2">
              {imageUrls.map((url) => (
                <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 group/img">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => void removeImage(url)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                    title="Remove photo"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
              {imageUrls.length < MAX_IMAGES && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-600 text-xs disabled:opacity-50"
                >
                  <Camera className="w-5 h-5 mb-0.5" />
                  {uploading ? '…' : 'Add'}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">Up to {MAX_IMAGES} images · max 7 MB each</p>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">From your stash</p>
              <button
                type="button"
                onClick={() => setShowPicker((v) => !v)}
                className="text-xs font-medium text-gray-900 flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                {showPicker ? 'Hide' : 'Add from stash'}
              </button>
            </div>
            {linkedList.length === 0 ? (
              <p className="text-sm text-gray-500">No pieces yet. Add owned items from your stash (lists).</p>
            ) : (
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {linkedList.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
                  >
                    <span className="truncate font-medium text-gray-900">{p.title}</span>
                    <button
                      type="button"
                      onClick={() => void toggleProduct(p.id)}
                      className="text-red-600 text-xs shrink-0 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {showPicker && (
            <div className="mb-6 border border-gray-200 rounded-xl p-3 max-h-52 overflow-y-auto">
              {pickerList.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Mark products as <strong>I own this</strong> first — then they appear in your stash here.
                </p>
              ) : (
                <ul className="space-y-1">
                  {pickerList.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void toggleProduct(p.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                          linkedIds.has(p.id) ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-800'
                        }`}
                      >
                        {linkedIds.has(p.id) && <Check className="w-4 h-4 shrink-0" />}
                        <span className="truncate">{p.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteOutfit()}
              className="px-4 py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Delete outfit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
