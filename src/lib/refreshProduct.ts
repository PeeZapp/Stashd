import { supabase } from './supabase';
import { scrapeProduct, fetchEbayPrice } from './scrapeProduct';
import type { Product } from './types';

export interface RefreshResult {
  updated: boolean;
  changes: string[];
}

export async function refreshProduct(
  product: Product,
  userId: string
): Promise<RefreshResult> {
  const scraped = await scrapeProduct(product.source_url);

  // If scraping returned no price but we have a title, fall back to eBay
  let newPrice = scraped.current_price;
  let priceSource = scraped.price_source;

  if (newPrice === null && (scraped.title ?? product.title)) {
    const ebayPrice = await fetchEbayPrice(
      scraped.title ?? product.title,
      scraped.sku ?? product.sku
    );
    if (ebayPrice !== null) {
      newPrice = ebayPrice;
      priceSource = 'ebay';
    }
  }

  const newOutOfStock = scraped.is_out_of_stock;
  const oldPrice = product.current_price;
  const oldOutOfStock = product.is_out_of_stock;

  const changes: string[] = [];
  const notifications: Array<{ type: string; message: string }> = [];

  // Stock changes
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

  // Price changes
  const priceLabel = priceSource === 'ebay' ? ' (eBay market price)' : '';
  if (newPrice !== null && oldPrice !== null && newPrice < oldPrice) {
    const diff = (oldPrice - newPrice).toFixed(2);
    const isOnSale =
      scraped.original_price !== null
        ? newPrice < scraped.original_price
        : product.original_price !== null
        ? newPrice < product.original_price
        : false;
    changes.push(`Price dropped $${diff} — now $${newPrice.toFixed(2)}${priceLabel}`);
    notifications.push({
      type: isOnSale ? 'on_sale' : 'price_drop',
      message: `"${product.title}" dropped $${diff} — now $${newPrice.toFixed(2)}${priceLabel}.`,
    });
  } else if (newPrice !== null && oldPrice === null) {
    changes.push(`Price found: $${newPrice.toFixed(2)}${priceLabel}`);
  } else if (newPrice !== null && oldPrice !== null && newPrice > oldPrice) {
    changes.push(`Price updated to $${newPrice.toFixed(2)}${priceLabel}`);
  }

  if (scraped.image_url && !product.image_url) {
    changes.push('Image found');
  }

  const hasChanges =
    changes.length > 0 ||
    newOutOfStock !== oldOutOfStock ||
    (newPrice !== null && newPrice !== oldPrice) ||
    (scraped.image_url && !product.image_url) ||
    (scraped.sku && !product.sku);

  if (hasChanges) {
    const updatePayload: Record<string, unknown> = {
      is_out_of_stock: newOutOfStock,
    };

    if (newPrice !== null) {
      updatePayload.current_price = newPrice;
      updatePayload.price_source = priceSource;
      const knownOriginal = scraped.original_price ?? product.original_price;
      if (knownOriginal !== null && knownOriginal > newPrice) {
        updatePayload.original_price = knownOriginal;
        updatePayload.is_on_sale = true;
      } else {
        updatePayload.is_on_sale =
          product.original_price !== null ? newPrice < product.original_price : false;
      }
    }

    if (scraped.image_url && !product.image_url) updatePayload.image_url = scraped.image_url;
    if (scraped.store_name && !product.store_name) updatePayload.store_name = scraped.store_name;
    if (scraped.sku && !product.sku) updatePayload.sku = scraped.sku;

    await supabase.from('products').update(updatePayload).eq('id', product.id);

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

  return { updated: !!hasChanges, changes };
}
