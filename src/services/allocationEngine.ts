import {
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
  CalculatedCardOwnership,
  OwnershipStatus,
  LogicalCard,
  CardPrinting,
  WishlistItem,
  StoreProfile,
  BulkLocationOverride,
  RequirementMode
} from '../types/tcg';

/**
 * Calculates ownership metrics for a specific card requirement inside a deck.
 */
export function calculateCardOwnershipForDeck(
  card: LogicalCard,
  requirement: DeckRequirement,
  deck: Deck,
  allDecks: Deck[],
  collectionItems: CollectionItem[],
  allocations: Allocation[]
): CalculatedCardOwnership {
  // Filter collection items matching requirement mode
  const matchingCollectionItems = collectionItems.filter((item) => {
    if (item.cardId !== card.id) return false;
    if (requirement.requirementMode === 'SPECIFIC_PRINTING' && requirement.preferredPrintingId) {
      return item.printingId === requirement.preferredPrintingId;
    }
    return true;
  });

  const totalOwnedInCollection = matchingCollectionItems.reduce((acc, item) => acc + item.quantity, 0);

  // Active decks map
  const activeDeckIds = new Set(allDecks.filter((d) => d.status === 'Active').map((d) => d.id));

  // Allocations to this specific deck matching requirement mode/item
  const allocatedToThisDeck = allocations
    .filter((a) => a.deckId === deck.id && a.requirementId === requirement.id && matchingCollectionItems.some((ci) => ci.id === a.collectionItemId))
    .reduce((acc, a) => acc + a.quantity, 0);

  // Allocations to OTHER active decks for matching items
  const allocatedToOtherDecks = allocations
    .filter((a) => a.deckId !== deck.id && activeDeckIds.has(a.deckId))
    .reduce((acc, a) => {
      const isMatchingCard = matchingCollectionItems.some((ci) => ci.id === a.collectionItemId);
      return isMatchingCard ? acc + a.quantity : acc;
    }, 0);

  const totalAllocatedAcrossActiveDecks = allocations
    .filter((a) => activeDeckIds.has(a.deckId))
    .reduce((acc, a) => {
      const isMatchingCard = matchingCollectionItems.some((ci) => ci.id === a.collectionItemId);
      return isMatchingCard ? acc + a.quantity : acc;
    }, 0);

  const availableInCollection = Math.max(0, totalOwnedInCollection - totalAllocatedAcrossActiveDecks);

  const required = requirement.quantity;
  const remainingNeeded = Math.max(0, required - allocatedToThisDeck);
  const assignableQuantity = deck.status === 'Active'
    ? Math.min(remainingNeeded, availableInCollection)
    : 0;
  const canFullyAssignNow = remainingNeeded > 0 && assignableQuantity === remainingNeeded;
  const isSharedWithOtherDecks = allocatedToOtherDecks > 0;
  const missing = Math.max(0, remainingNeeded - availableInCollection);

  // Determine 1 of 4 Ownership States:
  let status: OwnershipStatus;
  if (allocatedToThisDeck + availableInCollection >= required) {
    status = 'FULLY_OWNED';
  } else if (totalOwnedInCollection === 0) {
    status = 'NOT_OWNED';
  } else if (totalOwnedInCollection < required) {
    status = 'PARTIALLY_OWNED';
  } else {
    // Total owned >= required, but not enough unallocated available because they're locked in other decks!
    status = 'ALLOCATED_ELSEWHERE';
  }

  return {
    cardId: card.id,
    cardName: card.name,
    required,
    allocatedToThisDeck,
    availableInCollection,
    totalOwnedInCollection,
    allocatedToOtherDecks,
    remainingNeeded,
    assignableQuantity,
    canFullyAssignNow,
    isSharedWithOtherDecks,
    missing,
    status,
    requirementMode: requirement.requirementMode,
    preferredPrintingId: requirement.preferredPrintingId,
  };
}

/**
 * Calculates physical collection shortfalls across multiple decks without double counting.
 */
export function calculateMultiDeckShortfalls(
  decks: Deck[],
  requirements: DeckRequirement[],
  collectionItems: CollectionItem[],
  cards: LogicalCard[],
  options?: { includeInactiveDecks?: boolean }
): { cardId: string; cardName: string; totalRequired: number; totalOwned: number; missing: number }[] {
  const includedDecks = options?.includeInactiveDecks
    ? decks
    : decks.filter((d) => d.status === 'Active');
  const activeDeckIds = new Set(includedDecks.map((d) => d.id));

  const activeRequirements = requirements.filter((r) => activeDeckIds.has(r.deckId));

  const requiredPerCardMap = new Map<string, number>();
  for (const req of activeRequirements) {
    const current = requiredPerCardMap.get(req.cardId) || 0;
    requiredPerCardMap.set(req.cardId, current + req.quantity);
  }

  const results: { cardId: string; cardName: string; totalRequired: number; totalOwned: number; missing: number }[] = [];

  for (const [cardId, totalRequired] of requiredPerCardMap.entries()) {
    const card = cards.find((c) => c.id === cardId);
    const cardName = card ? card.name : 'Unknown Card';

    const totalOwned = collectionItems
      .filter((ci) => ci.cardId === cardId)
      .reduce((sum, ci) => sum + ci.quantity, 0);

    const missing = Math.max(0, totalRequired - totalOwned);
    if (missing > 0) {
      results.push({
        cardId,
        cardName,
        totalRequired,
        totalOwned,
        missing,
      });
    }
  }

  return results;
}

/**
 * Auto-allocates available physical collection items to deck requirements.
 * Locked allocations for the target deck are preserved and count against both
 * item availability and requirement satisfaction. Unlocked rows for the deck
 * are recomputed. At most one row per (deckId, requirementId, collectionItemId).
 */
export function autoAllocateDeck(
  deckId: string,
  requirements: DeckRequirement[],
  collectionItems: CollectionItem[],
  allocations: Allocation[],
  activeDecks: Deck[]
): Allocation[] {
  const preservedLocked = allocations.filter((a) => a.deckId === deckId && a.isLocked);
  const newAllocations: Allocation[] = [
    ...allocations.filter((a) => a.deckId !== deckId),
    ...preservedLocked,
  ];
  const activeDeckIds = new Set(activeDecks.filter((d) => d.status === 'Active').map((d) => d.id));

  // If the target deck is inactive, drop its unlocked rows and keep locked? Plan: inactive returns without adding.
  // Preserve locked rows for inactive decks as well (they remain in newAllocations via preservedLocked).
  if (!activeDeckIds.has(deckId)) {
    return newAllocations;
  }

  // Compute available quantity per collection item:
  // item.quantity - allocated to other active decks - locked for this deck
  const itemAvailableMap = new Map<string, number>();
  for (const item of collectionItems) {
    const allocatedOther = allocations
      .filter((a) => a.collectionItemId === item.id && a.deckId !== deckId && activeDeckIds.has(a.deckId))
      .reduce((sum, a) => sum + a.quantity, 0);
    const lockedForThisDeck = preservedLocked
      .filter((a) => a.collectionItemId === item.id)
      .reduce((sum, a) => sum + a.quantity, 0);
    const available = Math.max(0, item.quantity - allocatedOther - lockedForThisDeck);
    itemAvailableMap.set(item.id, available);
  }

  const deckReqs = requirements.filter((r) => r.deckId === deckId);

  const targetDeck = activeDecks.find((d) => d.id === deckId);
  const isLocked = targetDeck?.isPermanentlyAssembled ?? false;

  for (const req of deckReqs) {
    const lockedForReq = preservedLocked
      .filter((a) => a.requirementId === req.id)
      .reduce((sum, a) => sum + a.quantity, 0);
    let needed = Math.max(0, req.quantity - lockedForReq);

    // Matching collection items
    const candidates = collectionItems.filter((item) => {
      if (item.cardId !== req.cardId) return false;
      if (req.requirementMode === 'SPECIFIC_PRINTING' && req.preferredPrintingId) {
        return item.printingId === req.preferredPrintingId;
      }
      return true;
    });

    for (const cand of candidates) {
      if (needed <= 0) break;
      const avail = itemAvailableMap.get(cand.id) || 0;
      if (avail <= 0) continue;

      const toAllocate = Math.min(needed, avail);

      const existingIdx = newAllocations.findIndex(
        (a) =>
          a.deckId === deckId &&
          a.requirementId === req.id &&
          a.collectionItemId === cand.id
      );

      if (existingIdx !== -1) {
        newAllocations[existingIdx] = {
          ...newAllocations[existingIdx],
          quantity: newAllocations[existingIdx].quantity + toAllocate,
        };
      } else {
        newAllocations.push({
          id: `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          collectionItemId: cand.id,
          deckId,
          requirementId: req.id,
          quantity: toAllocate,
          isLocked,
        });
      }

      itemAvailableMap.set(cand.id, avail - toAllocate);
      needed -= toAllocate;
    }
  }

  return newAllocations;
}

/**
 * Maps a card to its bulk store location based on store profile rules and overrides.
 */
export function resolveBulkCategoryForCard(
  card: LogicalCard,
  printing: CardPrinting | undefined,
  storeProfile: StoreProfile
): string {
  // Check explicit overrides first
  for (const override of storeProfile.overrides) {
    if (override.cardId && override.cardId === card.id) {
      const cat = storeProfile.categories.find((c) => c.id === override.categoryId);
      if (cat) return cat.name;
    }
    if (printing && override.rarity && override.rarity === printing.rarity) {
      const cat = storeProfile.categories.find((c) => c.id === override.categoryId);
      if (cat) return cat.name;
    }
    if (override.supertype && override.supertype === card.supertype) {
      const cat = storeProfile.categories.find((c) => c.id === override.categoryId);
      if (cat) return cat.name;
    }
  }

  // Default heuristic by card name first letter and supertype
  const nameLetter = card.name.charAt(0).toUpperCase();
  const rarity = printing ? printing.rarity : 'Uncommon';

  if (card.supertype === 'Trainer') {
    const trainerCat = storeProfile.categories.find((c) => c.name.toLowerCase().includes('trainer'));
    if (trainerCat) return trainerCat.name;
  }

  if (rarity === 'Rare' || rarity === 'Double Rare' || rarity === 'Ultra Rare' || rarity === 'Illustration Rare' || rarity === 'ACE SPEC') {
    if (nameLetter >= 'A' && nameLetter <= 'F') {
      const rareAF = storeProfile.categories.find((c) => c.name.includes('Rare') && c.name.includes('A–F'));
      if (rareAF) return rareAF.name;
    }
    if (nameLetter >= 'G' && nameLetter <= 'M') {
      const rareGM = storeProfile.categories.find((c) => c.name.includes('Rare') && c.name.includes('G–M'));
      if (rareGM) return rareGM.name;
    }
    if (nameLetter >= 'N' && nameLetter <= 'Z') {
      const rareNZ = storeProfile.categories.find((c) => c.name.includes('Rare') && c.name.includes('N–Z'));
      if (rareNZ) return rareNZ.name;
    }
  }

  // Fallback category matching alphabet
  if (nameLetter >= 'A' && nameLetter <= 'F') {
    const cat = storeProfile.categories.find((c) => c.name.includes('A–F') || c.name.includes('A-F'));
    if (cat) return cat.name;
  }
  if (nameLetter >= 'G' && nameLetter <= 'M') {
    const cat = storeProfile.categories.find((c) => c.name.includes('G–M') || c.name.includes('G-M'));
    if (cat) return cat.name;
  }
  if (nameLetter >= 'N' && nameLetter <= 'Z') {
    const cat = storeProfile.categories.find((c) => c.name.includes('N–Z') || c.name.includes('N-Z'));
    if (cat) return cat.name;
  }

  return storeProfile.categories[0]?.name || 'General Bulk';
}
