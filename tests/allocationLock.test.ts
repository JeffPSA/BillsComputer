import { autoAllocateDeck } from '../src/services/allocationEngine';
import {
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
} from '../src/types/tcg';

console.log('--- RUNNING ALLOCATION LOCK PRESERVATION TESTS ---');

const deck: Deck = {
  id: 'deck_lock_1',
  name: 'Lock Deck',
  version: '1.0',
  format: 'Standard',
  status: 'Active',
  isPermanentlyAssembled: false,
  updatedAt: new Date().toISOString(),
};

const req: DeckRequirement = {
  id: 'req_lock_1',
  deckId: 'deck_lock_1',
  cardId: 'card_lock_1',
  quantity: 4,
  requirementMode: 'ANY_PRINTING',
};

const collection: CollectionItem[] = [
  {
    id: 'ci_lock_1',
    cardId: 'card_lock_1',
    printingId: 'prt_lock_1',
    quantity: 4,
    condition: 'NM',
    language: 'English',
  },
];

function testPreservesLockedAllocation() {
  const locked: Allocation = {
    id: 'alloc_locked_keep',
    deckId: deck.id,
    requirementId: req.id,
    collectionItemId: 'ci_lock_1',
    quantity: 2,
    isLocked: true,
  };

  const result = autoAllocateDeck(deck.id, [req], collection, [locked], [deck]);
  const kept = result.find((a) => a.id === 'alloc_locked_keep');

  if (!kept) {
    throw new Error('Locked allocation must be preserved with same id');
  }
  if (kept.isLocked !== true) {
    throw new Error('Locked allocation must remain isLocked=true');
  }

  // Remaining need merges into the same identity row (at most one row per identity)
  const forReq = result.filter((a) => a.deckId === deck.id && a.requirementId === req.id);
  if (forReq.length !== 1) {
    throw new Error(`Expected single identity row after merge, got ${forReq.length}`);
  }
  if (forReq[0].quantity !== 4) {
    throw new Error(`Expected merged quantity 4 (2 locked + 2 auto), got ${forReq[0].quantity}`);
  }

  console.log('✅ (a) autoAllocateDeck preserves locked allocation and only recomputes unlocked');
}

function testLockedReducesAvailablePool() {
  const locked: Allocation = {
    id: 'alloc_locked_pool',
    deckId: deck.id,
    requirementId: req.id,
    collectionItemId: 'ci_lock_1',
    quantity: 3,
    isLocked: true,
  };

  const result = autoAllocateDeck(deck.id, [req], collection, [locked], [deck]);
  const total = result
    .filter((a) => a.collectionItemId === 'ci_lock_1')
    .reduce((s, a) => s + a.quantity, 0);

  if (total > 4) {
    throw new Error(`Over-allocation: total ${total} exceeds item quantity 4`);
  }
  if (total !== 4) {
    throw new Error(`Expected total allocated 4 (3 locked + 1 auto), got ${total}`);
  }

  console.log('✅ (b) locked allocations reduce item available pool (no over-allocation)');
}

function testFullySatisfiedByLockedGetsNoNew() {
  const locked: Allocation = {
    id: 'alloc_locked_full',
    deckId: deck.id,
    requirementId: req.id,
    collectionItemId: 'ci_lock_1',
    quantity: 4,
    isLocked: true,
  };

  const result = autoAllocateDeck(deck.id, [req], collection, [locked], [deck]);
  const forReq = result.filter((a) => a.deckId === deck.id && a.requirementId === req.id);

  if (forReq.length !== 1 || forReq[0].id !== 'alloc_locked_full') {
    throw new Error('Fully locked requirement must not receive new unlocked allocations');
  }
  if (forReq[0].quantity !== 4) {
    throw new Error('Locked full allocation quantity must remain 4');
  }

  console.log('✅ (c) requirement fully satisfied by locked rows gets no new unlocked allocations');
}

try {
  testPreservesLockedAllocation();
  testLockedReducesAvailablePool();
  testFullySatisfiedByLockedGetsNoNew();
  console.log('--- ALL ALLOCATION LOCK TESTS PASSED ---');
} catch (error) {
  console.error('❌ allocationLock failed:', error);
  process.exit(1);
}
