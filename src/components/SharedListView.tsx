import { useEffect, useState } from 'react';
import { ShoppingBag, ExternalLink, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Product, List } from '../lib/types';

interface SharedListViewProps {
  shareToken: string;
}

export default function SharedListView({ shareToken }: SharedListViewProps) {
  const [list, setList] = useState<List | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSharedList();
  }, [shareToken]);

  const loadSharedList = async () => {
    try {
      const { data: listData, error: listError } = await supabase
        .from('lists')
        .select('*')
        .eq('share_token', shareToken)
        .eq('is_shared', true)
        .maybeSingle();

      if (listError) throw listError;
      if (!listData) {
        setError('List not found or not shared');
        setLoading(false);
        return;
      }

      setList(listData);

      const { data: listProducts, error: productsError } = await supabase
        .from('list_products')
        .select('product_id, products(*)')
        .eq('list_id', listData.id);

      if (productsError) throw productsError;

      const prods = listProducts?.map((lp: { products: Product }) => lp.products) || [];
      setProducts(prods);
    } catch (err) {
      console.error('Error loading shared list:', err);
      setError('Failed to load list');
    } finally {
      setLoading(false);
    }
  };

  const totalCost = products.reduce((sum, p) => sum + (p.current_price ?? 0), 0);
  const totalSavings = products.reduce((sum, p) => {
    if (p.is_on_sale && p.original_price && p.current_price != null) {
      return sum + (p.original_price - p.current_price);
    }
    return sum;
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">List Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'This list does not exist or is not shared'}</p>
          <a
            href="/"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Go to Home</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-7 h-7 text-gray-900" strokeWidth={1.5} />
            <span className="text-xl font-semibold text-gray-900">Stashd</span>
          </div>
          <a href="/" className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors">
            Create Your Own
          </a>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">{list.name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-gray-600">
            <p>
              {products.length} item{products.length !== 1 ? 's' : ''}
            </p>
            {totalCost > 0 && (
              <>
                <span>·</span>
                <p className="text-2xl font-bold text-gray-900">${totalCost.toFixed(2)} total</p>
              </>
            )}
            {totalSavings > 0 && (
              <>
                <span>·</span>
                <p className="text-green-600 font-semibold">${totalSavings.toFixed(2)} in savings</p>
              </>
            )}
          </div>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">This list is empty</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => {
              const discount =
                product.original_price && product.current_price && product.is_on_sale
                  ? Math.round(
                      ((product.original_price - product.current_price) /
                        product.original_price) *
                        100
                    )
                  : 0;

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
                >
                  <div className="relative aspect-square bg-gray-100">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
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
                    {product.store_name && (
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                        {product.store_name}
                      </p>
                    )}
                    <h3 className="text-base font-semibold text-gray-900 line-clamp-2 mb-2">
                      {product.title}
                    </h3>

                    <div className="flex items-baseline space-x-2 mb-3">
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
                        </>
                      ) : (
                        <span className="text-sm text-gray-400 italic">No price</span>
                      )}
                    </div>

                    <a
                      href={product.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-1"
                    >
                      <span>View Product</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-600 mb-4">Want to create your own wishlist?</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Get Started with Stashd
          </a>
        </div>
      </footer>
    </div>
  );
}
