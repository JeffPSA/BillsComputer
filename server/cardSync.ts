import { config } from 'dotenv';
import path from 'path';
import { LogicalCard, CardPrinting, CardSet } from '../src/types/tcg';
import { fetchPokemonTcgSets, searchPokemonTcgSetCards, transformApiSetToSet } from './cardDataProvider';
import { getDatabaseManager } from './database/index';

// Load environment variables
config();

// Sync statistics tracking
interface SyncStats {
  setsSynced: number;
  cardsSynced: number;
  newCards: number;
  updatedCards: number;
  newSets: number;
  updatedSets: number;
  newPrintings: number;
  updatedPrintings: number;
  totalCards: number;
  totalPrintings: number;
  totalSets: number;
  changedSetIds: string[];
  failedSetIds: string[];
  setSyncFailed: boolean;
  stopped: boolean;
  duration: number;
}

type UpsertAction = 'new' | 'updated' | 'unchanged';

export interface SyncProgress {
  phase: 'sets' | 'cards' | 'complete' | 'stopped';
  message: string;
  currentSetId?: string;
  currentSetName?: string;
  currentSetIndex?: number;
  totalSets?: number;
  currentPage?: number;
  cardsSynced?: number;
  setsSynced?: number;
  percent?: number;
}

export interface SyncOptions {
  shouldStop?: () => boolean;
  onProgress?: (progress: SyncProgress) => void;
}

function createStats(): SyncStats {
  return {
    setsSynced: 0,
    cardsSynced: 0,
    newCards: 0,
    updatedCards: 0,
    newSets: 0,
    updatedSets: 0,
    newPrintings: 0,
    updatedPrintings: 0,
    totalCards: 0,
    totalPrintings: 0,
    totalSets: 0,
    changedSetIds: [],
    failedSetIds: [],
    setSyncFailed: false,
    stopped: false,
    duration: 0,
  };
}

function mergeStats(target: SyncStats, source: SyncStats): void {
  target.cardsSynced += source.cardsSynced;
  target.newCards += source.newCards;
  target.updatedCards += source.updatedCards;
  target.newPrintings += source.newPrintings;
  target.updatedPrintings += source.updatedPrintings;
  target.failedSetIds.push(...source.failedSetIds);
  target.stopped = target.stopped || source.stopped;
}

function syncShouldStop(options?: SyncOptions): boolean {
  return Boolean(options?.shouldStop?.());
}

function reportProgress(options: SyncOptions | undefined, progress: SyncProgress): void {
  options?.onProgress?.(progress);
}

function recordFinalCounts(stats: SyncStats): void {
  const dbStats = getDatabaseManager().getStats();
  stats.totalCards = dbStats.totalCards;
  stats.totalPrintings = dbStats.totalPrintings;
  stats.totalSets = dbStats.totalSets;
}

function persistFailedSetIds(failedSetIds: string[]): void {
  const dbManager = getDatabaseManager();
  const db = dbManager.readDb();
  const uniqueFailedSetIds = Array.from(new Set(failedSetIds));

  db.syncMetadata = {
    ...db.syncMetadata,
    failedSetIds: uniqueFailedSetIds,
    lastSyncCompletedWithFailures: uniqueFailedSetIds.length > 0,
  };

  dbManager.writeDb(db);
}

function normalizeForCompare(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * Upsert a set into the database.
 * Returns true if the set was new or updated, false if unchanged.
 */
function upsertSet(db: any, setToStore: CardSet): UpsertAction {
  const existingIdx = db.sets.findIndex((s: CardSet) => s.id === setToStore.id);

  if (existingIdx === -1) {
    db.sets.push(setToStore);
    console.log(`[CardSync] Added new set: ${setToStore.name} (${setToStore.id})`);
    return 'new';
  }

  const existing = db.sets[existingIdx];
  if (
    existing.name !== setToStore.name ||
    existing.series !== setToStore.series ||
    existing.ptcgoCode !== setToStore.ptcgoCode ||
    existing.releaseDate !== setToStore.releaseDate ||
    existing.printedTotal !== setToStore.printedTotal ||
    existing.total !== setToStore.total ||
    existing.updatedAt !== setToStore.updatedAt
  ) {
    db.sets[existingIdx] = setToStore;
    console.log(`[CardSync] Updated set: ${setToStore.name} (${setToStore.id})`);
    return 'updated';
  }

  return 'unchanged';
}

/**
 * Upsert a card and its printings into the database.
 * Returns true if the card/printings were new or updated, false if unchanged.
 */
function upsertCard(db: any, card: LogicalCard, printings: CardPrinting[]) {
  // Initialize arrays if missing
  if (!db.cards) {
    db.cards = [];
  }
  if (!db.printings) {
    db.printings = [];
  }

  const result = {
    cardAction: 'unchanged' as UpsertAction,
    newPrintings: 0,
    updatedPrintings: 0,
  };

  // Upsert logical card
  const existingCardIdx = db.cards.findIndex((c: LogicalCard) => c.id === card.id);
  if (existingCardIdx === -1) {
    db.cards.push(card);
    console.log(`[CardSync] Added new card: ${card.name} (${card.id})`);
    result.cardAction = 'new';
  } else {
    // Update card if needed (compare key fields)
    const existing = db.cards[existingCardIdx];
    if (existing.name !== card.name || 
        existing.supertype !== card.supertype ||
        existing.subtype !== card.subtype ||
        existing.hp !== card.hp ||
        normalizeForCompare(existing.types || []) !== normalizeForCompare(card.types || []) ||
        normalizeForCompare(existing.rules || []) !== normalizeForCompare(card.rules || []) ||
        existing.isAceSpec !== card.isAceSpec ||
        existing.defaultPrintingId !== card.defaultPrintingId) {
      db.cards[existingCardIdx] = { ...existing, ...card };
      console.log(`[CardSync] Updated card: ${card.name} (${card.id})`);
      result.cardAction = 'updated';
    }
  }

  // Upsert printings
  for (const printing of printings) {
    const existingPrintingIdx = db.printings.findIndex((p: CardPrinting) => p.id === printing.id);
    if (existingPrintingIdx === -1) {
      db.printings.push(printing);
      console.log(`[CardSync] Added new printing: ${printing.cardName} ${printing.setCode} ${printing.cardNumber}`);
      result.newPrintings++;
    } else {
      // Update printing if needed
      const existing = db.printings[existingPrintingIdx];
      if (existing.cardId !== printing.cardId ||
          existing.cardName !== printing.cardName ||
          existing.setCode !== printing.setCode ||
          existing.setName !== printing.setName ||
          existing.cardNumber !== printing.cardNumber ||
          existing.rarity !== printing.rarity ||
          existing.variant !== printing.variant ||
          existing.language !== printing.language ||
          existing.marketPrice !== printing.marketPrice ||
          existing.imageUrl !== printing.imageUrl ||
          normalizeForCompare(existing.attacks || []) !== normalizeForCompare(printing.attacks || []) ||
          normalizeForCompare(existing.abilities || []) !== normalizeForCompare(printing.abilities || []) ||
          normalizeForCompare(existing.weaknesses || []) !== normalizeForCompare(printing.weaknesses || []) ||
          normalizeForCompare(existing.resistances || []) !== normalizeForCompare(printing.resistances || []) ||
          existing.retreatCost !== printing.retreatCost ||
          normalizeForCompare(existing.nationalPokedexNumbers || []) !== normalizeForCompare(printing.nationalPokedexNumbers || []) ||
          existing.regulationMark !== printing.regulationMark ||
          normalizeForCompare(existing.legalities || {}) !== normalizeForCompare(printing.legalities || {}) ||
          existing.artist !== printing.artist ||
          existing.imageUrlSmall !== printing.imageUrlSmall ||
          existing.imageUrlLarge !== printing.imageUrlLarge) {
        db.printings[existingPrintingIdx] = { ...existing, ...printing };
        console.log(`[CardSync] Updated printing: ${printing.cardName} ${printing.setCode} ${printing.cardNumber}`);
        result.updatedPrintings++;
      }
    }
  }

  if (result.cardAction === 'unchanged' && (result.newPrintings > 0 || result.updatedPrintings > 0)) {
    result.cardAction = 'updated';
  }

  return result;
}

/**
 * Synchronize all sets from the Pokémon TCG API.
 */
export async function syncSets(options?: SyncOptions): Promise<SyncStats> {
  const startTime = Date.now();
  const stats = createStats();

  console.log('[CardSync] Starting set synchronization...');
  reportProgress(options, {
    phase: 'sets',
    message: 'Fetching set metadata...',
  });

  try {
    if (syncShouldStop(options)) {
      stats.stopped = true;
      stats.duration = Date.now() - startTime;
      return stats;
    }

    const apiSets = await fetchPokemonTcgSets();
    const dbManager = getDatabaseManager();
    const db = dbManager.readDb();

    if (!db) {
      console.error('[CardSync] Failed to read database');
      return stats;
    }

    // Initialize sets array if missing
    if (!db.sets) {
      db.sets = [];
    }

    if (apiSets.length === 0) {
      console.warn('[CardSync] Set synchronization skipped: API returned no sets; preserving existing set metadata and sync timestamp');
      stats.setSyncFailed = true;
      recordFinalCounts(stats);
      stats.duration = Date.now() - startTime;
      return stats;
    }

    for (const [idx, apiSet] of apiSets.entries()) {
      if (syncShouldStop(options)) {
        stats.stopped = true;
        break;
      }

      reportProgress(options, {
        phase: 'sets',
        message: `Checking set ${apiSet.name}`,
        currentSetId: apiSet.id,
        currentSetName: apiSet.name,
        currentSetIndex: idx + 1,
        totalSets: apiSets.length,
        setsSynced: stats.setsSynced,
        percent: Math.round(((idx + 1) / apiSets.length) * 20),
      });

      const set = transformApiSetToSet(apiSet);
      const action = upsertSet(db, set);
      
      if (action !== 'unchanged') {
        stats.setsSynced++;
        stats.changedSetIds.push(set.id);
        if (action === 'new') {
          stats.newSets++;
        } else {
          stats.updatedSets++;
        }
      }
    }

    // Update sync metadata
    db.syncMetadata = {
      ...db.syncMetadata,
      lastSyncTimestamp: new Date().toISOString(),
      totalSetsSynced: db.sets.length,
    };

    dbManager.writeDb(db);
    recordFinalCounts(stats);

    stats.duration = Date.now() - startTime;
    console.log(`[CardSync] Set synchronization complete: ${stats.setsSynced} sets in ${stats.duration}ms`);
  } catch (err) {
    console.error('[CardSync] Error during set synchronization:', err);
    stats.setSyncFailed = true;
    recordFinalCounts(stats);
    stats.duration = Date.now() - startTime;
  }

  return stats;
}

/**
 * Find sets missing from local SQLite, add only those sets, then sync their cards.
 * Existing set metadata is intentionally left untouched to keep this admin action quiet.
 */
export async function syncNewSetsAndCards(options?: SyncOptions): Promise<SyncStats> {
  const startTime = Date.now();
  const stats = createStats();

  console.log('[CardSync] Scanning for new sets only...');
  reportProgress(options, {
    phase: 'sets',
    message: 'Scanning API for sets missing locally...',
    percent: 0,
  });

  try {
    if (syncShouldStop(options)) {
      stats.stopped = true;
      stats.duration = Date.now() - startTime;
      return stats;
    }

    const apiSets = await fetchPokemonTcgSets();
    const dbManager = getDatabaseManager();
    const db = dbManager.readDb();

    if (!db) {
      console.error('[CardSync] Failed to read database');
      return stats;
    }

    if (!db.sets) {
      db.sets = [];
    }

    if (apiSets.length === 0) {
      console.warn('[CardSync] New set scan skipped: API returned no sets; preserving existing set metadata');
      stats.setSyncFailed = true;
      recordFinalCounts(stats);
      stats.duration = Date.now() - startTime;
      return stats;
    }

    const existingSetIds = new Set(db.sets.map((set: CardSet) => set.id.toLowerCase()));
    const newSets: CardSet[] = [];

    for (const [idx, apiSet] of apiSets.entries()) {
      if (syncShouldStop(options)) {
        stats.stopped = true;
        break;
      }

      reportProgress(options, {
        phase: 'sets',
        message: `Checking for new set: ${apiSet.name}`,
        currentSetId: apiSet.id,
        currentSetName: apiSet.name,
        currentSetIndex: idx + 1,
        totalSets: apiSets.length,
        setsSynced: stats.setsSynced,
        percent: Math.round(((idx + 1) / apiSets.length) * 20),
      });

      if (!existingSetIds.has(apiSet.id.toLowerCase())) {
        const newSet = transformApiSetToSet(apiSet);
        db.sets.push(newSet);
        existingSetIds.add(newSet.id.toLowerCase());
        newSets.push(newSet);
        stats.setsSynced++;
        stats.newSets++;
        stats.changedSetIds.push(newSet.id);
        console.log(`[CardSync] Added new set: ${newSet.name} (${newSet.id})`);
      }
    }

    db.syncMetadata = {
      ...db.syncMetadata,
      lastNewSetScanTimestamp: new Date().toISOString(),
      lastNewSetsFound: newSets.map((set) => set.id),
      totalSetsSynced: db.sets.length,
    };

    dbManager.writeDb(db);
    recordFinalCounts(stats);

    if (stats.stopped || syncShouldStop(options)) {
      stats.stopped = true;
      stats.duration = Date.now() - startTime;
      reportProgress(options, {
        phase: 'stopped',
        message: 'New set scan stopped before card sync',
        setsSynced: stats.setsSynced,
        cardsSynced: stats.cardsSynced,
      });
      return stats;
    }

    if (newSets.length === 0) {
      stats.duration = Date.now() - startTime;
      reportProgress(options, {
        phase: 'complete',
        message: 'No new sets found',
        setsSynced: 0,
        cardsSynced: 0,
        percent: 100,
      });
      console.log('[CardSync] New set scan complete: no new sets found');
      return stats;
    }

    for (const [idx, set] of newSets.entries()) {
      if (syncShouldStop(options)) {
        stats.stopped = true;
        break;
      }

      reportProgress(options, {
        phase: 'cards',
        message: `Syncing cards for new set ${set.name}`,
        currentSetId: set.id,
        currentSetName: set.name,
        currentSetIndex: idx + 1,
        totalSets: newSets.length,
        cardsSynced: stats.cardsSynced,
        setsSynced: stats.setsSynced,
        percent: Math.round(20 + ((idx + 1) / Math.max(newSets.length, 1)) * 80),
      });

      const cardStats = await syncCardsForSet(set.id, 250, options);
      mergeStats(stats, cardStats);
      if (cardStats.stopped) {
        stats.stopped = true;
        break;
      }
    }

    persistFailedSetIds(stats.failedSetIds);
    recordFinalCounts(stats);
    stats.duration = Date.now() - startTime;
    reportProgress(options, {
      phase: stats.stopped ? 'stopped' : 'complete',
      message: stats.stopped ? 'New set sync stopped' : `Synced ${newSets.length} new set(s)`,
      cardsSynced: stats.cardsSynced,
      setsSynced: stats.setsSynced,
      percent: stats.stopped ? undefined : 100,
    });
    console.log(`[CardSync] New set sync complete: ${newSets.length} new set(s), ${stats.cardsSynced} cards in ${stats.duration}ms`);
  } catch (err) {
    console.error('[CardSync] Error during new set sync:', err);
    stats.setSyncFailed = true;
    recordFinalCounts(stats);
    stats.duration = Date.now() - startTime;
  }

  return stats;
}

/**
 * Synchronize cards for a specific set from the Pokémon TCG API.
 */
export async function syncCardsForSet(
  setId: string,
  pageSize: number = 250,
  options?: SyncOptions
): Promise<SyncStats> {
  const startTime = Date.now();
  const stats = createStats();

  console.log(`[CardSync] Starting card synchronization for set: ${setId}...`);

  try {
    let page = 1;
    let hasMore = true;
    let totalCardsInSet = 0;

    while (hasMore) {
      if (syncShouldStop(options)) {
        stats.stopped = true;
        console.log(`[CardSync] Stop requested before set ${setId} page ${page}`);
        break;
      }

      console.log(`[CardSync] Fetching page ${page} for set ${setId}...`);
      reportProgress(options, {
        phase: 'cards',
        message: `Fetching ${setId} page ${page}`,
        currentSetId: setId,
        currentPage: page,
        cardsSynced: stats.cardsSynced,
      });
      
      const result = await searchPokemonTcgSetCards(setId, {
        page,
        pageSize,
      });

      if (!result.success) {
        const reason = result.error || 'Unknown API error';
        console.warn(`[CardSync] Skipping set ${setId} page ${page}: ${reason}. It will be retried on a future sync.`);
        stats.failedSetIds.push(setId);
        hasMore = false;
        break;
      }

      if (result.cards.length === 0) {
        console.log(`[CardSync] No more cards for set ${setId} on page ${page}`);
        hasMore = false;
        break;
      }

      const dbManager = getDatabaseManager();
      const db = dbManager.readDb();

      if (!db) {
        console.error('[CardSync] Failed to read database');
        break;
      }

      // Initialize arrays if missing
      if (!db.cards) {
        db.cards = [];
      }
      if (!db.printings) {
        db.printings = [];
      }

      for (const card of result.cards) {
        const upsertResult = upsertCard(db, card, result.printings.filter(p => p.cardId === card.id));
        
        if (upsertResult.cardAction !== 'unchanged') {
          stats.cardsSynced++;
          if (upsertResult.cardAction === 'new') {
            stats.newCards++;
          } else {
            stats.updatedCards++;
          }
        }
        stats.newPrintings += upsertResult.newPrintings;
        stats.updatedPrintings += upsertResult.updatedPrintings;
        totalCardsInSet++;
      }

      // Update sync metadata
      db.syncMetadata = {
        ...db.syncMetadata,
        lastSyncTimestamp: new Date().toISOString(),
        lastSyncedSetId: setId,
        lastSyncedPage: page,
        totalCardsSynced: db.cards.length,
      };

      dbManager.writeDb(db);
      recordFinalCounts(stats);
      reportProgress(options, {
        phase: 'cards',
        message: `Cached ${totalCardsInSet} cards from ${setId}`,
        currentSetId: setId,
        currentPage: page,
        cardsSynced: stats.cardsSynced,
      });

      hasMore = result.cards.length === pageSize;
      page++;
    }

    recordFinalCounts(stats);
    stats.duration = Date.now() - startTime;
    console.log(`[CardSync] Card synchronization complete for set ${setId}: ${totalCardsInSet} cards in ${stats.duration}ms`);
  } catch (err) {
    console.error(`[CardSync] Error during card synchronization for set ${setId}:`, err);
    stats.failedSetIds.push(setId);
    recordFinalCounts(stats);
    stats.duration = Date.now() - startTime;
  }

  return stats;
}

/**
 * Synchronize all cards from all sets.
 * This is a full sync - for incremental sync, use syncCardsIncremental.
 */
export async function syncAllCards(options?: SyncOptions): Promise<SyncStats> {
  const startTime = Date.now();
  const totalStats = createStats();

  console.log('[CardSync] Starting full card synchronization...');

  try {
    const dbManager = getDatabaseManager();
    const db = dbManager.readDb();
    if (!db) {
      console.error('[CardSync] Failed to read database');
      return totalStats;
    }

    // Initialize sets array if missing
    if (!db.sets) {
      db.sets = [];
    }

    // Sync sets first to ensure we have all set metadata
    const setStats = await syncSets(options);
    totalStats.setsSynced = setStats.setsSynced;
    totalStats.newSets = setStats.newSets;
    totalStats.updatedSets = setStats.updatedSets;
    totalStats.changedSetIds = setStats.changedSetIds;
    totalStats.setSyncFailed = setStats.setSyncFailed;
    totalStats.stopped = setStats.stopped;

    if (totalStats.stopped || syncShouldStop(options)) {
      totalStats.stopped = true;
      recordFinalCounts(totalStats);
      totalStats.duration = Date.now() - startTime;
      reportProgress(options, {
        phase: 'stopped',
        message: 'Sync stopped after set metadata',
        cardsSynced: totalStats.cardsSynced,
        setsSynced: totalStats.setsSynced,
      });
      return totalStats;
    }

    if (setStats.setSyncFailed) {
      const latestDb = dbManager.readDb();
      const pendingFailedSetIds = Array.isArray(latestDb.syncMetadata?.failedSetIds)
        ? latestDb.syncMetadata.failedSetIds
        : [];
      if (pendingFailedSetIds.length === 0) {
        console.warn('[CardSync] Full card synchronization skipped because set metadata could not be fetched');
        recordFinalCounts(totalStats);
        totalStats.duration = Date.now() - startTime;
        return totalStats;
      }
      console.warn(`[CardSync] Set metadata fetch failed; retrying ${pendingFailedSetIds.length} previously failed sets only`);
    }

    // Sync cards for each set
    // For initial sync, sync all sets
    const latestDb = dbManager.readDb();
    const fullSyncSetIds = setStats.setSyncFailed && Array.isArray(latestDb.syncMetadata?.failedSetIds)
      ? new Set(latestDb.syncMetadata.failedSetIds)
      : null;
    const setsToSync = fullSyncSetIds
      ? (latestDb.sets || []).filter((set: CardSet) => fullSyncSetIds.has(set.id))
      : (latestDb.sets || []);

    for (const [idx, set] of setsToSync.entries()) {
      if (syncShouldStop(options)) {
        totalStats.stopped = true;
        break;
      }

      console.log(`[CardSync] Syncing cards for set: ${set.name} (${set.id})`);
      reportProgress(options, {
        phase: 'cards',
        message: `Syncing ${set.name}`,
        currentSetId: set.id,
        currentSetName: set.name,
        currentSetIndex: idx + 1,
        totalSets: setsToSync.length,
        cardsSynced: totalStats.cardsSynced,
        setsSynced: totalStats.setsSynced,
        percent: Math.round(20 + ((idx + 1) / Math.max(setsToSync.length, 1)) * 80),
      });
      const cardStats = await syncCardsForSet(set.id, 250, options);
      mergeStats(totalStats, cardStats);
      if (cardStats.stopped) {
        totalStats.stopped = true;
        break;
      }
    }

    persistFailedSetIds(totalStats.failedSetIds);
    recordFinalCounts(totalStats);
    totalStats.duration = Date.now() - startTime;
    reportProgress(options, {
      phase: totalStats.stopped ? 'stopped' : 'complete',
      message: totalStats.stopped ? 'Sync stopped' : 'Sync complete',
      cardsSynced: totalStats.cardsSynced,
      setsSynced: totalStats.setsSynced,
      percent: totalStats.stopped ? undefined : 100,
    });
    console.log(`[CardSync] Full card synchronization complete: ${totalStats.cardsSynced} cards across ${totalStats.setsSynced} sets in ${totalStats.duration}ms`);
  } catch (err) {
    console.error('[CardSync] Error during full card synchronization:', err);
  }

  return totalStats;
}

/**
 * Incremental sync - only sync sets that have changed since last sync.
 */
export async function syncIncremental(options?: SyncOptions): Promise<SyncStats> {
  const startTime = Date.now();
  const stats = createStats();

  console.log('[CardSync] Starting incremental synchronization...');

  try {
    const dbManager = getDatabaseManager();
    const db = dbManager.readDb();
    if (!db) {
      console.error('[CardSync] Failed to read database');
      return stats;
    }

    // Initialize syncMetadata if missing
    if (!db.syncMetadata) {
      db.syncMetadata = {
        lastSyncTimestamp: new Date(0).toISOString(),
        totalCardsSynced: 0,
        totalSetsSynced: 0,
      };
      dbManager.writeDb(db);
    }

    // Check if last sync was more than 7 days ago - if so, do full sync
    const lastSync = new Date(db.syncMetadata.lastSyncTimestamp);
    const daysSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceSync > 7 || !db.sets || db.sets.length === 0) {
      console.log(`[CardSync] Last sync was ${daysSinceSync.toFixed(1)} days ago or no sets exist, performing full sync`);
      return await syncAllCards(options);
    }

    // Sync sets to check for updates
    const setStats = await syncSets(options);
    stats.setsSynced = setStats.setsSynced;
    stats.newSets = setStats.newSets;
    stats.updatedSets = setStats.updatedSets;
    stats.changedSetIds = setStats.changedSetIds;
    stats.setSyncFailed = setStats.setSyncFailed;
    stats.stopped = setStats.stopped;

    if (stats.stopped || syncShouldStop(options)) {
      stats.stopped = true;
      recordFinalCounts(stats);
      stats.duration = Date.now() - startTime;
      reportProgress(options, {
        phase: 'stopped',
        message: 'Sync stopped after set metadata',
        cardsSynced: stats.cardsSynced,
        setsSynced: stats.setsSynced,
      });
      return stats;
    }

    const previouslyFailedSetIds = Array.isArray(db.syncMetadata.failedSetIds)
      ? db.syncMetadata.failedSetIds
      : [];

    // Sync updated sets and retry sets that failed in a previous run.
    console.log('[CardSync] Syncing cards for updated and previously failed sets...');
    const latestDb = dbManager.readDb();
    const setIdsToSync = new Set([...setStats.changedSetIds, ...previouslyFailedSetIds]);
    const setsToSync = latestDb.sets.filter((set: CardSet) => setIdsToSync.has(set.id));
    for (const [idx, set] of setsToSync.entries()) {
      if (syncShouldStop(options)) {
        stats.stopped = true;
        break;
      }

      reportProgress(options, {
        phase: 'cards',
        message: `Syncing ${set.name}`,
        currentSetId: set.id,
        currentSetName: set.name,
        currentSetIndex: idx + 1,
        totalSets: setsToSync.length,
        cardsSynced: stats.cardsSynced,
        setsSynced: stats.setsSynced,
        percent: Math.round(20 + ((idx + 1) / Math.max(setsToSync.length, 1)) * 80),
      });
      const cardStats = await syncCardsForSet(set.id, 250, options);
      mergeStats(stats, cardStats);
      if (cardStats.stopped) {
        stats.stopped = true;
        break;
      }
    }

    if (!setStats.setSyncFailed || previouslyFailedSetIds.length > 0 || stats.failedSetIds.length > 0) {
      persistFailedSetIds(stats.failedSetIds);
    }
    recordFinalCounts(stats);
    stats.duration = Date.now() - startTime;
    reportProgress(options, {
      phase: stats.stopped ? 'stopped' : 'complete',
      message: stats.stopped ? 'Sync stopped' : 'Sync complete',
      cardsSynced: stats.cardsSynced,
      setsSynced: stats.setsSynced,
      percent: stats.stopped ? undefined : 100,
    });
    console.log(`[CardSync] Incremental synchronization complete: ${stats.cardsSynced} cards, ${stats.setsSynced} sets in ${stats.duration}ms`);
  } catch (err) {
    console.error('[CardSync] Error during incremental synchronization:', err);
  }

  return stats;
}

/**
 * Get sync metadata for UI display.
 */
export function getSyncMetadata(): any {
  const dbManager = getDatabaseManager();
  return dbManager.getSyncMetadata();
}

/**
 * Main sync function - can be called from command line.
 */
export async function mainSync(forceFull: boolean = false) {
  console.log('='.repeat(60));
  console.log('Pokémon TCG Card Synchronization');
  console.log('='.repeat(60));

  const stats = forceFull ? await syncAllCards() : await syncIncremental();

  console.log('='.repeat(60));
  console.log('Synchronization Summary');
  console.log('='.repeat(60));
  console.log(`Sets synced: ${stats.setsSynced}`);
  console.log(`Cards synced: ${stats.cardsSynced}`);
  console.log(`New cards: ${stats.newCards}`);
  console.log(`Updated cards: ${stats.updatedCards}`);
  console.log(`New printings: ${stats.newPrintings}`);
  console.log(`Updated printings: ${stats.updatedPrintings}`);
  if (stats.setSyncFailed) {
    console.log('Set metadata fetch: failed, preserved existing SQLite state');
  }
  console.log(`Failed sets queued for retry: ${new Set(stats.failedSetIds).size}`);
  console.log(`New sets: ${stats.newSets}`);
  console.log(`Updated sets: ${stats.updatedSets}`);
  console.log(`Total cards in SQLite: ${stats.totalCards}`);
  console.log(`Total printings in SQLite: ${stats.totalPrintings}`);
  console.log(`Total sets in SQLite: ${stats.totalSets}`);
  console.log(`Duration: ${(stats.duration / 1000).toFixed(2)}s`);
  console.log('='.repeat(60));

  const metadata = getSyncMetadata();
  console.log('Current Database State');
  console.log('='.repeat(60));
  console.log(`Total cards: ${stats.totalCards}`);
  console.log(`Total printings: ${stats.totalPrintings}`);
  console.log(`Total sets: ${stats.totalSets}`);
  if (metadata?.lastSyncTimestamp) {
    console.log(`Last sync: ${new Date(metadata.lastSyncTimestamp).toLocaleString()}`);
  }
  if (Array.isArray(metadata?.failedSetIds) && metadata.failedSetIds.length > 0) {
    console.log(`Pending failed sets: ${metadata.failedSetIds.join(', ')}`);
  }
  console.log('='.repeat(60));
}

// Run if executed directly
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectCardSyncRun =
  entryPath.endsWith(`${path.sep}server${path.sep}cardSync.ts`) ||
  entryPath.endsWith(`${path.sep}server${path.sep}cardSync.js`);

if (isDirectCardSyncRun) {
  mainSync(process.argv.includes('--force')).catch(err => {
    console.error('[CardSync] Fatal error:', err);
    process.exit(1);
  });
}
