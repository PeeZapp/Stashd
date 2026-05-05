export type PriceSource = 'manual' | 'ebay' | 'scraped' | null;

export interface Profile {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  /** Local hour (0–23) to run pending detailed adds once per day; `null` = off */
  detailed_enrichment_schedule_hour: number | null;
  /** When true, pending detailed adds may run while the tab is in the background */
  detailed_enrichment_when_idle: boolean;
}

/** How the product was first saved from a URL */
export type AddDetailLevel = 'quick' | 'detailed';

export interface Product {
  id: string;
  user_id: string;
  title: string;
  current_price: number | null;
  original_price: number | null;
  is_on_sale: boolean;
  image_url: string | null;
  source_url: string;
  store_name: string | null;
  description: string | null;
  sku: string | null;
  price_source: PriceSource;
  is_owned: boolean;
  /** `quick` = URL-only save; `detailed` = filled via detailed add or manual form */
  add_detail_level: AddDetailLevel;
  /** True for quick-add rows until a detailed add fills in the listing */
  detailed_enrichment_pending: boolean;
  created_at: string;
  updated_at: string;
}

export type ListScope = 'wishlist' | 'stash';

export interface List {
  id: string;
  user_id: string;
  name: string;
  /** wishlist = shopping lists; stash = organizing things you already own (Owned tab). */
  scope: ListScope;
  is_shared: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListProduct {
  id: string;
  user_id: string;
  list_id: string;
  product_id: string;
  added_at: string;
}

/** Curated looks: owned products + optional photos (e.g. mirror selfies). */
export interface Outfit {
  id: string;
  user_id: string;
  name: string;
  image_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface OutfitProduct {
  id: string;
  user_id: string;
  outfit_id: string;
  product_id: string;
  added_at: string;
}

export interface OutfitWithProducts extends Outfit {
  products: Product[];
}

export interface Notification {
  id: string;
  user_id: string;
  product_id: string | null;
  type: 'on_sale' | 'price_drop';
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface ProductWithList extends Product {
  lists?: List[];
}

export interface ListWithProducts extends List {
  products?: Product[];
  productCount?: number;
  totalCost?: number;
}
