import type { ReactNode } from 'react';
import { X, ExternalLink, ShoppingBag } from 'lucide-react';
import type { Product } from '../lib/types';

interface CompareModalProps {
  products: Product[];
  onClose: () => void;
}

function discount(p: Product): number {
  if (!p.is_on_sale || !p.original_price || !p.current_price) return 0;
  return Math.round(((p.original_price - p.current_price) / p.original_price) * 100);
}

export default function CompareModal({ products, onClose }: CompareModalProps) {
  const rows: { label: string; render: (p: Product) => ReactNode }[] = [
    {
      label: 'Image',
      render: (p) =>
        p.image_url ? (
          <img
            src={p.image_url}
            alt={p.title}
            className="w-full aspect-square object-cover rounded-lg"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
            <ShoppingBag className="w-10 h-10 text-gray-300" />
          </div>
        ),
    },
    {
      label: 'Product',
      render: (p) => (
        <div>
          {p.store_name && (
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{p.store_name}</p>
          )}
          <p className="font-semibold text-gray-900 text-sm leading-snug">{p.title}</p>
        </div>
      ),
    },
    {
      label: 'Price',
      render: (p) =>
        p.current_price != null ? (
          <div className="flex items-baseline space-x-2">
            <span className={`text-xl font-bold ${p.is_on_sale ? 'text-red-600' : 'text-gray-900'}`}>
              ${p.current_price.toFixed(2)}
            </span>
            {p.is_on_sale && p.original_price && (
              <span className="text-sm text-gray-400 line-through">${p.original_price.toFixed(2)}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-400">No price</span>
        ),
    },
    {
      label: 'Discount',
      render: (p) => {
        const d = discount(p);
        return d > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-sm font-semibold">
            -{d}%
          </span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        );
      },
    },
    {
      label: 'SKU',
      render: (p) =>
        p.sku ? (
          <span className="text-sm font-mono text-gray-600">{p.sku}</span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        ),
    },
    {
      label: 'Description',
      render: (p) =>
        p.description ? (
          <p className="text-sm text-gray-600 line-clamp-3">{p.description}</p>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        ),
    },
    {
      label: 'Link',
      render: (p) => (
        <a
          href={p.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 text-sm text-gray-900 font-medium hover:underline"
        >
          <span>View Product</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      ),
    },
  ];

  const colWidth = products.length === 2 ? 'w-1/2' : products.length === 3 ? 'w-1/3' : 'w-1/4';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Comparing {products.length} items
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap w-24 align-top">
                    {row.label}
                  </td>
                  {products.map((p) => (
                    <td key={p.id} className={`px-4 py-4 align-top ${colWidth}`}>
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
