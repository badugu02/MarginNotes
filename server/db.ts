import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const databasePath = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'syllabus.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })
mkdirSync(join(process.cwd(), 'data', 'uploads'), { recursive: true })

export const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    google_id TEXT UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    branch TEXT NOT NULL,
    semester INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
    error TEXT,
    storage_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    UNIQUE(document_id, page_number)
  );
  CREATE INDEX IF NOT EXISTS pages_document_idx ON pages(document_id);
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New conversation',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    feedback INTEGER CHECK (feedback IN (-1, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

try {
  db.exec('ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE')
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error
}
