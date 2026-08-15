import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { getDatabaseManager } from './index';

// Load environment variables
config();

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DB_ARCHIVE_FILE = path.join(DATA_DIR, 'db.json.archive');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Initialize SQLite database with empty schema and default data
 */
export async function initializeDatabase() {
  console.log('[Database Init] Starting database initialization...');

  // Archive existing JSON database if it exists
  if (fs.existsSync(DB_FILE)) {
    console.log(`[Database Init] Archiving existing ${DB_FILE} to ${DB_ARCHIVE_FILE}`);
    fs.copyFileSync(DB_FILE, DB_ARCHIVE_FILE);
    console.log('[Database Init] JSON database archived successfully');
  }

  // Initialize database manager (this creates tables if they don't exist)
  const dbManager = getDatabaseManager();

  // Create default store profile
  const db = dbManager.readDb();
  
  if (!db.storeProfiles || db.storeProfiles.length === 0) {
    console.log('[Database Init] Creating default store profile');
    db.storeProfiles = [
      {
        id: 'default',
        name: 'Default Store',
        isDefault: true,
        categories: [],
        overrides: [],
      },
    ];
  }

  // Initialize sync metadata
  if (!db.syncMetadata) {
    console.log('[Database Init] Initializing sync metadata');
    db.syncMetadata = {
      lastSyncTimestamp: new Date(0).toISOString(),
      totalCardsSynced: 0,
      totalSetsSynced: 0,
    };
  }

  // Write initial data
  dbManager.writeDb(db);

  console.log('[Database Init] Database initialization complete');
  console.log('[Database Init] Next steps:');
  console.log('[Database Init]   1. Run: npm run sync-cards');
  console.log('[Database Init]   2. This will populate the database with card data from the Pokémon TCG API');
  console.log('[Database Init]   3. Your application is now ready to use SQLite');
}

// Run if executed directly
initializeDatabase().catch(err => {
  console.error('[Database Init] Fatal error:', err);
  process.exit(1);
});
