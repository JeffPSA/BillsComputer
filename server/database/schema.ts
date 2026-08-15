import Database from 'better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';

/**
 * SQLite schema definition for Pokémon TCG Deck Builder
 * Matches the current JSON-based schema structure
 */

export function createSchema(db: SQLiteDatabase): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Cards table - logical card definitions
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      supertype TEXT NOT NULL,
      subtype TEXT NOT NULL,
      hp INTEGER,
      types TEXT, -- JSON array
      rules TEXT, -- JSON array
      isAceSpec INTEGER DEFAULT 0,
      defaultPrintingId TEXT
    )
  `);

  // Printings table - specific printings (canonical API IDs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS printings (
      id TEXT PRIMARY KEY,
      cardId TEXT NOT NULL,
      cardName TEXT NOT NULL,
      setCode TEXT NOT NULL,
      setName TEXT NOT NULL,
      cardNumber TEXT NOT NULL,
      rarity TEXT NOT NULL,
      variant TEXT NOT NULL,
      language TEXT NOT NULL,
      imageUrl TEXT NOT NULL,
      marketPrice REAL NOT NULL,
      attacks TEXT, -- JSON array
      abilities TEXT, -- JSON array
      weaknesses TEXT, -- JSON array
      resistances TEXT, -- JSON array
      retreatCost INTEGER,
      nationalPokedexNumbers TEXT, -- JSON array
      regulationMark TEXT,
      legalities TEXT, -- JSON object
      artist TEXT,
      imageUrlSmall TEXT,
      imageUrlLarge TEXT,
      FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE
    )
  `);

  // Sets table - set metadata
  db.exec(`
    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      series TEXT NOT NULL,
      ptcgoCode TEXT,
      releaseDate TEXT NOT NULL,
      printedTotal INTEGER NOT NULL,
      total INTEGER NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Collection items table - user's collection
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_items (
      id TEXT PRIMARY KEY,
      cardId TEXT NOT NULL,
      printingId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      condition TEXT NOT NULL,
      language TEXT NOT NULL,
      acquisitionSource TEXT,
      acquisitionDate TEXT,
      acquisitionCost REAL,
      notes TEXT,
      FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE
    )
  `);

  // Decks table - deck definitions
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL,
      isPermanentlyAssembled INTEGER DEFAULT 0,
      notes TEXT,
      updatedAt TEXT NOT NULL
    )
  `);

  // Deck requirements table - deck card requirements
  db.exec(`
    CREATE TABLE IF NOT EXISTS deck_requirements (
      id TEXT PRIMARY KEY,
      deckId TEXT NOT NULL,
      cardId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      requirementMode TEXT NOT NULL,
      FOREIGN KEY (deckId) REFERENCES decks(id) ON DELETE CASCADE,
      FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE
    )
  `);

  // Allocations table - card allocations to decks
  // UNIQUE(deckId, requirementId, collectionItemId) enforces at-most-one row per logical identity
  db.exec(`
    CREATE TABLE IF NOT EXISTS allocations (
      id TEXT PRIMARY KEY,
      deckId TEXT NOT NULL,
      collectionItemId TEXT NOT NULL,
      requirementId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      isLocked INTEGER DEFAULT 0,
      FOREIGN KEY (deckId) REFERENCES decks(id) ON DELETE CASCADE,
      FOREIGN KEY (collectionItemId) REFERENCES collection_items(id) ON DELETE CASCADE,
      UNIQUE(deckId, requirementId, collectionItemId)
    )
  `);

  // Wishlist items table - wishlist entries
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id TEXT PRIMARY KEY,
      cardId TEXT NOT NULL,
      printingId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      priority TEXT,
      notes TEXT,
      FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE
    )
  `);

  // Store profiles table - store configurations
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      isDefault INTEGER DEFAULT 0,
      categories TEXT, -- JSON array
      overrides TEXT -- JSON array
    )
  `);

  // Acquisitions table - purchase records
  db.exec(`
    CREATE TABLE IF NOT EXISTS acquisitions (
      id TEXT PRIMARY KEY,
      cardId TEXT NOT NULL,
      printingId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      source TEXT,
      method TEXT,
      costPerUnit REAL,
      totalCost REAL,
      date TEXT,
      notes TEXT,
      FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE
    )
  `);

  // Sync metadata table - sync tracking info
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_printings_cardId ON printings(cardId)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_printings_setCode ON printings(setCode)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_collection_items_cardId ON collection_items(cardId)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_deck_requirements_deckId ON deck_requirements(deckId)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_allocations_deckId ON allocations(deckId)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_decks_status ON decks(status)
  `);
}

export function dropSchema(db: SQLiteDatabase): void {
  db.exec('DROP TABLE IF EXISTS allocations');
  db.exec('DROP TABLE IF EXISTS deck_requirements');
  db.exec('DROP TABLE IF EXISTS decks');
  db.exec('DROP TABLE IF EXISTS collection_items');
  db.exec('DROP TABLE IF EXISTS acquisitions');
  db.exec('DROP TABLE IF EXISTS wishlist_items');
  db.exec('DROP TABLE IF EXISTS store_profiles');
  db.exec('DROP TABLE IF EXISTS printings');
  db.exec('DROP TABLE IF EXISTS cards');
  db.exec('DROP TABLE IF EXISTS sets');
  db.exec('DROP TABLE IF EXISTS sync_metadata');
}
