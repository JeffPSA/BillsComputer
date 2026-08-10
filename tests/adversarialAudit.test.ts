import { test } from 'node:test';
import assert from 'node:assert';
import {
  calculateCardOwnershipForDeck,
  autoAllocateDeck,
  resolveBulkCategoryForCard,
} from '../src/services/allocationEngine';
import {
  LogicalCard,
  CardPrinting,
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
  StoreProfile,
} from '../src/types/tcg';

test('Hostile QA Audit Suite - Edge Cases & Stress Scenarios', async (t) => {
  const cardA: LogicalCard = {
    id: 'card_a',
    name: 'Boss\'s Orders',
    supertype: 'Trainer',
    subtype: 'Supporter',
    defaultPrintingId: 'prt_a_1',
  };

  const printingsA: CardPrinting[] = [
    { id: 'prt_a_1', cardId: 'card_a', cardName: "Boss's Orders", setCode: 'PAL', setName: 'Paldea Evolved', cardNumber: '172', rarity: 'Rare', variant: 'Normal', language: 'EN', imageUrl: '', marketPrice: 1.50 },
    { id: 'prt_a_2', cardId: 'card_a', cardName: "Boss's Orders", setCode: 'PAL', setName: 'Paldea Evolved', cardNumber: '265', rarity: 'Special Illustration Rare', variant: 'Full Art', language: 'EN', imageUrl: '', marketPrice: 25.00 },
  ];

  // Test 1: Empty Collection (0 copies owned)
  let collection: CollectionItem[] = [];
  let allocations: Allocation[] = [];

  const deck1: Deck = {
    id: 'deck_1',
    name: 'Test Deck 1',
    format: 'Standard',
    version: '1.0',
    status: 'Active',
    isPermanentlyAssembled: false,
    updatedAt: new Date().toISOString(),
  };

  const req1: DeckRequirement = {
    id: 'req_1',
    deckId: 'deck_1',
    cardId: 'card_a',
    requirementMode: 'ANY_PRINTING',
    quantity: 4,
  };

  allocations = autoAllocateDeck('deck_1', [req1], collection, allocations, [deck1]);
  assert.strictEqual(allocations.length, 0, 'No allocations should be created for empty collection');

  const ownership1 = calculateCardOwnershipForDeck(cardA, req1, deck1, [deck1], collection, allocations);
  assert.strictEqual(ownership1.status, 'NOT_OWNED', 'Status should be NOT_OWNED when 0 copies owned');
  assert.strictEqual(ownership1.missing, 4, 'Missing quantity should equal required quantity');
  assert.strictEqual(ownership1.allocatedToThisDeck, 0);

  // Test 2: Owning exact quantity required (4 owned, 4 required)
  collection = [
    { id: 'col_a_1', cardId: 'card_a', printingId: 'prt_a_1', quantity: 4, condition: 'NM', language: 'EN' }
  ];

  allocations = autoAllocateDeck('deck_1', [req1], collection, [], [deck1]);
  assert.strictEqual(allocations.length, 1, 'Should create 1 allocation');
  assert.strictEqual(allocations[0].quantity, 4, 'Should allocate all 4 copies');

  const ownership2 = calculateCardOwnershipForDeck(cardA, req1, deck1, [deck1], collection, allocations);
  assert.strictEqual(ownership2.status, 'FULLY_OWNED', 'Status should be FULLY_OWNED when exact quantity owned');
  assert.strictEqual(ownership2.missing, 0);

  // Test 3: Owning more than required (10 owned, 4 required)
  collection = [
    { id: 'col_a_1', cardId: 'card_a', printingId: 'prt_a_1', quantity: 10, condition: 'NM', language: 'EN' }
  ];

  allocations = autoAllocateDeck('deck_1', [req1], collection, [], [deck1]);
  assert.strictEqual(allocations[0].quantity, 4, 'Should cap allocation at required 4 copies');

  // Test 4: SPECIFIC_PRINTING mode when only regular printing owned
  const reqSpecificGold: DeckRequirement = {
    id: 'req_gold',
    deckId: 'deck_1',
    cardId: 'card_a',
    requirementMode: 'SPECIFIC_PRINTING',
    preferredPrintingId: 'prt_a_2', // Full Art
    quantity: 2,
  };

  allocations = autoAllocateDeck('deck_1', [reqSpecificGold], collection, [], [deck1]);
  assert.strictEqual(allocations.length, 0, 'Should not allocate regular printing when SPECIFIC_PRINTING requests Full Art');

  const ownershipGold = calculateCardOwnershipForDeck(cardA, reqSpecificGold, deck1, [deck1], collection, allocations);
  assert.strictEqual(ownershipGold.status, 'NOT_OWNED', 'Gold requirement should be NOT_OWNED when none owned');
  assert.strictEqual(ownershipGold.missing, 2);

  // Test 5: Permanent assembly lock behavior
  const deckLocked: Deck = {
    ...deck1,
    id: 'deck_locked',
    isPermanentlyAssembled: true,
  };

  const reqLocked: DeckRequirement = {
    id: 'req_locked',
    deckId: 'deck_locked',
    cardId: 'card_a',
    requirementMode: 'ANY_PRINTING',
    quantity: 4,
  };

  allocations = autoAllocateDeck('deck_locked', [reqLocked], collection, [], [deckLocked]);
  assert.strictEqual(allocations.length, 1);
  assert.strictEqual(allocations[0].isLocked, true, 'Allocations for permanently assembled deck must be locked');

  console.log('✅ ALL HOSTILE QA AUDIT TESTS PASSED SUCCESSFULLY!');
});
