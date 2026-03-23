import { useState } from 'react';
import { X, Plus, AlertCircle, Loader, ExternalLink, ChevronLeft, DollarSign, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { scrapeProduct } from '../lib/scrapeProduct';
import type { List } from '../lib/types';

interface AddProductModalProps {
  lists: List[];
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'url' | 'fetching' | 'details';

interface FormData {
  sourceUrl: string;
  title: string;
  currentPrice: string;
  originalPrice: string;
  imageUrl: string;
  storeName: string;
  description: string;
  isOutOfStock: boolean;
  sku: string;
  priceSource: 'manual' | 'ebay' | 'scraped' | null;
}

const emptyForm = (sourceUrl = ''): FormData => ({
  sourceUrl,
  title: '',
  currentPrice: '',
  originalPrice: '',
  imageUrl: '',
  storeName: '',
  description: '',
  isOutOfStock: false,
  sku: '',
  priceSource: null,
});

export default function AddProductModal({ lists, onClose, onSuccess }: AddProductModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('url');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormData>(emptyForm());
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [newListName, setNewListName] = useState('');

  const update = (field: keyof FormData, value: string | boolean | null) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleFetchUrl = async () => {
    const url = formData.sourceUrl.trim();
    if (!url) {
      setError('Please enter a product URL');
      return;
    }
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL (e.g. https://example.com/product)');
      return;
    }

    setError('');
    setStep('fetching');

    try {
      const scraped = await scrapeProduct(url);

      setFormData({
        sourceUrl: url,
        title: scraped.title ?? '',
        currentPrice: scraped.current_price != null ? String(scraped.current_price) : '',
        originalPrice: scraped.original_price != null ? String(scraped.original_price) : '',
        imageUrl: scraped.image_url ?? '',
        storeName: scraped.store_name ?? '',
        description: scraped.description ?? '',
        isOutOfStock: scraped.is_out_of_stock,
        sku: scraped.sku ?? '',
        priceSource: scraped.price_source,
      });
      setStep('details');
    } catch (err) {
      console.error('Fetch error:', err);
      setFormData(emptyForm(url));
      setError('Could not read that page automatically — please fill in the details below.');
      setStep('details');
    }
  };

  const handleSkipToManual = () => {
    setError('');
    setFormData(emptyForm());
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.title.trim()) {
      setError('Product name is required');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const currentPrice =
        formData.currentPrice.trim() ? parseFloat(formData.currentPrice) : null;
      const originalPrice =
        formData.originalPrice.trim() ? parseFloat(formData.originalPrice) : null;
      const isOnSale =
        currentPrice !== null && originalPrice !== null && originalPrice > currentPrice;

      // Build insert payload — only include columns confirmed to exist.
      // New columns (is_out_of_stock, sku, price_source) require the migration in
      // supabase/migrations/20260323000002_add_sku_and_price_source.sql to be run first.
      // We try with the full payload and gracefully retry without extended columns on error.
      const basePayload = {
        user_id: user.id,
        title: formData.title.trim(),
        source_url: formData.sourceUrl.trim(),
        current_price: currentPrice,
        original_price: originalPrice,
        is_on_sale: isOnSale,
        image_url: formData.imageUrl.trim() || null,
        store_name: formData.storeName.trim() || null,
        description: formData.description.trim() || null,
      };

      const extendedPayload = {
        ...basePayload,
        is_out_of_stock: formData.isOutOfStock,
        sku: formData.sku.trim() || null,
        price_source: formData.priceSource,
      };

      let productInsert = await supabase
        .from('products')
        .insert(extendedPayload)
        .select()
        .single();

      // If extended columns don't exist yet (migration not run), retry with base payload
      if (
        productInsert.error &&
        (productInsert.error.message.includes('column') ||
          productInsert.error.code === 'PGRST204')
      ) {
        productInsert = await supabase
          .from('products')
          .insert(basePayload)
          .select()
          .single();
      }

      const { data: product, error: productError } = productInsert;
      if (productError) throw productError;

      let allListIds = [...selectedListIds];

      if (newListName.trim()) {
        const shareToken = crypto.randomUUID();
        const { data: newList, error: listError } = await supabase
          .from('lists')
          .insert({ user_id: user.id, name: newListName.trim(), share_token: shareToken })
          .select()
          .single();
        if (listError) throw listError;
        if (newList) allListIds = [...allListIds, newList.id];
      }

      // If still no list selected, use or create an "Uncategorised" list
      if (allListIds.length === 0 && product) {
        const { data: existing } = await supabase
          .from('lists')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', 'Uncategorised')
          .maybeSingle();

        if (existing) {
          allListIds = [existing.id];
        } else {
          const { data: created, error: createError } = await supabase
            .from('lists')
            .insert({ user_id: user.id, name: 'Uncategorised', share_token: crypto.randomUUID() })
            .select()
            .single();
          if (createError) throw createError;
          if (created) allListIds = [created.id];
        }
      }

      if (allListIds.length > 0 && product) {
        const { error: lpError } = await supabase
          .from('list_products')
          .insert(allListIds.map((list_id) => ({ list_id, product_id: product.id })));
        if (lpError) throw lpError;
      }

      onSuccess();
    } catch (err: unknown) {
      console.error('Error saving product:', err);
      const errObj = err as Record<string, unknown>;
      const msg = typeof errObj?.message === 'string'
        ? errObj.message
        : 'Failed to save product. Please try again.';
      setError(msg);
      // Scroll to top of modal so error is visible
      document.querySelector('.modal-scroll-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setLoading(false);
    }
  };

  const toggleList = (listId: string) =>
    setSelectedListIds((prev) =>
      prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId]
    );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-8 relative my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* ── Step: URL entry ── */}
        {step === 'url' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Add New Product</h2>
            <p className="text-sm text-gray-500 mb-6">
              Paste a product URL and we'll fill in the details automatically.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={formData.sourceUrl}
                  onChange={(e) => update('sourceUrl', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="https://example.com/product"
                  autoFocus
                />
              </div>

              <button
                type="button"
                onClick={handleFetchUrl}
                disabled={!formData.sourceUrl.trim()}
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center space-x-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Import from URL</span>
              </button>

              <button
                type="button"
                onClick={handleSkipToManual}
                className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Skip — enter details manually
              </button>
            </div>
          </>
        )}

        {/* ── Step: Fetching ── */}
        {step === 'fetching' && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Loader className="w-10 h-10 text-gray-900 animate-spin" />
            <p className="text-gray-700 font-medium">Fetching product details…</p>
            <p className="text-sm text-gray-400 text-center max-w-xs">
              Reading product details from the page. This usually takes just a second.
            </p>
          </div>
        )}

        {/* ── Step: Details / edit ── */}
        {step === 'details' && (
          <>
            <div className="flex items-center space-x-2 mb-6">
              <button
                type="button"
                onClick={() => { setStep('url'); setError(''); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-2xl font-bold text-gray-900">Product Details</h2>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={formData.sourceUrl}
                  onChange={(e) => update('sourceUrl', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm text-gray-600"
                  placeholder="https://example.com/product"
                  required
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => update('title', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Product name"
                  required
                />
              </div>

              {/* Price not found callout */}
              {!formData.currentPrice && formData.sourceUrl && (
                <div className="flex items-start space-x-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <DollarSign className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Price not found automatically</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Most major retailers protect their prices from automated reading. Check the site and enter the price below — it only takes a second.
                    </p>
                  </div>
                </div>
              )}

              {/* eBay price disclaimer when price was sourced from eBay */}
              {formData.currentPrice && formData.priceSource === 'ebay' && (
                <div className="flex items-start space-x-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Price from eBay marketplace</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      We couldn't read the price directly from the retailer, so this is the lowest new listing price from eBay. It's a useful reference but may differ from the retailer's actual price. You can edit it below.
                    </p>
                  </div>
                </div>
              )}

              {/* Prices */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.currentPrice}
                      onChange={(e) => { update('currentPrice', e.target.value); update('priceSource', 'manual'); }}
                      className={`w-full pl-7 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${!formData.currentPrice && formData.sourceUrl ? 'border-amber-300 bg-amber-50' : 'border-gray-300'}`}
                      placeholder="0.00"
                      autoFocus={!formData.currentPrice && !!formData.sourceUrl}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Original / Was Price
                    <span className="ml-1 text-xs text-gray-400">(if on sale)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.originalPrice}
                      onChange={(e) => update('originalPrice', e.target.value)}
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image URL
                  <span className="ml-1 text-xs text-gray-400">(optional)</span>
                </label>
                {formData.imageUrl && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-gray-200 h-32 bg-gray-50 flex items-center justify-center">
                    <img
                      src={formData.imageUrl}
                      alt="Product preview"
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => update('imageUrl', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              {/* Store + SKU row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Store Name
                    <span className="ml-1 text-xs text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.storeName}
                    onChange={(e) => update('storeName', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="e.g., Amazon, Nike"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SKU / Model No.
                    <span className="ml-1 text-xs text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => update('sku', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono text-sm"
                    placeholder="e.g., ABC-1234"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                  <span className="ml-1 text-xs text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                  placeholder="Notes or description"
                />
              </div>

              {/* Lists */}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Add to Lists
                  <span className="ml-1 text-xs text-gray-400">(optional)</span>
                </label>

                {lists.length > 0 && (
                  <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                    {lists.map((list) => (
                      <label
                        key={list.id}
                        className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedListIds.includes(list.id)}
                          onChange={() => toggleList(list.id)}
                          className="w-4 h-4 text-gray-900 focus:ring-gray-900 rounded"
                        />
                        <span className="text-sm text-gray-700">{list.name}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Create new list"
                  />
                  {newListName && (
                    <div className="flex items-center px-3 bg-gray-100 rounded-lg">
                      <Plus className="w-4 h-4 text-gray-600" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? 'Saving…' : 'Save Product'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
