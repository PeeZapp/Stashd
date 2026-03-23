import { Share2, Trash2, ShoppingBag, Tag } from 'lucide-react';
import type { Product, List } from '../lib/types';

export interface ListWithProducts extends List {
  products: Product[];
}

interface ListCardProps {
  list: ListWithProducts;
  onClick: () => void;
  onDelete: () => void;
  onShare: () => void;
}

export default function ListCard({ list, onClick, onDelete, onShare }: ListCardProps) {
  const { products } = list;

  const coverImage = products.find((p) => p.image_url)?.image_url ?? null;
  const itemCount = products.length;
  const totalPrice = products.reduce((sum, p) => sum + (p.current_price ?? 0), 0);
  const hasAnySale = products.some((p) => p.is_on_sale);

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

        {/* Sale badge */}
        {hasAnySale && (
          <div className="absolute top-3 left-3 flex items-center space-x-1 bg-red-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            <Tag className="w-3 h-3" />
            <span>Items on sale</span>
          </div>
        )}

        {/* Shared badge */}
        {list.is_shared && (
          <div className="absolute top-3 right-3 bg-gray-900 text-white text-xs font-medium px-2.5 py-1 rounded-full">
            Shared
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4">
        {/* List name */}
        <h3
          className="text-lg font-semibold text-gray-900 mb-1 line-clamp-1 group-hover:text-gray-700 transition-colors"
          onClick={onClick}
        >
          {list.name}
        </h3>

        {/* Stats row */}
        <div className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
          <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
          {itemCount > 0 && totalPrice > 0 && (
            <>
              <span>·</span>
              <span className="font-semibold text-gray-900">${totalPrice.toFixed(2)}</span>
            </>
          )}
          {hasAnySale && (
            <>
              <span>·</span>
              <span className="text-red-600 font-medium">Sale!</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
            title="Share list"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex items-center justify-center p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete list"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
