import assert from 'node:assert';
import { searchCards } from '../src/services/cardSearch';
import { LogicalCard, CardPrinting, CollectionItem, Deck, DeckRequirement, Allocation, StoreProfile } from '../src/types/tcg';
import { autoAllocateDeck, resolveBulkCategoryForCard } from '../src/services/allocationEngine';

console.log('🧪 Starting Critical Functionality & Reliability Tests...');

// 1. Test Card Search Pipeline
const sampleCards: LogicalCard[] = [
  {
    id: 'c1',
    name: "Boss's Orders",
    supertype: 'Trainer',
    subtype: 'Supporter',
    defaultPrintingId: 'p1',
    printings: [
      {
        id: 'p1',
        cardId: 'c1',
        cardName: "Boss's Orders",
        setCode: 'PAL',
        setName: 'Paldea Evolved',
        cardNumber: '172',
        rarity: 'Rare',
        variant: 'Normal',
        language: 'English',
        imageUrl: '',
        marketPrice: 1.5,
      },
    ],
  },
  {
    id: 'c2',
    name: 'Ultra Ball',
    supertype: 'Trainer',
    subtype: 'Item',
    defaultPrintingId: 'p2',
    printings: [
      {
        id: 'p2',
        cardId: 'c2',
        cardName: 'Ultra Ball',
        setCode: 'SVI',
        setName: 'Scarlet & Violet',
        cardNumber: '196',
        rarity: 'Uncommon',
        variant: 'Normal',
        language: 'English',
        imageUrl: '',
        marketPrice: 0.5,
      },
    ],
  },
  {
    id: 'c3',
    name: 'Charizard ex',
    supertype: 'Pokémon',
    subtype: 'Stage 2',
    defaultPrintingId: 'p3',
    printings: [
      {
        id: 'p3',
        cardId: 'c3',
        cardName: 'Charizard ex',
        setCode: 'OBF',
        setName: 'Obsidian Flames',
        cardNumber: '125',
        rarity: 'Double Rare',
        variant: 'Holo',
        language: 'English',
        imageUrl: '',
        marketPrice: 25.0,
      },
    ],
  },
];

// Test card search queries
console.log('Testing unified card search queries...');
assert.strictEqual(searchCards(sampleCards, "Boss's Orders").length, 1, 'Exact name search');
assert.strictEqual(searchCards(sampleCards, 'boss orders').length, 1, 'Multi-word partial search');
assert.strictEqual(searchCards(sampleCards, 'ultra').length, 1, 'Partial name search');
assert.strictEqual(searchCards(sampleCards, 'SVI').length, 1, 'Set code search');
assert.strictEqual(searchCards(sampleCards, '172').length, 1, 'Card number search');
assert.strictEqual(searchCards(sampleCards, 'paldea').length, 1, 'Set name search');
assert.strictEqual(searchCards(sampleCards, 'charizard', { supertype: 'Pokémon' }).length, 1, 'Filter by supertype');
assert.strictEqual(searchCards(sampleCards, 'ultra', { supertype: 'Pokémon' }).length, 0, 'Filter mismatch');

// 2. Test Deck Deletion & Allocation Re-Evaluation
console.log('Testing deck deletion & allocation releasing...');
const testCollection: CollectionItem[] = [
  {
    id: 'ci1',
    cardId: 'c2',
    printingId: 'p2',
    quantity: 4,
    condition: 'NM',
    language: 'English',
    acquisitionSource: 'Store',
    acquisitionDate: '2026-01-01',
    acquisitionCost: 0.5,
  },
];

const deckA: Deck = {
  id: 'd1',
  name: 'Deck A',
  format: 'Standard',
  version: 'v1.0',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const deckB: Deck = {
  id: 'd2',
  name: 'Deck B',
  format: 'Standard',
  version: 'v1.0',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const reqsA: DeckRequirement[] = [
  {
    id: 'req_a1',
    deckId: 'd1',
    cardId: 'c2',
    quantity: 4,
    requirementMode: 'ANY_PRINTING',
  },
];

const reqsB: DeckRequirement[] = [
  {
    id: 'req_b1',
    deckId: 'd2',
    cardId: 'c2',
    quantity: 4,
    requirementMode: 'ANY_PRINTING',
  },
];

const allReqs = [...reqsA, ...reqsB];
const allDecks = [deckA, deckB];

// Initially allocate Deck A first
let allocs = autoAllocateDeck('d1', allReqs, testCollection, [], allDecks);
assert.strictEqual(allocs.length, 1);
assert.strictEqual(allocs[0].quantity, 4);
assert.strictEqual(allocs[0].deckId, 'd1');

// Deck B gets 0 copies because all 4 copies are claimed by Deck A
allocs = autoAllocateDeck('d2', allReqs, testCollection, allocs, allDecks);
assert.strictEqual(allocs.filter((a) => a.deckId === 'd2').length, 0);

// Now simulate deleting Deck A: allocations for d1 removed
const allocsAfterDelete = allocs.filter((a) => a.deckId !== 'd1');
// Re-allocate remaining active decks (Deck B)
const allocsReevaluated = autoAllocateDeck('d2', allReqs, testCollection, allocsAfterDelete, [deckB]);
assert.strictEqual(allocsReevaluated.length, 1);
assert.strictEqual(allocsReevaluated[0].deckId, 'd2');
assert.strictEqual(allocsReevaluated[0].quantity, 4, 'Deck B automatically claims released copies!');

// 3. Test Store Profile Categories & Overrides
console.log('Testing Store Profile categories & overrides...');
const profile: StoreProfile = {
  id: 'sp1',
  name: 'Main LGS Store',
  isDefault: true,
  categories: [
    { id: 'cat1', name: 'Rare A–F', sortOrder: 1 },
    { id: 'cat2', name: 'Trainer Items Box', sortOrder: 2 },
  ],
  overrides: [
    {
      id: 'ov1',
      storeProfileId: 'sp1',
      cardId: 'c2',
      categoryId: 'cat2',
    },
  ],
};

const resolvedCat = resolveBulkCategoryForCard(sampleCards[1], sampleCards[1].printings![0], profile);
assert.strictEqual(resolvedCat, 'Trainer Items Box', 'Card override routes Ultra Ball into Trainer Items Box');

console.log('✅ All Critical Functionality & Reliability Tests Passed Successfully!');
