import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { config } from 'dotenv';
import { 
  searchPokemonTcgApi, 
  getPokemonCardById 
} from './server/cardDataProvider';
import { getDatabaseManager } from './server/database/index';
import { syncAllCards, syncCardsForSet, syncIncremental, syncNewSetsAndCards, SyncProgress } from './server/cardSync';

// Load environment variables from .env file
config();
import {
  LogicalCard,
  CardPrinting,
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
  WishlistItem,
  StoreProfile,
  Acquisition,
  MarketplaceListing,
  ShoppingOptimizationResult,
  CardSet,
  PokemonTcgSet
} from './src/types/tcg';
import {
  calculateCardOwnershipForDeck,
  calculateMultiDeckShortfalls,
  autoAllocateDeck,
  resolveBulkCategoryForCard
} from './src/services/allocationEngine';
import { resolveCardForImport } from './server/localCardSearch';
import {
  validateAllocationInvariants,
  applyManualAllocate,
  applyReleaseAllocation,
} from './server/allocationIntegrity';

export { validateAllocationInvariants };

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SQLITE_DB_FILE = path.join(DATA_DIR, 'cards.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DEFAULT_USD_TO_ZAR_RATE = 18.5;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database manager
const dbManager = getDatabaseManager();

type AdminSyncMode = 'incremental' | 'force' | 'sets-only' | 'single-set';
interface AdminSyncJob {
  running: boolean;
  stopRequested?: boolean;
  mode?: AdminSyncMode;
  source?: 'admin' | 'dashboard';
  startedAt?: string;
  finishedAt?: string;
  status?: 'idle' | 'running' | 'completed' | 'stopped' | 'failed';
  progress?: SyncProgress;
  stats?: any;
  error?: string;
  setId?: string;
}

let adminSyncJob: AdminSyncJob = { running: false, status: 'idle' };

interface DatabaseSchema {
  cards: LogicalCard[];
  printings: CardPrinting[];
  sets: CardSet[];
  collectionItems: CollectionItem[];
  decks: Deck[];
  deckRequirements: DeckRequirement[];
  allocations: Allocation[];
  wishlistItems: WishlistItem[];
  storeProfiles: StoreProfile[];
  acquisitions: Acquisition[];
  syncMetadata: {
    lastSyncTimestamp: string;
    lastSyncedSetId?: string;
    lastSyncedPage?: number;
    totalCardsSynced: number;
    totalSetsSynced: number;
  };
}

function migrateCanonicalCardIds(db: DatabaseSchema): boolean {
  // Since we're starting with a fresh SQLite database with canonical API data,
  // legacy ID migration is not needed. This function is kept for compatibility
  // but will always return false with SQLite.
  return false;
}

function cacheCardsInDb(db: DatabaseSchema, cards: LogicalCard[], printings: CardPrinting[] = []) {
  let modified = false;

  for (const c of cards) {
    const existingCardIdx = db.cards.findIndex((existing) => existing.id === c.id);
    if (existingCardIdx === -1) {
      db.cards.push({
        id: c.id,
        name: c.name,
        supertype: c.supertype,
        subtype: c.subtype,
        hp: c.hp,
        types: c.types,
        rules: c.rules,
        isAceSpec: c.isAceSpec,
        defaultPrintingId: c.defaultPrintingId,
      });
      modified = true;
    }
  }

  for (const p of printings) {
    const existingPrtIdx = db.printings.findIndex((existing) => existing.id === p.id);
    if (existingPrtIdx === -1) {
      db.printings.push(p);
      modified = true;
    }
  }

  if (modified) {
    writeDb(db);
  }
}

function getInitialDb(): DatabaseSchema {
  // Start with empty database - cards will be fetched from Pokémon TCG API as needed
  // This ensures canonical data flow and removes legacy sample data dependencies
  
  const defaultStoreProfile: StoreProfile = {
    id: 'sp_default_lgs',
    name: 'TopDeck Local Game Shop',
    isDefault: true,
    categories: [
      { id: 'cat_1', name: 'Rare — A–F', description: 'Rare / Holo cards alphabetized A to F', sortOrder: 1 },
      { id: 'cat_2', name: 'Rare — G–M', description: 'Rare / Holo cards alphabetized G to M', sortOrder: 2 },
      { id: 'cat_3', name: 'Rare — N–Z', description: 'Rare / Holo cards alphabetized N to Z', sortOrder: 3 },
      { id: 'cat_4', name: 'Uncommon — A–F', description: 'Uncommon bulk box A to F', sortOrder: 4 },
      { id: 'cat_5', name: 'Uncommon — G–M', description: 'Uncommon bulk box G to M', sortOrder: 5 },
      { id: 'cat_6', name: 'Uncommon — N–Z', description: 'Uncommon bulk box N to Z', sortOrder: 6 },
      { id: 'cat_7', name: 'Trainer Box', description: 'Dedicated Items, Supporters, Stadiums binder/box', sortOrder: 7 },
      { id: 'cat_8', name: 'Special ACE SPEC Box', description: 'ACE SPEC cards top loading binder', sortOrder: 8 },
    ],
    overrides: [],
  };

  return {
    cards: [],
    printings: [],
    sets: [],
    collectionItems: [],
    decks: [],
    deckRequirements: [],
    allocations: [],
    wishlistItems: [],
    storeProfiles: [defaultStoreProfile],
    acquisitions: [],
    syncMetadata: {
      lastSyncTimestamp: new Date(0).toISOString(),
      totalCardsSynced: 0,
      totalSetsSynced: 0,
    },
  };
}

function readDb(): DatabaseSchema {
  return dbManager.readDb();
}

function writeDb(db: DatabaseSchema) {
  dbManager.writeDb(db);
}

function getCurrencySettings() {
  const metadata = dbManager.getSyncMetadata();
  const savedRate = Number(metadata.usdToZarRate);
  const usdToZarRate = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : DEFAULT_USD_TO_ZAR_RATE;

  return {
    usdToZarRate,
    source: metadata.usdToZarRateUpdatedAt ? 'admin' : 'default',
    updatedAt: metadata.usdToZarRateUpdatedAt || null,
  };
}

function getAdminHealth() {
  const db = readDb();
  const stats = dbManager.getStats();
  const syncMetadata = dbManager.getSyncMetadata();
  const allocationIntegrity = validateAllocationInvariants(db);

  return {
    stats: {
      ...stats,
      totalDeckRequirements: db.deckRequirements.length,
      totalAllocations: db.allocations.length,
      totalWishlistItems: db.wishlistItems.length,
      totalAcquisitions: db.acquisitions.length,
      totalStoreProfiles: db.storeProfiles.length,
    },
    currency: getCurrencySettings(),
    syncMetadata,
    allocationIntegrity,
    syncJob: adminSyncJob,
  };
}

function resolveAdminSetCode(rawSetCode: string): { id: string; name?: string } | null {
  const normalized = rawSetCode.trim().toLowerCase();
  if (!normalized) return null;

  const db = readDb();
  const set = db.sets.find((s) =>
    s.id.toLowerCase() === normalized ||
    s.ptcgoCode?.toLowerCase() === normalized ||
    s.name.toLowerCase() === normalized
  );

  return set ? { id: set.id, name: set.name } : null;
}

function startAdminSync(mode: AdminSyncMode, setId?: string, source: 'admin' | 'dashboard' = 'admin'): AdminSyncJob {
  if (adminSyncJob.running) {
    return adminSyncJob;
  }

  adminSyncJob = {
    running: true,
    stopRequested: false,
    mode,
    source,
    setId,
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: {
      phase: 'sets',
      message:
        mode === 'force' ? 'Starting full resync...' :
        mode === 'sets-only' ? 'Finding new sets and syncing their cards...' :
        mode === 'single-set' ? `Starting set sync for ${setId}...` :
        'Starting incremental sync...',
      percent: 0,
    },
  };

  const syncOptions = {
    shouldStop: () => Boolean(adminSyncJob.stopRequested),
    onProgress: (progress: SyncProgress) => {
      adminSyncJob = {
        ...adminSyncJob,
        progress,
      };
    },
  };

  const syncPromise =
    mode === 'force' ? syncAllCards(syncOptions) :
    mode === 'sets-only' ? syncNewSetsAndCards(syncOptions) :
    mode === 'single-set' && setId ? syncCardsForSet(setId, 250, syncOptions) :
    syncIncremental(syncOptions);

  syncPromise
    .then((stats) => {
      const finishedAt = new Date().toISOString();
      const status = stats.stopped ? 'stopped' : 'completed';
      adminSyncJob = {
        ...adminSyncJob,
        running: false,
        stopRequested: false,
        finishedAt,
        status,
        progress: {
          phase: stats.stopped ? 'stopped' : 'complete',
          message: stats.stopped ? 'Sync stopped safely' : 'Sync complete',
          cardsSynced: stats.cardsSynced,
          setsSynced: stats.setsSynced,
          percent: stats.stopped ? adminSyncJob.progress?.percent : 100,
        },
        stats,
      };

      if (source === 'dashboard') {
        dbManager.setSyncMetadataValue('dashboardRoutineLastRunAt', finishedAt);
        dbManager.setSyncMetadataValue('dashboardRoutineLastStatus', status);
        dbManager.setSyncMetadataValue('dashboardRoutineLastStats', stats);
      }
    })
    .catch((err: any) => {
      console.error('[Admin] Sync failed:', err);
      const finishedAt = new Date().toISOString();
      adminSyncJob = {
        ...adminSyncJob,
        running: false,
        stopRequested: false,
        finishedAt,
        status: 'failed',
        error: err?.message || 'Sync failed',
      };

      if (source === 'dashboard') {
        dbManager.setSyncMetadataValue('dashboardRoutineLastRunAt', finishedAt);
        dbManager.setSyncMetadataValue('dashboardRoutineLastStatus', 'failed');
        dbManager.setSyncMetadataValue('dashboardRoutineLastStats', { error: err?.message || 'Sync failed' });
      }
    });

  return adminSyncJob;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- AUTHENTICATION ---
  const appPassword = process.env.APP_PASSWORD || 'default-password';
  const dashboardApiToken = process.env.DASHBOARD_API_TOKEN || process.env.HOME_DASHBOARD_API_TOKEN || '';
  const validTokens = new Set<string>();

  // Generate a simple random token
  function generateToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Authentication middleware
  function getBearerToken(req: any): string {
    const authHeader = req.headers.authorization;
    return authHeader?.replace('Bearer ', '') || '';
  }

  const requireAuth = (req: any, res: any, next: any) => {
    const token = getBearerToken(req);

    if (!token || !validTokens.has(token)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };

  const requireDashboardAuth = (req: any, res: any, next: any) => {
    const token = getBearerToken(req);
    const isLoggedInAppToken = token && validTokens.has(token);
    const isDashboardToken = Boolean(dashboardApiToken) && token === dashboardApiToken;

    if (!isLoggedInAppToken && !isDashboardToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };

  // Auth endpoints (public)
  app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    if (password === appPassword) {
      const token = generateToken();
      validTokens.add(token);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (token) {
      validTokens.delete(token);
    }
    res.json({ success: true });
  });

  app.get('/api/auth/check', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    res.json({ success: validTokens.has(token) || false });
  });

  // --- API ENDPOINTS ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /api/cards/sync-status (Catalogue health information)
  app.get('/api/cards/sync-status', (req, res) => {
    try {
      const metadata = dbManager.getSyncMetadata();
      const stats = dbManager.getStats();
      res.json({
        ...metadata,
        ...stats,
      });
    } catch (err: any) {
      console.error('[Server] Error in /api/cards/sync-status:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/dashboard/weekly-routine (Protected home-dashboard summary)
  app.get('/api/dashboard/weekly-routine', requireDashboardAuth, (req, res) => {
    try {
      const days = Number(req.query.days || 7);
      res.json({
        success: true,
        ...dbManager.getDashboardWeeklySummary(days),
        syncJob: adminSyncJob,
      });
    } catch (err: any) {
      console.error('[DashboardAPI] Error reading weekly routine summary:', err);
      res.status(500).json({ success: false, error: 'Unable to read weekly dashboard summary' });
    }
  });

  // POST /api/dashboard/weekly-routine/run (Protected idempotent routine trigger)
  app.post('/api/dashboard/weekly-routine/run', requireDashboardAuth, (req, res) => {
    try {
      const requestedMode = req.body?.mode;
      const mode: AdminSyncMode = requestedMode === 'incremental' ? 'incremental' : 'sets-only';
      const alreadyRunning = adminSyncJob.running;
      const syncJob = startAdminSync(mode, undefined, 'dashboard');

      res.status(202).json({
        success: true,
        started: !alreadyRunning,
        alreadyRunning,
        message: alreadyRunning ? 'A sync routine is already running' : 'Weekly dashboard routine started',
        syncJob,
        summary: dbManager.getDashboardWeeklySummary(7),
      });
    } catch (err: any) {
      console.error('[DashboardAPI] Error starting weekly routine:', err);
      res.status(500).json({ success: false, error: 'Unable to start weekly dashboard routine' });
    }
  });

  // GET /api/admin/health (Protected database/admin health overview)
  app.get('/api/admin/health', requireAuth, (_req, res) => {
    try {
      res.json(getAdminHealth());
    } catch (err: any) {
      console.error('[Admin] Error reading admin health:', err);
      res.status(500).json({ error: 'Unable to read admin health' });
    }
  });

  // GET /api/admin/settings/currency (Protected currency display settings)
  app.get('/api/admin/settings/currency', requireAuth, (_req, res) => {
    try {
      res.json(getCurrencySettings());
    } catch (err: any) {
      console.error('[Admin] Error reading currency settings:', err);
      res.status(500).json({ error: 'Unable to read currency settings' });
    }
  });

  // POST /api/admin/settings/currency (Protected currency display settings update)
  app.post('/api/admin/settings/currency', requireAuth, (req, res) => {
    try {
      const usdToZarRate = Number(req.body?.usdToZarRate);
      if (!Number.isFinite(usdToZarRate) || usdToZarRate <= 0 || usdToZarRate > 1000) {
        return res.status(400).json({ error: 'Enter a valid USD to ZAR rate greater than 0.' });
      }

      const roundedRate = Number(usdToZarRate.toFixed(4));
      dbManager.setSyncMetadataValue('usdToZarRate', roundedRate);
      dbManager.setSyncMetadataValue('usdToZarRateUpdatedAt', new Date().toISOString());
      res.json({
        success: true,
        ...getCurrencySettings(),
      });
    } catch (err: any) {
      console.error('[Admin] Error saving currency settings:', err);
      res.status(500).json({ error: 'Unable to save currency settings' });
    }
  });

  // POST /api/admin/sync (Protected controlled card sync)
  app.post('/api/admin/sync', requireAuth, (req, res) => {
    try {
      const requestedMode = req.body?.mode;
      const mode: AdminSyncMode =
        requestedMode === 'force' ? 'force' :
        requestedMode === 'sets-only' ? 'sets-only' :
        requestedMode === 'single-set' ? 'single-set' :
        'incremental';

      let setId: string | undefined;
      if (mode === 'single-set') {
        const resolvedSet = resolveAdminSetCode(String(req.body?.setCode || req.body?.setId || ''));
        if (!resolvedSet) {
          return res.status(400).json({ error: 'Set not found. Use a set ID, set code, or exact set name from the local database.' });
        }
        setId = resolvedSet.id;
      }

      const alreadyRunning = adminSyncJob.running;
      const syncJob = startAdminSync(mode, setId);
      res.status(alreadyRunning ? 409 : 202).json({
        success: !alreadyRunning,
        syncJob,
        message: alreadyRunning ? 'A sync is already running' :
          mode === 'force' ? 'Full sync started' :
          mode === 'sets-only' ? 'New-set scan started; any missing sets will be populated with card data' :
          mode === 'single-set' ? `Single-set sync started for ${setId}` :
          'Incremental sync started',
      });
    } catch (err: any) {
      console.error('[Admin] Error starting sync:', err);
      res.status(500).json({ error: 'Unable to start sync' });
    }
  });

  // POST /api/admin/sync/stop (Protected cooperative sync stop)
  app.post('/api/admin/sync/stop', requireAuth, (_req, res) => {
    if (!adminSyncJob.running) {
      return res.json({
        success: false,
        syncJob: adminSyncJob,
        message: 'No sync is currently running',
      });
    }

    adminSyncJob = {
      ...adminSyncJob,
      stopRequested: true,
      progress: {
        ...adminSyncJob.progress,
        phase: adminSyncJob.progress?.phase || 'cards',
        message: 'Stop requested. Sync will halt after the current API step finishes.',
      },
    };

    res.json({
      success: true,
      syncJob: adminSyncJob,
      message: 'Stop requested. Sync will halt safely after the current API step.',
    });
  });

  // POST /api/admin/backup (Protected timestamped SQLite backup)
  app.post('/api/admin/backup', requireAuth, async (_req, res) => {
    try {
      if (!fs.existsSync(SQLITE_DB_FILE)) {
        return res.status(404).json({ error: 'SQLite database file not found' });
      }
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `cards.db.admin-${stamp}.bak`);
      const metadata = await dbManager.backup(backupPath);
      const backupStat = fs.statSync(backupPath);
      res.json({
        success: true,
        backupPath,
        sizeBytes: backupStat.size,
        pages: metadata.totalPages,
        remainingPages: metadata.remainingPages,
      });
    } catch (err: any) {
      console.error('[Admin] Error creating backup:', err);
      res.status(500).json({ error: 'Unable to create database backup' });
    }
  });

  // GET /api/cards/browser (SQLite-only paginated catalogue browser)
  app.get('/api/cards/browser', requireAuth, (req, res) => {
    try {
      const result = dbManager.browseCards({
        query: (req.query.query as string || '').trim(),
        supertype: req.query.supertype as string,
        setCode: req.query.setCode as string,
        rarity: req.query.rarity as string,
        variant: req.query.variant as string,
        ownership: req.query.ownership as any,
        wishlist: req.query.wishlist as any,
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 30),
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[Browser] Error browsing cards:', err);
      res.status(500).json({ success: false, error: 'Unable to browse local cards', cards: [], totalCount: 0 });
    }
  });

  // GET /api/wishlist (Persistent SQLite wishlist)
  app.get('/api/wishlist', requireAuth, (_req, res) => {
    try {
      res.json(dbManager.getWishlistItemsWithCards());
    } catch (err: any) {
      console.error('[Wishlist] Error reading wishlist:', err);
      res.status(500).json({ error: 'Unable to read wishlist' });
    }
  });

  // POST /api/wishlist (Add/increment persistent wishlist item)
  app.post('/api/wishlist', requireAuth, (req, res) => {
    try {
      const { cardId, printingId, quantity, priority, notes } = req.body;
      if (!cardId) {
        return res.status(400).json({ error: 'cardId required' });
      }

      const item = dbManager.upsertWishlistItem({ cardId, printingId, quantity, priority, notes });
      res.json({ success: true, item, wishlist: dbManager.getWishlistItemsWithCards() });
    } catch (err: any) {
      console.error('[Wishlist] Error saving wishlist item:', err);
      res.status(500).json({ error: err?.message || 'Unable to save wishlist item' });
    }
  });

  // DELETE /api/wishlist/:id
  app.delete('/api/wishlist/:id', requireAuth, (req, res) => {
    try {
      dbManager.deleteWishlistItem(req.params.id);
      res.json({ success: true, wishlist: dbManager.getWishlistItemsWithCards() });
    } catch (err: any) {
      console.error('[Wishlist] Error deleting wishlist item:', err);
      res.status(500).json({ error: 'Unable to delete wishlist item' });
    }
  });

  // GET /api/cards/search (LOCAL FIRST, API fallback only if empty)
  app.get('/api/cards/search', requireAuth, async (req, res) => {
    try {
      const query = (req.query.q as string || req.query.query as string || '').trim();
      const supertype = req.query.supertype as string;
      const setCode = req.query.setCode as string;
      const page = parseInt((req.query.page as string) || '1', 10);
      const pageSize = parseInt((req.query.pageSize as string) || '30', 10);

      // Try local search first
      const localSearch = dbManager.searchCardsWithPrintings({
        query,
        supertype,
        setCode,
        page,
        pageSize,
      });
      
      if (localSearch.totalCount > 0) {
        const allPrintings = localSearch.cards.flatMap((c) => c.printings || []);
        return res.json({
          success: true,
          cards: localSearch.cards,
          printings: allPrintings,
          totalCount: localSearch.totalCount,
          page,
          pageSize,
        });
      }

      // Fallback to API only if local search returns empty
      console.log(`[Search] Local search empty for "${query}", trying API fallback`);
      const apiResult = await searchPokemonTcgApi(query, { supertype, setCode, page, pageSize });

      if (apiResult.success && apiResult.cards.length > 0) {
        const db = readDb();
        cacheCardsInDb(db, apiResult.cards, apiResult.printings);
      }

      if (!apiResult.success) {
        return res.status(503).json(apiResult);
      }

      res.json(apiResult);
    } catch (err: any) {
      console.error('[Server] Error in /api/cards/search:', err);
      res.status(500).json({
        success: false,
        cards: [],
        printings: [],
        totalCount: 0,
        page: 1,
        pageSize: 30,
        error: 'Internal server error during search',
      });
    }
  });

  // GET /api/cards (Legacy/General card endpoint - LOCAL FIRST)
  app.get('/api/cards', requireAuth, async (req, res) => {
    try {
      const query = (req.query.query as string || req.query.q as string || '').trim();
      const supertype = req.query.supertype as string;

      if (query) {
        // Try local search first
        const localResults = dbManager.searchCardsWithPrintings({
          query,
          supertype,
          page: 1,
          pageSize: 250,
        });
        
        if (localResults.totalCount > 0) {
          return res.json(localResults.cards);
        }
        
        // Fallback to API only if local search empty
        console.log(`[Cards] Local search empty for "${query}", trying API fallback`);
        const apiResult = await searchPokemonTcgApi(query, { supertype });
        if (apiResult.success) {
          const db = readDb();
          cacheCardsInDb(db, apiResult.cards, apiResult.printings);
          return res.json(apiResult.cards);
        } else {
          return res.status(503).json({ error: apiResult.error || 'Card search is temporarily unavailable. Please try again.', cards: [] });
        }
      }

      res.json(dbManager.getCardsWithPrintings());
    } catch (err: any) {
      console.error('[Server] Error in /api/cards:', err);
      res.status(500).json({ error: 'Internal server error', cards: [] });
    }
  });

  // GET /api/cards/:id (Fetch card details by canonical ID e.g. 'sv1-196', 'xy1-4')
  app.get('/api/cards/:id', requireAuth, async (req, res) => {
    const cardId = req.params.id;
    const db = readDb();

    let printing = db.printings.find((p) => p.id === cardId);
    let card = db.cards.find((c) => c.id === (printing ? printing.cardId : cardId));

    if (!printing || !card) {
      const fetched = await getPokemonCardById(cardId);
      if (fetched) {
        cacheCardsInDb(db, [fetched.card], [fetched.printing]);
        card = fetched.card;
        printing = fetched.printing;
      }
    }

    if (!card && !printing) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({ card, printing });
  });


  // POST /api/cards (Create custom card/printing)
  app.post('/api/cards', requireAuth, (req, res) => {
    const db = readDb();
    const { name, supertype, subtype, setCode, setName, cardNumber, rarity, marketPrice } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Card name required' });
    }

    let existingCard = db.cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!existingCard) {
      const cardId = `card_${Date.now()}`;
      const prtId = `prt_${Date.now()}`;
      existingCard = {
        id: cardId,
        name,
        supertype: supertype || 'Trainer',
        subtype: subtype || 'Item',
        defaultPrintingId: prtId,
      };
      db.cards.push(existingCard);

      const printing: CardPrinting = {
        id: prtId,
        cardId,
        cardName: name,
        setCode: setCode || 'CUSTOM',
        setName: setName || 'Custom Expansion',
        cardNumber: cardNumber || '1',
        rarity: rarity || 'Uncommon',
        variant: 'Normal',
        language: 'English',
        imageUrl: '',
        marketPrice: Number(marketPrice) || 1.0,
      };
      db.printings.push(printing);
    }

    writeDb(db);
    res.json(existingCard);
  });

  // GET /api/collection
  app.get('/api/collection', requireAuth, (req, res) => {
    const db = dbManager.getCollectionContext();
    const activeDeckIds = new Set(db.decks.filter((d) => d.status === 'Active').map((d) => d.id));
    const cardsById = new Map(db.cards.map((card) => [card.id, card]));
    const printingsById = new Map(db.printings.map((printing) => [printing.id, printing]));
    const decksById = new Map(db.decks.map((deck) => [deck.id, deck]));
    const allocationsByCollectionItemId = new Map<string, Allocation[]>();
    for (const allocation of db.allocations) {
      if (!activeDeckIds.has(allocation.deckId)) continue;
      const current = allocationsByCollectionItemId.get(allocation.collectionItemId) || [];
      current.push(allocation);
      allocationsByCollectionItemId.set(allocation.collectionItemId, current);
    }

    const enrichedCollection = db.collectionItems.map((item) => {
      const card = cardsById.get(item.cardId);
      const printing = printingsById.get(item.printingId);

      const itemAllocations = allocationsByCollectionItemId.get(item.id) || [];
      const allocatedQty = itemAllocations.reduce((sum, a) => sum + a.quantity, 0);
      const availableQty = Math.max(0, item.quantity - allocatedQty);

      const allocatedDetails = itemAllocations.map((a) => {
        const deck = decksById.get(a.deckId);
        return {
          allocationId: a.id,
          deckId: a.deckId,
          deckName: deck ? deck.name : 'Unknown Deck',
          allocatedQuantity: a.quantity,
        };
      });

      return {
        ...item,
        card,
        printing,
        allocatedQuantity: allocatedQty,
        availableQuantity: availableQty,
        allocatedDetails,
      };
    });

    res.json(enrichedCollection);
  });

  // POST /api/collection (Add/Update collection item)
  // BACKEND IS AUTHORITATIVE: Re-checks database for allocations before any deletion/quantity change
  app.post('/api/collection', requireAuth, (req, res) => {
    const db = dbManager.getAllocationContext();
    const { id, cardId, printingId, quantity, condition, language, acquisitionSource, acquisitionCost, notes } = req.body;

    let targetCardId = cardId;
    let existingItem: CollectionItem | undefined;

    if (id) {
      existingItem = db.collectionItems.find((ci) => ci.id === id);
      if (existingItem) {
        targetCardId = targetCardId || existingItem.cardId;
      }
    }

    if (!targetCardId && !id) {
      return res.status(400).json({ error: 'cardId or collection item id required' });
    }

    const targetCard = targetCardId ? dbManager.getCardById(targetCardId) : null;
    const prtId = printingId || targetCard?.defaultPrintingId || existingItem?.printingId || '';

    if (id && existingItem) {
      const idx = db.collectionItems.findIndex((ci) => ci.id === id);
      if (idx !== -1) {
        if (Number(quantity) <= 0) {
          // Check for active allocations before deletion
          const itemAllocations = db.allocations.filter((a) => a.collectionItemId === id);
          if (itemAllocations.length > 0) {
            const deckNames = itemAllocations
              .map(a => db.decks.find(d => d.id === a.deckId)?.name || 'Unknown Deck')
              .join(', ');
            return res.status(400).json({ 
              error: `Cannot delete: ${itemAllocations.length} copies allocated to ${deckNames}. Release allocations first.` 
            });
          }
          // Safe to delete
          db.collectionItems.splice(idx, 1);
          db.allocations = db.allocations.filter((a) => a.collectionItemId !== id);
        } else {
          const newQty = Number(quantity);
          
          // Check if new quantity is below allocated amount
          const itemAllocations = db.allocations.filter((a) => a.collectionItemId === id);
          const totalAllocated = itemAllocations.reduce((sum, a) => sum + a.quantity, 0);
          if (newQty < totalAllocated) {
            const deckNames = itemAllocations
              .map(a => db.decks.find(d => d.id === a.deckId)?.name || 'Unknown Deck')
              .join(', ');
            return res.status(400).json({ 
              error: `Cannot decrease below ${totalAllocated} allocated copies (allocated to ${deckNames}). Release allocations first.` 
            });
          }
          
          // Update the collection item with new quantity
          db.collectionItems[idx] = {
            ...db.collectionItems[idx],
            quantity: newQty,
            condition: condition || db.collectionItems[idx].condition,
            language: language || db.collectionItems[idx].language,
            notes: notes !== undefined ? notes : db.collectionItems[idx].notes,
          };

          // Safety net: Trim allocations if total allocated exceeds new quantity
          // This should rarely happen due to the check above, but provides additional safety
          if (totalAllocated > newQty) {
            let toTrim = totalAllocated - newQty;
            for (let i = itemAllocations.length - 1; i >= 0; i--) {
              if (toTrim <= 0) break;
              const alloc = itemAllocations[i];
              if (alloc.quantity <= toTrim) {
                toTrim -= alloc.quantity;
                db.allocations = db.allocations.filter((a) => a.id !== alloc.id);
              } else {
                alloc.quantity -= toTrim;
                toTrim = 0;
              }
            }
          }

          const invariant = validateAllocationInvariants(db);
          if (!invariant.ok) {
            return res.status(400).json({ error: invariant.error });
          }
        }
      }
    } else if (targetCardId) {
      // Create or increment existing item with same printing
      const existing = db.collectionItems.find((ci) => ci.cardId === targetCardId && ci.printingId === prtId && ci.condition === (condition || 'NM'));
      if (existing) {
        existing.quantity += Number(quantity || 1);
      } else {
        const newItem: CollectionItem = {
          id: `ci_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          cardId: targetCardId,
          printingId: prtId,
          quantity: Number(quantity || 1),
          condition: condition || 'NM',
          language: language || 'English',
          acquisitionSource: acquisitionSource || 'Manual Add',
          acquisitionDate: new Date().toISOString().split('T')[0],
          acquisitionCost: Number(acquisitionCost || 0),
          notes,
        };
        db.collectionItems.push(newItem);
      }
    }

    // CRITICAL FIX: Do NOT auto-allocate on collection changes
    // Auto-allocation should only happen via explicit user action (auto-allocate endpoint)
    // This prevents silent reallocation when modifying collection quantities

    dbManager.replaceCollectionItemsAndAllocations(db.collectionItems, db.allocations);
    res.json({ success: true, collection: db.collectionItems });
  });

  // DELETE /api/collection/:id
  // BACKEND IS AUTHORITATIVE: Re-checks database for allocations before deletion
  app.delete('/api/collection/:id', requireAuth, (req, res) => {
    const db = dbManager.getAllocationContext();
    const { id } = req.params;

    // Check for active allocations before deletion
    const itemAllocations = db.allocations.filter((a) => a.collectionItemId === id);
    if (itemAllocations.length > 0) {
      const deckNames = itemAllocations
        .map(a => db.decks.find(d => d.id === a.deckId)?.name || 'Unknown Deck')
        .join(', ');
      return res.status(400).json({ 
        error: `Cannot delete: ${itemAllocations.length} copies allocated to ${deckNames}. Release allocations first.` 
      });
    }

    db.collectionItems = db.collectionItems.filter((ci) => ci.id !== id);
    db.allocations = db.allocations.filter((a) => a.collectionItemId !== id);

    // CRITICAL FIX: Do NOT auto-allocate on collection deletion
    // Auto-allocation should only happen via explicit user action (auto-allocate endpoint)

    dbManager.replaceCollectionItemsAndAllocations(db.collectionItems, db.allocations);
    res.json({ success: true, collection: db.collectionItems });
  });

  // GET /api/decks
  app.get('/api/decks', requireAuth, (req, res) => {
    const db = dbManager.getDeckContext();
    const requirementsByDeckId = new Map<string, DeckRequirement[]>();
    for (const requirement of db.deckRequirements) {
      const current = requirementsByDeckId.get(requirement.deckId) || [];
      current.push(requirement);
      requirementsByDeckId.set(requirement.deckId, current);
    }
    const cardsById = new Map(db.cards.map((card) => [card.id, card]));
    const printingsById = new Map(db.printings.map((printing) => [printing.id, printing]));

    const enrichedDecks = db.decks.map((deck) => {
      const reqs = requirementsByDeckId.get(deck.id) || [];

      const cardOwnershipList = reqs.map((req) => {
        const card = cardsById.get(req.cardId);
        if (!card) return null;

        const ownership = calculateCardOwnershipForDeck(
          card,
          req,
          deck,
          db.decks,
          db.collectionItems,
          db.allocations
        );

        const printing = printingsById.get(req.preferredPrintingId || card.defaultPrintingId);

        return {
          requirement: req,
          card,
          printing,
          ownership,
        };
      }).filter(Boolean);

      const totalRequired = reqs.reduce((sum, r) => sum + r.quantity, 0);
      const totalAllocated = cardOwnershipList.reduce((sum, item) => sum + (item?.ownership.allocatedToThisDeck || 0), 0);
      const totalAllocationMissing = Math.max(0, totalRequired - totalAllocated);
      const totalCollectionMissing = cardOwnershipList.reduce((sum, item) => sum + (item?.ownership.missing || 0), 0);
      const uniqueCardCount = reqs.length; // Count of unique card types
      const isFullyOwned = cardOwnershipList.every((item) => item?.ownership.status === 'FULLY_OWNED');

      return {
        ...deck,
        requirements: cardOwnershipList,
        totalRequiredCards: totalRequired,
        totalAllocatedCards: totalAllocated,
        totalAllocationMissingCards: totalAllocationMissing,
        totalCollectionMissingCards: totalCollectionMissing,
        uniqueCardCount: uniqueCardCount,
        isFullyOwned,
      };
    });

    res.json(enrichedDecks);
  });

  // POST /api/decks (Create or Update deck)
  app.post('/api/decks', requireAuth, (req, res) => {
    const db = dbManager.getAllocationContext();
    const { id, name, version, format, status, isPermanentlyAssembled, notes, requirements } = req.body;

    let deck: Deck;
    let wasActiveBeforeUpdate = false;
    let deckRequirementsForSave: DeckRequirement[] | undefined;
    if (id) {
      const idx = db.decks.findIndex((d) => d.id === id);
      if (idx !== -1) {
        wasActiveBeforeUpdate = db.decks[idx].status === 'Active';
        db.decks[idx] = {
          ...db.decks[idx],
          name: name || db.decks[idx].name,
          version: version || db.decks[idx].version,
          format: format || db.decks[idx].format,
          status: status || db.decks[idx].status,
          isPermanentlyAssembled: isPermanentlyAssembled !== undefined ? isPermanentlyAssembled : db.decks[idx].isPermanentlyAssembled,
          notes: notes !== undefined ? notes : db.decks[idx].notes,
          updatedAt: new Date().toISOString(),
        };
        deck = db.decks[idx];
      } else {
        return res.status(404).json({ error: 'Deck not found' });
      }
    } else {
      const newId = `deck_${Date.now()}`;
      deck = {
        id: newId,
        name: name || 'New Pokémon Deck',
        version: version || 'v1.0',
        format: format || 'Standard',
        status: status || 'Active',
        isPermanentlyAssembled: Boolean(isPermanentlyAssembled),
        notes,
        updatedAt: new Date().toISOString(),
      };
      db.decks.push(deck);
    }

    // Update requirements if provided
    if (Array.isArray(requirements)) {
      db.deckRequirements = db.deckRequirements.filter((r) => r.deckId !== deck.id);
      for (const r of requirements) {
        db.deckRequirements.push({
          id: r.id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          deckId: deck.id,
          cardId: r.cardId,
          quantity: Math.max(1, Number(r.quantity || 1)),
          requirementMode: r.requirementMode || 'ANY_PRINTING',
          preferredPrintingId: r.preferredPrintingId,
        });
      }
      deckRequirementsForSave = db.deckRequirements.filter((r) => r.deckId === deck.id);

      // Cleanup orphaned allocations for this deck
      const validReqIds = new Set(db.deckRequirements.filter((r) => r.deckId === deck.id).map((r) => r.id));
      db.allocations = db.allocations.filter((a) => a.deckId !== deck.id || validReqIds.has(a.requirementId));

      // CRITICAL FIX: Do NOT auto-allocate on deck creation/import
      // Allocation should only happen via explicit user action (auto-allocate endpoint)
      // This prevents silent allocation of collection cards when creating decks
    }

    if (wasActiveBeforeUpdate && deck.status !== 'Active') {
      db.allocations = db.allocations.filter((a) => a.deckId !== deck.id);
    }

    const invariant = validateAllocationInvariants(db);
    if (!invariant.ok) {
      return res.status(400).json({ error: invariant.error });
    }

    dbManager.saveDeckWithRequirements(deck, deckRequirementsForSave, db.allocations);
    res.json(deck);
  });

  // DELETE /api/decks/:id
  app.delete('/api/decks/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    dbManager.deleteDeckById(id);
    res.json({ success: true });
  });

  // POST /api/decks/:id/auto-allocate
  app.post('/api/decks/:id/auto-allocate', requireAuth, (req, res) => {
    const db = dbManager.getAllocationContext();
    const { id } = req.params;

    const deck = db.decks.find((d) => d.id === id);
    if (!deck) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const activeDecks = db.decks.filter((d) => d.status === 'Active');
    db.allocations = autoAllocateDeck(
      id,
      db.deckRequirements,
      db.collectionItems,
      db.allocations,
      activeDecks
    );

    const invariant = validateAllocationInvariants(db);
    if (!invariant.ok) {
      return res.status(400).json({ error: invariant.error });
    }

    dbManager.replaceAllocations(db.allocations);
    res.json({ success: true, allocations: db.allocations });
  });

  // POST /api/allocations/allocate (Manual allocate collection item to deck requirement)
  app.post('/api/allocations/allocate', requireAuth, (req, res) => {
    const db = dbManager.getAllocationContext();
    const { deckId, requirementId, collectionItemId, quantity } = req.body;

    if (!deckId || !requirementId || !collectionItemId) {
      return res.status(400).json({ error: 'deckId, requirementId, and collectionItemId required' });
    }

    const result = applyManualAllocate(db, {
      deckId,
      requirementId,
      collectionItemId,
      quantity: Number(quantity),
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    db.allocations = result.allocations!;
    dbManager.replaceAllocations(db.allocations);
    res.json({ success: true, allocations: db.allocations });
  });

  // POST /api/allocations/release (Release part or all of an allocation)
  app.post('/api/allocations/release', requireAuth, (req, res) => {
    const db = dbManager.getAllocationContext();
    const { allocationId, quantity } = req.body;

    if (!allocationId) {
      return res.status(400).json({ error: 'allocationId required' });
    }

    const result = applyReleaseAllocation(db, {
      allocationId,
      quantity: quantity === undefined || quantity === null ? undefined : Number(quantity),
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    db.allocations = result.allocations!;
    dbManager.replaceAllocations(db.allocations);
    res.json({ success: true, allocations: db.allocations });
  });

  // POST /api/allocations/move (Transfer allocations directly between decks)
  app.post('/api/allocations/move', requireAuth, (req, res) => {
    const db = dbManager.getAllocationContext();
    const { sourceDeckId, targetDeckId, cardId, quantity } = req.body;

    if (!sourceDeckId || !targetDeckId || !cardId) {
      return res.status(400).json({ error: 'sourceDeckId, targetDeckId, and cardId required' });
    }

    const moveQty = Number(quantity || 1);
    let remainingToMove = moveQty;

    // Find allocations in source deck for collection items matching cardId
    const sourceAllocations = db.allocations.filter((a) => {
      if (a.deckId !== sourceDeckId) return false;
      const ci = db.collectionItems.find((c) => c.id === a.collectionItemId);
      return ci && ci.cardId === cardId;
    });

    const targetReq = db.deckRequirements.find((r) => r.deckId === targetDeckId && r.cardId === cardId);
    if (!targetReq) {
      return res.status(400).json({ error: 'Target deck does not have a requirement for this card' });
    }

    for (const sAlloc of sourceAllocations) {
      if (remainingToMove <= 0) break;
      const amount = Math.min(sAlloc.quantity, remainingToMove);

      sAlloc.quantity -= amount;
      remainingToMove -= amount;

      // Add allocation to target deck requirement (preserve source isLocked)
      const existingTargetAlloc = db.allocations.find(
        (a) => a.deckId === targetDeckId && a.requirementId === targetReq.id && a.collectionItemId === sAlloc.collectionItemId
      );

      if (existingTargetAlloc) {
        existingTargetAlloc.quantity += amount;
        if (sAlloc.isLocked) {
          existingTargetAlloc.isLocked = true;
        }
      } else {
        db.allocations.push({
          id: `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          collectionItemId: sAlloc.collectionItemId,
          deckId: targetDeckId,
          requirementId: targetReq.id,
          quantity: amount,
          isLocked: Boolean(sAlloc.isLocked),
        });
      }
    }

    // Clean up 0 quantity allocations
    db.allocations = db.allocations.filter((a) => a.quantity > 0);

    const invariant = validateAllocationInvariants(db);
    if (!invariant.ok) {
      return res.status(400).json({ error: invariant.error });
    }

    dbManager.replaceAllocations(db.allocations);
    res.json({ success: true, moved: moveQty - remainingToMove, allocations: db.allocations });
  });

  // POST /api/decks/:id/assemble (Assemble Deck Pick List)
  app.post('/api/decks/:id/assemble', requireAuth, (req, res) => {
    const db = readDb();
    const { id } = req.params;

    const deck = db.decks.find((d) => d.id === id);
    if (!deck) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const reqs = db.deckRequirements.filter((r) => r.deckId === id);
    const storeProfile = db.storeProfiles.find((sp) => sp.isDefault) || db.storeProfiles[0];

    const pickList = reqs.map((req) => {
      const card = db.cards.find((c) => c.id === req.cardId);
      const printing = db.printings.find((p) => p.id === (req.preferredPrintingId || card?.defaultPrintingId));

      const reqAllocations = db.allocations.filter((a) => a.deckId === id && a.requirementId === req.id);
      const allocatedQty = reqAllocations.reduce((sum, a) => sum + a.quantity, 0);

      // Check where allocated cards are physically coming from
      const transferAlerts: { fromDeckName: string; count: number }[] = [];
      const collectionItemSources: { printingName: string; setCode: string; count: number; condition: string }[] = [];

      for (const alloc of reqAllocations) {
        const item = db.collectionItems.find((ci) => ci.id === alloc.collectionItemId);
        if (item) {
          const prt = db.printings.find((p) => p.id === item.printingId);
          collectionItemSources.push({
            printingName: prt ? `${prt.setName} (${prt.setCode} ${prt.cardNumber})` : 'Main Collection',
            setCode: prt ? prt.setCode : 'GEN',
            count: alloc.quantity,
            condition: item.condition,
          });
        }
      }

      // Check if other active decks need to surrender allocated copies
      const activeOtherDeckIds = new Set(db.decks.filter((d) => d.id !== id && d.status === 'Active').map((d) => d.id));
      const otherDeckAllocations = db.allocations.filter((a) => activeOtherDeckIds.has(a.deckId) && db.collectionItems.some((ci) => ci.id === a.collectionItemId && ci.cardId === req.cardId));
      for (const oAlloc of otherDeckAllocations) {
        const otherDeck = db.decks.find((d) => d.id === oAlloc.deckId);
        if (otherDeck) {
          transferAlerts.push({
            fromDeckName: otherDeck.name,
            count: oAlloc.quantity,
          });
        }
      }

      const bulkCategory = card && storeProfile ? resolveBulkCategoryForCard(card, printing, storeProfile) : 'General Box';

      return {
        card,
        printing,
        requiredQty: req.quantity,
        allocatedQty,
        missingQty: Math.max(0, req.quantity - allocatedQty),
        bulkCategory,
        collectionItemSources,
        transferAlerts,
      };
    });

    res.json({
      deck,
      pickList,
    });
  });

  // GET /api/store-profiles
  app.get('/api/store-profiles', requireAuth, (req, res) => {
    res.json(dbManager.getStoreProfiles());
  });

  // POST /api/store-profiles
  app.post('/api/store-profiles', requireAuth, (req, res) => {
    const storeProfiles = dbManager.getStoreProfiles();
    const { id, name, categories, overrides } = req.body;

    if (id) {
      const idx = storeProfiles.findIndex((sp) => sp.id === id);
      if (idx !== -1) {
        storeProfiles[idx] = {
          ...storeProfiles[idx],
          name: name || storeProfiles[idx].name,
          categories: categories || storeProfiles[idx].categories,
          overrides: overrides || storeProfiles[idx].overrides,
        };
      }
    } else {
      const newSp: StoreProfile = {
        id: `sp_${Date.now()}`,
        name: name || 'Custom Store Profile',
        isDefault: storeProfiles.length === 0,
        categories: categories || [],
        overrides: overrides || [],
      };
      storeProfiles.push(newSp);
    }

    dbManager.replaceStoreProfiles(storeProfiles);
    res.json(storeProfiles);
  });

  // POST /api/store-profiles/duplicate
  app.post('/api/store-profiles/duplicate', requireAuth, (req, res) => {
    const storeProfiles = dbManager.getStoreProfiles();
    const { id } = req.body;
    const existing = storeProfiles.find((sp) => sp.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Store profile not found' });
    }

    const newSp: StoreProfile = {
      id: `sp_${Date.now()}`,
      name: `Copy of ${existing.name}`,
      isDefault: false,
      categories: existing.categories.map((c) => ({ ...c, id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` })),
      overrides: existing.overrides.map((o) => ({ ...o, id: `ov_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` })),
    };
    storeProfiles.push(newSp);
    dbManager.replaceStoreProfiles(storeProfiles);
    res.json({ success: true, storeProfiles, newProfile: newSp });
  });

  // POST /api/store-profiles/default
  app.post('/api/store-profiles/default', requireAuth, (req, res) => {
    const storeProfiles = dbManager.getStoreProfiles();
    const { id } = req.body;
    const updatedStoreProfiles = storeProfiles.map((sp) => ({
      ...sp,
      isDefault: sp.id === id,
    }));
    dbManager.replaceStoreProfiles(updatedStoreProfiles);
    res.json(updatedStoreProfiles);
  });

  // DELETE /api/store-profiles/:id
  app.delete('/api/store-profiles/:id', requireAuth, (req, res) => {
    let storeProfiles = dbManager.getStoreProfiles();
    const { id } = req.params;
    if (storeProfiles.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only store profile' });
    }
    storeProfiles = storeProfiles.filter((sp) => sp.id !== id);
    if (!storeProfiles.some((sp) => sp.isDefault)) {
      storeProfiles[0].isDefault = true;
    }
    dbManager.replaceStoreProfiles(storeProfiles);
    res.json(storeProfiles);
  });

  // GET /api/bulk-hunt (Generate physical store bulk hunting checklist)
  app.get('/api/bulk-hunt', requireAuth, (req, res) => {
    const db = {
      ...dbManager.getDeckContext(),
      storeProfiles: dbManager.getStoreProfiles(),
    };
    const deckId = req.query.deckId as string;
    const storeProfileId = req.query.storeProfileId as string;

    const storeProfile = db.storeProfiles.find((sp) => sp.id === storeProfileId) || db.storeProfiles[0];
    const requirementsByDeckId = new Map<string, DeckRequirement[]>();
    for (const requirement of db.deckRequirements) {
      const current = requirementsByDeckId.get(requirement.deckId) || [];
      current.push(requirement);
      requirementsByDeckId.set(requirement.deckId, current);
    }
    const cardsById = new Map(db.cards.map((card) => [card.id, card]));
    const printingsById = new Map(db.printings.map((printing) => [printing.id, printing]));

    // Determine missing cards
    let shortfalls: { cardId: string; cardName: string; missing: number; preferredPrintingId?: string }[] = [];

    if (deckId && deckId !== 'ALL') {
      const reqs = requirementsByDeckId.get(deckId) || [];
      const deck = db.decks.find((d) => d.id === deckId);
      if (deck) {
        shortfalls = reqs.map((req) => {
          const card = cardsById.get(req.cardId);
          if (!card) return null;
          const ownership = calculateCardOwnershipForDeck(card, req, deck, db.decks, db.collectionItems, db.allocations);
          return {
            cardId: card.id,
            cardName: card.name,
            missing: ownership.missing,
            preferredPrintingId: req.preferredPrintingId,
          };
        }).filter((item): item is NonNullable<typeof item> => item !== null && item.missing > 0);
      }
    } else {
      const multiShortfalls = calculateMultiDeckShortfalls(db.decks, db.deckRequirements, db.collectionItems, db.cards, {
        includeInactiveDecks: true,
      });
      shortfalls = multiShortfalls.map((s) => ({
        cardId: s.cardId,
        cardName: s.cardName,
        missing: s.missing,
      }));
    }

    // Group missing cards by Bulk Categories
    const categoryMap = new Map<string, any[]>();
    for (const cat of storeProfile?.categories || []) {
      categoryMap.set(cat.name, []);
    }

    for (const item of shortfalls) {
      const card = cardsById.get(item.cardId);
      if (!card) continue;
      const printing = printingsById.get(item.preferredPrintingId || card.defaultPrintingId);

      const categoryName = resolveBulkCategoryForCard(card, printing, storeProfile);
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, []);
      }

      categoryMap.get(categoryName)?.push({
        cardId: card.id,
        cardName: card.name,
        supertype: card.supertype,
        subtype: card.subtype,
        rarity: printing?.rarity ?? null,
        regulationMark: printing?.regulationMark ?? null,
        printing,
        needQty: item.missing,
        foundQty: 0,
      });
    }

    // Rarity sort order — lower number = searched first (bulk box order)
    const RARITY_ORDER: Record<string, number> = {
      'Common': 0,
      'Uncommon': 1,
      'Rare': 2,
      'Rare Holo': 3,
      'Holo Rare': 3,
      'Double Rare': 4,
      'Ultra Rare': 5,
      'Illustration Rare': 6,
      'Special Illustration Rare': 7,
      'Hyper Rare': 8,
      'ACE SPEC': 9,
      'Radiant Rare': 10,
      'Promo': 11,
    };

    function rarityRank(rarity: string | null): number {
      if (!rarity) return 99;
      return RARITY_ORDER[rarity] ?? 99;
    }

    // Regulation marks sort order (G = oldest current standard, ascending)
    const REGULATION_ORDER: Record<string, number> = {
      'G': 0, 'H': 1, 'I': 2, 'J': 3,
    };

    function regulationRank(mark: string | null): number {
      if (!mark) return 99;
      const upper = mark.toUpperCase();
      return REGULATION_ORDER[upper] ?? 50; // unknown marks after known, before null
    }

    const groupedList = Array.from(categoryMap.entries())
      .filter(([_, items]) => items.length > 0)
      .map(([categoryName, items]) => {
        const catInfo = storeProfile?.categories?.find((c) => c.name === categoryName);
        const sortedItems = items.sort((a: any, b: any) => {
          // 1. Regulation mark (G → H → I → J → unknown → none)
          const regDiff = regulationRank(a.regulationMark) - regulationRank(b.regulationMark);
          if (regDiff !== 0) return regDiff;
          // 2. Rarity (Common → Uncommon → Rare → ...)
          const rarDiff = rarityRank(a.rarity) - rarityRank(b.rarity);
          if (rarDiff !== 0) return rarDiff;
          // 3. Alphabetical
          return a.cardName.localeCompare(b.cardName);
        });
        return {
          categoryName,
          sortOrder: catInfo ? catInfo.sortOrder : 99,
          items: sortedItems,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

    res.json({
      storeProfile,
      groupedList,
    });
  });

  // POST /api/acquisitions (Acquire cards into collection)
  app.post('/api/acquisitions', requireAuth, (req, res) => {
    const db = dbManager.getAllocationContext();
    const { cardId, printingId, quantity, source, method, costPerUnit, deckIdToAllocate } = req.body;

    if (!cardId) {
      return res.status(400).json({ error: 'cardId required' });
    }

    const card = dbManager.getCardById(cardId);
    const prtId = printingId || card?.defaultPrintingId || '';
    const qty = Number(quantity || 1);
    const unitCost = Number(costPerUnit || 0);

    // Record Acquisition Log
    const acq = {
      id: `acq_${Date.now()}`,
      cardId,
      cardName: card ? card.name : 'Unknown Card',
      printingId: prtId,
      quantity: qty,
      source: source || 'Local Store Bulk Hunt',
      method: method || 'Bulk',
      date: new Date().toISOString().split('T')[0],
      costPerUnit: unitCost,
      totalCost: unitCost * qty,
      notes: `Acquired ${qty}x ${card?.name || 'Card'}`,
    };

    // Add into Collection
    let colItem = db.collectionItems.find((ci) => ci.cardId === cardId && ci.printingId === prtId && ci.condition === 'NM');
    if (colItem) {
      colItem.quantity += qty;
    } else {
      colItem = {
        id: `ci_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        cardId,
        printingId: prtId,
        quantity: qty,
        condition: 'NM',
        language: 'English',
        acquisitionSource: source || 'Bulk Hunt',
        acquisitionDate: new Date().toISOString().split('T')[0],
        acquisitionCost: unitCost,
      };
      db.collectionItems.push(colItem);
    }

    // Auto allocate to specific deck if requested
    if (deckIdToAllocate && colItem) {
      const activeDecks = db.decks.filter((d) => d.status === 'Active');
      db.allocations = autoAllocateDeck(deckIdToAllocate, db.deckRequirements, db.collectionItems, db.allocations, activeDecks);
    }

    dbManager.saveAcquisitionCollectionAndAllocations(acq, db.collectionItems, db.allocations);
    res.json({ success: true, acquisition: acq, collectionItem: colItem });
  });

  // GET /api/marketplace/search (Search links across international and South African marketplaces)
  app.get('/api/marketplace/search', requireAuth, (req, res) => {
    const query = (req.query.query as string || '').trim();

    if (!query) {
      return res.json([]);
    }

    const matchingCards = dbManager.searchCardsWithPrintings({
      query,
      page: 1,
      pageSize: 25,
    }).cards;
    const results: MarketplaceListing[] = [];

    const marketplaces: {
      name: MarketplaceListing['marketplace'];
      sellerName: string;
      shippingPrice: number;
      priceVariance: number;
      buildUrl: (card: LogicalCard, printing: CardPrinting) => string;
    }[] = [
      {
        name: 'Pokeverse',
        sellerName: 'Pokeverse SA',
        shippingPrice: 0,
        priceVariance: 0.05,
        buildUrl: (card, printing) => `https://pokeverse.co.za/?s=${encodeURIComponent(`${card.name} ${printing.setCode} ${printing.cardNumber}`)}&post_type=product`,
      },
      {
        name: 'PokeBulk',
        sellerName: 'PokeBulk SA',
        shippingPrice: 0,
        priceVariance: -0.1,
        buildUrl: () => 'https://www.pokebulk.co.za/cards',
      },
      {
        name: 'Bob Shop',
        sellerName: 'Bob Shop SA marketplace',
        shippingPrice: 2.5,
        priceVariance: 0.15,
        buildUrl: (card, printing) => `https://www.bobshop.co.za/search/${encodeURIComponent(`${card.name} ${printing.setCode} ${printing.cardNumber}`)}`,
      },
      {
        name: 'TCGPlayer',
        sellerName: 'TCGPlayer marketplace',
        shippingPrice: 0.99,
        priceVariance: 0,
        buildUrl: (card, printing) => `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(`${card.name} ${printing.setCode} ${printing.cardNumber}`)}&view=grid`,
      },
      {
        name: 'eBay',
        sellerName: 'eBay marketplace',
        shippingPrice: 1.5,
        priceVariance: 0.1,
        buildUrl: (card, printing) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${card.name} ${printing.setCode} ${printing.cardNumber}`)}`,
      },
      {
        name: 'Local Game Store',
        sellerName: 'Local Game Store manual check',
        shippingPrice: 0,
        priceVariance: 0,
        buildUrl: () => 'https://www.google.com/search?q=local+game+store+pokemon+cards+south+africa',
      },
    ];

    matchingCards.forEach((card) => {
      (card.printings || []).forEach((p) => {
        marketplaces.forEach((mkt, idx) => {
          const basePrice = p.marketPrice || 1.0;
          const price = Math.max(0.25, parseFloat((basePrice * (1 + mkt.priceVariance)).toFixed(2)));

          results.push({
            id: `mkt_${card.id}_${p.id}_${idx}`,
            marketplace: mkt.name,
            cardName: card.name,
            printingString: `${p.setName} (${p.setCode} ${p.cardNumber})`,
            sellerName: mkt.sellerName,
            condition: 'NM',
            itemPrice: price,
            shippingPrice: mkt.shippingPrice,
            availableQty: 4 + idx * 2,
            listingUrl: mkt.buildUrl(card, p),
          });
        });
      });
    });

  res.json(results);
  });

  // GET /api/marketplace/optimize (Shopping Optimizer)
  app.get('/api/marketplace/optimize', requireAuth, (req, res) => {
    const db = dbManager.getDeckContext();
    const mode = (req.query.mode as 'CHEAPEST_TOTAL' | 'FEWEST_SELLERS') || 'CHEAPEST_TOTAL';

    const shortfalls = calculateMultiDeckShortfalls(db.decks, db.deckRequirements, db.collectionItems, db.cards);
    const cardsById = new Map(db.cards.map((card) => [card.id, card]));
    const printingsById = new Map(db.printings.map((printing) => [printing.id, printing]));

    const items: ShoppingOptimizationResult['items'] = [];
    let totalCardCost = 0;
    let totalShippingCost = 0;
    const sellersUsed = new Set<string>();

    shortfalls.forEach((shortfall) => {
      const card = cardsById.get(shortfall.cardId);
      if (!card) return;
      const printing = printingsById.get(card.defaultPrintingId);

      const basePrice = printing?.marketPrice || 1.20;
      const shipping = mode === 'FEWEST_SELLERS' ? 0.0 : 0.99;
      const seller = mode === 'FEWEST_SELLERS' ? 'MegaTCG Central Store' : `TopDeck Direct Seller`;

      sellersUsed.add(seller);
      const cardCost = basePrice * shortfall.missing;

      totalCardCost += cardCost;
      if (!sellersUsed.has(seller + '_shipping_paid')) {
        totalShippingCost += shipping;
        sellersUsed.add(seller + '_shipping_paid');
      }

      items.push({
        cardId: shortfall.cardId,
        cardName: shortfall.cardName,
        printingString: printing ? `${printing.setName} (${printing.setCode} ${printing.cardNumber})` : 'Standard Printing',
        requiredQty: shortfall.missing,
        listing: {
          id: `opt_${shortfall.cardId}`,
          marketplace: 'TCGPlayer',
          cardName: shortfall.cardName,
          printingString: printing ? `${printing.setName} (${printing.setCode} ${printing.cardNumber})` : 'Standard Printing',
          sellerName: seller,
          condition: 'NM',
          itemPrice: basePrice,
          shippingPrice: shipping,
          availableQty: shortfall.missing,
        },
      });
    });

    res.json({
      mode,
      totalCardCost: parseFloat(totalCardCost.toFixed(2)),
      totalShippingCost: parseFloat(totalShippingCost.toFixed(2)),
      grandTotal: parseFloat((totalCardCost + totalShippingCost).toFixed(2)),
      selectedSellersCount: sellersUsed.size,
      items,
    });
  });

  // POST /api/import-export/deck (Limitless TCG format parser)
  app.post('/api/import-export/deck', requireAuth, async (req, res) => {
    const db = readDb();
    const { text, deckName } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Decklist text required' });
    }

    const lines = text.split('\n');
    const parsedRequirements: { cardId: string; quantity: number; setCode?: string; cardNumber?: string }[] = [];
    const unresolvedCards: { name: string; setCode?: string; cardNumber?: string; reason: string }[] = [];
    const ambiguousCards: { name: string; setCode?: string; cardNumber?: string; possiblePrintings: any[] }[] = [];

    // Group identical cards to avoid duplicate lookups
    const uniqueCardEntries = new Map<string, { qty: number; setCode?: string; cardNumber?: string }>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('pokémon:') || trimmed.toLowerCase().startsWith('trainer:') || trimmed.toLowerCase().startsWith('energy:')) {
        continue;
      }

      // Format regex: "4 Ultra Ball SVI 196" or "4 Ultra Ball"
      const match = trimmed.match(/^(\d+)\s+(.+?)(?:\s+([A-Z0-9]{2,4})\s+(\d+[a-z]?))?$/i);
      if (match) {
        const qty = parseInt(match[1], 10);
        const cardName = match[2].trim();
        const setCode = match[3]?.toUpperCase();
        const cardNumber = match[4];

        const key = `${cardName}|${setCode || ''}|${cardNumber || ''}`;
        const existing = uniqueCardEntries.get(key);
        if (existing) {
          existing.qty += qty;
        } else {
          uniqueCardEntries.set(key, { qty, setCode, cardNumber });
        }
      }
    }

    // Resolve each unique card against local database with strict matching
    for (const [key, entry] of uniqueCardEntries) {
      const [cardName, setCode, cardNumber] = key.split('|');
      
      // Use strict local matching
      const resolution = resolveCardForImport(db.cards, cardName, setCode, cardNumber);
      
      if (resolution.card) {
        parsedRequirements.push({
          cardId: resolution.card.id,
          quantity: entry.qty,
          setCode: entry.setCode,
          cardNumber: entry.cardNumber,
        });
        console.log(`[Import] Resolved: ${cardName} (${resolution.matchType})`);
      } else if (resolution.matchType === 'ambiguous') {
        ambiguousCards.push({
          name: cardName,
          setCode: entry.setCode,
          cardNumber: entry.cardNumber,
          possiblePrintings: resolution.possiblePrintings || [],
        });
        console.log(`[Import] Ambiguous: ${cardName} - multiple printings found`);
      } else {
        unresolvedCards.push({
          name: cardName,
          setCode: entry.setCode,
          cardNumber: entry.cardNumber,
          reason: 'not_found',
        });
        console.log(`[Import] Unresolved: ${cardName} - not found in local database`);
      }
    }

    // Create deck
    const deckId = `deck_${Date.now()}`;
    const newDeck: Deck = {
      id: deckId,
      name: deckName || 'Imported Limitless Deck',
      version: 'v1.0 Import',
      format: 'Standard',
      status: 'Active',
      isPermanentlyAssembled: false,
      notes: `Imported on ${new Date().toLocaleDateString()}`,
      updatedAt: new Date().toISOString(),
    };
    db.decks.push(newDeck);

    for (const pr of parsedRequirements) {
      db.deckRequirements.push({
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        deckId,
        cardId: pr.cardId,
        quantity: pr.quantity,
        requirementMode: pr.setCode ? 'SPECIFIC_PRINTING' : 'ANY_PRINTING',
      });
    }

    // CRITICAL FIX: Do NOT auto-allocate on deck import
    // Allocation should only happen via explicit user action (auto-allocate endpoint)
    // This prevents silent allocation of collection cards when importing decks

    writeDb(db);
    
    res.json({ 
      success: true, 
      deck: newDeck, 
      resolvedCount: parsedRequirements.length,
      unresolvedCards,
      ambiguousCards,
    });
  });

  // --- VITE MIDDLEWARE / STATIC SERVING ---
  const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const isBuiltServer = entryPath.endsWith(`${path.sep}dist${path.sep}server.cjs`);
  if (process.env.NODE_ENV !== 'production' && !isBuiltServer) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
