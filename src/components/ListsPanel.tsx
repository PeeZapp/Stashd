import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Share2, ExternalLink, Pencil, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  createList,
  deleteList,
  getListProductRows,
  getProductsByIds,
  updateList,
} from '../lib/firestore';
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
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedList) loadListProducts(selectedList);
  }, [selectedList]);

  useEffect(() => {
    if (editingListId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingListId]);

  const loadListProducts = async (listId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await getListProductRows(listId, user.uid);
      const products = await getProductsByIds(rows.map((row) => row.product_id));
      setListProducts(products);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !user) return;

    try {
      await createList({
        user_id: user.uid,
        name: newListName.trim(),
        share_token: crypto.randomUUID(),
      });
    } catch (error) {
      console.error(error);
      return;
    }
    setNewListName('');
    onListsChanged();
  };

  const handleDeleteList = async (listId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this list?')) return;
    try {
      await deleteList(listId, user.uid);
    } catch (error) {
      console.error(error);
      return;
    }
    if (selectedList === listId) setSelectedList(null);
    onListsChanged();
  };

  const handleShareList = async (list: List) => {
    let token = list.share_token;
    if (!list.is_shared || !token) {
      token = token ?? crypto.randomUUID();
      try {
        await updateList(list.id, { is_shared: true, share_token: token });
      } catch (error) {
        console.error(error);
        return;
      }
      onListsChanged();
    }
    if (!token) return;
    const shareUrl = `${window.location.origin}/share/list/${token}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Share link copied to clipboard!');
  };

  const startEditing = (list: List) => {
    setEditingListId(list.id);
    setEditingName(list.name);
  };

  const saveRename = async () => {
    if (!editingListId) return;
    const trimmed = editingName.trim();
    const original = lists.find((l) => l.id === editingListId)?.name;
    if (!trimmed || trimmed === original) { setEditingListId(null); return; }

    try {
      await updateList(editingListId, { name: trimmed });
    } catch (error) {
      console.error(error);
    }
    setEditingListId(null);
    onListsChanged();
  };

  const getTotalCost = () => listProducts.reduce((sum, p) => sum + (p.current_price ?? 0), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col min-h-0">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Your Lists</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-6">
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
              {lists.map((list) => {
                const isUncategorised = list.name === 'Uncategorised';
                const isEditing = editingListId === list.id;

                return (
                  <div
                    key={list.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 mr-3">
                        {isEditing ? (
                          <div className="flex items-center space-x-2">
                            <input
                              ref={editInputRef}
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRename();
                                if (e.key === 'Escape') setEditingListId(null);
                              }}
                              className="flex-1 font-semibold px-2 py-0.5 border border-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                            />
                            <button
                              onClick={saveRename}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingListId(null)}
                              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 group/name">
                            <h3 className="font-semibold text-gray-900">{list.name}</h3>
                            {!isUncategorised && (
                              <button
                                onClick={() => startEditing(list)}
                                className="p-1 text-gray-300 hover:text-gray-600 opacity-0 group-hover/name:opacity-100 transition-opacity rounded"
                                title="Rename list"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {selectedList === list.id && !loading && (
                          <p className="text-sm text-gray-600 mt-1">
                            {listProducts.length} item{listProducts.length !== 1 ? 's' : ''}
                            {getTotalCost() > 0 && ` · Total: $${getTotalCost().toFixed(2)}`}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 flex-shrink-0">
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
                        {!isUncategorised && (
                          <button
                            onClick={() => handleDeleteList(list.id)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete list"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
                              <div key={product.id} className="border border-gray-200 rounded-lg overflow-hidden">
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
                                  <p className="text-xs text-gray-900 line-clamp-1 font-medium">{product.title}</p>
                                  {product.current_price != null ? (
                                    <p className="text-xs text-gray-600">${product.current_price.toFixed(2)}</p>
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
