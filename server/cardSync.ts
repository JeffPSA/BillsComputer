import { config } from 'dotenv';
import { LogicalCard, CardPrinting, CardSet, PokemonTcgSet } from '../src/types/tcg';
import { fetchPokemonTcgSets, searchPokemonTcgSetCards, transformApiSetToSet } from './cardDataProvider';
import { getDatabaseManager } from './database/index';

// Load environment variables
config();

const POKEMON_TCG_API_BASE = 'https://api.pokemontcg.io/v2';

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
  duration: number;
}

type UpsertAction = 'new' | 'updated' | 'unchanged';

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
    duration: 0,
  };
}

function recordFinalCounts(stats: SyncStats): void {
  const dbStats = getDatabaseManager().getStats();
  stats.totalCards = dbStats.totalCards;
  stats.totalPrintings = dbStats.totalPrintings;
  stats.totalSets = dbStats.totalSets;
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
export async function syncSets(): Promise<SyncStats> {
  const startTime = Date.now();
  const stats = createStats();

  console.log('[CardSync] Starting set synchronization...');

  try {
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

    if (apiSets.length === 0 && db.sets.length > 0) {
      console.warn('[CardSync] Set synchronization skipped: API returned no sets; preserving existing set metadata and sync timestamp');
      recordFinalCounts(stats);
      stats.duration = Date.now() - startTime;
      return stats;
    }

    for (const apiSet of apiSets) {
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
  }

  return stats;
}

/**
 * Synchronize cards for a specific set from the Pokémon TCG API.
 */
export async function syncCardsForSet(
  setId: string,
  pageSize: number = 250
): Promise<SyncStats> {
  const startTime = Date.now();
  const stats = createStats();

  console.log(`[CardSync] Starting card synchronization for set: ${setId}...`);

  try {
    let page = 1;
    let hasMore = true;
    let totalCardsInSet = 0;

    while (hasMore) {
      console.log(`[CardSync] Fetching page ${page} for set ${setId}...`);
      
      const result = await searchPokemonTcgSetCards(setId, {
        page,
        pageSize,
      });

      if (!result.success || result.cards.length === 0) {
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

      hasMore = result.cards.length === pageSize;
      page++;
    }

    stats.duration = Date.now() - startTime;
    console.log(`[CardSync] Card synchronization complete for set ${setId}: ${totalCardsInSet} cards in ${stats.duration}ms`);
  } catch (err) {
    console.error(`[CardSync] Error during card synchronization for set ${setId}:`, err);
  }

  return stats;
}

/**
 * Synchronize all cards from all sets.
 * This is a full sync - for incremental sync, use syncCardsIncremental.
 */
export async function syncAllCards(): Promise<SyncStats> {
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
    const setStats = await syncSets();
    totalStats.setsSynced = setStats.setsSynced;
    totalStats.newSets = setStats.newSets;
    totalStats.updatedSets = setStats.updatedSets;
    totalStats.changedSetIds = setStats.changedSetIds;

    // Sync cards for each set
    // For initial sync, sync all sets
    const latestDb = dbManager.readDb();
    for (const set of latestDb.sets || []) {
      console.log(`[CardSync] Syncing cards for set: ${set.name} (${set.id})`);
      const cardStats = await syncCardsForSet(set.id);
      totalStats.cardsSynced += cardStats.cardsSynced;
      totalStats.newCards += cardStats.newCards;
      totalStats.updatedCards += cardStats.updatedCards;
      totalStats.newPrintings += cardStats.newPrintings;
      totalStats.updatedPrintings += cardStats.updatedPrintings;
    }

    recordFinalCounts(totalStats);
    totalStats.duration = Date.now() - startTime;
    console.log(`[CardSync] Full card synchronization complete: ${totalStats.cardsSynced} cards across ${totalStats.setsSynced} sets in ${totalStats.duration}ms`);
  } catch (err) {
    console.error('[CardSync] Error during full card synchronization:', err);
  }

  return totalStats;
}

/**
 * Incremental sync - only sync sets that have changed since last sync.
 */
export async function syncIncremental(): Promise<SyncStats> {
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
      return await syncAllCards();
    }

    // Sync sets to check for updates
    const setStats = await syncSets();
    stats.setsSynced = setStats.setsSynced;
    stats.newSets = setStats.newSets;
    stats.updatedSets = setStats.updatedSets;
    stats.changedSetIds = setStats.changedSetIds;

    // Only sync cards for sets that were updated
    console.log('[CardSync] Syncing cards for updated sets...');
    const latestDb = dbManager.readDb();
    const setsToSync = latestDb.sets.filter((set: CardSet) => setStats.changedSetIds.includes(set.id));
    for (const set of setsToSync) {
      const cardStats = await syncCardsForSet(set.id);
      stats.cardsSynced += cardStats.cardsSynced;
      stats.newCards += cardStats.newCards;
      stats.updatedCards += cardStats.updatedCards;
      stats.newPrintings += cardStats.newPrintings;
      stats.updatedPrintings += cardStats.updatedPrintings;
    }

    recordFinalCounts(stats);
    stats.duration = Date.now() - startTime;
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
  console.log('='.repeat(60));
}

// Run if executed directly
mainSync(process.argv.includes('--force')).catch(err => {
  console.error('[CardSync] Fatal error:', err);
  process.exit(1);
});
