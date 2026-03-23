/*
  Make optional product fields nullable so only title + source_url are required.
*/

ALTER TABLE products
  ALTER COLUMN current_price DROP NOT NULL,
  ALTER COLUMN current_price SET DEFAULT NULL,
  ALTER COLUMN image_url DROP NOT NULL,
  ALTER COLUMN image_url SET DEFAULT NULL,
  ALTER COLUMN store_name DROP NOT NULL,
  ALTER COLUMN store_name SET DEFAULT NULL;
