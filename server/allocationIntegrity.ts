/**
 * Pure allocation invariant / allocate / release helpers.
 * Imported by server.ts and by tests (avoids booting the Express server).
 */
import type {
  Allocation,
  CollectionItem,
  Deck,
  DeckRequirement,
} from '../src/types/tcg';

export interface AllocationDbSlice {
  collectionItems: CollectionItem[];
  decks: Deck[];
  deckRequirements: DeckRequirement[];
  allocations: Allocation[];
}

export interface InvariantResult {
  ok: boolean;
  error?: string;
}

/**
 * For every collectionItem: sum(all allocation.quantity) <= item.quantity.
 * Reports deck names on violation.
 */
export function validateAllocationInvariants(db: AllocationDbSlice): InvariantResult {
  for (const item of db.collectionItems) {
    const itemAllocations = db.allocations.filter((a) => a.collectionItemId === item.id);
    const totalAllocated = itemAllocations.reduce((sum, a) => sum + a.quantity, 0);
    if (totalAllocated > item.quantity) {
      const deckNames = [
        ...new Set(
          itemAllocations.map(
            (a) => db.decks.find((d) => d.id === a.deckId)?.name || 'Unknown Deck'
          )
        ),
      ].join(', ');
      return {
        ok: false,
        error: `Over-allocation: collection item ${item.id} has ${totalAllocated} allocated but only ${item.quantity} owned (decks: ${deckNames})`,
      };
    }
  }

  for (const req of db.deckRequirements) {
    const reqAllocations = db.allocations.filter((a) => a.requirementId === req.id);
    const totalAllocated = reqAllocations.reduce((sum, a) => sum + a.quantity, 0);
    if (totalAllocated > req.quantity) {
      const deckName = db.decks.find((d) => d.id === req.deckId)?.name || 'Unknown Deck';
      return {
        ok: false,
        error: `Over-allocation: requirement ${req.id} on deck "${deckName}" has ${totalAllocated} allocated but only ${req.quantity} required`,
      };
    }
  }

  return { ok: true };
}

export interface AllocateInput {
  deckId: string;
  requirementId: string;
  collectionItemId: string;
  quantity: number;
}

export interface AllocateResult {
  ok: boolean;
  error?: string;
  status?: number;
  allocations?: Allocation[];
}

/**
 * Manual allocate: merge into existing identity or create locked row.
 * Returns updated allocations array (does not mutate when rejected).
 */
export function applyManualAllocate(
  db: AllocationDbSlice,
  input: AllocateInput
): AllocateResult {
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, status: 400, error: 'quantity must be a positive integer' };
  }

  const deck = db.decks.find((d) => d.id === input.deckId);
  if (!deck) {
    return { ok: false, status: 404, error: 'Deck not found' };
  }
  if (deck.status !== 'Active') {
    return { ok: false, status: 400, error: 'Deck must be Active to allocate' };
  }

  const requirement = db.deckRequirements.find(
    (r) => r.id === input.requirementId && r.deckId === input.deckId
  );
  if (!requirement) {
    return { ok: false, status: 400, error: 'Requirement does not belong to deck' };
  }

  const collectionItem = db.collectionItems.find((ci) => ci.id === input.collectionItemId);
  if (!collectionItem) {
    return { ok: false, status: 404, error: 'Collection item not found' };
  }

  if (collectionItem.cardId !== requirement.cardId) {
    return { ok: false, status: 400, error: 'Collection item does not match requirement cardId' };
  }

  if (
    requirement.requirementMode === 'SPECIFIC_PRINTING' &&
    requirement.preferredPrintingId &&
    collectionItem.printingId !== requirement.preferredPrintingId
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Collection item printing does not match SPECIFIC_PRINTING requirement',
    };
  }

  const allocations = db.allocations.map((a) => ({ ...a }));
  const existing = allocations.find(
    (a) =>
      a.deckId === input.deckId &&
      a.requirementId === input.requirementId &&
      a.collectionItemId === input.collectionItemId
  );

  if (existing) {
    existing.quantity += quantity;
    existing.isLocked = true;
  } else {
    allocations.push({
      id: `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      deckId: input.deckId,
      requirementId: input.requirementId,
      collectionItemId: input.collectionItemId,
      quantity,
      isLocked: true,
    });
  }

  const nextDb: AllocationDbSlice = {
    ...db,
    allocations,
  };
  const invariant = validateAllocationInvariants(nextDb);
  if (!invariant.ok) {
    return { ok: false, status: 400, error: invariant.error };
  }

  return { ok: true, allocations };
}

export interface ReleaseInput {
  allocationId: string;
  quantity?: number;
}

export interface ReleaseResult {
  ok: boolean;
  error?: string;
  status?: number;
  allocations?: Allocation[];
}

/**
 * Partial release reduces quantity; full release (or quantity >= row) deletes the row.
 */
export function applyReleaseAllocation(
  db: AllocationDbSlice,
  input: ReleaseInput
): ReleaseResult {
  const allocations = db.allocations.map((a) => ({ ...a }));
  const idx = allocations.findIndex((a) => a.id === input.allocationId);
  if (idx === -1) {
    return { ok: false, status: 404, error: 'Allocation not found' };
  }

  const row = allocations[idx];
  if (input.quantity === undefined || input.quantity === null) {
    allocations.splice(idx, 1);
  } else {
    const releaseQty = Number(input.quantity);
    if (!Number.isInteger(releaseQty) || releaseQty <= 0) {
      return { ok: false, status: 400, error: 'quantity must be a positive integer when provided' };
    }
    if (releaseQty >= row.quantity) {
      allocations.splice(idx, 1);
    } else {
      row.quantity -= releaseQty;
    }
  }

  const nextDb: AllocationDbSlice = { ...db, allocations };
  const invariant = validateAllocationInvariants(nextDb);
  if (!invariant.ok) {
    return { ok: false, status: 400, error: invariant.error };
  }

  return { ok: true, allocations };
}
