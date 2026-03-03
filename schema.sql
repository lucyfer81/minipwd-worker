CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space TEXT NOT NULL DEFAULT 'personal' CHECK (space IN ('personal', 'work')),
  title TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  login_url TEXT,
  notes TEXT,
  folder TEXT,
  tags_json TEXT,
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_items_space_updated_at ON items(space, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_space_last_used_at ON items(space, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_space_title ON items(space, title);
