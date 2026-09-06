import {
  CardPrinting,
  CollectionItem,
  Deck,
  DeckRequirement,
  LogicalCard,
  RequirementMode,
  StoreShoppingListItem,
  StoreShoppingListResult,
} from '../types/tcg';

interface ShoppingNeed {
  cardId: string;
  cardName: string;
  requirementMode: RequirementMode;
  preferredPrintingId?: string;
  requiredQty: number;
}

function buildBobShopSearchUrl(query: string): string {
  const params = new URLSearchParams({
    IncludedKeywords: query,
    submitter: 'SearchUrlRewrite',
  });
  return `https://www.bobshop.co.za/mobilejquery/jsp/tradesearch/TradeSearch.jsp?${params.toString()}`;
}

/**
 * Calculates physical card shortfalls across active decks while respecting exact
 * printing requirements. Exact requirements reserve their matching owned copies
 * first; remaining copies of the card may then satisfy ANY_PRINTING requirements.
 */
export function calculatePrintingAwareShoppingNeeds(
  decks: Deck[],
  requirements: DeckRequirement[],
  collectionItems: CollectionItem[],
  cards: LogicalCard[]
): ShoppingNeed[] {
  const activeDeckIds = new Set(decks.filter((deck) => deck.status === 'Active').map((deck) => deck.id));
  const activeRequirements = requirements.filter((requirement) => activeDeckIds.has(requirement.deckId));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const cardIds = new Set(activeRequirements.map((requirement) => requirement.cardId));
  const needs: ShoppingNeed[] = [];

  for (const cardId of cardIds) {
    const cardRequirements = activeRequirements.filter((requirement) => requirement.cardId === cardId);
    const cardName = cardsById.get(cardId)?.name || cardId;
    const ownedByPrinting = new Map<string, number>();

    for (const item of collectionItems.filter((collectionItem) => collectionItem.cardId === cardId)) {
      ownedByPrinting.set(item.printingId, (ownedByPrinting.get(item.printingId) || 0) + item.quantity);
    }

    const exactRequiredByPrinting = new Map<string, number>();
    let anyRequired = 0;
    for (const requirement of cardRequirements) {
      if (requirement.requirementMode === 'SPECIFIC_PRINTING' && requirement.preferredPrintingId) {
        exactRequiredByPrinting.set(
          requirement.preferredPrintingId,
          (exactRequiredByPrinting.get(requirement.preferredPrintingId) || 0) + requirement.quantity
        );
      } else {
        anyRequired += requirement.quantity;
      }
    }

    for (const [printingId, requiredQty] of exactRequiredByPrinting) {
      const missing = Math.max(0, requiredQty - (ownedByPrinting.get(printingId) || 0));
      if (missing > 0) {
        needs.push({
          cardId,
          cardName,
          requirementMode: 'SPECIFIC_PRINTING',
          preferredPrintingId: printingId,
          requiredQty: missing,
        });
      }
    }

    const ownedAfterExactRequirements = [...ownedByPrinting.entries()].reduce((total, [printingId, ownedQty]) => {
      return total + Math.max(0, ownedQty - (exactRequiredByPrinting.get(printingId) || 0));
    }, 0);
    const missingAny = Math.max(0, anyRequired - ownedAfterExactRequirements);
    if (missingAny > 0) {
      needs.push({
        cardId,
        cardName,
        requirementMode: 'ANY_PRINTING',
        requiredQty: missingAny,
      });
    }
  }

  return needs.sort((left, right) =>
    left.cardName.localeCompare(right.cardName) ||
    (left.preferredPrintingId || '').localeCompare(right.preferredPrintingId || '')
  );
}

export function buildBobShopShoppingList(
  decks: Deck[],
  requirements: DeckRequirement[],
  collectionItems: CollectionItem[],
  cards: LogicalCard[],
  printings: CardPrinting[]
): StoreShoppingListResult {
  const printingsById = new Map(printings.map((printing) => [printing.id, printing]));
  const needs = calculatePrintingAwareShoppingNeeds(decks, requirements, collectionItems, cards);
  const items: StoreShoppingListItem[] = needs.map((need) => {
    const printing = need.preferredPrintingId ? printingsById.get(need.preferredPrintingId) : undefined;
    const printingString = printing
      ? `${printing.setName} (${printing.setCode} #${printing.cardNumber}) · ${printing.variant}`
      : need.requirementMode === 'SPECIFIC_PRINTING'
        ? 'Exact printing unavailable in local catalogue'
        : 'Any compatible printing';
    const searchQuery = printing
      ? `Pokemon ${need.cardName} ${printing.setCode} ${printing.cardNumber}`
      : `Pokemon ${need.cardName} card`;

    return {
      key: `${need.cardId}:${need.preferredPrintingId || 'ANY'}`,
      ...need,
      printingString,
      searchQuery,
      searchUrl: buildBobShopSearchUrl(searchQuery),
    };
  });

  return {
    marketplace: 'Bob Shop',
    totalMissingCards: items.reduce((total, item) => total + item.requiredQty, 0),
    uniqueItems: items.length,
    items,
  };
}
