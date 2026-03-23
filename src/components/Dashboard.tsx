import { useState, useEffect } from 'react';
import { Plus, ShoppingBag, LogOut, List as ListIcon, Filter, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Product, List } from '../lib/types';
import ProductCard from './ProductCard';
import AddProductModal from './AddProductModal';
import ListsPanel from './ListsPanel';
import ProductDetailModal from './ProductDetailModal';

export default function Dashboard() {
  const { signOut, profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showLists, setShowLists] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'price-low' | 'price-high' | 'sale'>('recent');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadProducts(), loadLists()]);
    setLoading(false);
  };

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading products:', error);
      return;
    }

    setProducts(data || []);
  };

  const loadLists = async () => {
    const { data, error } = await supabase
      .from('lists')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading lists:', error);
      return;
    }

    setLists(data || []);
  };

  const handleProductAdded = () => {
    loadData();
    setShowAddProduct(false);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error('Error deleting product:', error);
      return;
    }

    loadProducts();
  };

  const getFilteredProducts = () => {
    let filtered = [...products];

    if (selectedList) {
      filtered = products.filter((p) => {
        return true;
      });
    }

    switch (sortBy) {
      case 'price-low':
        filtered.sort((a, b) => a.current_price - b.current_price);
        break;
      case 'price-high':
        filtered.sort((a, b) => b.current_price - a.current_price);
        break;
      case 'sale':
        filtered = filtered.filter((p) => p.is_on_sale);
        break;
      case 'recent':
      default:
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return filtered;
  };

  const filteredProducts = getFilteredProducts();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ShoppingBag className="w-7 h-7 text-gray-900" strokeWidth={1.5} />
              <span className="text-xl font-semibold text-gray-900">Stashd</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowLists(true)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center space-x-2"
              >
                <ListIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Lists</span>
              </button>
              <button
                onClick={() => setShowAddProduct(true)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">Add Product</span>
              </button>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {profile?.name || 'there'}
          </h1>
          <p className="text-gray-600">
            You have {products.length} saved product{products.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Sort by:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSortBy('recent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'recent'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Recently Added
            </button>
            <button
              onClick={() => setSortBy('price-low')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'price-low'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Price: Low to High
            </button>
            <button
              onClick={() => setSortBy('price-high')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'price-high'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Price: High to Low
            </button>
            <button
              onClick={() => setSortBy('sale')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'sale'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              On Sale
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No products yet</h3>
            <p className="text-gray-600 mb-6">Start by adding your first product</p>
            <button
              onClick={() => setShowAddProduct(true)}
              className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Add Your First Product</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={() => setSelectedProduct(product)}
                onDelete={() => handleDeleteProduct(product.id)}
              />
            ))}
          </div>
        )}
      </main>

      {showAddProduct && (
        <AddProductModal
          lists={lists}
          onClose={() => setShowAddProduct(false)}
          onSuccess={handleProductAdded}
        />
      )}

      {showLists && (
        <ListsPanel
          lists={lists}
          onClose={() => setShowLists(false)}
          onListsChanged={loadLists}
        />
      )}

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          lists={lists}
          onClose={() => setSelectedProduct(null)}
          onUpdate={loadProducts}
          onDelete={() => {
            handleDeleteProduct(selectedProduct.id);
            setSelectedProduct(null);
          }}
        />
      )}
    </div>
  );
}
