import { createNotifications, updateProduct } from './firestore';
import { scrapeProduct } from './scrapeProduct';
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

  const newPrice = scraped.current_price;
  const priceSource = scraped.price_source;
  const oldPrice = product.current_price;

  const changes: string[] = [];
  const notifications: Array<{ type: string; message: string }> = [];

  // Price changes
  if (newPrice !== null && oldPrice !== null && newPrice < oldPrice) {
    const diff = (oldPrice - newPrice).toFixed(2);
    const isOnSale =
      scraped.original_price !== null
        ? newPrice < scraped.original_price
        : product.original_price !== null
        ? newPrice < product.original_price
        : false;
    changes.push(`Price dropped $${diff} — now $${newPrice.toFixed(2)}`);
    notifications.push({
      type: isOnSale ? 'on_sale' : 'price_drop',
      message: `"${product.title}" dropped $${diff} — now $${newPrice.toFixed(2)}.`,
    });
  } else if (newPrice !== null && oldPrice === null) {
    changes.push(`Price found: $${newPrice.toFixed(2)}`);
  } else if (newPrice !== null && oldPrice !== null && newPrice > oldPrice) {
    changes.push(`Price updated to $${newPrice.toFixed(2)}`);
  }

  if (scraped.image_url && !product.image_url) {
    changes.push('Image found');
  }

  const hasChanges =
    changes.length > 0 ||
    (newPrice !== null && newPrice !== oldPrice) ||
    (scraped.image_url && !product.image_url) ||
    (scraped.sku && !product.sku);

  if (hasChanges) {
    const updatePayload: Record<string, unknown> = {};

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

    await updateProduct(product.id, updatePayload as Parameters<typeof updateProduct>[1]);

    if (notifications.length > 0) {
      await createNotifications(
        notifications.map((n) => ({
          user_id: userId,
          product_id: product.id,
          type: n.type as 'on_sale' | 'price_drop',
          message: n.message,
        }))
      );
    }
  }

  return { updated: !!hasChanges, changes };
}
