import { supabase } from './supabase';
import type { Product } from './types';

const OUT_OF_STOCK_KEYWORDS = [
  'out of stock',
  'out-of-stock',
  'sold out',
  'sold-out',
  'unavailable',
  'not available',
  'currently unavailable',
  'temporarily unavailable',
  'no longer available',
  'coming soon',
];

function detectOutOfStock(text: string): boolean {
  const lower = text.toLowerCase();
  return OUT_OF_STOCK_KEYWORDS.some((kw) => lower.includes(kw));
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

export interface RefreshResult {
  updated: boolean;
  changes: string[];
}

export async function refreshProduct(
  product: Product,
  userId: string
): Promise<RefreshResult> {
  const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(product.source_url)}&screenshot=false`;
  const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
  const json = await response.json();

  if (json.status !== 'success') {
    throw new Error('Could not reach the product page');
  }

  const d = json.data ?? {};

  // Detect stock status from title + description text
  const combinedText = [d.title, d.description].filter(Boolean).join(' ');
  const newOutOfStock = detectOutOfStock(combinedText);

  // Parse price
  const newPrice = parsePrice(d.price);
  const oldPrice = product.current_price;
  const oldOutOfStock = product.is_out_of_stock;

  // Detect sale: price dropped and we have both values
  const newIsOnSale =
    newPrice !== null && product.original_price !== null
      ? newPrice < product.original_price
      : product.is_on_sale;

  // Build change list
  const changes: string[] = [];
  const notifications: Array<{ type: string; message: string }> = [];

  if (oldOutOfStock && !newOutOfStock) {
    changes.push('Back in stock');
    notifications.push({
      type: 'back_in_stock',
      message: `"${product.title}" is back in stock!`,
    });
  } else if (!oldOutOfStock && newOutOfStock) {
    changes.push('Now out of stock');
    notifications.push({
      type: 'out_of_stock',
      message: `"${product.title}" is now out of stock.`,
    });
  }

  if (newPrice !== null && oldPrice !== null && newPrice < oldPrice) {
    const diff = (oldPrice - newPrice).toFixed(2);
    changes.push(`Price dropped $${diff} (now $${newPrice.toFixed(2)})`);
    notifications.push({
      type: newIsOnSale ? 'on_sale' : 'price_drop',
      message: `"${product.title}" dropped $${diff} — now $${newPrice.toFixed(2)}.`,
    });
  } else if (newPrice !== null && oldPrice === null) {
    changes.push(`Price found: $${newPrice.toFixed(2)}`);
  }

  // Update product in DB if anything changed
  const hasChanges = changes.length > 0 || newOutOfStock !== oldOutOfStock || newPrice !== oldPrice;

  if (hasChanges) {
    const updatePayload: Record<string, unknown> = {
      is_out_of_stock: newOutOfStock,
      is_on_sale: newIsOnSale,
    };
    if (newPrice !== null) {
      updatePayload.current_price = newPrice;
      if (product.original_price === null && product.current_price !== null) {
        updatePayload.original_price = product.current_price;
      }
    }

    await supabase.from('products').update(updatePayload).eq('id', product.id);

    // Write notifications
    if (notifications.length > 0) {
      await supabase.from('notifications').insert(
        notifications.map((n) => ({
          user_id: userId,
          product_id: product.id,
          type: n.type as 'back_in_stock' | 'out_of_stock' | 'on_sale' | 'price_drop',
          message: n.message,
        }))
      );
    }
  }

  return { updated: hasChanges, changes };
}
