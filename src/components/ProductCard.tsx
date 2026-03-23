import { useState, useRef, useEffect } from 'react';
import { ExternalLink, Trash2, ShoppingBag, PackageX, CheckCircle, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Product } from '../lib/types';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  onDelete: () => void;
  onPriceUpdate?: (updatedProduct: Product) => void;
}

export default function ProductCard({ product, onClick, onDelete, onPriceUpdate }: ProductCardProps) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(
    product.current_price != null ? String(product.current_price) : ''
  );
  const [savingPrice, setSavingPrice] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const discount =
    product.original_price && product.current_price && product.is_on_sale
      ? Math.round(
          ((product.original_price - product.current_price) / product.original_price) * 100
        )
      : 0;

  useEffect(() => {
    if (editingPrice && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingPrice]);

  const savePrice = async () => {
    const num = priceInput.trim() ? parseFloat(priceInput) : null;
    if (num !== null && (isNaN(num) || num < 0)) return;

    setSavingPrice(true);
    try {
      const isOnSale =
        num !== null && product.original_price !== null && product.original_price > num;

      const { data } = await supabase
        .from('products')
        .update({ current_price: num, is_on_sale: isOnSale })
        .eq('id', product.id)
        .select()
        .single();

      if (data && onPriceUpdate) onPriceUpdate(data as Product);
    } catch {
      // silently ignore
    } finally {
      setSavingPrice(false);
      setEditingPrice(false);
    }
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') savePrice();
    if (e.key === 'Escape') {
      setPriceInput(product.current_price != null ? String(product.current_price) : '');
      setEditingPrice(false);
    }
  };

  return (
    <div
      className={`bg-white rounded-xl overflow-hidden border transition-shadow group ${
        product.is_out_of_stock
          ? 'border-gray-300 opacity-75'
          : 'border-gray-200 hover:shadow-lg'
      }`}
    >
      {/* Image */}
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

        {/* Price — click to edit */}
        <div className="mb-3">
          {editingPrice ? (
            <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1.5 text-gray-500 text-sm">$</span>
                <input
                  ref={inputRef}
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  onKeyDown={handlePriceKeyDown}
                  className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="0.00"
                  disabled={savingPrice}
                />
              </div>
              <button
                onClick={savePrice}
                disabled={savingPrice}
                className="px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {savingPrice ? '…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setPriceInput(product.current_price != null ? String(product.current_price) : '');
                  setEditingPrice(false);
                }}
                className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingPrice(true); }}
              className="flex items-baseline space-x-2 group/price hover:opacity-75 transition-opacity text-left w-full"
              title="Click to set price"
            >
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
                  <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover/price:opacity-100 transition-opacity ml-1" />
                </>
              ) : (
                <span className="text-sm text-amber-600 font-medium flex items-center space-x-1">
                  <span>+ Add price</span>
                  <Pencil className="w-3 h-3" />
                </span>
              )}
            </button>
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

        {/* Actions */}
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
