import {
  calculateCardOwnershipForDeck,
  calculateMultiDeckShortfalls,
  autoAllocateDeck,
  resolveBulkCategoryForCard
} from './allocationEngine';
import {
  LogicalCard,
  CardPrinting,
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
  StoreProfile
} from '../types/tcg';

// Test Data Setup
const mockCardUltraBall: LogicalCard = {
  id: 'card_ultra_ball',
  name: 'Ultra Ball',
  supertype: 'Trainer',
  subtype: 'Item',
  defaultPrintingId: 'prt_ub_1',
};

const mockPrintingUB1: CardPrinting = {
  id: 'prt_ub_1',
  cardId: 'card_ultra_ball',
  cardName: 'Ultra Ball',
  setCode: 'MEG',
  setName: 'Mega Evolution',
  cardNumber: '131',
  rarity: 'Uncommon',
  variant: 'Normal',
  language: 'English',
  imageUrl: '',
  marketPrice: 0.50,
};

const mockDeckDarkrai: Deck = {
  id: 'deck_darkrai',
  name: 'Mega Darkrai',
  version: '1.0',
  format: 'Standard',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const mockDeckLucario: Deck = {
  id: 'deck_lucario',
  name: 'Mega Lucario',
  version: '1.0',
  format: 'Standard',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const reqDarkraiUB: DeckRequirement = {
  id: 'req_darkrai_ub',
  deckId: 'deck_darkrai',
  cardId: 'card_ultra_ball',
  quantity: 4,
  requirementMode: 'ANY_PRINTING',
};

const reqLucarioUB: DeckRequirement = {
  id: 'req_lucario_ub',
  deckId: 'deck_lucario',
  cardId: 'card_ultra_ball',
  quantity: 4,
  requirementMode: 'ANY_PRINTING',
};

// 6 physical Ultra Balls owned in collection
const collectionItems: CollectionItem[] = [
  {
    id: 'ci_ub_6x',
    cardId: 'card_ultra_ball',
    printingId: 'prt_ub_1',
    quantity: 6,
    condition: 'NM',
    language: 'English',
  },
];

console.log('--- RUNNING ALLOCATION ENGINE AUTOMATED TESTS ---');

// Test 1: Owned 6, Darkrai allocated 4, Lucario allocated 2
const allocations: Allocation[] = [
  { id: 'a1', collectionItemId: 'ci_ub_6x', deckId: 'deck_darkrai', requirementId: 'req_darkrai_ub', quantity: 4 },
  { id: 'a2', collectionItemId: 'ci_ub_6x', deckId: 'deck_lucario', requirementId: 'req_lucario_ub', quantity: 2 },
];

const lucarioOwnership = calculateCardOwnershipForDeck(
  mockCardUltraBall,
  reqLucarioUB,
  mockDeckLucario,
  [mockDeckDarkrai, mockDeckLucario],
  collectionItems,
  allocations
);

console.assert(lucarioOwnership.required === 4, 'Lucario requirement should be 4');
console.assert(lucarioOwnership.allocatedToThisDeck === 2, 'Lucario allocated should be 2');
console.assert(lucarioOwnership.availableInCollection === 0, 'Available unallocated in collection should be 0');
console.assert(lucarioOwnership.missing === 2, 'Lucario missing should be 2');
console.assert(lucarioOwnership.status === 'ALLOCATED_ELSEWHERE', 'Lucario ownership status should be ALLOCATED_ELSEWHERE');

console.log('✅ Test 1 Passed: Correctly calculated required:4, allocated:2, available:0, missing:2, status:ALLOCATED_ELSEWHERE');

// Test 2: Deactivating Darkrai frees available inventory for Lucario
const inactiveDarkrai: Deck = { ...mockDeckDarkrai, status: 'Inactive' };
const lucarioOwnershipWithInactiveDarkrai = calculateCardOwnershipForDeck(
  mockCardUltraBall,
  reqLucarioUB,
  mockDeckLucario,
  [inactiveDarkrai, mockDeckLucario],
  collectionItems,
  allocations
);

console.assert(lucarioOwnershipWithInactiveDarkrai.availableInCollection === 4, 'Inactive Darkrai releases 4 copies to available pool');
console.assert(lucarioOwnershipWithInactiveDarkrai.status === 'FULLY_OWNED', 'Lucario can now fully own its 4 copies');
console.log('✅ Test 2 Passed: Deactivating Darkrai releases copies to available pool');

// Test 3: Multi-deck shortfalls (Darkrai needs 4, Lucario needs 4, Total required = 8, Owned = 6 -> Shortfall = 2)
const shortfalls = calculateMultiDeckShortfalls(
  [mockDeckDarkrai, mockDeckLucario],
  [reqDarkraiUB, reqLucarioUB],
  collectionItems,
  [mockCardUltraBall]
);

console.assert(shortfalls.length === 1, 'Should find 1 card shortfall');
console.assert(shortfalls[0].totalRequired === 8, 'Total required across active decks should be 8');
console.assert(shortfalls[0].missing === 2, 'Total physical shortfall should be 2');
console.log('✅ Test 3 Passed: Multi-deck shortfall calculation avoids double counting shared card shortages');

// Test 4: Bulk category resolution with store overrides
const storeProfile: StoreProfile = {
  id: 'sp_local',
  name: 'Local Game Store',
  isDefault: true,
  categories: [
    { id: 'cat_rare_af', name: 'Rare — A–F', sortOrder: 1 },
    { id: 'cat_rare_gm', name: 'Rare — G–M', sortOrder: 2 },
    { id: 'cat_rare_nz', name: 'Rare — N–Z', sortOrder: 3 },
    { id: 'cat_uncommon_nz', name: 'Uncommon — N–Z', sortOrder: 4 },
    { id: 'cat_trainers', name: 'Trainer Box', sortOrder: 5 },
  ],
  overrides: [
    { id: 'ov_ub', storeProfileId: 'sp_local', cardId: 'card_ultra_ball', categoryId: 'cat_uncommon_nz' },
  ],
};

const resolvedCat = resolveBulkCategoryForCard(mockCardUltraBall, mockPrintingUB1, storeProfile);
console.assert(resolvedCat === 'Uncommon — N–Z', 'Ultra Ball override should resolve to Uncommon — N–Z');
console.log('✅ Test 4 Passed: Bulk location override respected');

console.log('--- ALL TESTS PASSED SUCCESSFULLY ---');
