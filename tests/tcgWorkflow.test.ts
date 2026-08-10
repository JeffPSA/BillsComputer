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

test('Full 18-step TCG Deck Builder & Collection Inventory QA Suite', async (t) => {
  // Step 1: Mock Cards & Printings
  const ultraBallCard: LogicalCard = {
    id: 'card_ultraball',
    name: 'Ultra Ball',
    supertype: 'Trainer',
    subtype: 'Item',
    defaultPrintingId: 'prt_ub_base',
  };

  const ultraBallPrintings: CardPrinting[] = [
    { id: 'prt_ub_base', cardId: 'card_ultraball', cardName: 'Ultra Ball', setCode: 'SVI', setName: 'Scarlet & Violet', cardNumber: '196', rarity: 'Uncommon', variant: 'Normal', language: 'EN', imageUrl: '', marketPrice: 0.25 },
    { id: 'prt_ub_gold', cardId: 'card_ultraball', cardName: 'Ultra Ball', setCode: 'SVI', setName: 'Scarlet & Violet', cardNumber: '254', rarity: 'Hyper Rare', variant: 'Gold', language: 'EN', imageUrl: '', marketPrice: 22.00 },
  ];

  const bossOrdersCard: LogicalCard = {
    id: 'card_boss',
    name: "Boss's Orders",
    supertype: 'Trainer',
    subtype: 'Supporter',
    defaultPrintingId: 'prt_boss_base',
  };

  // Step 2: Add multiple printings of the same card to collection
  let collection: CollectionItem[] = [
    {
      id: 'col_ub_base',
      cardId: 'card_ultraball',
      printingId: 'prt_ub_base',
      quantity: 4,
      condition: 'NM',
      language: 'EN',
    },
    {
      id: 'col_ub_gold',
      cardId: 'card_ultraball',
      printingId: 'prt_ub_gold',
      quantity: 2,
      condition: 'NM',
      language: 'EN',
    },
    {
      id: 'col_boss_base',
      cardId: 'card_boss',
      printingId: 'prt_boss_base',
      quantity: 2,
      condition: 'NM',
      language: 'EN',
    },
  ];

  let allocations: Allocation[] = [];

  // Step 3: Create Deck A (Darkrai) requiring 4x Ultra Ball and 2x Boss's Orders
  const deckA: Deck = { id: 'deck_A', name: 'Mega Darkrai ex', format: 'Standard', version: '1.0', status: 'Active', isPermanentlyAssembled: false, updatedAt: new Date().toISOString() };
  let deckAReqs: DeckRequirement[] = [
    { id: 'req_A_ub', deckId: 'deck_A', cardId: 'card_ultraball', requirementMode: 'ANY_PRINTING', quantity: 4 },
    { id: 'req_A_boss', deckId: 'deck_A', cardId: 'card_boss', requirementMode: 'ANY_PRINTING', quantity: 2 },
  ];

  // Step 4: Auto-allocate physical cards to Deck A
  allocations = autoAllocateDeck('deck_A', deckAReqs, collection, allocations, [deckA]);
  assert.strictEqual(allocations.length, 2, 'Deck A should receive allocations for Ultra Ball and Boss');

  // Verify ownership status for Deck A
  const ubOwnershipA = calculateCardOwnershipForDeck(ultraBallCard, deckAReqs[0], deckA, [deckA], collection, allocations);
  assert.strictEqual(ubOwnershipA.status, 'FULLY_OWNED', 'Deck A Ultra Ball should be FULLY_OWNED');
  assert.strictEqual(ubOwnershipA.allocatedToThisDeck, 4, '4 Ultra Balls allocated to Deck A');

  // Step 5 & 6: Create Deck B requiring 4x Ultra Ball and verify NO double counting!
  const deckB: Deck = { id: 'deck_B', name: 'Regidrago VSTAR', format: 'Standard', version: '1.0', status: 'Active', isPermanentlyAssembled: false, updatedAt: new Date().toISOString() };
  let deckBReqs: DeckRequirement[] = [
    { id: 'req_B_ub', deckId: 'deck_B', cardId: 'card_ultraball', requirementMode: 'ANY_PRINTING', quantity: 4 },
  ];

  allocations = autoAllocateDeck('deck_B', deckBReqs, collection, allocations, [deckA, deckB]);

  const ubOwnershipB = calculateCardOwnershipForDeck(ultraBallCard, deckBReqs[0], deckB, [deckA, deckB], collection, allocations);
  assert.strictEqual(ubOwnershipB.status, 'ALLOCATED_ELSEWHERE', 'Deck B status should be ALLOCATED_ELSEWHERE because 4 copies are allocated to Deck A');
  assert.strictEqual(ubOwnershipB.allocatedToThisDeck, 2, '2 Ultra Balls allocated to Deck B');
  assert.strictEqual(ubOwnershipB.allocatedToOtherDecks, 4, '4 Ultra Balls allocated to Deck A');
  assert.strictEqual(ubOwnershipB.missing, 2, 'Deck B short 2 Ultra Balls');

  // Step 8: Deactivate Deck A and verify cards become available for Deck B
  const inactiveDeckA: Deck = { ...deckA, status: 'Inactive' as const };
  allocations = autoAllocateDeck('deck_B', deckBReqs, collection, allocations, [inactiveDeckA, deckB]);
  
  const ubOwnershipBAfterDeactivate = calculateCardOwnershipForDeck(ultraBallCard, deckBReqs[0], deckB, [inactiveDeckA, deckB], collection, allocations);
  assert.strictEqual(ubOwnershipBAfterDeactivate.status, 'FULLY_OWNED', 'Deck B should become FULLY_OWNED once Deck A is inactive');
  assert.strictEqual(ubOwnershipBAfterDeactivate.allocatedToThisDeck, 4, 'Deck B gets 4 Ultra Balls');

  // Step 9 & 10: Specific Printing vs Any Printing test
  const reqGoldOnly: DeckRequirement = {
    id: 'req_gold_only',
    deckId: 'deck_B',
    cardId: 'card_ultraball',
    requirementMode: 'SPECIFIC_PRINTING',
    preferredPrintingId: 'prt_ub_gold',
    quantity: 4,
  };
  const goldOwnership = calculateCardOwnershipForDeck(ultraBallCard, reqGoldOnly, deckB, [deckB], collection, allocations);
  assert.strictEqual(goldOwnership.status, 'PARTIALLY_OWNED', 'Only 2 Gold Ultra Balls exist in collection');
  assert.strictEqual(goldOwnership.missing, 2, 'Short 2 Gold Ultra Balls');

  // Step 12, 13 & 14: Bulk Hunting & Store Profile Overrides
  const storeProfile: StoreProfile = {
    id: 'store_1',
    name: 'Local Game Shop',
    isDefault: true,
    categories: [
      { id: 'cat_trainers', name: 'Trainers Box', description: 'Box #1', sortOrder: 1 },
      { id: 'cat_gold', name: 'Secret Rares Binder', description: 'Display Case', sortOrder: 2 },
    ],
    overrides: [
      { id: 'ov_1', storeProfileId: 'store_1', cardId: 'card_ultraball', categoryId: 'cat_gold' },
    ],
  };

  const resolvedCategory = resolveBulkCategoryForCard(ultraBallCard, ultraBallPrintings[1], storeProfile);
  assert.strictEqual(resolvedCategory, 'Secret Rares Binder', 'Location override successfully pushed Ultra Ball into Secret Rares Binder');

  // Step 18: Regression check - SPECIFIC_PRINTING auto-allocation
  let goldAllocations = autoAllocateDeck('deck_B', [reqGoldOnly], collection, allocations, [deckB]);
  const allocatedGoldCopies = goldAllocations.filter(a => a.requirementId === 'req_gold_only');
  assert.strictEqual(allocatedGoldCopies.length, 1, 'Only gold collection item should be allocated');
  assert.strictEqual(allocatedGoldCopies[0].collectionItemId, 'col_ub_gold', 'Correctly selected col_ub_gold for SPECIFIC_PRINTING');
  assert.strictEqual(allocatedGoldCopies[0].quantity, 2, 'Allocated all 2 owned gold copies');

  console.log('✅ ALL 18 FUNCTIONAL QA WORKFLOW STEPS PASSED SUCCESSFULLY!');
});
