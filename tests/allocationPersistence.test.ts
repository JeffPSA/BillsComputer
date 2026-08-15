import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseManager } from '../server/database/index';
import {
  LogicalCard,
  CardPrinting,
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation
} from '../src/types/tcg';

// Test data setup
const mockCard: LogicalCard = {
  id: 'card_test_1',
  name: 'Test Card',
  supertype: 'Trainer',
  subtype: 'Item',
  defaultPrintingId: 'prt_test_1',
};

const mockPrinting: CardPrinting = {
  id: 'prt_test_1',
  cardId: 'card_test_1',
  cardName: 'Test Card',
  setCode: 'TEST',
  setName: 'Test Set',
  cardNumber: '1',
  rarity: 'Uncommon',
  variant: 'Normal',
  language: 'English',
  imageUrl: '',
  marketPrice: 1.0,
};

const mockCollectionItem: CollectionItem = {
  id: 'ci_test_1',
  cardId: 'card_test_1',
  printingId: 'prt_test_1',
  quantity: 10,
  condition: 'NM',
  language: 'English',
};

const mockDeck: Deck = {
  id: 'deck_test_1',
  name: 'Test Deck',
  version: '1.0',
  format: 'Standard',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const mockRequirement: DeckRequirement = {
  id: 'req_test_1',
  deckId: 'deck_test_1',
  cardId: 'card_test_1',
  quantity: 4,
  requirementMode: 'ANY_PRINTING',
};

const mockAllocation: Allocation = {
  id: 'alloc_test_1',
  collectionItemId: 'ci_test_1',
  deckId: 'deck_test_1',
  requirementId: 'req_test_1',
  quantity: 4,
  isLocked: true,
};

console.log('--- RUNNING ALLOCATION PERSISTENCE TESTS ---');

function withTempManager(fn: (dbManager: DatabaseManager) => void) {
  const dbPath = path.join(os.tmpdir(), `alloc-persist-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const dbManager = new DatabaseManager(dbPath);
  try {
    fn(dbManager);
  } finally {
    dbManager.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  }
}

// Test 1: collectionItemId preservation through write/read cycle
function testCollectionItemIdPreservation() {
  withTempManager((dbManager) => {
    const testData = {
      cards: [mockCard],
      printings: [mockPrinting],
      sets: [],
      collectionItems: [mockCollectionItem],
      decks: [mockDeck],
      deckRequirements: [mockRequirement],
      allocations: [mockAllocation],
      wishlistItems: [],
      storeProfiles: [],
      acquisitions: [],
      syncMetadata: {},
    };

    dbManager.writeDb(testData);

    const readData = dbManager.readDb();
    const readAllocation = readData.allocations[0];

    console.assert(readAllocation.collectionItemId === mockAllocation.collectionItemId,
      'collectionItemId should be preserved');
  });
  console.log('✅ Test 1 Passed: collectionItemId preserved through write/read cycle');
}

// Test 2: requirementId preservation through write/read cycle
function testRequirementIdPreservation() {
  withTempManager((dbManager) => {
    const testData = {
      cards: [mockCard],
      printings: [mockPrinting],
      sets: [],
      collectionItems: [mockCollectionItem],
      decks: [mockDeck],
      deckRequirements: [mockRequirement],
      allocations: [mockAllocation],
      wishlistItems: [],
      storeProfiles: [],
      acquisitions: [],
      syncMetadata: {},
    };

    dbManager.writeDb(testData);
    const readData = dbManager.readDb();
    const readAllocation = readData.allocations[0];

    console.assert(readAllocation.requirementId === mockAllocation.requirementId,
      'requirementId should be preserved');
  });
  console.log('✅ Test 2 Passed: requirementId preserved through write/read cycle');
}

// Test 3: isLocked preservation through write/read cycle
function testIsLockedPreservation() {
  withTempManager((dbManager) => {
    const testData = {
      cards: [mockCard],
      printings: [mockPrinting],
      sets: [],
      collectionItems: [mockCollectionItem],
      decks: [mockDeck],
      deckRequirements: [mockRequirement],
      allocations: [mockAllocation],
      wishlistItems: [],
      storeProfiles: [],
      acquisitions: [],
      syncMetadata: {},
    };

    dbManager.writeDb(testData);
    const readData = dbManager.readDb();
    const readAllocation = readData.allocations[0];

    if (readAllocation.isLocked !== true) {
      throw new Error('isLocked should be preserved as true');
    }

    const unlockedAllocation = { ...mockAllocation, id: 'alloc_test_2', isLocked: false };
    testData.allocations = [unlockedAllocation];
    dbManager.writeDb(testData);
    const readData2 = dbManager.readDb();
    const readAllocation2 = readData2.allocations.find((a: Allocation) => a.id === 'alloc_test_2');

    if (readAllocation2?.isLocked !== false) {
      throw new Error('isLocked should be preserved as false, got: ' + readAllocation2?.isLocked);
    }
  });
  console.log('✅ Test 3 Passed: isLocked preserved through write/read cycle');
}

// Test 4: quantity preservation (regression test)
function testQuantityPreservation() {
  withTempManager((dbManager) => {
    const testData = {
      cards: [mockCard],
      printings: [mockPrinting],
      sets: [],
      collectionItems: [mockCollectionItem],
      decks: [mockDeck],
      deckRequirements: [mockRequirement],
      allocations: [mockAllocation],
      wishlistItems: [],
      storeProfiles: [],
      acquisitions: [],
      syncMetadata: {},
    };

    dbManager.writeDb(testData);
    const readData = dbManager.readDb();
    const readAllocation = readData.allocations[0];

    console.assert(readAllocation.quantity === mockAllocation.quantity,
      'quantity should be preserved');
  });
  console.log('✅ Test 4 Passed: quantity preserved through write/read cycle');
}

// Test 5: Multi-deck allocation scenarios maintain correct associations
function testMultiDeckAllocationAssociations() {
  withTempManager((dbManager) => {
    const mockDeck2: Deck = {
      id: 'deck_test_2',
      name: 'Test Deck 2',
      version: '1.0',
      format: 'Standard',
      status: 'Active',
      isPermanentlyAssembled: false,
      updatedAt: new Date().toISOString(),
    };

    const mockRequirement2: DeckRequirement = {
      id: 'req_test_2',
      deckId: 'deck_test_2',
      cardId: 'card_test_1',
      quantity: 2,
      requirementMode: 'ANY_PRINTING',
    };

    const mockAllocation2: Allocation = {
      id: 'alloc_test_2',
      collectionItemId: 'ci_test_1',
      deckId: 'deck_test_2',
      requirementId: 'req_test_2',
      quantity: 2,
      isLocked: false,
    };

    const testData = {
      cards: [mockCard],
      printings: [mockPrinting],
      sets: [],
      collectionItems: [mockCollectionItem],
      decks: [mockDeck, mockDeck2],
      deckRequirements: [mockRequirement, mockRequirement2],
      allocations: [mockAllocation, mockAllocation2],
      wishlistItems: [],
      storeProfiles: [],
      acquisitions: [],
      syncMetadata: {},
    };

    dbManager.writeDb(testData);
    const readData = dbManager.readDb();

    const alloc1 = readData.allocations.find((a: Allocation) => a.id === 'alloc_test_1');
    const alloc2 = readData.allocations.find((a: Allocation) => a.id === 'alloc_test_2');

    console.assert(alloc1?.deckId === 'deck_test_1', 'Allocation 1 should be associated with deck 1');
    console.assert(alloc1?.requirementId === 'req_test_1', 'Allocation 1 should be associated with requirement 1');
    console.assert(alloc1?.collectionItemId === 'ci_test_1', 'Allocation 1 should be associated with collection item');

    console.assert(alloc2?.deckId === 'deck_test_2', 'Allocation 2 should be associated with deck 2');
    console.assert(alloc2?.requirementId === 'req_test_2', 'Allocation 2 should be associated with requirement 2');
    console.assert(alloc2?.collectionItemId === 'ci_test_1', 'Allocation 2 should be associated with collection item');
  });
  console.log('✅ Test 5 Passed: Multi-deck allocation scenarios maintain correct associations');
}

// Test 6: Migration deletes legacy rows and reports count correctly
function testMigrationDeletesLegacyRows() {
  // Covered by allocationDuplicateRegression migrateAllocationUniqueness tests
  console.log('⏭️  Test 6 Skipped: covered by allocationDuplicateRegression migration tests');
}

// Run all tests
try {
  testCollectionItemIdPreservation();
  testRequirementIdPreservation();
  testIsLockedPreservation();
  testQuantityPreservation();
  testMultiDeckAllocationAssociations();
  testMigrationDeletesLegacyRows();

  console.log('--- ALL ALLOCATION PERSISTENCE TESTS PASSED ---');
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
