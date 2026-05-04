import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  ShoppingBag,
  LogOut,
  ArrowLeft,
  Share2,
  RefreshCw,
  Info,
  GitCompare,
  Bookmark,
  X,
  User,
  Sparkles,
  Camera,
} from 'lucide-react';
import { usePlaywrightStatus } from '../hooks/usePlaywrightStatus';
import { useProxyStatus } from '../hooks/useProxyStatus';
import { useAuth } from '../contexts/AuthContext';
import { refreshProduct } from '../lib/refreshProduct';
import type { Product, List, Outfit } from '../lib/types';
import {
  createList,
  createOutfit,
  deleteList,
  deleteProduct,
  getUserListsWithProducts,
  getUserOutfitsWithProducts,
  updateList,
} from '../lib/firestore';
import ProductCard from './ProductCard';
import AddProductModal from './AddProductModal';
import ProductDetailModal from './ProductDetailModal';
import ListCard, { type ListWithProducts } from './ListCard';
import NotificationsPanel from './NotificationsPanel';
import CompareModal from './CompareModal';
import BookmarkletModal from './BookmarkletModal';
import OutfitModal from './OutfitModal';

type View = { type: 'lists' } | { type: 'list-detail'; listId: string; ownedOnly?: boolean };
type DashboardTab = 'wishlists' | 'owned';

interface DashboardProps {
  prefillUrl?: string;
  onNavigateToProfile?: () => void;
}

export default function Dashboard({ prefillUrl, onNavigateToProfile }: DashboardProps) {
  const { signOut, profile, user } = useAuth();
  const [listsWithProducts, setListsWithProducts] = useState<ListWithProducts[]>([]);
  const [outfitsWithProducts, setOutfitsWithProducts] = useState<
    Array<{ outfit: Outfit; products: Product[] }>
  >([]);
  const [allLists, setAllLists] = useState<List[]>([]);
  const [view, setView] = useState<View>({ type: 'lists' });
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('wishlists');
  const [showAddProduct, setShowAddProduct] = useState(!!prefillUrl);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [createListError, setCreateListError] = useState('');
  const playwrightStatus = usePlaywrightStatus();
  const proxyStatus = useProxyStatus();

  const browserLive = playwrightStatus === 'ready';
  const piOk = proxyStatus === 'unconfigured' || proxyStatus === 'reachable';
  const piUnreachable = proxyStatus === 'unreachable';

  let appStatusTone: 'green' | 'yellow' | 'red';
  let appStatusLabel: string;
  let appStatusTitle: string;
  if (browserLive && piOk) {
    appStatusTone = 'green';
    appStatusLabel = 'App ready';
    appStatusTitle =
      proxyStatus === 'reachable'
        ? 'Browser scrape API is ready; residential proxy (Pi) is reachable.'
        : 'Browser scrape API is ready; Pi proxy is not configured (optional).';
  } else if (!browserLive && piUnreachable) {
    appStatusTone = 'red';
    appStatusLabel = 'App offline';
    appStatusTitle =
      'Scrape API is not ready and the Pi/residential proxy is unreachable. Check Render and your Pi tunnel.';
  } else {
    appStatusTone = 'yellow';
    if (playwrightStatus === 'launching') {
      appStatusLabel = 'Warming up…';
      appStatusTitle =
        'Browser is launching on the server. First load after idle can take 30–60s on free hosting.';
    } else if (browserLive && piUnreachable) {
      appStatusLabel = 'Pi offline';
      appStatusTitle =
        'Scrape API is ready, but the residential proxy (Pi) is unreachable. Scrapes may fail on bot-protected sites.';
    } else {
      appStatusLabel = 'Starting…';
      appStatusTitle =
        'Waiting for the scrape API (cold start or server waking). Pi: ' +
        (proxyStatus === 'unconfigured' ? 'not configured (optional).' : 'reachable.');
    }
  }

  const appStatusClass =
    appStatusTone === 'green'
      ? 'bg-green-50 border-green-200 text-green-700'
      : appStatusTone === 'yellow'
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-red-50 border-red-200 text-red-700';
  const appStatusDotClass =
    appStatusTone === 'green'
      ? 'bg-green-500'
      : appStatusTone === 'yellow'
        ? `bg-amber-400 ${playwrightStatus === 'launching' ? 'animate-pulse' : ''}`
        : 'bg-red-500';
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshAllStatus, setRefreshAllStatus] = useState<string | null>(null);
  const [showRefreshInfo, setShowRefreshInfo] = useState(false);
  const [showBookmarklet, setShowBookmarklet] = useState(false);

  // Compare mode (list-detail view)
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [outfitEditor, setOutfitEditor] = useState<{
    outfit: Outfit;
    products: Product[];
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setOutfitEditor((prev) => {
      if (!prev) return prev;
      const match = outfitsWithProducts.find(({ outfit }) => outfit.id === prev.outfit.id);
      if (match) return match;
      return null;
    });
  }, [outfitsWithProducts]);

  const loadData = async () => {
    setLoading(true);
    await loadLists();
    setLoading(false);
  };

  const loadLists = async () => {
    if (!user) return;
    try {
      const [data, outfits] = await Promise.all([
        getUserListsWithProducts(user.uid),
        getUserOutfitsWithProducts(user.uid),
      ]);
      setListsWithProducts(data);
      setOutfitsWithProducts(outfits);
      setAllLists(data.map(({ products: _p, ...l }) => l as List));
    } catch (error) {
      console.error('Error loading lists:', error);
      return;
    }
  };

  const handleProductAdded = () => {
    loadData();
    setShowAddProduct(false);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteProduct(productId, user.uid);
    } catch (error) {
      console.error(error);
      return;
    }
    await loadData();
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
    if (view.type === 'list-detail' && view.listId === listId) {
      setView({ type: 'lists' });
    }
    await loadData();
  };

  const handleRenameList = async (listId: string, newName: string) => {
    try {
      await updateList(listId, { name: newName });
    } catch (error) {
      console.error(error);
      return;
    }
    await loadData();
  };

  const handleShareList = async (list: ListWithProducts) => {
    let token = list.share_token;
    if (!list.is_shared || !token) {
      token = token ?? crypto.randomUUID();
      try {
        await updateList(list.id, { is_shared: true, share_token: token });
      } catch (error) {
        console.error(error);
        return;
      }
      await loadData();
    }
    const shareUrl = `${window.location.origin}/share/list/${token}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Share link copied to clipboard!');
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !user) return;
    setCreateListError('');
    try {
      await createList({
        user_id: user.uid,
        name: newListName.trim(),
        share_token: crypto.randomUUID(),
      });
    } catch (error) {
      console.error(error);
      setCreateListError('Could not create list. Please try again.');
      return;
    }
    setNewListName('');
    setCreatingList(false);
    await loadData();
  };

  const handleNewOutfit = async () => {
    if (!user) return;
    try {
      const outfit = await createOutfit({ user_id: user.uid, name: 'New outfit' });
      await loadLists();
      setOutfitEditor({ outfit, products: [] });
    } catch (error) {
      console.error(error);
    }
  };

  const handleRefreshAll = async () => {
    if (!user || refreshingAll) return;
    setRefreshingAll(true);
    setRefreshAllStatus(null);
    setShowRefreshInfo(false);

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
      setRefreshAllStatus('No products to check.');
      setRefreshingAll(false);
      return;
    }

    let updated = 0;
    for (let i = 0; i < allProducts.length; i++) {
      setRefreshAllStatus(`Checking ${i + 1} of ${allProducts.length}…`);
      try {
        const result = await refreshProduct(allProducts[i], user.uid);
        if (result.updated) updated++;
      } catch {
        // skip failed products silently
      }
    }

    await loadData();
    setRefreshAllStatus(
      updated > 0
        ? `Done — ${updated} product${updated !== 1 ? 's' : ''} updated with new prices.`
        : `Done — all prices are up to date.`
    );
    setRefreshingAll(false);
  };

  // ── Local state updates ───────────────────────────────────

  const updateProductInState = (updatedProduct: Product) => {
    setListsWithProducts((prev) =>
      prev.map((list) => ({
        ...list,
        products: list.products.map((p) =>
          p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p
        ),
      }))
    );
  };

  // ── Compare helpers ───────────────────────────────────────

  const toggleCompare = (productId: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(productId)) return prev.filter((id) => id !== productId);
      if (prev.length >= 4) return prev;
      return [...prev, productId];
    });
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setSelectedForCompare([]);
  };

  // ── Derived data ──────────────────────────────────────────

  const fullList =
    view.type === 'list-detail'
      ? listsWithProducts.find((l) => l.id === view.listId) ?? null
      : null;

  const displayList =
    fullList && view.type === 'list-detail' && view.ownedOnly
      ? { ...fullList, products: fullList.products.filter((p) => p.is_owned) }
      : fullList;

  /** Owned items across all lists (for outfits picker) — not deleted when an outfit is removed. */
  const stashProducts = useMemo(() => {
    const m = new Map<string, Product>();
    listsWithProducts.forEach((list) => {
      list.products.forEach((p) => {
        if (p.is_owned) m.set(p.id, p);
      });
    });
    return [...m.values()];
  }, [listsWithProducts]);

  const totalOwnedItems = useMemo(() => {
    const seen = new Set<string>();
    listsWithProducts.forEach((list) => {
      list.products.forEach((p) => {
        if (p.is_owned) seen.add(p.id);
      });
    });
    return seen.size;
  }, [listsWithProducts]);

  const totalOwnedValue = useMemo(() => {
    const priceByProduct = new Map<string, number>();
    listsWithProducts.forEach((list) => {
      list.products.forEach((p) => {
        if (p.is_owned && p.current_price != null) {
          priceByProduct.set(p.id, p.current_price);
        }
      });
    });
    let s = 0;
    priceByProduct.forEach((v) => {
      s += v;
    });
    return s;
  }, [listsWithProducts]);

  const compareProducts =
    displayList?.products.filter((p) => selectedForCompare.includes(p.id)) ?? [];

  // ── Nav bar ───────────────────────────────────────────────

  const navBar = (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {view.type === 'list-detail' ? (
              <button
                onClick={() => { setView({ type: 'lists' }); exitCompareMode(); }}
                className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors mr-1"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : null}
            <ShoppingBag className="w-7 h-7 text-gray-900" strokeWidth={1.5} />
            <span className="text-xl font-semibold text-gray-900">Stashd</span>
          </div>

          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-medium ${appStatusClass}`}
              title={appStatusTitle}
              aria-label={appStatusTitle}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${appStatusDotClass}`} />
              <span>{appStatusLabel}</span>
            </span>
            <button
              onClick={() => setShowBookmarklet(true)}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              title="Save products from any website"
            >
              <Bookmark className="w-4 h-4" />
              <span>Bookmarklet</span>
            </button>
            <button
              onClick={() => setShowAddProduct(true)}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Add Product</span>
            </button>
            {user && <NotificationsPanel userId={user.uid} />}
            {onNavigateToProfile && (
              <button
                onClick={onNavigateToProfile}
                className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Profile"
              >
                <User className="w-5 h-5" />
              </button>
            )}
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

  if (view.type === 'list-detail' && fullList && displayList) {
    const hasSale = displayList.products.some((p) => p.is_on_sale);
    const total = displayList.products.reduce((s, p) => s + (p.current_price ?? 0), 0);

    return (
      <div className="min-h-screen bg-gray-50">
        {navBar}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">{fullList.name}</h1>
              {view.ownedOnly && (
                <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2 max-w-xl">
                  Your stash in this list: only products you marked <strong>I own this</strong>. Use Wishlists to add items, then mark them owned.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-gray-500 text-sm">
                <span>
                  {displayList.products.length} item{displayList.products.length !== 1 ? 's' : ''}
                  {view.ownedOnly && fullList.products.length !== displayList.products.length
                    ? ` (${fullList.products.length} on list)`
                    : ''}
                </span>
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

            <div className="flex items-center gap-2 flex-wrap">
              {displayList.products.length >= 2 && (
                <button
                  onClick={() => {
                    setCompareMode((m) => !m);
                    setSelectedForCompare([]);
                  }}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                    ${compareMode
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <GitCompare className="w-4 h-4" />
                  <span>{compareMode ? 'Exit Compare' : 'Compare Items'}</span>
                </button>
              )}
              <button
                onClick={() => handleShareList(fullList)}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Share2 className="w-4 h-4" />
                <span>{fullList.is_shared ? 'Copy share link' : 'Share list'}</span>
              </button>
            </div>
          </div>

          {compareMode && (
            <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center justify-between">
              <span>
                {selectedForCompare.length === 0
                  ? 'Select 2–4 items to compare them side by side'
                  : `${selectedForCompare.length} item${selectedForCompare.length !== 1 ? 's' : ''} selected — select up to ${4 - selectedForCompare.length} more`
                }
              </span>
              {selectedForCompare.length >= 2 && (
                <button
                  onClick={() => setShowCompareModal(true)}
                  className="ml-4 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Compare
                </button>
              )}
            </div>
          )}

          {displayList.products.length === 0 ? (
            <div className="text-center py-20">
              <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No products in this list</h3>
              <p className="text-gray-600 mb-6">
                {view.ownedOnly
                  ? 'Mark items you own from your wishlists, or switch to Wishlists to add products.'
                  : 'Add products and assign them to this list'}
              </p>
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
              {displayList.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => setSelectedProduct(product)}
                  onDelete={() => handleDeleteProduct(product.id)}
                  onPriceUpdate={updateProductInState}
                  onMarkOwned={updateProductInState}
                  compareMode={compareMode}
                  isSelectedForCompare={selectedForCompare.includes(product.id)}
                  onToggleCompare={() => toggleCompare(product.id)}
                  hideOwned={Boolean(view.ownedOnly)}
                />
              ))}
            </div>
          )}
        </main>

        {showCompareModal && compareProducts.length >= 2 && (
          <CompareModal
            products={compareProducts}
            onClose={() => setShowCompareModal(false)}
          />
        )}

        {showAddProduct && (
          <AddProductModal
            lists={allLists}
            onClose={() => setShowAddProduct(false)}
            onSuccess={handleProductAdded}
          />
        )}

        {selectedProduct && !compareMode && (
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

        {user && outfitEditor && (
          <OutfitModal
            userId={user.uid}
            outfit={outfitEditor.outfit}
            stashProducts={stashProducts}
            linkedProducts={outfitEditor.products}
            onClose={() => setOutfitEditor(null)}
            onChanged={() => void loadLists()}
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
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              Welcome back, {profile?.name || 'there'}
            </h1>
            <p className="text-gray-600">
              {listsWithProducts.length} list{listsWithProducts.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {listsWithProducts.some((l) => l.products.length > 0) && (
              <div className="relative">
                <button
                  onClick={handleRefreshAll}
                  disabled={refreshingAll}
                  className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} />
                  <span>{refreshingAll ? (refreshAllStatus ?? 'Checking…') : 'Check prices'}</span>
                </button>
                <button
                  onClick={() => setShowRefreshInfo((v) => !v)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors"
                  title="About checking prices"
                >
                  <Info className="w-2.5 h-2.5 text-gray-600" />
                </button>
              </div>
            )}
            {(dashboardTab === 'wishlists' || dashboardTab === 'owned') && (
              <button
                onClick={() => setCreatingList(true)}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>New List</span>
              </button>
            )}
          </div>
        </div>

        {/* Refresh info tooltip */}
        {showRefreshInfo && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start justify-between gap-3">
            <div className="flex items-start space-x-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Prices aren’t tracked automatically. Pressing <strong>Check prices</strong> will check prices for all items on your list and tell you when something is discounted.
              </p>
            </div>
            <button onClick={() => setShowRefreshInfo(false)} className="text-amber-500 hover:text-amber-700 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Refresh status message */}
        {refreshAllStatus && !refreshingAll && (
          <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center justify-between">
            <span>{refreshAllStatus}</span>
            <button onClick={() => setRefreshAllStatus(null)} className="text-blue-400 hover:text-blue-600 ml-4 text-xs">Dismiss</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center border-b border-gray-200 mb-6">
          <button
            onClick={() => setDashboardTab('wishlists')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              dashboardTab === 'wishlists'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Wishlists
          </button>
          <button
            onClick={() => setDashboardTab('owned')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center space-x-1.5 ${
              dashboardTab === 'owned'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>Owned</span>
            {totalOwnedItems > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                dashboardTab === 'owned' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {totalOwnedItems}
              </span>
            )}
          </button>
        </div>

        {creatingList && (
          <div className="mb-6">
            <form
              onSubmit={handleCreateList}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center space-x-3"
            >
              <input
                type="text"
                value={newListName}
                onChange={(e) => {
                  setNewListName(e.target.value);
                  setCreateListError('');
                }}
                placeholder={dashboardTab === 'owned' ? 'e.g. Summer clothes' : 'List name'}
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
                onClick={() => {
                  setCreatingList(false);
                  setNewListName('');
                  setCreateListError('');
                }}
                className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
              >
                Cancel
              </button>
            </form>
            {createListError && <p className="mt-2 text-sm text-red-600 px-1">{createListError}</p>}
          </div>
        )}

        {/* ── Wishlists tab ── */}
        {dashboardTab === 'wishlists' && (
          <>
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
              </div>
            ) : listsWithProducts.length === 0 && !creatingList ? (
              <div className="text-center py-20">
                <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Your stash is empty</h3>
                <p className="text-gray-500 mb-1 text-sm max-w-sm mx-auto">
                  Paste any product URL — from any shop — to save it here and track the price.
                </p>
                <p className="text-gray-400 mb-6 text-sm">Then organise into lists like "Wishlist", "Birthday ideas", or "Next season".</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => setShowAddProduct(true)}
                    className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center space-x-2"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Save Your First Product</span>
                  </button>
                  <button
                    onClick={() => setCreatingList(true)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center space-x-2"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Create a List</span>
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
          </>
        )}

        {/* ── Owned tab ── */}
        {dashboardTab === 'owned' && (
          <>
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
              </div>
            ) : (
              <>
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">
                      {totalOwnedItems} piece{totalOwnedItems !== 1 ? 's' : ''} in your stash
                      {totalOwnedValue > 0 && (
                        <span className="ml-2 font-semibold text-gray-900">~${totalOwnedValue.toFixed(2)} value</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 max-w-xl">
                      Create lists (e.g. summer clothes), curate outfits from your stash, and add photos of your looks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleNewOutfit()}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium shrink-0"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>New outfit</span>
                  </button>
                </div>

                <div className="mb-8">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    Outfits
                  </h2>
                  {outfitsWithProducts.length === 0 ? (
                    <p className="text-sm text-gray-500 mb-4">
                      No outfits yet. Create one, pick pieces from your stash, and upload mirror pics or inspo shots.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-2">
                      {outfitsWithProducts.map(({ outfit, products }) => {
                        const cover =
                          outfit.image_urls[0] ?? products.find((p) => p.image_url)?.image_url ?? null;
                        return (
                          <button
                            key={outfit.id}
                            type="button"
                            onClick={() => setOutfitEditor({ outfit, products })}
                            className="text-left bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
                          >
                            <div className="aspect-[4/3] bg-gray-100 relative">
                              {cover ? (
                                <img src={cover} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Camera className="w-12 h-12 text-gray-300" />
                                </div>
                              )}
                            </div>
                            <div className="p-4">
                              <h3 className="font-semibold text-gray-900 line-clamp-1">{outfit.name}</h3>
                              <p className="text-xs text-gray-500 mt-1">
                                {products.length} piece{products.length !== 1 ? 's' : ''}
                                {outfit.image_urls.length > 0
                                  ? ` · ${outfit.image_urls.length} photo${outfit.image_urls.length !== 1 ? 's' : ''}`
                                  : ''}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Lists</h2>
                {listsWithProducts.length === 0 && !creatingList ? (
                  <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
                    <ShoppingBag className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Organize your stash</h3>
                    <p className="text-gray-600 text-sm max-w-md mx-auto mb-2">
                      Create a list (e.g. <em>Summer clothes</em>), save products from any shop, then tap{' '}
                      <strong>I own this</strong> on each card once it is in your closet.
                    </p>
                    <p className="text-sm text-gray-400">
                      When you buy from a wishlist, use the same button — owned items show up here under that list.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {listsWithProducts.map((list) => (
                      <ListCard
                        key={list.id}
                        list={list}
                        displayMode="owned"
                        onClick={() => setView({ type: 'list-detail', listId: list.id, ownedOnly: true })}
                        onDelete={() => handleDeleteList(list.id)}
                        onShare={() => handleShareList(list)}
                        onRename={(newName) => handleRenameList(list.id, newName)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {showBookmarklet && <BookmarkletModal onClose={() => setShowBookmarklet(false)} />}

      {showAddProduct && (
        <AddProductModal
          lists={allLists}
          onClose={() => setShowAddProduct(false)}
          onSuccess={handleProductAdded}
          prefillUrl={prefillUrl}
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

      {user && outfitEditor && (
        <OutfitModal
          userId={user.uid}
          outfit={outfitEditor.outfit}
          stashProducts={stashProducts}
          linkedProducts={outfitEditor.products}
          onClose={() => setOutfitEditor(null)}
          onChanged={() => void loadLists()}
        />
      )}
    </div>
  );
}
