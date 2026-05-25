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

/** 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent */
export type StandardListPriority = 0 | 1 | 2 | 3 | 4;
export type StandardListRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface StandardList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_pinned: boolean;
  is_shared: boolean;
  share_token: string | null;
  collaborator_emails: string[];
  created_at: string;
  updated_at: string;
}

export interface StandardListItem {
  id: string;
  user_id: string;
  list_id: string;
  parent_id: string | null;
  text: string;
  notes: string | null;
  tags: string[];
  priority: StandardListPriority;
  due_at: string | null;
  recurrence: StandardListRecurrence;
  link_url: string | null;
  link_title: string | null;
  product_id: string | null;
  image_urls: string[];
  is_completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface StandardListItemTreeNode extends StandardListItem {
  children: StandardListItemTreeNode[];
}

export interface StandardListTemplate {
  id: string;
  name: string;
  description: string;
  items: string[];
}

export interface StandardListComment {
  id: string;
  list_id: string;
  item_id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

/** Rich URL library — recipes, videos, articles, tools, etc. */
export type SavedLinkType =
  | 'recipe'
  | 'video'
  | 'article'
  | 'tool'
  | 'place'
  | 'product'
  | 'other';

export type SavedLinkStatus =
  | 'saved'
  | 'try_next'
  | 'tried'
  | 'liked'
  | 'not_for_me'
  | 'archived';

/** 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent */
export type SavedLinkPriority = 0 | 1 | 2 | 3 | 4;

export interface SavedLinkMetadata {
  /** Recipe */
  ingredients?: string[];
  cook_time_minutes?: number | null;
  total_time_minutes?: number | null;
  servings?: string | null;
  cuisine?: string | null;
  diet_tags?: string[];
  /** Video */
  creator?: string | null;
  duration?: string | null;
  platform?: string | null;
  embed_url?: string | null;
  /** Article */
  author?: string | null;
  published_at?: string | null;
}

export interface SavedLinkTimestampNote {
  id: string;
  label: string;
  timecode: string;
  seconds: number | null;
  note: string;
  created_at: string;
}

export interface SavedLinkCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SavedLink {
  id: string;
  user_id: string;
  collection_ids: string[];
  url: string;
  canonical_url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  favicon_url: string | null;
  link_type: SavedLinkType;
  status: SavedLinkStatus;
  priority: SavedLinkPriority;
  tags: string[];
  notes: string | null;
  timestamp_notes: SavedLinkTimestampNote[];
  metadata: SavedLinkMetadata;
  enrichment_pending: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScrapedLink {
  url: string;
  canonical_url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  favicon_url: string | null;
  link_type: SavedLinkType;
  metadata: SavedLinkMetadata;
}
