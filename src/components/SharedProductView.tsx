import { useEffect, useState } from 'react';
import { ShoppingBag, ExternalLink, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Product } from '../lib/types';

interface SharedProductViewProps {
  productId: string;
}

export default function SharedProductView({ productId }: SharedProductViewProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProduct();
  }, [productId]);

  const loadProduct = async () => {
    try {
      const { data, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();

      if (productError) throw productError;
      if (!data) {
        setError('Product not found');
        setLoading(false);
        return;
      }

      setProduct(data);
    } catch (err) {
      console.error('Error loading product:', err);
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'This product does not exist'}</p>
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

  const discount =
    product.original_price && product.is_on_sale
      ? Math.round(((product.original_price - product.current_price) / product.original_price) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-7 h-7 text-gray-900" strokeWidth={1.5} />
            <span className="text-xl font-semibold text-gray-900">Stashd</span>
          </div>
          <a
            href="/"
            className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            Create Your Own
          </a>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
          <div className="grid md:grid-cols-2 gap-8 p-8">
            <div className="relative">
              <img
                src={product.image_url}
                alt={product.title}
                className="w-full aspect-square object-cover rounded-xl"
              />
              {product.is_on_sale && discount > 0 && (
                <div className="absolute top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-full text-lg font-semibold">
                  -{discount}%
                </div>
              )}
            </div>

            <div className="flex flex-col">
              <div className="mb-6">
                <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">
                  {product.store_name}
                </p>
                <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.title}</h1>

                {product.description && (
                  <p className="text-gray-600 mb-6">{product.description}</p>
                )}

                <div className="flex items-baseline space-x-3 mb-6">
                  <span className="text-4xl font-bold text-gray-900">
                    ${product.current_price.toFixed(2)}
                  </span>
                  {product.is_on_sale && product.original_price && (
                    <span className="text-2xl text-gray-500 line-through">
                      ${product.original_price.toFixed(2)}
                    </span>
                  )}
                </div>

                {product.is_on_sale && product.original_price && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 font-semibold">
                      Save ${(product.original_price - product.current_price).toFixed(2)} ({discount}% off)
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-auto">
                <a
                  href={product.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-6 py-4 bg-gray-900 text-white text-lg font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
                >
                  <span>Buy on {product.store_name}</span>
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
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
