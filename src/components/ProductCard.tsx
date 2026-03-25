import { useState, useRef, useEffect } from 'react';
import { ExternalLink, Trash2, ShoppingBag, Pencil, Info, Check, CheckSquare2 } from 'lucide-react';
import type { Product } from '../lib/types';
import { updateProduct } from '../lib/firestore';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  onDelete: () => void;
  onPriceUpdate?: (updatedProduct: Product) => void;
  onMarkOwned?: (updatedProduct: Product) => void;
  compareMode?: boolean;
  isSelectedForCompare?: boolean;
  onToggleCompare?: () => void;
  hideOwned?: boolean;
}

export default function ProductCard({
  product,
  onClick,
  onDelete,
  onPriceUpdate,
  onMarkOwned,
  compareMode = false,
  isSelectedForCompare = false,
  onToggleCompare,
  hideOwned = false,
}: ProductCardProps) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(
    product.current_price != null ? String(product.current_price) : ''
  );
  const [savingPrice, setSavingPrice] = useState(false);
  const [markingOwned, setMarkingOwned] = useState(false);
  const [ownedError, setOwnedError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOwned = product.is_owned ?? false;

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

      const data = await updateProduct(product.id, {
        current_price: num,
        is_on_sale: isOnSale,
        price_source: 'manual',
      });

      if (data && onPriceUpdate) onPriceUpdate(data);
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

  const handleMarkOwned = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkingOwned(true);
    setOwnedError(false);
    const newVal = !isOwned;
    try {
      const data = await updateProduct(product.id, { is_owned: newVal });
      if (data && onMarkOwned) onMarkOwned(data);
    } catch {
      setOwnedError(true);
      setTimeout(() => setOwnedError(false), 6000);
    } finally {
      setMarkingOwned(false);
    }
  };

  const handleCardClick = () => {
    if (compareMode && onToggleCompare) {
      onToggleCompare();
    } else {
      onClick();
    }
  };

  const isEbayPrice = product.price_source === 'ebay';

  return (
    <div
      className={`bg-white rounded-xl overflow-hidden border transition-shadow group relative
        ${compareMode
          ? isSelectedForCompare
            ? 'border-blue-500 ring-2 ring-blue-300 cursor-pointer shadow-md'
            : 'border-gray-200 hover:border-blue-300 cursor-pointer hover:shadow-md'
          : 'border-gray-200 hover:shadow-lg cursor-default'
        }`}
      onClick={compareMode ? handleCardClick : undefined}
    >
      {/* Compare mode selection overlay */}
      {compareMode && (
        <div className={`absolute top-3 left-3 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
          ${isSelectedForCompare ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`}
        >
          {isSelectedForCompare && <Check className="w-3.5 h-3.5 text-white" />}
        </div>
      )}

      {/* Owned badge */}
      {isOwned && !hideOwned && (
        <div className="absolute top-3 left-3 z-10 flex items-center space-x-1 bg-emerald-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
          <Check className="w-3 h-3" />
          <span>Owned</span>
        </div>
      )}

      {/* Image */}
      <div
        className="relative aspect-square bg-gray-100"
        onClick={!compareMode ? handleCardClick : undefined}
        style={{ cursor: compareMode ? undefined : 'pointer' }}
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className="w-full h-full object-cover"
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

        {product.is_on_sale && discount > 0 && (
          <div className="absolute top-3 right-3 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
            -{discount}%
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Store + SKU */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            {product.store_name && (
              <p className="text-xs text-gray-500 uppercase tracking-wide">{product.store_name}</p>
            )}
            {product.sku && (
              <p className="text-xs text-gray-400 font-mono truncate max-w-[120px]" title={`SKU: ${product.sku}`}>
                SKU {product.sku}
              </p>
            )}
          </div>
          <h3
            className="text-base font-semibold text-gray-900 line-clamp-2 hover:text-gray-700 transition-colors"
            onClick={!compareMode ? handleCardClick : undefined}
            style={{ cursor: compareMode ? undefined : 'pointer' }}
          >
            {product.title}
          </h3>
        </div>

        {/* Price — click to edit (disabled in compare mode) */}
        {!compareMode && (
          <div className="mb-1">
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
                title={isEbayPrice ? 'eBay market price — click to enter actual price' : 'Click to set price'}
              >
                {product.current_price != null ? (
                  <>
                    <span className="text-xl font-bold text-gray-900">
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
        )}

        {/* Price display in compare mode (read-only) */}
        {compareMode && product.current_price != null && (
          <div className="mb-2 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-gray-900">
              ${product.current_price.toFixed(2)}
            </span>
            {product.is_on_sale && product.original_price && (
              <span className="text-sm text-gray-500 line-through">
                ${product.original_price.toFixed(2)}
              </span>
            )}
          </div>
        )}

        {/* eBay price disclaimer */}
        {isEbayPrice && !editingPrice && product.current_price != null && (
          <div className="flex items-center space-x-1 mb-2">
            <Info className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <p className="text-xs text-gray-400">
              eBay market price · may differ from retailer
            </p>
          </div>
        )}

        {/* Actions (hidden in compare mode) */}
        {!compareMode && (
          <>
            <div className="flex items-center space-x-2 mb-2">
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
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete product"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            {/* I bought this */}
            <button
              onClick={handleMarkOwned}
              disabled={markingOwned}
              className={`w-full text-xs py-1.5 rounded-lg border transition-colors flex items-center justify-center space-x-1.5
                ${ownedError
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : isOwned
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700'
                }`}
            >
              <CheckSquare2 className="w-3.5 h-3.5" />
              <span>
                {markingOwned
                  ? '…'
                  : ownedError
                    ? 'Could not update item ownership'
                    : isOwned
                      ? 'Owned — undo?'
                      : 'I bought this'}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
