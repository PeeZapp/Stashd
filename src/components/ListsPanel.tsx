import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Share2, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { List, Product } from '../lib/types';

interface ListsPanelProps {
  lists: List[];
  onClose: () => void;
  onListsChanged: () => void;
}

export default function ListsPanel({ lists, onClose, onListsChanged }: ListsPanelProps) {
  const { user } = useAuth();
  const [newListName, setNewListName] = useState('');
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [listProducts, setListProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedList) {
      loadListProducts(selectedList);
    }
  }, [selectedList]);

  const loadListProducts = async (listId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('list_products')
      .select('product_id, products(*)')
      .eq('list_id', listId);

    if (error) {
      console.error('Error loading list products:', error);
      setLoading(false);
      return;
    }

    const products = data?.map((lp: { products: Product }) => lp.products) || [];
    setListProducts(products);
    setLoading(false);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !user) return;

    const shareToken = crypto.randomUUID();
    const { error } = await supabase.from('lists').insert({
      user_id: user.id,
      name: newListName.trim(),
      share_token: shareToken,
    });

    if (error) {
      console.error('Error creating list:', error);
      return;
    }

    setNewListName('');
    onListsChanged();
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list?')) return;

    const { error } = await supabase.from('lists').delete().eq('id', listId);

    if (error) {
      console.error('Error deleting list:', error);
      return;
    }

    if (selectedList === listId) setSelectedList(null);
    onListsChanged();
  };

  const handleShareList = async (list: List) => {
    if (!list.is_shared) {
      const shareToken = list.share_token ?? crypto.randomUUID();
      const { error } = await supabase
        .from('lists')
        .update({ is_shared: true, share_token: shareToken })
        .eq('id', list.id);

      if (error) {
        console.error('Error sharing list:', error);
        return;
      }
      onListsChanged();
    }

    const token = list.share_token;
    if (!token) return;
    const shareUrl = `${window.location.origin}/share/list/${token}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Share link copied to clipboard!');
  };

  const getTotalCost = () => {
    return listProducts.reduce((sum, p) => sum + (p.current_price ?? 0), 0);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Your Lists</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleCreateList} className="mb-6 flex space-x-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Create a new list"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!newListName.trim()}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Create</span>
            </button>
          </form>

          {lists.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No lists yet. Create your first list above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lists.map((list) => (
                <div
                  key={list.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{list.name}</h3>
                      {selectedList === list.id && !loading && (
                        <p className="text-sm text-gray-600">
                          {listProducts.length} item{listProducts.length !== 1 ? 's' : ''}
                          {getTotalCost() > 0 && ` · Total: $${getTotalCost().toFixed(2)}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleShareList(list)}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Share list"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSelectedList(selectedList === list.id ? null : list.id)}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View products"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteList(list.id)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete list"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {selectedList === list.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      {loading ? (
                        <p className="text-sm text-gray-500">Loading products...</p>
                      ) : listProducts.length === 0 ? (
                        <p className="text-sm text-gray-500">No products in this list yet.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {listProducts.map((product) => (
                            <div
                              key={product.id}
                              className="border border-gray-200 rounded-lg overflow-hidden"
                            >
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.title}
                                  className="w-full aspect-square object-cover"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                              ) : (
                                <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
                                  <span className="text-gray-300 text-2xl">🛍</span>
                                </div>
                              )}
                              <div className="p-2">
                                <p className="text-xs text-gray-900 line-clamp-1 font-medium">
                                  {product.title}
                                </p>
                                {product.current_price != null ? (
                                  <p className="text-xs text-gray-600">
                                    ${product.current_price.toFixed(2)}
                                  </p>
                                ) : (
                                  <p className="text-xs text-gray-400 italic">No price</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
