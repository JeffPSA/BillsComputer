import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import {
  DatabaseManager,
  migrateAllocationUniqueness,
} from '../server/database/index';
import { autoAllocateDeck } from '../src/services/allocationEngine';
import {
  LogicalCard,
  CardPrinting,
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
} from '../src/types/tcg';

console.log('--- RUNNING ALLOCATION DUPLICATE REGRESSION TESTS ---');

const card: LogicalCard = {
  id: 'card_dup_1',
  name: 'Dup Card',
  supertype: 'Trainer',
  subtype: 'Item',
  defaultPrintingId: 'prt_dup_1',
};

const printing: CardPrinting = {
  id: 'prt_dup_1',
  cardId: 'card_dup_1',
  cardName: 'Dup Card',
  setCode: 'TEST',
  setName: 'Test Set',
  cardNumber: '1',
  rarity: 'Uncommon',
  variant: 'Normal',
  language: 'English',
  imageUrl: '',
  marketPrice: 1,
};

const printingSpecific: CardPrinting = {
  ...printing,
  id: 'prt_dup_gold',
  cardNumber: '1a',
  rarity: 'Rare',
  variant: 'Full Art',
};

const collectionItem: CollectionItem = {
  id: 'ci_dup_1',
  cardId: 'card_dup_1',
  printingId: 'prt_dup_1',
  quantity: 4,
  condition: 'NM',
  language: 'English',
};

const collectionItemGold: CollectionItem = {
  id: 'ci_dup_gold',
  cardId: 'card_dup_1',
  printingId: 'prt_dup_gold',
  quantity: 2,
  condition: 'NM',
  language: 'English',
};

const deck: Deck = {
  id: 'deck_dup_1',
  name: 'Dup Deck',
  version: '1.0',
  format: 'Standard',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const req: DeckRequirement = {
  id: 'req_dup_1',
  deckId: 'deck_dup_1',
  cardId: 'card_dup_1',
  quantity: 4,
  requirementMode: 'ANY_PRINTING',
};

const reqSpecific: DeckRequirement = {
  id: 'req_dup_specific',
  deckId: 'deck_dup_1',
  cardId: 'card_dup_1',
  quantity: 2,
  requirementMode: 'SPECIFIC_PRINTING',
  preferredPrintingId: 'prt_dup_gold',
};

function identityKey(a: Allocation): string {
  return `${a.deckId}|${a.requirementId}|${a.collectionItemId}`;
}

function assertNoDuplicateIdentities(allocations: Allocation[], label: string) {
  const counts = new Map<string, number>();
  for (const a of allocations) {
    const key = identityKey(a);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const [key, count] of counts) {
    if (count > 1) {
      throw new Error(`${label}: duplicate identity ${key} count=${count}`);
    }
  }
}

function emptyDbPayload(overrides: Record<string, unknown> = {}) {
  return {
    cards: [card],
    printings: [printing, printingSpecific],
    sets: [],
    collectionItems: [collectionItem, collectionItemGold],
    decks: [deck],
    deckRequirements: [req],
    allocations: [] as Allocation[],
    wishlistItems: [],
    storeProfiles: [],
    acquisitions: [],
    syncMetadata: {},
    ...overrides,
  };
}

function withTempDb(fn: (manager: DatabaseManager, dbPath: string) => void) {
  const dbPath = path.join(os.tmpdir(), `alloc-dup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const manager = new DatabaseManager(dbPath);
  try {
    fn(manager, dbPath);
  } finally {
    manager.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  }
}

// (a) autoAllocate twice through writeDb/readDb must not accumulate duplicates (idempotent quantities)
function testAutoAllocateTwiceNoDuplicates() {
  withTempDb((manager) => {
    const base = emptyDbPayload();
    manager.writeDb(base);

    let db = manager.readDb();
    db.allocations = autoAllocateDeck(
      deck.id,
      db.deckRequirements,
      db.collectionItems,
      db.allocations,
      db.decks
    );
    manager.writeDb(db);

    db = manager.readDb();
    const afterFirst = db.allocations.filter((a: Allocation) => a.deckId === deck.id);
    const qtyFirst = afterFirst.reduce((s: number, a: Allocation) => s + a.quantity, 0);

    db.allocations = autoAllocateDeck(
      deck.id,
      db.deckRequirements,
      db.collectionItems,
      db.allocations,
      db.decks
    );
    manager.writeDb(db);

    db = manager.readDb();
    const afterSecond = db.allocations.filter((a: Allocation) => a.deckId === deck.id);
    const qtySecond = afterSecond.reduce((s: number, a: Allocation) => s + a.quantity, 0);

    assertNoDuplicateIdentities(db.allocations, 'testAutoAllocateTwiceNoDuplicates');
    if (qtySecond !== qtyFirst) {
      throw new Error(`Expected idempotent quantity ${qtyFirst}, got ${qtySecond}`);
    }
    if (qtySecond !== 4) {
      throw new Error(`Expected allocated quantity 4, got ${qtySecond}`);
    }
  });
  console.log('✅ (a) autoAllocate twice yields no duplicate identities and same quantities');
}

// (b) writeDb→readDb roundtrip removes a previously-written allocation id absent from incoming state
function testWriteDbReconciliationDeletesStale() {
  withTempDb((manager) => {
    const keep: Allocation = {
      id: 'alloc_keep_1',
      deckId: deck.id,
      requirementId: req.id,
      collectionItemId: collectionItem.id,
      quantity: 2,
      isLocked: false,
    };
    const stale: Allocation = {
      id: 'alloc_stale_1',
      deckId: deck.id,
      requirementId: req.id,
      collectionItemId: collectionItem.id,
      quantity: 1,
      isLocked: false,
    };

    // Seed both rows with unique identities so UNIQUE index (if present) does not block seed
    const staleDifferentIdentity: Allocation = {
      ...stale,
      requirementId: 'req_other_for_stale',
    };

    manager.writeDb(
      emptyDbPayload({
        deckRequirements: [req, { ...req, id: 'req_other_for_stale', quantity: 1 }],
        allocations: [keep, staleDifferentIdentity],
      })
    );

    let db = manager.readDb();
    if (!db.allocations.find((a: Allocation) => a.id === 'alloc_stale_1')) {
      throw new Error('stale allocation should exist before reconciliation write');
    }

    // Write only the keep row — stale must be deleted by reconciliation
    manager.writeDb(
      emptyDbPayload({
        deckRequirements: [req, { ...req, id: 'req_other_for_stale', quantity: 1 }],
        allocations: [keep],
      })
    );

    db = manager.readDb();
    if (db.allocations.find((a: Allocation) => a.id === 'alloc_stale_1')) {
      throw new Error('stale allocation id should be removed by writeDb reconciliation');
    }
    if (!db.allocations.find((a: Allocation) => a.id === 'alloc_keep_1')) {
      throw new Error('kept allocation id should remain');
    }
  });
  console.log('✅ (b) writeDb reconciliation deletes stale allocation ids');
}

// (c) migrateAllocationUniqueness keep-newest per identity (do NOT sum)
function testMigrateKeepNewest() {
  const dbPath = path.join(os.tmpdir(), `alloc-mig-${Date.now()}.db`);
  const raw = new Database(dbPath);
  try {
    // Intentionally create pre-uniqueness schema so duplicates can be seeded
    raw.exec(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        supertype TEXT NOT NULL,
        subtype TEXT NOT NULL,
        defaultPrintingId TEXT
      );
      CREATE TABLE printings (
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
        marketPrice REAL NOT NULL
      );
      CREATE TABLE collection_items (
        id TEXT PRIMARY KEY,
        cardId TEXT NOT NULL,
        printingId TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        condition TEXT NOT NULL,
        language TEXT NOT NULL
      );
      CREATE TABLE decks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        format TEXT NOT NULL,
        status TEXT NOT NULL,
        isPermanentlyAssembled INTEGER DEFAULT 0,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE deck_requirements (
        id TEXT PRIMARY KEY,
        deckId TEXT NOT NULL,
        cardId TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        requirementMode TEXT NOT NULL
      );
      CREATE TABLE allocations (
        id TEXT PRIMARY KEY,
        deckId TEXT NOT NULL,
        collectionItemId TEXT NOT NULL,
        requirementId TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        isLocked INTEGER DEFAULT 0
      );
    `);

    raw.prepare(
      `INSERT INTO cards (id, name, supertype, subtype, defaultPrintingId) VALUES (?, ?, ?, ?, ?)`
    ).run(card.id, card.name, card.supertype, card.subtype, card.defaultPrintingId);
    raw.prepare(
      `INSERT INTO printings (id, cardId, cardName, setCode, setName, cardNumber, rarity, variant, language, imageUrl, marketPrice)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      printing.marketPrice
    );
    raw.prepare(
      `INSERT INTO collection_items (id, cardId, printingId, quantity, condition, language) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(collectionItem.id, collectionItem.cardId, collectionItem.printingId, 4, 'NM', 'English');
    raw.prepare(
      `INSERT INTO decks (id, name, version, format, status, isPermanentlyAssembled, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(deck.id, deck.name, deck.version, deck.format, deck.status, 0, deck.updatedAt);
    raw.prepare(
      `INSERT INTO deck_requirements (id, deckId, cardId, quantity, requirementMode) VALUES (?, ?, ?, ?, ?)`
    ).run(req.id, req.deckId, req.cardId, req.quantity, req.requirementMode);

    // Older then newer duplicate identity — keep newest (higher ts), do NOT sum
    raw.prepare(
      `INSERT INTO allocations (id, deckId, collectionItemId, requirementId, quantity, isLocked) VALUES (?, ?, ?, ?, ?, ?)`
    ).run('alloc_1000000000001_oldaa', deck.id, collectionItem.id, req.id, 4, 0);
    raw.prepare(
      `INSERT INTO allocations (id, deckId, collectionItemId, requirementId, quantity, isLocked) VALUES (?, ?, ?, ?, ?, ?)`
    ).run('alloc_1000000000099_newbb', deck.id, collectionItem.id, req.id, 4, 1);

    migrateAllocationUniqueness(raw);

    const rows = raw
      .prepare(
        `SELECT id, quantity, isLocked FROM allocations WHERE deckId = ? AND requirementId = ? AND collectionItemId = ?`
      )
      .all(deck.id, req.id, collectionItem.id) as { id: string; quantity: number; isLocked: number }[];

    if (rows.length !== 1) {
      throw new Error(`Expected 1 row after dedupe, got ${rows.length}`);
    }
    if (rows[0].id !== 'alloc_1000000000099_newbb') {
      throw new Error(`Expected newest id kept, got ${rows[0].id}`);
    }
    if (rows[0].quantity !== 4) {
      throw new Error(`Expected quantity 4 (not summed), got ${rows[0].quantity}`);
    }
    if (rows[0].isLocked !== 1) {
      throw new Error('Expected isLocked preserved from kept row');
    }

    const index = raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_allocations_identity'`)
      .get() as { name: string } | undefined;
    if (!index) {
      throw new Error('idx_allocations_identity should exist after migration');
    }

    // Idempotent second call
    migrateAllocationUniqueness(raw);
    const rows2 = raw.prepare(`SELECT COUNT(*) as c FROM allocations`).get() as { c: number };
    if (rows2.c !== 1) {
      throw new Error('Migration should be idempotent');
    }
  } finally {
    raw.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  }
  console.log('✅ (c) migrateAllocationUniqueness keeps newest row and creates unique index');
}

// (d) auto → manual locked → auto: locked preserved, remaining filled, no duplicate identities
function testAutoManualAutoMergedState() {
  withTempDb((manager) => {
    manager.writeDb(emptyDbPayload());

    let db = manager.readDb();
    db.allocations = autoAllocateDeck(
      deck.id,
      db.deckRequirements,
      db.collectionItems,
      db.allocations,
      db.decks
    );
    manager.writeDb(db);

    db = manager.readDb();
    // Simulate manual allocate: lock 2 copies on the existing identity (or create locked)
    const existing = db.allocations.find(
      (a: Allocation) =>
        a.deckId === deck.id &&
        a.requirementId === req.id &&
        a.collectionItemId === collectionItem.id
    );
    if (!existing) {
      throw new Error('Expected auto-allocation to create a row');
    }
    existing.quantity = 2;
    existing.isLocked = true;
    // Drop any other rows for this deck so remaining need is clear
    db.allocations = db.allocations.filter(
      (a: Allocation) => a.id === existing.id || a.deckId !== deck.id
    );
    manager.writeDb(db);

    db = manager.readDb();
    db.allocations = autoAllocateDeck(
      deck.id,
      db.deckRequirements,
      db.collectionItems,
      db.allocations,
      db.decks
    );
    manager.writeDb(db);

    db = manager.readDb();
    assertNoDuplicateIdentities(db.allocations, 'testAutoManualAutoMergedState');

    const locked = db.allocations.find((a: Allocation) => a.id === existing.id);
    if (!locked || locked.isLocked !== true) {
      throw new Error('Locked manual allocation must survive recalc');
    }

    // Remaining need merges into the locked identity row
    const totalForReq = db.allocations
      .filter((a: Allocation) => a.deckId === deck.id && a.requirementId === req.id)
      .reduce((s: number, a: Allocation) => s + a.quantity, 0);
    if (totalForReq !== 4) {
      throw new Error(`Expected requirement fully filled to 4 after second auto, got ${totalForReq}`);
    }
    if (locked.quantity !== 4) {
      throw new Error(`Expected locked identity row merged to quantity 4, got ${locked.quantity}`);
    }
  });
  console.log('✅ (d) auto → manual lock → auto produces correct merged state');
}

// (e) SPECIFIC_PRINTING allocations produce correct identity (gold printing only)
function testSpecificPrintingIdentity() {
  // Engine-level: preferredPrintingId is honored when present on the requirement
  const engineAllocs = autoAllocateDeck(
    deck.id,
    [reqSpecific],
    [collectionItem, collectionItemGold],
    [],
    [deck]
  );
  assertNoDuplicateIdentities(engineAllocs, 'testSpecificPrintingIdentity-engine');
  if (engineAllocs.length !== 1) {
    throw new Error(`Expected 1 SPECIFIC_PRINTING allocation, got ${engineAllocs.length}`);
  }
  if (engineAllocs[0].collectionItemId !== collectionItemGold.id) {
    throw new Error('SPECIFIC_PRINTING must allocate the preferred printing collection item');
  }
  if (engineAllocs[0].quantity !== 2) {
    throw new Error(`Expected quantity 2, got ${engineAllocs[0].quantity}`);
  }

  // Persistence idempotency for that identity (preferredPrintingId is not stored in SQLite
  // deck_requirements today — engine correctness is covered above; here we persist the
  // resulting rows and ensure a second write/reconcile does not duplicate them).
  withTempDb((manager) => {
    manager.writeDb(
      emptyDbPayload({
        deckRequirements: [{ ...reqSpecific, preferredPrintingId: undefined }],
        collectionItems: [collectionItem, collectionItemGold],
        allocations: engineAllocs,
      })
    );

    let db = manager.readDb();
    assertNoDuplicateIdentities(db.allocations, 'testSpecificPrintingIdentity-persisted');

    // Re-write same allocations — reconciliation must not duplicate
    manager.writeDb({
      ...emptyDbPayload({
        deckRequirements: [{ ...reqSpecific, preferredPrintingId: undefined }],
        collectionItems: [collectionItem, collectionItemGold],
      }),
      allocations: db.allocations,
    });
    db = manager.readDb();
    assertNoDuplicateIdentities(db.allocations, 'testSpecificPrintingIdentity-rewritten');
    const allocs2 = db.allocations.filter((a: Allocation) => a.requirementId === reqSpecific.id);
    if (allocs2.length !== 1 || allocs2[0].quantity !== 2) {
      throw new Error('SPECIFIC_PRINTING persisted identity must remain idempotent');
    }
  });
  console.log('✅ (e) SPECIFIC_PRINTING allocations produce correct identity');
}

try {
  testAutoAllocateTwiceNoDuplicates();
  testWriteDbReconciliationDeletesStale();
  testMigrateKeepNewest();
  testAutoManualAutoMergedState();
  testSpecificPrintingIdentity();
  console.log('--- ALL ALLOCATION DUPLICATE REGRESSION TESTS PASSED ---');
} catch (error) {
  console.error('❌ allocationDuplicateRegression failed:', error);
  process.exit(1);
}
