import { ExternalLink, Trash2, ShoppingBag, PackageX, CheckCircle } from 'lucide-react';
import type { Product } from '../lib/types';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  onDelete: () => void;
}

export default function ProductCard({ product, onClick, onDelete }: ProductCardProps) {
  const discount =
    product.original_price && product.current_price && product.is_on_sale
      ? Math.round(
          ((product.original_price - product.current_price) / product.original_price) * 100
        )
      : 0;

  return (
    <div className={`bg-white rounded-xl overflow-hidden border transition-shadow group ${product.is_out_of_stock ? 'border-gray-300 opacity-75' : 'border-gray-200 hover:shadow-lg'}`}>
      <div className="relative aspect-square bg-gray-100 cursor-pointer" onClick={onClick}>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className={`w-full h-full object-cover ${product.is_out_of_stock ? 'grayscale' : ''}`}
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) parent.classList.add('flex', 'items-center', 'justify-center');
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="w-12 h-12 text-gray-300" />
          </div>
        )}

        {/* Out of stock overlay */}
        {product.is_out_of_stock && (
          <div className="absolute inset-0 flex items-end">
            <div className="w-full bg-gray-900 bg-opacity-80 text-white text-center py-2 flex items-center justify-center space-x-1.5">
              <PackageX className="w-4 h-4" />
              <span className="text-sm font-semibold tracking-wide">Out of Stock</span>
            </div>
          </div>
        )}

        {/* Sale badge */}
        {!product.is_out_of_stock && product.is_on_sale && discount > 0 && (
          <div className="absolute top-3 right-3 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
            -{discount}%
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="mb-2">
          {product.store_name && (
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {product.store_name}
            </p>
          )}
          <h3
            className="text-base font-semibold text-gray-900 line-clamp-2 cursor-pointer hover:text-gray-700 transition-colors"
            onClick={onClick}
          >
            {product.title}
          </h3>
        </div>

        <div className="flex items-baseline space-x-2 mb-3">
          {product.current_price != null ? (
            <>
              <span className={`text-xl font-bold ${product.is_out_of_stock ? 'text-gray-400' : 'text-gray-900'}`}>
                ${product.current_price.toFixed(2)}
              </span>
              {product.is_on_sale && product.original_price && (
                <span className="text-sm text-gray-500 line-through">
                  ${product.original_price.toFixed(2)}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-gray-400 italic">No price set</span>
          )}
        </div>

        {/* Stock status indicator */}
        <div className="mb-3">
          {product.is_out_of_stock ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              <PackageX className="w-3 h-3" />
              <span>Out of Stock</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium">
              <CheckCircle className="w-3 h-3" />
              <span>In Stock</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <a
            href={product.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span>View Product</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete product"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
