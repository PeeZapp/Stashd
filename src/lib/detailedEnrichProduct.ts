import { updateProduct } from './firestore';
import { normalizeProtocolRelativeUrl } from './normalizeMediaUrl';
import { scrapeProduct } from './scrapeProduct';
import type { Product } from './types';

/**
 * Fetches product-page details for a saved URL and merges them into the product.
 * Used to complete “quick add” rows (URL-only) via detailed add.
 */
export async function detailedEnrichProduct(
  product: Product
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const scraped = await scrapeProduct(product.source_url);
    const newCurrent = scraped.current_price ?? product.current_price;
    const newOriginal = scraped.original_price ?? product.original_price;
    const isOnSale =
      newCurrent !== null && newOriginal !== null && newOriginal > newCurrent;

    const title =
      scraped.title?.trim() ||
      product.title ||
      product.source_url;

    await updateProduct(product.id, {
      title,
      current_price: newCurrent,
      original_price: newOriginal,
      is_on_sale: isOnSale,
      image_url:
        normalizeProtocolRelativeUrl(scraped.image_url ?? '') || product.image_url,
      store_name: scraped.store_name?.trim() || product.store_name,
      description: scraped.description?.trim() || product.description,
      sku: scraped.sku?.trim() || product.sku,
      price_source: scraped.price_source ?? product.price_source,
      add_detail_level: 'detailed',
      detailed_enrichment_pending: false,
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not complete detailed add';
    return { ok: false, message };
  }
}
