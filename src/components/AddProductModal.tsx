import { useState } from 'react';
import { X, Plus, AlertCircle, Loader, ExternalLink, ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
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
}

const emptyForm = (sourceUrl = ''): FormData => ({
  sourceUrl,
  title: '',
  currentPrice: '',
  originalPrice: '',
  imageUrl: '',
  storeName: '',
  description: '',
});

export default function AddProductModal({ lists, onClose, onSuccess }: AddProductModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('url');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormData>(emptyForm());
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [newListName, setNewListName] = useState('');

  const update = (field: keyof FormData, value: string) =>
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
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape_product`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch product data');
      }

      const d = json.data;
      setFormData({
        sourceUrl: url,
        title: d.title ?? '',
        currentPrice: d.current_price != null ? String(d.current_price) : '',
        originalPrice: d.original_price != null ? String(d.original_price) : '',
        imageUrl: d.image_url ?? '',
        storeName: d.store_name ?? '',
        description: d.description ?? '',
      });
      setStep('details');
    } catch (err) {
      console.error('Fetch error:', err);
      setFormData(emptyForm(url));
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

      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          user_id: user.id,
          title: formData.title.trim(),
          source_url: formData.sourceUrl.trim(),
          current_price: currentPrice,
          original_price: originalPrice,
          is_on_sale: isOnSale,
          image_url: formData.imageUrl.trim() || null,
          store_name: formData.storeName.trim() || null,
          description: formData.description.trim() || null,
        })
        .select()
        .single();

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

      if (allListIds.length > 0 && product) {
        const { error: lpError } = await supabase
          .from('list_products')
          .insert(allListIds.map((list_id) => ({ list_id, product_id: product.id })));
        if (lpError) throw lpError;
      }

      onSuccess();
    } catch (err: unknown) {
      console.error('Error saving product:', err);
      setError(err instanceof Error ? err.message : 'Failed to save product');
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
              We're reading the page metadata. This usually takes just a second.
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
              {/* URL (readonly-ish) */}
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

              {/* Title — required */}
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

              {/* Prices — optional */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Price
                    <span className="ml-1 text-xs text-gray-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.currentPrice}
                      onChange={(e) => update('currentPrice', e.target.value)}
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Original Price
                    <span className="ml-1 text-xs text-gray-400">(optional)</span>
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

              {/* Image preview + URL */}
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

              {/* Store name */}
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
                  placeholder="e.g., Amazon, Nike, Apple"
                />
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
