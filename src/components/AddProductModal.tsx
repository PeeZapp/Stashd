import { useState } from 'react';
import { X, Plus, AlertCircle, Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { List } from '../lib/types';

interface AddProductModalProps {
  lists: List[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddProductModal({ lists, onClose, onSuccess }: AddProductModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    sourceUrl: '',
    title: '',
    currentPrice: '',
    originalPrice: '',
    imageUrl: '',
    storeName: '',
    description: '',
    sku: '',
  });

  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [newListName, setNewListName] = useState('');

  const handleScrapeUrl = async () => {
    if (!formData.sourceUrl.trim()) {
      setError('Please enter a product URL');
      return;
    }

    setScraping(true);
    setError('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape_product`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: formData.sourceUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to scrape product');
      }

      if (data.data) {
        setFormData((prev) => ({
          ...prev,
          title: data.data.title || prev.title,
          currentPrice: data.data.price.toString(),
          imageUrl: data.data.image || prev.imageUrl,
          storeName: data.data.storeName || prev.storeName,
          description: data.data.description || prev.description,
          sku: data.data.sku || prev.sku,
        }));
      }
    } catch (err) {
      console.error('Scraping error:', err);
      setError(err instanceof Error ? err.message : 'Failed to scrape product details');
    } finally {
      setScraping(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!user) {
        setError('You must be logged in');
        return;
      }

      const currentPrice = parseFloat(formData.currentPrice);
      const originalPrice = formData.originalPrice ? parseFloat(formData.originalPrice) : null;

      if (isNaN(currentPrice) || currentPrice <= 0) {
        setError('Please enter a valid current price');
        return;
      }

      const isOnSale = originalPrice ? originalPrice > currentPrice : false;

      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          user_id: user.id,
          title: formData.title,
          current_price: currentPrice,
          original_price: originalPrice,
          is_on_sale: isOnSale,
          image_url: formData.imageUrl,
          source_url: formData.sourceUrl,
          store_name: formData.storeName,
          description: formData.description,
        })
        .select()
        .single();

      if (productError) throw productError;

      if (newListName.trim()) {
        const shareToken = crypto.randomUUID();
        const { data: newList, error: listError } = await supabase
          .from('lists')
          .insert({
            user_id: user.id,
            name: newListName,
            share_token: shareToken,
          })
          .select()
          .single();

        if (listError) throw listError;
        if (newList) {
          selectedListIds.push(newList.id);
        }
      }

      if (selectedListIds.length > 0 && product) {
        const listProducts = selectedListIds.map((listId) => ({
          list_id: listId,
          product_id: product.id,
        }));

        const { error: listProductError } = await supabase
          .from('list_products')
          .insert(listProducts);

        if (listProductError) throw listProductError;
      }

      onSuccess();
    } catch (err: unknown) {
      console.error('Error adding product:', err);
      setError(err instanceof Error ? err.message : 'Failed to add product');
    } finally {
      setLoading(false);
    }
  };

  const toggleList = (listId: string) => {
    setSelectedListIds((prev) =>
      prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-8 relative my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Product</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product URL <span className="text-red-500">*</span>
            </label>
            <div className="flex space-x-2">
              <input
                type="url"
                value={formData.sourceUrl}
                onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="https://example.com/product"
                required
              />
              <button
                type="button"
                onClick={handleScrapeUrl}
                disabled={scraping || !formData.sourceUrl.trim()}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2 whitespace-nowrap"
              >
                {scraping ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Scraping...</span>
                  </>
                ) : (
                  <span>Auto-fill</span>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="Auto-filled or enter product name"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Price <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-2.5 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.currentPrice}
                  onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Original Price
              </label>
              <div className="relative">
                <span className="absolute left-4 top-2.5 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.originalPrice}
                  onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Image URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="https://example.com/image.jpg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Store Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="e.g., Amazon, Nike, Apple"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
              placeholder="Optional description or notes"
            />
          </div>

          {formData.sku && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SKU / Product Code
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-gray-50"
                disabled
              />
            </div>
          )}

          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Add to Lists (optional)
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
              {loading ? 'Adding...' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
