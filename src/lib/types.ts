export type PriceSource = 'manual' | 'ebay' | 'scraped' | null;

export interface Profile {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
}

export interface List {
  id: string;
  user_id: string;
  name: string;
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
