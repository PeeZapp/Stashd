import { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, Share2, Trash2, Check, ShoppingBag, RefreshCw, PackageX, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { refreshProduct } from '../lib/refreshProduct';
import { useAuth } from '../contexts/AuthContext';
import type { Product, List } from '../lib/types';

interface ProductDetailModalProps {
  product: Product;
  lists: List[];
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export default function ProductDetailModal({
  product,
  lists,
  onClose,
  onUpdate,
  onDelete,
}: ProductDetailModalProps) {
  const { user } = useAuth();
  const [productLists, setProductLists] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadProductLists();
  }, [product.id]);

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [handleEsc]);

  const loadProductLists = async () => {
    const { data, error } = await supabase
      .from('list_products')
      .select('list_id')
      .eq('product_id', product.id);

    if (error) { console.error(error); return; }
    setProductLists(data?.map((lp) => lp.list_id) || []);
    setLoading(false);
  };

  const handleToggleList = async (listId: string) => {
    const isInList = productLists.includes(listId);

    if (isInList) {
      const { error } = await supabase
        .from('list_products')
        .delete()
        .eq('list_id', listId)
        .eq('product_id', product.id);
      if (error) { console.error(error); return; }
      setProductLists((prev) => prev.filter((id) => id !== listId));
    } else {
      const { error } = await supabase
        .from('list_products')
        .insert({ list_id: listId, product_id: product.id });
      if (error) { console.error(error); return; }
      setProductLists((prev) => [...prev, listId]);
    }
    onUpdate();
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/share/product/${product.id}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Product link copied to clipboard!');
  };

  const handleRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const result = await refreshProduct(product, user.id);
      if (result.updated && result.changes.length > 0) {
        setRefreshMsg({ type: 'success', text: result.changes.join(' · ') });
        onUpdate();
      } else {
        setRefreshMsg({ type: 'success', text: 'Everything looks up to date.' });
      }
    } catch {
      setRefreshMsg({ type: 'error', text: 'Could not reach the product page. Try again later.' });
    } finally {
      setRefreshing(false);
    }
  };

  const discount =
    product.original_price && product.current_price && product.is_on_sale
      ? Math.round(
          ((product.original_price - product.current_price) / product.original_price) * 100
        )
      : 0;

  const storeName = product.store_name ?? 'Store';
  const isEbayPrice = product.price_source === 'ebay';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full p-8 relative my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Image */}
          <div className="relative">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.title}
                className={`w-full aspect-square object-cover rounded-xl ${product.is_out_of_stock ? 'grayscale' : ''}`}
                onError={(e) => {
                  const t = e.currentTarget;
                  t.style.display = 'none';
                  const sibling = t.nextElementSibling as HTMLElement | null;
                  if (sibling) sibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-full aspect-square rounded-xl bg-gray-100 items-center justify-center"
              style={{ display: product.image_url ? 'none' : 'flex' }}
            >
              <ShoppingBag className="w-20 h-20 text-gray-300" />
            </div>

            {product.is_out_of_stock && (
              <div className="absolute inset-x-0 bottom-0 rounded-b-xl bg-gray-900 bg-opacity-80 text-white text-center py-3 flex items-center justify-center space-x-2">
                <PackageX className="w-5 h-5" />
                <span className="font-semibold">Out of Stock</span>
              </div>
            )}

            {!product.is_out_of_stock && product.is_on_sale && discount > 0 && (
              <div className="absolute top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-full text-lg font-semibold">
                -{discount}%
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <div className="mb-4">
              {/* Store + SKU row */}
              <div className="flex items-center justify-between mb-2">
                {product.store_name && (
                  <p className="text-sm text-gray-500 uppercase tracking-wide">{product.store_name}</p>
                )}
                {product.sku && (
                  <span className="text-xs text-gray-400 font-mono bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                    SKU {product.sku}
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">{product.title}</h2>

              {product.description && (
                <p className="text-gray-600 mb-4">{product.description}</p>
              )}

              {/* Stock warning */}
              {product.is_out_of_stock && (
                <div className="mb-4 p-3 bg-gray-100 border border-gray-300 rounded-lg flex items-center space-x-2">
                  <PackageX className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <p className="text-sm text-gray-700 font-medium">
                    This item is currently out of stock. Refresh to check if it's back.
                  </p>
                </div>
              )}

              {/* Price */}
              <div className="flex items-baseline space-x-3 mb-1">
                {product.current_price != null ? (
                  <>
                    <span className={`text-3xl font-bold ${product.is_out_of_stock ? 'text-gray-400' : 'text-gray-900'}`}>
                      ${product.current_price.toFixed(2)}
                    </span>
                    {product.is_on_sale && product.original_price && (
                      <span className="text-xl text-gray-500 line-through">
                        ${product.original_price.toFixed(2)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400 italic text-lg">No price set</span>
                )}
              </div>

              {/* Price source disclaimer */}
              {product.current_price != null && (
                <div className="flex items-start space-x-1.5 mb-4">
                  <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                  {isEbayPrice ? (
                    <p className="text-xs text-gray-500">
                      Price sourced from eBay marketplace listings. This is a market reference price and may differ from the actual retailer's current price. Click the price on the card to enter the real price manually.
                    </p>
                  ) : product.price_source === 'scraped' ? (
                    <p className="text-xs text-gray-500">
                      Price read directly from the product page. Verify on the retailer's site for accuracy.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Price entered manually.
                    </p>
                  )}
                </div>
              )}

              {product.is_on_sale && product.original_price && product.current_price && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium">
                    You save ${(product.original_price - product.current_price).toFixed(2)} ({discount}% off)
                  </p>
                </div>
              )}

              {/* Refresh result */}
              {refreshMsg && (
                <div className={`mb-4 p-3 rounded-lg border text-sm font-medium ${refreshMsg.type === 'success' ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {refreshMsg.text}
                </div>
              )}
            </div>

            {/* Lists */}
            <div className="mb-6 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Add to Lists</h3>
              {loading ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : lists.length === 0 ? (
                <p className="text-sm text-gray-500">No lists yet. Create one first.</p>
              ) : (
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {lists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => handleToggleList(list.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        productLists.includes(list.id)
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <span className="text-sm font-medium">{list.name}</span>
                      {productLists.includes(list.id) && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-auto space-y-3">
              <a
                href={product.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2 font-medium"
              >
                <span>View on {storeName}</span>
                <ExternalLink className="w-5 h-5" />
              </a>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Checking…' : 'Check Price & Stock'}</span>
              </button>

              {/* Refresh disclaimer */}
              <p className="text-xs text-gray-400 text-center">
                Prices from eBay marketplace · stock from retailer page where available
              </p>

              <div className="flex space-x-2">
                <button
                  onClick={handleShare}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2"
                >
                  <Share2 className="w-5 h-5" />
                  <span>Share</span>
                </button>
                <button
                  onClick={onDelete}
                  className="flex-1 px-4 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center space-x-2"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
