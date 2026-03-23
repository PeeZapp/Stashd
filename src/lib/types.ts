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
          current_price: number;
          original_price: number | null;
          is_on_sale: boolean;
          image_url: string;
          source_url: string;
          store_name: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          current_price: number;
          original_price?: number | null;
          is_on_sale?: boolean;
          image_url: string;
          source_url: string;
          store_name: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          current_price?: number;
          original_price?: number | null;
          is_on_sale?: boolean;
          image_url?: string;
          source_url?: string;
          store_name?: string;
          description?: string;
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
    };
  };
}

export type Product = Database['public']['Tables']['products']['Row'];
export type List = Database['public']['Tables']['lists']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ListProduct = Database['public']['Tables']['list_products']['Row'];

export interface ProductWithList extends Product {
  lists?: List[];
}

export interface ListWithProducts extends List {
  products?: Product[];
  productCount?: number;
  totalCost?: number;
}
