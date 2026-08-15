import {
  validateAllocationInvariants,
  applyManualAllocate,
  applyReleaseAllocation,
  AllocationDbSlice,
} from '../server/allocationIntegrity';
import {
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
} from '../src/types/tcg';

console.log('--- RUNNING ALLOCATION INVARIANT TESTS ---');

function baseDb(overrides: Partial<AllocationDbSlice> = {}): AllocationDbSlice {
  const deck: Deck = {
    id: 'deck_inv_1',
    name: 'Invariant Deck',
    version: '1.0',
    format: 'Standard',
    status: 'Active',
    isPermanentlyAssembled: false,
    updatedAt: new Date().toISOString(),
  };
  const req: DeckRequirement = {
    id: 'req_inv_1',
    deckId: 'deck_inv_1',
    cardId: 'card_inv_1',
    quantity: 4,
    requirementMode: 'ANY_PRINTING',
  };
  const item: CollectionItem = {
    id: 'ci_inv_1',
    cardId: 'card_inv_1',
    printingId: 'prt_inv_1',
    quantity: 4,
    condition: 'NM',
    language: 'English',
  };

  return {
    collectionItems: [item],
    decks: [deck],
    deckRequirements: [req],
    allocations: [],
    ...overrides,
  };
}

function testDetectsOverAllocation() {
  const db = baseDb({
    allocations: [
      {
        id: 'alloc_over_1',
        deckId: 'deck_inv_1',
        requirementId: 'req_inv_1',
        collectionItemId: 'ci_inv_1',
        quantity: 5,
        isLocked: false,
      },
    ],
  });

  const result = validateAllocationInvariants(db);
  if (result.ok) {
    throw new Error('Expected over-allocation to be detected');
  }
  if (!result.error || !result.error.includes('Invariant Deck')) {
    throw new Error(`Expected error to mention deck name, got: ${result.error}`);
  }
  console.log('✅ (a) validateAllocationInvariants detects over-allocation and reports deck names');
}

function testAllocateBeyondAvailableRejected() {
  const db = baseDb({
    allocations: [
      {
        id: 'alloc_exist_1',
        deckId: 'deck_inv_1',
        requirementId: 'req_inv_1',
        collectionItemId: 'ci_inv_1',
        quantity: 3,
        isLocked: true,
      },
    ],
  });

  const result = applyManualAllocate(db, {
    deckId: 'deck_inv_1',
    requirementId: 'req_inv_1',
    collectionItemId: 'ci_inv_1',
    quantity: 2, // 3+2=5 > 4 owned
  });

  if (result.ok) {
    throw new Error('Allocate beyond available must be rejected');
  }
  if (result.status !== 400) {
    throw new Error(`Expected status 400, got ${result.status}`);
  }
  console.log('✅ (b) allocate quantity beyond available is rejected');
}

function testReleaseReducesThenDeletes() {
  const db = baseDb({
    allocations: [
      {
        id: 'alloc_rel_1',
        deckId: 'deck_inv_1',
        requirementId: 'req_inv_1',
        collectionItemId: 'ci_inv_1',
        quantity: 3,
        isLocked: true,
      },
    ],
  });

  const partial = applyReleaseAllocation(db, { allocationId: 'alloc_rel_1', quantity: 1 });
  if (!partial.ok || !partial.allocations) {
    throw new Error(`Partial release failed: ${partial.error}`);
  }
  const afterPartial = partial.allocations.find((a) => a.id === 'alloc_rel_1');
  if (!afterPartial || afterPartial.quantity !== 2) {
    throw new Error('Partial release should reduce quantity to 2');
  }

  const full = applyReleaseAllocation(
    { ...db, allocations: partial.allocations },
    { allocationId: 'alloc_rel_1' }
  );
  if (!full.ok || !full.allocations) {
    throw new Error(`Full release failed: ${full.error}`);
  }
  if (full.allocations.find((a) => a.id === 'alloc_rel_1')) {
    throw new Error('Full release should delete the row');
  }

  console.log('✅ (c) release reduces then deletes the row');
}

try {
  testDetectsOverAllocation();
  testAllocateBeyondAvailableRejected();
  testReleaseReducesThenDeletes();
  console.log('--- ALL ALLOCATION INVARIANT TESTS PASSED ---');
} catch (error) {
  console.error('❌ allocationInvariant failed:', error);
  process.exit(1);
}
