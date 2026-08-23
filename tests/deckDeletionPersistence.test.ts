import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../server/database/index';
import {
  LogicalCard,
  CardPrinting,
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
} from '../src/types/tcg';

console.log('--- RUNNING DECK DELETION PERSISTENCE TESTS ---');

// ── Shared seed data ───────────────────────────────────────────────────────────

const card: LogicalCard = {
  id: 'card_del_1',
  name: 'Delete Test Card',
  supertype: 'Pokémon',
  subtype: 'Basic',
  defaultPrintingId: 'prt_del_1',
};

const printing: CardPrinting = {
  id: 'prt_del_1',
  cardId: 'card_del_1',
  cardName: 'Delete Test Card',
  setCode: 'DEL',
  setName: 'Delete Test Set',
  cardNumber: '1',
  rarity: 'Common',
  variant: 'Normal',
  language: 'English',
  imageUrl: '',
  marketPrice: 0.5,
};

const collectionItem: CollectionItem = {
  id: 'ci_del_1',
  cardId: 'card_del_1',
  printingId: 'prt_del_1',
  quantity: 4,
  condition: 'NM',
  language: 'English',
};

const deckA: Deck = {
  id: 'deck_del_a',
  name: 'Deck A',
  version: '1.0',
  format: 'Standard',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const deckB: Deck = {
  id: 'deck_del_b',
  name: 'Deck B',
  version: '1.0',
  format: 'Standard',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const reqA1: DeckRequirement = {
  id: 'req_del_a1',
  deckId: 'deck_del_a',
  cardId: 'card_del_1',
  quantity: 2,
  requirementMode: 'ANY_PRINTING',
};

const reqA2: DeckRequirement = {
  id: 'req_del_a2',
  deckId: 'deck_del_a',
  cardId: 'card_del_1',
  quantity: 1,
  requirementMode: 'ANY_PRINTING',
};

const reqB1: DeckRequirement = {
  id: 'req_del_b1',
  deckId: 'deck_del_b',
  cardId: 'card_del_1',
  quantity: 1,
  requirementMode: 'ANY_PRINTING',
};

const allocA: Allocation = {
  id: 'alloc_del_a_001',
  deckId: 'deck_del_a',
  collectionItemId: 'ci_del_1',
  requirementId: 'req_del_a1',
  quantity: 2,
  isLocked: false,
};

const allocB: Allocation = {
  id: 'alloc_del_b_001',
  deckId: 'deck_del_b',
  collectionItemId: 'ci_del_1',
  requirementId: 'req_del_b1',
  quantity: 1,
  isLocked: false,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function withTempDb(fn: (manager: DatabaseManager) => void) {
  const dbPath = path.join(
    os.tmpdir(),
    `deck-del-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  const manager = new DatabaseManager(dbPath);
  try {
    fn(manager);
  } finally {
    manager.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  }
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    cards: [card],
    printings: [printing],
    sets: [],
    collectionItems: [collectionItem],
    decks: [deckA, deckB],
    deckRequirements: [reqA1, reqA2, reqB1],
    allocations: [allocA, allocB],
    wishlistItems: [],
    storeProfiles: [],
    acquisitions: [],
    syncMetadata: {},
    ...overrides,
  };
}

// ── Test (a): deleting a deck removes it and all its requirements from SQLite ──

function testDeckAndRequirementsRemovedOnDelete() {
  withTempDb((manager) => {
    // 1. Seed two decks with requirements and allocations
    manager.writeDb(basePayload());

    // 2. Verify both exist after seed
    let db = manager.readDb();
    if (!db.decks.find((d: Deck) => d.id === 'deck_del_a')) {
      throw new Error('Pre-condition: deck_del_a should exist after seed');
    }
    if (!db.decks.find((d: Deck) => d.id === 'deck_del_b')) {
      throw new Error('Pre-condition: deck_del_b should exist after seed');
    }
    if (db.deckRequirements.filter((r: DeckRequirement) => r.deckId === 'deck_del_a').length !== 2) {
      throw new Error('Pre-condition: deck_del_a should have 2 requirements after seed');
    }

    // 3. Simulate DELETE /api/decks/:id — remove deck_del_a from in-memory state
    const deletedId = 'deck_del_a';
    db.decks = db.decks.filter((d: Deck) => d.id !== deletedId);
    db.deckRequirements = db.deckRequirements.filter((r: DeckRequirement) => r.deckId !== deletedId);
    db.allocations = db.allocations.filter((a: Allocation) => a.deckId !== deletedId);

    // 4. Persist the filtered state
    manager.writeDb(db);

    // 5. Re-read from SQLite and assert
    const after = manager.readDb();

    // Deleted deck must be gone
    if (after.decks.find((d: Deck) => d.id === deletedId)) {
      throw new Error(`FAIL: deck ${deletedId} still present in SQLite after deletion`);
    }

    // Its requirements must be gone
    const orphanedReqs = after.deckRequirements.filter(
      (r: DeckRequirement) => r.deckId === deletedId
    );
    if (orphanedReqs.length > 0) {
      throw new Error(
        `FAIL: ${orphanedReqs.length} orphaned deck_requirements for ${deletedId} remain in SQLite`
      );
    }

    // Its allocations must be gone
    const orphanedAllocs = after.allocations.filter(
      (a: Allocation) => a.deckId === deletedId
    );
    if (orphanedAllocs.length > 0) {
      throw new Error(
        `FAIL: ${orphanedAllocs.length} orphaned allocations for ${deletedId} remain in SQLite`
      );
    }

    // Unrelated deck, its requirements, and its allocations must survive
    if (!after.decks.find((d: Deck) => d.id === 'deck_del_b')) {
      throw new Error('FAIL: deck_del_b was incorrectly removed');
    }
    if (!after.deckRequirements.find((r: DeckRequirement) => r.id === 'req_del_b1')) {
      throw new Error('FAIL: req_del_b1 was incorrectly removed');
    }
    if (!after.allocations.find((a: Allocation) => a.id === 'alloc_del_b_001')) {
      throw new Error('FAIL: alloc_del_b_001 was incorrectly removed');
    }

    // Unrelated collection data must survive
    if (!after.collectionItems.find((ci: CollectionItem) => ci.id === 'ci_del_1')) {
      throw new Error('FAIL: collection item was incorrectly removed');
    }
    if (!after.cards.find((c: LogicalCard) => c.id === 'card_del_1')) {
      throw new Error('FAIL: card was incorrectly removed');
    }
  });
  console.log('✅ (a) Deleting a deck removes it and all its requirements and allocations from SQLite');
}

// ── Test (b): deleting all decks leaves SQLite deck tables empty ──────────────

function testDeleteAllDecksEmptiesTable() {
  withTempDb((manager) => {
    manager.writeDb(basePayload());

    let db = manager.readDb();
    // Simulate deleting all decks
    db.decks = [];
    db.deckRequirements = [];
    db.allocations = [];
    manager.writeDb(db);

    const after = manager.readDb();
    if (after.decks.length !== 0) {
      throw new Error(`FAIL: expected 0 decks, got ${after.decks.length}`);
    }
    if (after.deckRequirements.length !== 0) {
      throw new Error(`FAIL: expected 0 deck_requirements, got ${after.deckRequirements.length}`);
    }
    if (after.allocations.length !== 0) {
      throw new Error(`FAIL: expected 0 allocations, got ${after.allocations.length}`);
    }
    // Cards and collection items remain
    if (after.cards.length !== 1) {
      throw new Error(`FAIL: expected 1 card, got ${after.cards.length}`);
    }
    if (after.collectionItems.length !== 1) {
      throw new Error(`FAIL: expected 1 collectionItem, got ${after.collectionItems.length}`);
    }
  });
  console.log('✅ (b) Deleting all decks leaves decks/requirements/allocations tables empty');
}

// ── Test (c): writeDb is idempotent — re-writing same state changes nothing ───

function testIdempotentWriteDoesNotDeleteSurvivors() {
  withTempDb((manager) => {
    const payload = basePayload();
    manager.writeDb(payload);
    // Write the exact same state a second time — nothing should be deleted
    manager.writeDb(payload);

    const after = manager.readDb();
    if (after.decks.length !== 2) {
      throw new Error(`FAIL: idempotent write changed deck count to ${after.decks.length}`);
    }
    if (after.deckRequirements.length !== 3) {
      throw new Error(`FAIL: idempotent write changed req count to ${after.deckRequirements.length}`);
    }
    if (after.allocations.length !== 2) {
      throw new Error(`FAIL: idempotent write changed allocation count to ${after.allocations.length}`);
    }
  });
  console.log('✅ (c) Idempotent writeDb does not remove surviving rows');
}

// ── Run all tests ──────────────────────────────────────────────────────────────

try {
  testDeckAndRequirementsRemovedOnDelete();
  testDeleteAllDecksEmptiesTable();
  testIdempotentWriteDoesNotDeleteSurvivors();
  console.log('\n✅ All deck deletion persistence tests passed');
} catch (err) {
  console.error('\n❌ Deck deletion persistence test FAILED:', err);
  process.exit(1);
}
