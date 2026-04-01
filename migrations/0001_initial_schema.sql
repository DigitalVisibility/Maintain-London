-- Maintain London Project Hub: Initial Schema
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0001_initial_schema.sql

-- Better-Auth tables (singular names to match better-auth defaults)
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'operative',
  phone TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expiresAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  idToken TEXT,
  password TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Projects / Sites
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  lat REAL,
  lng REAL,
  client_name TEXT,
  client_email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT REFERENCES user(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Daily Log Entries (the core record)
CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  created_by TEXT NOT NULL REFERENCES user(id),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  site_manager TEXT NOT NULL,
  weather_temp REAL,
  weather_wind REAL,
  weather_humidity REAL,
  weather_condition TEXT,
  weather_icon TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  UNIQUE(project_id, date)
);

-- Personnel on site
CREATE TABLE IF NOT EXISTS entry_personnel (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operative',
  hours REAL,
  company TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activities / Tasks
CREATE TABLE IF NOT EXISTS entry_activities (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Delays
CREATE TABLE IF NOT EXISTS entry_delays (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  reason TEXT NOT NULL,
  hours_lost REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Variations
CREATE TABLE IF NOT EXISTS entry_variations (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hours_required REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Materials / Equipment Required
CREATE TABLE IF NOT EXISTS entry_materials_required (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL,
  items TEXT NOT NULL,
  date_required TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Equipment Hire
CREATE TABLE IF NOT EXISTS entry_equipment_hire (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  equipment TEXT NOT NULL,
  supplier TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Materials Delivered
CREATE TABLE IF NOT EXISTS entry_deliveries (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Photos & Files (metadata — actual files in R2)
CREATE TABLE IF NOT EXISTS entry_files (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  caption TEXT,
  linked_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Suppliers (reference data)
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entries_project_date ON diary_entries(project_id, date);
CREATE INDEX IF NOT EXISTS idx_entries_status ON diary_entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_created_by ON diary_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_personnel_entry ON entry_personnel(entry_id);
CREATE INDEX IF NOT EXISTS idx_activities_entry ON entry_activities(entry_id);
CREATE INDEX IF NOT EXISTS idx_delays_entry ON entry_delays(entry_id);
CREATE INDEX IF NOT EXISTS idx_variations_entry ON entry_variations(entry_id);
CREATE INDEX IF NOT EXISTS idx_materials_entry ON entry_materials_required(entry_id);
CREATE INDEX IF NOT EXISTS idx_equipment_entry ON entry_equipment_hire(entry_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_entry ON entry_deliveries(entry_id);
CREATE INDEX IF NOT EXISTS idx_files_entry ON entry_files(entry_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);
