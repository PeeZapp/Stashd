ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  UUID        REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE USING (auth.uid() = user_id);
