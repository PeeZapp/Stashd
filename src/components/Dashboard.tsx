import { useState, useEffect } from 'react';
import { Plus, ShoppingBag, LogOut, ArrowLeft, Share2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { refreshProduct } from '../lib/refreshProduct';
import type { Product, List } from '../lib/types';
import ProductCard from './ProductCard';
import AddProductModal from './AddProductModal';
import ProductDetailModal from './ProductDetailModal';
import ListCard, { type ListWithProducts } from './ListCard';
import NotificationsPanel from './NotificationsPanel';

type View = { type: 'lists' } | { type: 'list-detail'; listId: string };

export default function Dashboard() {
  const { signOut, profile, user } = useAuth();
  const [listsWithProducts, setListsWithProducts] = useState<ListWithProducts[]>([]);
  const [allLists, setAllLists] = useState<List[]>([]);
  const [view, setView] = useState<View>({ type: 'lists' });
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshAllStatus, setRefreshAllStatus] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await loadLists();
    setLoading(false);
  };

  const loadLists = async () => {
    const { data, error } = await supabase
      .from('lists')
      .select(`
        *,
        list_products (
          products (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading lists:', error);
      return;
    }

    const normalized: ListWithProducts[] = (data || []).map((list) => {
      const rawList = list as unknown as Record<string, unknown>;
      const listProducts = (rawList.list_products as Array<{ products: Product | null }>) || [];
      return {
        id: rawList.id as string,
        user_id: rawList.user_id as string,
        name: rawList.name as string,
        is_shared: rawList.is_shared as boolean,
        share_token: rawList.share_token as string | null,
        created_at: rawList.created_at as string,
        updated_at: rawList.updated_at as string,
        products: listProducts.map((lp) => lp.products).filter(Boolean) as Product[],
      };
    });

    setListsWithProducts(normalized);
    setAllLists(
      normalized.map(({ products: _p, ...l }) => l as List)
    );
  };

  const handleProductAdded = () => {
    loadData();
    setShowAddProduct(false);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) { console.error(error); return; }
    await loadData();
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list?')) return;
    const { error } = await supabase.from('lists').delete().eq('id', listId);
    if (error) { console.error(error); return; }
    if (view.type === 'list-detail' && view.listId === listId) {
      setView({ type: 'lists' });
    }
    await loadData();
  };

  const handleRenameList = async (listId: string, newName: string) => {
    const { error } = await supabase.from('lists').update({ name: newName }).eq('id', listId);
    if (error) { console.error(error); return; }
    await loadData();
  };

  const handleShareList = async (list: ListWithProducts) => {
    let token = list.share_token;
    if (!list.is_shared || !token) {
      token = token ?? crypto.randomUUID();
      const { error } = await supabase
        .from('lists')
        .update({ is_shared: true, share_token: token })
        .eq('id', list.id);
      if (error) { console.error(error); return; }
      await loadData();
    }
    const shareUrl = `${window.location.origin}/share/list/${token}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Share link copied to clipboard!');
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const { error } = await supabase.from('lists').insert({
      user_id: (await supabase.auth.getUser()).data.user?.id ?? '',
      name: newListName.trim(),
      share_token: crypto.randomUUID(),
    });
    if (error) { console.error(error); return; }
    setNewListName('');
    setCreatingList(false);
    await loadData();
  };

  const handleRefreshAll = async () => {
    if (!user || refreshingAll) return;
    setRefreshingAll(true);
    setRefreshAllStatus(null);

    // Collect unique products across all lists
    const seen = new Set<string>();
    const allProducts: Product[] = [];
    for (const list of listsWithProducts) {
      for (const p of list.products) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          allProducts.push(p);
        }
      }
    }

    if (allProducts.length === 0) {
      setRefreshAllStatus('No products to refresh.');
      setRefreshingAll(false);
      return;
    }

    let updated = 0;
    for (let i = 0; i < allProducts.length; i++) {
      setRefreshAllStatus(`Checking ${i + 1} of ${allProducts.length}…`);
      try {
        const result = await refreshProduct(allProducts[i], user.id);
        if (result.updated) updated++;
      } catch {
        // skip failed products silently
      }
    }

    await loadData();
    setRefreshAllStatus(
      updated > 0
        ? `Done — ${updated} product${updated !== 1 ? 's' : ''} updated.`
        : `Done — everything is up to date.`
    );
    setRefreshingAll(false);
  };

  // ── Inline price update from ProductCard ──────────────────

  const handlePriceUpdate = (updatedProduct: import('../lib/types').Product) => {
    setListsWithProducts((prev) =>
      prev.map((list) => ({
        ...list,
        products: list.products.map((p) =>
          p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p
        ),
      }))
    );
  };

  // ── Views ─────────────────────────────────────────────────

  const activeList =
    view.type === 'list-detail'
      ? listsWithProducts.find((l) => l.id === view.listId) ?? null
      : null;

  const navBar = (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {view.type === 'list-detail' ? (
              <button
                onClick={() => setView({ type: 'lists' })}
                className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors mr-1"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : null}
            <ShoppingBag className="w-7 h-7 text-gray-900" strokeWidth={1.5} />
            <span className="text-xl font-semibold text-gray-900">Stashd</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAddProduct(true)}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Add Product</span>
            </button>
            {user && <NotificationsPanel userId={user.id} />}
            <button
              onClick={signOut}
              className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );

  // ── List detail view ──────────────────────────────────────
  if (view.type === 'list-detail' && activeList) {
    const hasSale = activeList.products.some((p) => p.is_on_sale);
    const total = activeList.products.reduce((s, p) => s + (p.current_price ?? 0), 0);

    return (
      <div className="min-h-screen bg-gray-50">
        {navBar}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">{activeList.name}</h1>
              <div className="flex flex-wrap items-center gap-3 text-gray-500 text-sm">
                <span>{activeList.products.length} item{activeList.products.length !== 1 ? 's' : ''}</span>
                {total > 0 && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-gray-900 text-base">${total.toFixed(2)} total</span>
                  </>
                )}
                {hasSale && (
                  <>
                    <span>·</span>
                    <span className="text-red-600 font-medium">Items on sale!</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => handleShareList(activeList)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <Share2 className="w-4 h-4" />
              <span>{activeList.is_shared ? 'Copy share link' : 'Share list'}</span>
            </button>
          </div>

          {activeList.products.length === 0 ? (
            <div className="text-center py-20">
              <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No products in this list</h3>
              <p className="text-gray-600 mb-6">Add products and assign them to this list</p>
              <button
                onClick={() => setShowAddProduct(true)}
                className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Add Product</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {activeList.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => setSelectedProduct(product)}
                  onDelete={() => handleDeleteProduct(product.id)}
                  onPriceUpdate={handlePriceUpdate}
                />
              ))}
            </div>
          )}
        </main>

        {showAddProduct && (
          <AddProductModal
            lists={allLists}
            onClose={() => setShowAddProduct(false)}
            onSuccess={handleProductAdded}
          />
        )}

        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            lists={allLists}
            onClose={() => setSelectedProduct(null)}
            onUpdate={loadData}
            onDelete={() => {
              handleDeleteProduct(selectedProduct.id);
              setSelectedProduct(null);
            }}
          />
        )}
      </div>
    );
  }

  // ── Lists overview ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {navBar}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              Welcome back, {profile?.name || 'there'}
            </h1>
            <p className="text-gray-600">
              {listsWithProducts.length} list{listsWithProducts.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {listsWithProducts.some((l) => l.products.length > 0) && (
              <button
                onClick={handleRefreshAll}
                disabled={refreshingAll}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} />
                <span>{refreshingAll ? (refreshAllStatus ?? 'Refreshing…') : 'Refresh All'}</span>
              </button>
            )}
            <button
              onClick={() => setCreatingList(true)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>New List</span>
            </button>
          </div>
        </div>

        {/* Refresh status message */}
        {refreshAllStatus && !refreshingAll && (
          <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center justify-between">
            <span>{refreshAllStatus}</span>
            <button onClick={() => setRefreshAllStatus(null)} className="text-blue-400 hover:text-blue-600 ml-4 text-xs">Dismiss</button>
          </div>
        )}

        {/* Create list inline form */}
        {creatingList && (
          <form
            onSubmit={handleCreateList}
            className="mb-6 bg-white rounded-xl border border-gray-200 p-4 flex items-center space-x-3"
          >
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name"
              autoFocus
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
            />
            <button
              type="submit"
              disabled={!newListName.trim()}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setCreatingList(false); setNewListName(''); }}
              className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
            >
              Cancel
            </button>
          </form>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
          </div>
        ) : listsWithProducts.length === 0 && !creatingList ? (
          <div className="text-center py-20">
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No lists yet</h3>
            <p className="text-gray-600 mb-6">
              Create a list, then add products to it
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setCreatingList(true)}
                className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Create Your First List</span>
              </button>
              <button
                onClick={() => setShowAddProduct(true)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Add a Product</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listsWithProducts.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onClick={() => setView({ type: 'list-detail', listId: list.id })}
                onDelete={() => handleDeleteList(list.id)}
                onShare={() => handleShareList(list)}
                onRename={(newName) => handleRenameList(list.id, newName)}
              />
            ))}
          </div>
        )}
      </main>

      {showAddProduct && (
        <AddProductModal
          lists={allLists}
          onClose={() => setShowAddProduct(false)}
          onSuccess={handleProductAdded}
        />
      )}

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          lists={allLists}
          onClose={() => setSelectedProduct(null)}
          onUpdate={loadData}
          onDelete={() => {
            handleDeleteProduct(selectedProduct.id);
            setSelectedProduct(null);
          }}
        />
      )}
    </div>
  );
}
