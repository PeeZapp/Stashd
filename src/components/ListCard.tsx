import { useState, useRef, useEffect } from 'react';
import { Share2, Trash2, ShoppingBag, Tag, Pencil, Check, X } from 'lucide-react';
import type { Product, List } from '../lib/types';

export interface ListWithProducts extends List {
  products: Product[];
}

interface ListCardProps {
  list: ListWithProducts;
  /** When set, stats and cover use products across this list and all sub-lists. */
  statsProducts?: Product[];
  /** Direct child sub-lists count (shown on top-level cards). */
  subListCount?: number;
  /** When `owned`, stats and cover use only items marked owned (your stash view). */
  displayMode?: 'all' | 'owned';
  onClick: () => void;
  onDelete: () => void;
  onShare: () => void;
  onRename?: (newName: string) => void;
}

export default function ListCard({
  list,
  statsProducts,
  subListCount = 0,
  displayMode = 'all',
  onClick,
  onDelete,
  onShare,
  onRename,
}: ListCardProps) {
  const sourceProducts = statsProducts ?? list.products;
  const products =
    displayMode === 'owned' ? sourceProducts.filter((p) => p.is_owned) : sourceProducts;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(list.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUncategorised = list.name === 'Uncategorised';

  useEffect(() => {
    if (editingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingName]);

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === list.name) {
      setNameInput(list.name);
      setEditingName(false);
      return;
    }
    onRename?.(trimmed);
    setEditingName(false);
  };

  const cancelEdit = () => {
    setNameInput(list.name);
    setEditingName(false);
  };

  const coverImage = products.find((p) => p.image_url)?.image_url ?? null;
  const itemCount = products.length;
  const totalPrice = products.reduce((sum, p) => sum + (p.current_price ?? 0), 0);
  const hasAnySale = products.some((p) => p.is_on_sale);
  const totalOriginalPrice = products.reduce(
    (sum, p) => sum + (p.is_on_sale && p.original_price != null ? p.original_price : (p.current_price ?? 0)),
    0
  );

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 hover:shadow-lg transition-all duration-200 group cursor-pointer">
      {/* Cover image */}
      <div
        className="relative aspect-[4/3] bg-gray-100 overflow-hidden"
        onClick={onClick}
      >
        {coverImage ? (
          <img
            src={coverImage}
            alt={list.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const parent = (e.currentTarget as HTMLImageElement).parentElement;
              if (parent) parent.classList.add('flex', 'items-center', 'justify-center');
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="w-16 h-16 text-gray-300" />
          </div>
        )}

        {hasAnySale && (
          <div className="absolute top-3 left-3 flex items-center space-x-1 bg-red-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            <Tag className="w-3 h-3" />
            <span>Items on sale</span>
          </div>
        )}

        {list.is_shared && (
          <div className="absolute top-3 right-3 bg-gray-900 text-white text-xs font-medium px-2.5 py-1 rounded-full">
            Shared
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4">
        {/* List name — inline editable */}
        <div className="mb-1">
          {editingName ? (
            <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') cancelEdit();
                }}
                className="flex-1 text-lg font-semibold px-2 py-0.5 border border-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-0"
              />
              <button onClick={saveName} className="p-1 text-green-600 hover:bg-green-50 rounded">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 group/name">
              <h3
                className="text-lg font-semibold text-gray-900 line-clamp-1 group-hover:text-gray-700 transition-colors"
                onClick={onClick}
              >
                {list.name}
              </h3>
              {!isUncategorised && onRename && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingName(true); }}
                  className="p-1 text-gray-300 hover:text-gray-600 opacity-0 group-hover/name:opacity-100 transition-opacity rounded"
                  title="Rename list"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-sm text-gray-500 mb-4">
          {subListCount > 0 && (
            <>
              <span>
                {subListCount} sub-list{subListCount !== 1 ? 's' : ''}
              </span>
              <span>·</span>
            </>
          )}
          <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
          {itemCount > 0 && totalPrice > 0 && (
            <>
              <span>·</span>
              {hasAnySale && totalOriginalPrice > totalPrice ? (
                <span className="flex items-baseline space-x-1.5">
                  <span className="font-medium text-gray-400 line-through">
                    ${totalOriginalPrice.toFixed(2)}
                  </span>
                  <span className="font-semibold text-red-600">
                    ${totalPrice.toFixed(2)}
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-gray-900">${totalPrice.toFixed(2)}</span>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => { e.stopPropagation(); onShare(); }}
            className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
            title="Share list"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
          {!isUncategorised && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex items-center justify-center p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete list"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
