import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';
import { createSchema } from './schema';
import {
  LogicalCard,
  CardPrinting,
  CardSet,
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
  WishlistItem,
  StoreProfile,
  Acquisition
} from '../../src/types/tcg';

// Load environment variables
config();

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'cards.db');

const PRINTING_COLUMNS = [
  'id',
  'cardId',
  'cardName',
  'setCode',
  'setName',
  'cardNumber',
  'rarity',
  'variant',
  'language',
  'imageUrl',
  'marketPrice',
  'attacks',
  'abilities',
  'weaknesses',
  'resistances',
  'retreatCost',
  'nationalPokedexNumbers',
  'regulationMark',
  'legalities',
  'artist',
  'imageUrlSmall',
  'imageUrlLarge',
] as const;

const PRINTING_INSERT_SQL = `
  INSERT INTO printings (${PRINTING_COLUMNS.join(', ')})
  VALUES (${PRINTING_COLUMNS.map(() => '?').join(', ')})
  ON CONFLICT(id) DO UPDATE SET
    cardId = excluded.cardId,
    cardName = excluded.cardName,
    setCode = excluded.setCode,
    setName = excluded.setName,
    cardNumber = excluded.cardNumber,
    rarity = excluded.rarity,
    variant = excluded.variant,
    language = excluded.language,
    imageUrl = excluded.imageUrl,
    marketPrice = excluded.marketPrice,
    attacks = excluded.attacks,
    abilities = excluded.abilities,
    weaknesses = excluded.weaknesses,
    resistances = excluded.resistances,
    retreatCost = excluded.retreatCost,
    nationalPokedexNumbers = excluded.nationalPokedexNumbers,
    regulationMark = excluded.regulationMark,
    legalities = excluded.legalities,
    artist = excluded.artist,
    imageUrlSmall = excluded.imageUrlSmall,
    imageUrlLarge = excluded.imageUrlLarge
`;

function getPrintingValues(printing: CardPrinting): unknown[] {
  return [
    printing.id,
    printing.cardId,
    printing.cardName,
    printing.setCode,
    printing.setName,
    printing.cardNumber,
    printing.rarity,
    printing.variant,
    printing.language,
    printing.imageUrl,
    printing.marketPrice,
    JSON.stringify(printing.attacks || []),
    JSON.stringify(printing.abilities || []),
    JSON.stringify(printing.weaknesses || []),
    JSON.stringify(printing.resistances || []),
    typeof printing.retreatCost === 'number' ? printing.retreatCost : null,
    JSON.stringify(printing.nationalPokedexNumbers || []),
    printing.regulationMark ?? null,
    JSON.stringify(printing.legalities || {}),
    printing.artist ?? null,
    printing.imageUrlSmall ?? null,
    printing.imageUrlLarge ?? null,
  ];
}

function assertPrintingInsertAligned(db: Database.Database): void {
  const schemaColumns = db.prepare('PRAGMA table_info(printings)').all() as { name: string }[];
  const actualColumns = schemaColumns.map((column) => column.name);
  const expectedColumns = [...PRINTING_COLUMNS];
  const placeholders = (PRINTING_INSERT_SQL.match(/\?/g) || []).length;

  if (
    actualColumns.length !== expectedColumns.length ||
    actualColumns.some((column, index) => column !== expectedColumns[index])
  ) {
    throw new Error(
      `[Database] printings schema mismatch. Expected ${expectedColumns.join(', ')}, got ${actualColumns.join(', ')}`
    );
  }

  if (placeholders !== expectedColumns.length) {
    throw new Error(
      `[Database] printings insert mismatch. ${placeholders} values for ${expectedColumns.length} columns`
    );
  }
}

/**
 * Parse embedded timestamp from allocation ids shaped like `alloc_<ts>_<rand>`.
 * Non-parsing ids are treated as timestamp 0.
 */
function allocationIdTimestamp(id: string): number {
  if (!id || !id.startsWith('alloc_') || id.length < 20) {
    return 0;
  }
  const ts = Number(id.substring(6, 19));
  return Number.isFinite(ts) ? ts : 0;
}

interface CardSearchOptions {
  query?: string;
  supertype?: string;
  setCode?: string;
  page?: number;
  pageSize?: number;
}

interface StoredAcquisition extends Acquisition {
  cardId: string;
  totalCost: number;
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeSearchText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/['’'"`]/g, '')
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dedupe allocations by (deckId, requirementId, collectionItemId), keeping the newest row
 * (highest embedded timestamp in id; ties broken by id DESC). Does NOT sum quantities —
 * duplicate rows are duplicate representations of the same logical allocation.
 * Then creates UNIQUE index idx_allocations_identity. Safe to run more than once.
 */
export function migrateAllocationUniqueness(db: Database.Database): void {
  const rows = db
    .prepare(
      `SELECT id, deckId, requirementId, collectionItemId, quantity, isLocked FROM allocations`
    )
    .all() as {
    id: string;
    deckId: string;
    requirementId: string;
    collectionItemId: string;
    quantity: number;
    isLocked: number;
  }[];

  // Group by identity and pick keep-set (newest)
  const bestByIdentity = new Map<
    string,
    { id: string; ts: number; quantity: number; isLocked: number }
  >();

  for (const row of rows) {
    const key = `${row.deckId}|${row.requirementId}|${row.collectionItemId}`;
    const ts = allocationIdTimestamp(row.id);
    const existing = bestByIdentity.get(key);
    if (
      !existing ||
      ts > existing.ts ||
      (ts === existing.ts && row.id > existing.id)
    ) {
      bestByIdentity.set(key, {
        id: row.id,
        ts,
        quantity: row.quantity,
        isLocked: row.isLocked,
      });
    }
  }

  const keepIds = new Set([...bestByIdentity.values()].map((v) => v.id));

  // Verify post-dedupe physical/requirement invariants (warn, do not block)
  const collectionItems = db
    .prepare(`SELECT id, quantity FROM collection_items`)
    .all() as { id: string; quantity: number }[];
  const requirements = db
    .prepare(`SELECT id, quantity FROM deck_requirements`)
    .all() as { id: string; quantity: number }[];

  const keptRows = rows.filter((r) => keepIds.has(r.id));

  for (const item of collectionItems) {
    const sum = keptRows
      .filter((r) => r.collectionItemId === item.id)
      .reduce((s, r) => s + r.quantity, 0);
    if (sum > item.quantity) {
      console.warn(
        `[Database] Post-dedupe invariant warning: collectionItem ${item.id} allocated ${sum} > quantity ${item.quantity}`
      );
    }
  }

  for (const req of requirements) {
    const sum = keptRows
      .filter((r) => r.requirementId === req.id)
      .reduce((s, r) => s + r.quantity, 0);
    if (sum > req.quantity) {
      console.warn(
        `[Database] Post-dedupe invariant warning: requirement ${req.id} allocated ${sum} > quantity ${req.quantity}`
      );
    }
  }

  const toDelete = rows.filter((r) => !keepIds.has(r.id));
  if (toDelete.length > 0) {
    const deleteStmt = db.prepare(`DELETE FROM allocations WHERE id = ?`);
    const deleteMany = db.transaction((ids: string[]) => {
      for (const id of ids) {
        deleteStmt.run(id);
      }
    });
    deleteMany(toDelete.map((r) => r.id));
    console.log(
      `[Database] Allocation uniqueness migration: deleted ${toDelete.length} duplicate row(s), kept ${keepIds.size}`
    );
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_allocations_identity
    ON allocations(deckId, requirementId, collectionItemId)
  `);
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  /** Expose raw SQLite handle for migrations/tests. */
  getRawDb(): Database.Database {
    return this.db;
  }

  async backup(destinationFile: string): Promise<Database.BackupMetadata> {
    return this.db.backup(destinationFile);
  }

  private initialize(): void {
    createSchema(this.db);
    assertPrintingInsertAligned(this.db);
    this.migrateAllocations();
    migrateAllocationUniqueness(this.db);
    console.log('[Database] SQLite database initialized');
  }

  /**
   * Migrate allocations table from old schema (cardId, printingId) to new schema (collectionItemId, requirementId, isLocked)
   * This migration deletes all existing allocation rows since requirementId cannot be reliably recovered.
   */
  private migrateAllocations(): void {
    const tableInfo = this.db.prepare('PRAGMA table_info(allocations)').all() as { name: string }[];
    const columnNames = tableInfo.map(col => col.name);

    // Check if old schema exists (has cardId column)
    const hasOldSchema = columnNames.includes('cardId');

    if (hasOldSchema) {
      // Count existing rows before deletion
      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM allocations').get() as { count: number };
      const deletedCount = countResult.count;

      // Delete all existing allocation rows (per user decision)
      this.db.prepare('DELETE FROM allocations').run();

      // Recreate table with new schema
      this.db.exec('DROP TABLE IF EXISTS allocations');
      this.db.exec(`
        CREATE TABLE allocations (
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

      // Recreate indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_allocations_deckId ON allocations(deckId)');
      this.db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_allocations_identity ON allocations(deckId, requirementId, collectionItemId)'
      );

      console.log(`[Database] Migration: Deleted ${deletedCount} legacy allocation rows and updated schema`);
    } else {
      // Check if new columns exist, add them if not (for safety)
      if (!columnNames.includes('collectionItemId')) {
        this.db.exec('ALTER TABLE allocations ADD COLUMN collectionItemId TEXT NOT NULL');
      }
      if (!columnNames.includes('requirementId')) {
        this.db.exec('ALTER TABLE allocations ADD COLUMN requirementId TEXT NOT NULL');
      }
      if (!columnNames.includes('isLocked')) {
        this.db.exec('ALTER TABLE allocations ADD COLUMN isLocked INTEGER DEFAULT 0');
      }
    }
  }

  private parseCardRow(row: any): LogicalCard {
    return {
      ...row,
      types: parseJsonField(row.types, []),
      rules: parseJsonField(row.rules, []),
      isAceSpec: Boolean(row.isAceSpec),
    };
  }

  private parsePrintingRow(row: any): CardPrinting {
    return {
      ...row,
      attacks: parseJsonField(row.attacks, []),
      abilities: parseJsonField(row.abilities, []),
      weaknesses: parseJsonField(row.weaknesses, []),
      resistances: parseJsonField(row.resistances, []),
      nationalPokedexNumbers: parseJsonField(row.nationalPokedexNumbers, []),
      legalities: parseJsonField(row.legalities, {}),
    };
  }

  private attachPrintings(cards: LogicalCard[], printings: CardPrinting[]): LogicalCard[] {
    const printingsByCardId = new Map<string, CardPrinting[]>();
    for (const printing of printings) {
      const current = printingsByCardId.get(printing.cardId) || [];
      current.push(printing);
      printingsByCardId.set(printing.cardId, current);
    }

    return cards.map((card) => ({
      ...card,
      printings: printingsByCardId.get(card.id) || [],
    }));
  }

  private parseAllocationRow(row: any): Allocation {
    return {
      ...row,
      isLocked: Boolean(row.isLocked),
    };
  }

  private parseStoreProfileRow(row: any): StoreProfile {
    return {
      ...row,
      isDefault: Boolean(row.isDefault),
      categories: parseJsonField(row.categories, []),
      overrides: parseJsonField(row.overrides, []),
    };
  }

  private selectCardsByIds(cardIds: string[]): LogicalCard[] {
    if (cardIds.length === 0) return [];
    const placeholders = cardIds.map(() => '?').join(', ');
    return (
      this.db.prepare(`SELECT * FROM cards WHERE id IN (${placeholders})`).all(...cardIds) as any[]
    ).map((row) => this.parseCardRow(row));
  }

  private selectPrintingsByIds(printingIds: string[]): CardPrinting[] {
    if (printingIds.length === 0) return [];
    const placeholders = printingIds.map(() => '?').join(', ');
    return (
      this.db.prepare(`SELECT * FROM printings WHERE id IN (${placeholders})`).all(...printingIds) as any[]
    ).map((row) => this.parsePrintingRow(row));
  }

  getCollectionContext(): {
    collectionItems: CollectionItem[];
    cards: LogicalCard[];
    printings: CardPrinting[];
    decks: Deck[];
    allocations: Allocation[];
  } {
    const collectionItems = this.db.prepare('SELECT * FROM collection_items').all() as CollectionItem[];
    const decks = this.db.prepare('SELECT * FROM decks').all() as Deck[];
    const allocations = (this.db.prepare('SELECT * FROM allocations').all() as any[]).map((row) =>
      this.parseAllocationRow(row)
    );
    const cardIds = [...new Set(collectionItems.map((item) => item.cardId).filter(Boolean))];
    const printingIds = [...new Set(collectionItems.map((item) => item.printingId).filter(Boolean))];

    return {
      collectionItems,
      cards: this.selectCardsByIds(cardIds),
      printings: this.selectPrintingsByIds(printingIds),
      decks,
      allocations,
    };
  }

  getDeckContext(): {
    decks: Deck[];
    deckRequirements: DeckRequirement[];
    collectionItems: CollectionItem[];
    allocations: Allocation[];
    cards: LogicalCard[];
    printings: CardPrinting[];
  } {
    const decks = this.db.prepare('SELECT * FROM decks').all() as Deck[];
    const deckRequirements = this.db.prepare('SELECT * FROM deck_requirements').all() as DeckRequirement[];
    const collectionItems = this.db.prepare('SELECT * FROM collection_items').all() as CollectionItem[];
    const allocations = (this.db.prepare('SELECT * FROM allocations').all() as any[]).map((row) =>
      this.parseAllocationRow(row)
    );
    const cardIds = [...new Set(deckRequirements.map((req) => req.cardId).filter(Boolean))];
    const cards = this.selectCardsByIds(cardIds);
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const printingIds = [
      ...new Set(
        deckRequirements
          .map((req) => req.preferredPrintingId || cardsById.get(req.cardId)?.defaultPrintingId)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    return {
      decks,
      deckRequirements,
      collectionItems,
      allocations,
      cards,
      printings: this.selectPrintingsByIds(printingIds),
    };
  }

  getAllocationContext(): {
    collectionItems: CollectionItem[];
    decks: Deck[];
    deckRequirements: DeckRequirement[];
    allocations: Allocation[];
  } {
    const collectionItems = this.db.prepare('SELECT * FROM collection_items').all() as CollectionItem[];
    const decks = this.db.prepare('SELECT * FROM decks').all() as Deck[];
    const deckRequirements = this.db.prepare('SELECT * FROM deck_requirements').all() as DeckRequirement[];
    const allocations = (this.db.prepare('SELECT * FROM allocations').all() as any[]).map((row) =>
      this.parseAllocationRow(row)
    );

    return {
      collectionItems,
      decks,
      deckRequirements,
      allocations,
    };
  }

  getCardById(cardId: string): LogicalCard | null {
    const row = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as any | undefined;
    return row ? this.parseCardRow(row) : null;
  }

  replaceCollectionItemsAndAllocations(
    collectionItems: CollectionItem[],
    allocations: Allocation[]
  ): void {
    const transaction = this.db.transaction(() => {
      const incomingCollectionIds = new Set(collectionItems.map((item) => item.id));
      const existingCollectionIds = (
        this.db.prepare('SELECT id FROM collection_items').all() as { id: string }[]
      ).map((row) => row.id);
      const deleteCollectionItem = this.db.prepare('DELETE FROM collection_items WHERE id = ?');
      const upsertCollectionItem = this.db.prepare(`
        INSERT INTO collection_items (id, cardId, printingId, quantity, condition, language, acquisitionSource, acquisitionDate, acquisitionCost, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          cardId = excluded.cardId,
          printingId = excluded.printingId,
          quantity = excluded.quantity,
          condition = excluded.condition,
          language = excluded.language,
          acquisitionSource = excluded.acquisitionSource,
          acquisitionDate = excluded.acquisitionDate,
          acquisitionCost = excluded.acquisitionCost,
          notes = excluded.notes
      `);

      for (const existingId of existingCollectionIds) {
        if (!incomingCollectionIds.has(existingId)) {
          deleteCollectionItem.run(existingId);
        }
      }

      for (const item of collectionItems) {
        upsertCollectionItem.run(
          item.id,
          item.cardId,
          item.printingId,
          item.quantity,
          item.condition,
          item.language,
          item.acquisitionSource,
          item.acquisitionDate,
          item.acquisitionCost,
          item.notes
        );
      }

      const incomingAllocationIds = new Set(allocations.map((allocation) => allocation.id));
      const existingAllocationIds = (
        this.db.prepare('SELECT id FROM allocations').all() as { id: string }[]
      ).map((row) => row.id);
      const deleteAllocation = this.db.prepare('DELETE FROM allocations WHERE id = ?');
      const upsertAllocation = this.db.prepare(`
        INSERT INTO allocations (id, deckId, collectionItemId, requirementId, quantity, isLocked)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          deckId = excluded.deckId,
          collectionItemId = excluded.collectionItemId,
          requirementId = excluded.requirementId,
          quantity = excluded.quantity,
          isLocked = excluded.isLocked
      `);

      for (const existingId of existingAllocationIds) {
        if (!incomingAllocationIds.has(existingId)) {
          deleteAllocation.run(existingId);
        }
      }

      for (const allocation of allocations) {
        upsertAllocation.run(
          allocation.id,
          allocation.deckId,
          allocation.collectionItemId,
          allocation.requirementId,
          allocation.quantity,
          allocation.isLocked ? 1 : 0
        );
      }
    });

    transaction();
  }

  saveAcquisitionCollectionAndAllocations(
    acquisition: StoredAcquisition,
    collectionItems: CollectionItem[],
    allocations: Allocation[]
  ): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO acquisitions (id, cardId, printingId, quantity, source, method, costPerUnit, totalCost, date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          cardId = excluded.cardId,
          printingId = excluded.printingId,
          quantity = excluded.quantity,
          source = excluded.source,
          method = excluded.method,
          costPerUnit = excluded.costPerUnit,
          totalCost = excluded.totalCost,
          date = excluded.date,
          notes = excluded.notes
      `).run(
        acquisition.id,
        acquisition.cardId,
        acquisition.printingId,
        acquisition.quantity,
        acquisition.source,
        acquisition.method,
        acquisition.costPerUnit,
        acquisition.totalCost,
        acquisition.date,
        acquisition.notes
      );

      const incomingCollectionIds = new Set(collectionItems.map((item) => item.id));
      const existingCollectionIds = (
        this.db.prepare('SELECT id FROM collection_items').all() as { id: string }[]
      ).map((row) => row.id);
      const deleteCollectionItem = this.db.prepare('DELETE FROM collection_items WHERE id = ?');
      const upsertCollectionItem = this.db.prepare(`
        INSERT INTO collection_items (id, cardId, printingId, quantity, condition, language, acquisitionSource, acquisitionDate, acquisitionCost, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          cardId = excluded.cardId,
          printingId = excluded.printingId,
          quantity = excluded.quantity,
          condition = excluded.condition,
          language = excluded.language,
          acquisitionSource = excluded.acquisitionSource,
          acquisitionDate = excluded.acquisitionDate,
          acquisitionCost = excluded.acquisitionCost,
          notes = excluded.notes
      `);

      for (const existingId of existingCollectionIds) {
        if (!incomingCollectionIds.has(existingId)) {
          deleteCollectionItem.run(existingId);
        }
      }

      for (const item of collectionItems) {
        upsertCollectionItem.run(
          item.id,
          item.cardId,
          item.printingId,
          item.quantity,
          item.condition,
          item.language,
          item.acquisitionSource,
          item.acquisitionDate,
          item.acquisitionCost,
          item.notes
        );
      }

      const incomingAllocationIds = new Set(allocations.map((allocation) => allocation.id));
      const existingAllocationIds = (
        this.db.prepare('SELECT id FROM allocations').all() as { id: string }[]
      ).map((row) => row.id);
      const deleteAllocation = this.db.prepare('DELETE FROM allocations WHERE id = ?');
      const upsertAllocation = this.db.prepare(`
        INSERT INTO allocations (id, deckId, collectionItemId, requirementId, quantity, isLocked)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          deckId = excluded.deckId,
          collectionItemId = excluded.collectionItemId,
          requirementId = excluded.requirementId,
          quantity = excluded.quantity,
          isLocked = excluded.isLocked
      `);

      for (const existingId of existingAllocationIds) {
        if (!incomingAllocationIds.has(existingId)) {
          deleteAllocation.run(existingId);
        }
      }

      for (const allocation of allocations) {
        upsertAllocation.run(
          allocation.id,
          allocation.deckId,
          allocation.collectionItemId,
          allocation.requirementId,
          allocation.quantity,
          allocation.isLocked ? 1 : 0
        );
      }
    });

    transaction();
  }

  replaceAllocations(allocations: Allocation[]): void {
    const transaction = this.db.transaction(() => {
      const incomingIds = new Set(allocations.map((allocation) => allocation.id));
      const existingIds = (
        this.db.prepare('SELECT id FROM allocations').all() as { id: string }[]
      ).map((row) => row.id);
      const deleteStmt = this.db.prepare('DELETE FROM allocations WHERE id = ?');
      const upsertStmt = this.db.prepare(`
        INSERT INTO allocations (id, deckId, collectionItemId, requirementId, quantity, isLocked)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          deckId = excluded.deckId,
          collectionItemId = excluded.collectionItemId,
          requirementId = excluded.requirementId,
          quantity = excluded.quantity,
          isLocked = excluded.isLocked
      `);

      for (const existingId of existingIds) {
        if (!incomingIds.has(existingId)) {
          deleteStmt.run(existingId);
        }
      }

      for (const allocation of allocations) {
        upsertStmt.run(
          allocation.id,
          allocation.deckId,
          allocation.collectionItemId,
          allocation.requirementId,
          allocation.quantity,
          allocation.isLocked ? 1 : 0
        );
      }
    });

    transaction();
  }

  saveDeckWithRequirements(
    deck: Deck,
    requirements: DeckRequirement[] | undefined,
    allocations: Allocation[]
  ): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO decks (id, name, version, format, status, isPermanentlyAssembled, notes, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          version = excluded.version,
          format = excluded.format,
          status = excluded.status,
          isPermanentlyAssembled = excluded.isPermanentlyAssembled,
          notes = excluded.notes,
          updatedAt = excluded.updatedAt
      `).run(
        deck.id,
        deck.name,
        deck.version,
        deck.format,
        deck.status,
        deck.isPermanentlyAssembled ? 1 : 0,
        deck.notes,
        deck.updatedAt
      );

      if (requirements !== undefined) {
        this.db.prepare('DELETE FROM deck_requirements WHERE deckId = ?').run(deck.id);
        const insertRequirement = this.db.prepare(`
          INSERT INTO deck_requirements (id, deckId, cardId, quantity, requirementMode)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const requirement of requirements) {
          insertRequirement.run(
            requirement.id,
            requirement.deckId,
            requirement.cardId,
            requirement.quantity,
            requirement.requirementMode
          );
        }
      }

      const incomingIds = new Set(allocations.map((allocation) => allocation.id));
      const existingIds = (
        this.db.prepare('SELECT id FROM allocations').all() as { id: string }[]
      ).map((row) => row.id);
      const deleteAllocation = this.db.prepare('DELETE FROM allocations WHERE id = ?');
      const upsertAllocation = this.db.prepare(`
        INSERT INTO allocations (id, deckId, collectionItemId, requirementId, quantity, isLocked)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          deckId = excluded.deckId,
          collectionItemId = excluded.collectionItemId,
          requirementId = excluded.requirementId,
          quantity = excluded.quantity,
          isLocked = excluded.isLocked
      `);

      for (const existingId of existingIds) {
        if (!incomingIds.has(existingId)) {
          deleteAllocation.run(existingId);
        }
      }

      for (const allocation of allocations) {
        upsertAllocation.run(
          allocation.id,
          allocation.deckId,
          allocation.collectionItemId,
          allocation.requirementId,
          allocation.quantity,
          allocation.isLocked ? 1 : 0
        );
      }
    });

    transaction();
  }

  deleteDeckById(deckId: string): { deleted: boolean } {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM allocations WHERE deckId = ?').run(deckId);
      this.db.prepare('DELETE FROM deck_requirements WHERE deckId = ?').run(deckId);
      const result = this.db.prepare('DELETE FROM decks WHERE id = ?').run(deckId);
      return result.changes > 0;
    });

    return { deleted: transaction() };
  }

  getStoreProfiles(): StoreProfile[] {
    return (this.db.prepare('SELECT * FROM store_profiles').all() as any[]).map((row) =>
      this.parseStoreProfileRow(row)
    );
  }

  replaceStoreProfiles(storeProfiles: StoreProfile[]): void {
    const transaction = this.db.transaction(() => {
      const incomingIds = new Set(storeProfiles.map((profile) => profile.id));
      const existingIds = (
        this.db.prepare('SELECT id FROM store_profiles').all() as { id: string }[]
      ).map((row) => row.id);
      const deleteProfile = this.db.prepare('DELETE FROM store_profiles WHERE id = ?');
      const upsertProfile = this.db.prepare(`
        INSERT INTO store_profiles (id, name, isDefault, categories, overrides)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          isDefault = excluded.isDefault,
          categories = excluded.categories,
          overrides = excluded.overrides
      `);

      for (const existingId of existingIds) {
        if (!incomingIds.has(existingId)) {
          deleteProfile.run(existingId);
        }
      }

      for (const profile of storeProfiles) {
        upsertProfile.run(
          profile.id,
          profile.name,
          profile.isDefault ? 1 : 0,
          JSON.stringify(profile.categories || []),
          JSON.stringify(profile.overrides || [])
        );
      }
    });

    transaction();
  }

  getCardsWithPrintings(limit?: number): LogicalCard[] {
    const cardRows = (limit && limit > 0)
      ? this.db.prepare('SELECT * FROM cards ORDER BY name COLLATE NOCASE LIMIT ?').all(limit) as any[]
      : this.db.prepare('SELECT * FROM cards ORDER BY name COLLATE NOCASE').all() as any[];
    const cards = cardRows.map((row) => this.parseCardRow(row));
    if (cards.length === 0) return [];

    const cardIds = cards.map((card) => card.id);
    const placeholders = cardIds.map(() => '?').join(', ');
    const printings = (
      this.db
        .prepare(`SELECT * FROM printings WHERE cardId IN (${placeholders}) ORDER BY setName COLLATE NOCASE, cardNumber`)
        .all(...cardIds) as any[]
    ).map((row) => this.parsePrintingRow(row));

    return this.attachPrintings(cards, printings);
  }

  searchCardsWithPrintings(options: CardSearchOptions): { cards: LogicalCard[]; totalCount: number } {
    const page = Math.max(1, Number(options.page || 1));
    const pageSize = Math.max(1, Math.min(250, Number(options.pageSize || 30)));
    const offset = (page - 1) * pageSize;
    const normalizedQuery = normalizeSearchText(options.query || '');
    const tokens = normalizedQuery ? normalizedQuery.split(/\s+/) : [];

    const where: string[] = [];
    const params: unknown[] = [];
    const normalizedCardNameSql = `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(c.name, '''', ''), '’', ''), '"', ''), '#', ''))`;

    if (options.supertype && options.supertype !== 'ALL') {
      where.push('c.supertype = ?');
      params.push(options.supertype);
    }

    if (options.setCode && options.setCode !== 'ALL') {
      where.push('UPPER(p.setCode) = UPPER(?)');
      params.push(options.setCode);
    }

    for (const token of tokens) {
      const likeToken = `%${token}%`;
      where.push(`
        (
          ${normalizedCardNameSql} LIKE ?
          OR LOWER(c.supertype) LIKE ?
          OR LOWER(c.subtype) LIKE ?
          OR LOWER(COALESCE(c.types, '')) LIKE ?
          OR LOWER(COALESCE(c.rules, '')) LIKE ?
          OR LOWER(p.setCode) LIKE ?
          OR LOWER(p.setName) LIKE ?
          OR LOWER(REPLACE(p.cardNumber, '#', '')) = ?
          OR LOWER(p.rarity) LIKE ?
          OR LOWER(p.variant) LIKE ?
          OR LOWER(COALESCE(p.artist, '')) LIKE ?
        )
      `);
      params.push(
        likeToken,
        likeToken,
        likeToken,
        likeToken,
        likeToken,
        likeToken,
        likeToken,
        token,
        likeToken,
        likeToken,
        likeToken
      );
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const fromSql = 'FROM cards c LEFT JOIN printings p ON p.cardId = c.id';
    const totalRow = this.db
      .prepare(`SELECT COUNT(DISTINCT c.id) as count ${fromSql} ${whereSql}`)
      .get(...params) as { count: number };
    const orderParams: unknown[] = [];
    const orderSql = tokens.length > 0
      ? `
        ORDER BY
          CASE
            WHEN ${normalizedCardNameSql} = ? THEN 0
            WHEN ${normalizedCardNameSql} LIKE ? THEN 1
            WHEN ${tokens.map(() => `${normalizedCardNameSql} LIKE ?`).join(' AND ')} THEN 2
            ELSE 3
          END,
          c.name COLLATE NOCASE
      `
      : 'ORDER BY c.name COLLATE NOCASE';

    if (tokens.length > 0) {
      orderParams.push(normalizedQuery, `${normalizedQuery}%`, ...tokens.map((token) => `%${token}%`));
    }

    const idRows = this.db
      .prepare(`
        SELECT DISTINCT c.id, c.name
        ${fromSql}
        ${whereSql}
        ${orderSql}
        LIMIT ? OFFSET ?
      `)
      .all(...params, ...orderParams, pageSize, offset) as { id: string }[];

    const cardIds = idRows.map((row) => row.id);
    if (cardIds.length === 0) {
      return { cards: [], totalCount: totalRow.count };
    }

    const placeholders = cardIds.map(() => '?').join(', ');
    const cardRows = this.db
      .prepare(`SELECT * FROM cards WHERE id IN (${placeholders})`)
      .all(...cardIds) as any[];
    const printings = (
      this.db
        .prepare(`SELECT * FROM printings WHERE cardId IN (${placeholders}) ORDER BY setName COLLATE NOCASE, cardNumber`)
        .all(...cardIds) as any[]
    ).map((row) => this.parsePrintingRow(row));

    const cardById = new Map(cardRows.map((row) => [row.id, this.parseCardRow(row)]));
    const orderedCards = cardIds
      .map((id) => cardById.get(id))
      .filter((card): card is LogicalCard => Boolean(card));

    return {
      cards: this.attachPrintings(orderedCards, printings),
      totalCount: totalRow.count,
    };
  }

  /**
   * Read all data from database and return in JSON-like structure
   * Compatible with existing readDb() function in server.ts
   */
  readDb(): any {
    const cards = this.db.prepare('SELECT * FROM cards').all() as any[];
    const printings = this.db.prepare('SELECT * FROM printings').all() as any[];
    const sets = this.db.prepare('SELECT * FROM sets').all() as any[];
    const collectionItems = this.db.prepare('SELECT * FROM collection_items').all() as any[];
    const decks = this.db.prepare('SELECT * FROM decks').all() as any[];
    const deckRequirements = this.db.prepare('SELECT * FROM deck_requirements').all() as any[];
    const allocations = this.db.prepare('SELECT * FROM allocations').all() as any[];
    const wishlistItems = this.db.prepare('SELECT * FROM wishlist_items').all() as any[];
    const storeProfiles = this.db.prepare('SELECT * FROM store_profiles').all() as any[];
    const acquisitions = this.db.prepare('SELECT * FROM acquisitions').all() as any[];
    
    // Parse JSON fields
    const syncMetadataRows = this.db.prepare('SELECT * FROM sync_metadata').all() as any[];
    const syncMetadata: any = {};
    for (const row of syncMetadataRows) {
      syncMetadata[row.key] = JSON.parse(row.value);
    }

    // Parse JSON arrays/objects for complex fields
    for (const card of cards) {
      if (card.types) card.types = JSON.parse(card.types);
      if (card.rules) card.rules = JSON.parse(card.rules);
    }

    for (const printing of printings) {
      if (printing.attacks) printing.attacks = JSON.parse(printing.attacks);
      if (printing.abilities) printing.abilities = JSON.parse(printing.abilities);
      if (printing.weaknesses) printing.weaknesses = JSON.parse(printing.weaknesses);
      if (printing.resistances) printing.resistances = JSON.parse(printing.resistances);
      if (printing.nationalPokedexNumbers) printing.nationalPokedexNumbers = JSON.parse(printing.nationalPokedexNumbers);
      if (printing.legalities) printing.legalities = JSON.parse(printing.legalities);
    }

    for (const profile of storeProfiles) {
      if (profile.categories) profile.categories = JSON.parse(profile.categories);
      if (profile.overrides) profile.overrides = JSON.parse(profile.overrides);
    }

    // Convert isLocked from integer to boolean for allocations
    for (const allocation of allocations) {
      if (allocation.isLocked !== undefined) {
        allocation.isLocked = allocation.isLocked === 1;
      } else {
        // Default to false if not set
        allocation.isLocked = false;
      }
    }

    return {
      cards,
      printings,
      sets,
      collectionItems,
      decks,
      deckRequirements,
      allocations,
      wishlistItems,
      storeProfiles,
      acquisitions,
      syncMetadata,
    };
  }

  /**
   * Write data to database from JSON-like structure
   * Compatible with existing writeDb() function in server.ts
   */
  writeDb(data: any): void {
    const transaction = this.db.transaction(() => {
      // Upsert cards
      for (const card of data.cards || []) {
        this.db.prepare(`
          INSERT INTO cards (id, name, supertype, subtype, hp, types, rules, isAceSpec, defaultPrintingId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            supertype = excluded.supertype,
            subtype = excluded.subtype,
            hp = excluded.hp,
            types = excluded.types,
            rules = excluded.rules,
            isAceSpec = excluded.isAceSpec,
            defaultPrintingId = excluded.defaultPrintingId
        `).run(
          card.id,
          card.name,
          card.supertype,
          card.subtype,
          card.hp,
          JSON.stringify(card.types || []),
          JSON.stringify(card.rules || []),
          card.isAceSpec ? 1 : 0,
          card.defaultPrintingId
        );
      }

      // Upsert printings
      const upsertPrinting = this.db.prepare(PRINTING_INSERT_SQL);
      for (const printing of data.printings || []) {
        upsertPrinting.run(...getPrintingValues(printing));
      }

      // Upsert sets
      for (const set of data.sets || []) {
        this.db.prepare(`
          INSERT INTO sets (id, name, series, ptcgoCode, releaseDate, printedTotal, total, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            series = excluded.series,
            ptcgoCode = excluded.ptcgoCode,
            releaseDate = excluded.releaseDate,
            printedTotal = excluded.printedTotal,
            total = excluded.total,
            updatedAt = excluded.updatedAt
        `).run(
          set.id,
          set.name,
          set.series,
          set.ptcgoCode,
          set.releaseDate,
          set.printedTotal,
          set.total,
          set.updatedAt
        );
      }

      // Upsert collection items
      for (const item of data.collectionItems || []) {
        this.db.prepare(`
          INSERT INTO collection_items (id, cardId, printingId, quantity, condition, language, acquisitionSource, acquisitionDate, acquisitionCost, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            cardId = excluded.cardId,
            printingId = excluded.printingId,
            quantity = excluded.quantity,
            condition = excluded.condition,
            language = excluded.language,
            acquisitionSource = excluded.acquisitionSource,
            acquisitionDate = excluded.acquisitionDate,
            acquisitionCost = excluded.acquisitionCost,
            notes = excluded.notes
        `).run(
          item.id,
          item.cardId,
          item.printingId,
          item.quantity,
          item.condition,
          item.language,
          item.acquisitionSource,
          item.acquisitionDate,
          item.acquisitionCost,
          item.notes
        );
      }

      // Decks: reconcile so SQLite exactly matches incoming state (delete rows whose id is absent).
      // Guarded by !== undefined so partial writeDb callers cannot wipe decks.
      // deck_requirements are reconciled in the same block (child before parent for FK safety).
      if (data.decks !== undefined) {
        const incomingDeckIds = new Set(
          (data.decks as Deck[]).map((d) => d.id)
        );
        const existingDeckIds = (
          this.db.prepare('SELECT id FROM decks').all() as { id: string }[]
        ).map((r) => r.id);

        const staleIds = existingDeckIds.filter((id) => !incomingDeckIds.has(id));
        if (staleIds.length > 0) {
          // Delete child rows first to respect FK constraints, even though CASCADE would handle it
          const deleteReqStmt = this.db.prepare('DELETE FROM deck_requirements WHERE deckId = ?');
          const deleteDeckStmt = this.db.prepare('DELETE FROM decks WHERE id = ?');
          for (const staleId of staleIds) {
            deleteReqStmt.run(staleId);
            deleteDeckStmt.run(staleId);
          }
        }

        for (const deck of data.decks) {
          this.db.prepare(`
            INSERT INTO decks (id, name, version, format, status, isPermanentlyAssembled, notes, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              version = excluded.version,
              format = excluded.format,
              status = excluded.status,
              isPermanentlyAssembled = excluded.isPermanentlyAssembled,
              notes = excluded.notes,
              updatedAt = excluded.updatedAt
          `).run(
            deck.id,
            deck.name,
            deck.version,
            deck.format,
            deck.status,
            deck.isPermanentlyAssembled ? 1 : 0,
            deck.notes,
            deck.updatedAt
          );
        }
      }

      // Deck requirements: reconcile so SQLite exactly matches incoming state (delete stale rows).
      // Guarded by !== undefined. Stale-deck requirements are already removed above; this handles
      // requirements removed from an existing deck (e.g. card removed from deck).
      if (data.deckRequirements !== undefined) {
        const incomingReqIds = new Set(
          (data.deckRequirements as DeckRequirement[]).map((r) => r.id)
        );
        const existingReqIds = (
          this.db.prepare('SELECT id FROM deck_requirements').all() as { id: string }[]
        ).map((r) => r.id);

        const deleteReqByIdStmt = this.db.prepare('DELETE FROM deck_requirements WHERE id = ?');
        for (const existingId of existingReqIds) {
          if (!incomingReqIds.has(existingId)) {
            deleteReqByIdStmt.run(existingId);
          }
        }

        for (const req of data.deckRequirements) {
          this.db.prepare(`
            INSERT INTO deck_requirements (id, deckId, cardId, quantity, requirementMode)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              deckId = excluded.deckId,
              cardId = excluded.cardId,
              quantity = excluded.quantity,
              requirementMode = excluded.requirementMode
          `).run(
            req.id,
            req.deckId,
            req.cardId,
            req.quantity,
            req.requirementMode
          );
        }
      }

      // Allocations: when the caller provides a complete allocations array, reconcile so
      // SQLite exactly matches incoming state (delete rows whose id is absent).
      // Guarded by !== undefined so partial writeDb callers cannot wipe allocations.
      if (data.allocations !== undefined) {
        const incomingIds = new Set(
          (data.allocations as Allocation[]).map((a) => a.id)
        );
        const existingIds = (
          this.db.prepare('SELECT id FROM allocations').all() as { id: string }[]
        ).map((r) => r.id);

        const deleteStmt = this.db.prepare('DELETE FROM allocations WHERE id = ?');
        for (const existingId of existingIds) {
          if (!incomingIds.has(existingId)) {
            deleteStmt.run(existingId);
          }
        }

        for (const alloc of data.allocations) {
          this.db
            .prepare(
              `
            INSERT INTO allocations (id, deckId, collectionItemId, requirementId, quantity, isLocked)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              deckId = excluded.deckId,
              collectionItemId = excluded.collectionItemId,
              requirementId = excluded.requirementId,
              quantity = excluded.quantity,
              isLocked = excluded.isLocked
          `
            )
            .run(
              alloc.id,
              alloc.deckId,
              alloc.collectionItemId,
              alloc.requirementId,
              alloc.quantity,
              alloc.isLocked ? 1 : 0
            );
        }
      }

      // Upsert wishlist items
      for (const item of data.wishlistItems || []) {
        this.db.prepare(`
          INSERT INTO wishlist_items (id, cardId, printingId, quantity, priority, notes)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            cardId = excluded.cardId,
            printingId = excluded.printingId,
            quantity = excluded.quantity,
            priority = excluded.priority,
            notes = excluded.notes
        `).run(
          item.id,
          item.cardId,
          item.printingId,
          item.quantity,
          item.priority,
          item.notes
        );
      }

      // Upsert store profiles
      for (const profile of data.storeProfiles || []) {
        this.db.prepare(`
          INSERT INTO store_profiles (id, name, isDefault, categories, overrides)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            isDefault = excluded.isDefault,
            categories = excluded.categories,
            overrides = excluded.overrides
        `).run(
          profile.id,
          profile.name,
          profile.isDefault ? 1 : 0,
          JSON.stringify(profile.categories || []),
          JSON.stringify(profile.overrides || [])
        );
      }

      // Upsert acquisitions
      for (const acq of data.acquisitions || []) {
        this.db.prepare(`
          INSERT INTO acquisitions (id, cardId, printingId, quantity, source, method, costPerUnit, totalCost, date, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            cardId = excluded.cardId,
            printingId = excluded.printingId,
            quantity = excluded.quantity,
            source = excluded.source,
            method = excluded.method,
            costPerUnit = excluded.costPerUnit,
            totalCost = excluded.totalCost,
            date = excluded.date,
            notes = excluded.notes
        `).run(
          acq.id,
          acq.cardId,
          acq.printingId,
          acq.quantity,
          acq.source,
          acq.method,
          acq.costPerUnit,
          acq.totalCost,
          acq.date,
          acq.notes
        );
      }

      // Upsert sync metadata
      if (data.syncMetadata) {
        for (const [key, value] of Object.entries(data.syncMetadata)) {
          this.db.prepare(`
            INSERT INTO sync_metadata (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `).run(key, JSON.stringify(value));
        }
      }
    });

    transaction();
    console.log('[Database] Data written to SQLite database');
  }

  /**
   * Get sync metadata specifically
   */
  getSyncMetadata(): any {
    const rows = this.db.prepare('SELECT * FROM sync_metadata').all() as any[];
    const metadata: any = {};
    for (const row of rows) {
      metadata[row.key] = JSON.parse(row.value);
    }
    return metadata;
  }

  /**
   * Get database statistics
   */
  getStats(): any {
    const cardCount = this.db.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number };
    const printingCount = this.db.prepare('SELECT COUNT(*) as count FROM printings').get() as { count: number };
    const setCount = this.db.prepare('SELECT COUNT(*) as count FROM sets').get() as { count: number };
    const collectionCount = this.db.prepare('SELECT COUNT(*) as count FROM collection_items').get() as { count: number };
    const deckCount = this.db.prepare('SELECT COUNT(*) as count FROM decks').get() as { count: number };

    return {
      totalCards: cardCount.count,
      totalPrintings: printingCount.count,
      totalSets: setCount.count,
      totalCollectionItems: collectionCount.count,
      totalDecks: deckCount.count,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbManager: DatabaseManager | null = null;

export function getDatabaseManager(): DatabaseManager {
  if (!dbManager) {
    dbManager = new DatabaseManager();
  }
  return dbManager;
}

export function closeDatabase(): void {
  if (dbManager) {
    dbManager.close();
    dbManager = null;
  }
}
