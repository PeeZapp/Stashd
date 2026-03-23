/*
  # Product Saver Platform Schema

  ## Overview
  Creates the complete database schema for a universal product saver and wishlist platform.

  ## New Tables
  
  ### 1. profiles
  - `id` (uuid, references auth.users)
  - `name` (text)
  - `email` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. products
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `title` (text)
  - `current_price` (numeric)
  - `original_price` (numeric, nullable)
  - `is_on_sale` (boolean)
  - `image_url` (text)
  - `source_url` (text)
  - `store_name` (text)
  - `description` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. lists
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `name` (text)
  - `is_shared` (boolean)
  - `share_token` (text, unique)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. list_products
  - `id` (uuid, primary key)
  - `list_id` (uuid, references lists)
  - `product_id` (uuid, references products)
  - `added_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Users can only access their own data
  - Shared lists are publicly readable via share_token
  - Products in shared lists are publicly readable
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create lists table
CREATE TABLE IF NOT EXISTS lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_shared boolean DEFAULT false,
  share_token text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lists"
  ON lists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view shared lists"
  ON lists FOR SELECT
  TO anon, authenticated
  USING (is_shared = true);

CREATE POLICY "Users can insert own lists"
  ON lists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lists"
  ON lists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lists"
  ON lists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  current_price numeric(10, 2) NOT NULL,
  original_price numeric(10, 2),
  is_on_sale boolean DEFAULT false,
  image_url text NOT NULL,
  source_url text NOT NULL,
  store_name text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own products"
  ON products FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products"
  ON products FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own products"
  ON products FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create list_products junction table
CREATE TABLE IF NOT EXISTS list_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  UNIQUE(list_id, product_id)
);

ALTER TABLE list_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own list products"
  ON list_products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_products.list_id
      AND lists.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view products in shared lists"
  ON list_products FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_products.list_id
      AND lists.is_shared = true
    )
  );

CREATE POLICY "Users can insert into own lists"
  ON list_products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_products.list_id
      AND lists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete from own lists"
  ON list_products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_products.list_id
      AND lists.user_id = auth.uid()
    )
  );

-- Add policy for viewing products in shared lists
DROP POLICY IF EXISTS "Anyone can view products in shared lists" ON products;
CREATE POLICY "Anyone can view products in shared lists"
  ON products FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM list_products lp
      JOIN lists l ON l.id = lp.list_id
      WHERE lp.product_id = products.id
      AND l.is_shared = true
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id);
CREATE INDEX IF NOT EXISTS idx_lists_share_token ON lists(share_token);
CREATE INDEX IF NOT EXISTS idx_list_products_list_id ON list_products(list_id);
CREATE INDEX IF NOT EXISTS idx_list_products_product_id ON list_products(product_id);

-- Function to generate share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;