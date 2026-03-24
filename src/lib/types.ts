export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
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
          price_source: 'manual' | 'ebay' | 'scraped' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          current_price?: number | null;
          original_price?: number | null;
          is_on_sale?: boolean;
          image_url?: string | null;
          source_url: string;
          store_name?: string | null;
          description?: string | null;
          sku?: string | null;
          price_source?: 'manual' | 'ebay' | 'scraped' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          current_price?: number | null;
          original_price?: number | null;
          is_on_sale?: boolean;
          image_url?: string | null;
          source_url?: string;
          store_name?: string | null;
          description?: string | null;
          sku?: string | null;
          price_source?: 'manual' | 'ebay' | 'scraped' | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          is_shared: boolean;
          share_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          is_shared?: boolean;
          share_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          is_shared?: boolean;
          share_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      list_products: {
        Row: {
          id: string;
          list_id: string;
          product_id: string;
          added_at: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          product_id: string;
          added_at?: string;
        };
        Update: {
          id?: string;
          list_id?: string;
          product_id?: string;
          added_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          product_id: string | null;
          type: 'on_sale' | 'price_drop';
          message: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id?: string | null;
          type: 'on_sale' | 'price_drop';
          message: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          is_read?: boolean;
        };
      };
    };
  };
}

export type Product = Database['public']['Tables']['products']['Row'];
export type List = Database['public']['Tables']['lists']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ListProduct = Database['public']['Tables']['list_products']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];

export interface ProductWithList extends Product {
  lists?: List[];
}

export interface ListWithProducts extends List {
  products?: Product[];
  productCount?: number;
  totalCost?: number;
}
