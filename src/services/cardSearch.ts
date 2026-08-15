import { LogicalCard, CardPrinting } from '../types/tcg';

export interface SearchFilters {
  supertype?: string;
  setCode?: string;
  rarity?: string;
}

/**
 * LOCAL CARD SEARCH - For filtering already-cached cards only.
 * 
 * IMPORTANT: This is NOT a competing implementation with the Pokémon TCG API search.
 * The Pokémon TCG API (server/cardDataProvider.ts) remains the canonical source for:
 * - New card discovery
 * - Set metadata validation
 * - Card/printing data
 * 
 * This local search is only used for:
 * - Filtering cards already in the local database
 * - Client-side filtering of cached results
 * - Test scenarios with sample data
 * 
 * Do not use this for discovering new cards from the Pokémon TCG API.
 */

/**
 * Normalizes text for robust search while preserving meaningful characters.
 * Now preserves accented characters (é, ñ, etc.) for better Pokémon name matching.
 */
function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/['’'"`]/g, '') // remove quotes and apostrophes only
    .replace(/\s+/g, ' ') // normalize multiple spaces to single space
    .trim();
}

/**
 * High-performance, comprehensive card search pipeline across card attributes and printing variations.
 */
export function searchCards(
  cards: LogicalCard[],
  query: string,
  filters?: SearchFilters
): LogicalCard[] {
  const rawQuery = (query || '').trim();
  const normalizedQuery = normalizeText(rawQuery);
  const queryTokens = normalizedQuery ? normalizedQuery.split(/\s+/) : [];

  return cards.filter((card) => {
    // 1. Supertype filter
    if (filters?.supertype && filters.supertype !== 'ALL') {
      const normFilter = normalizeText(filters.supertype);
      const normCardSuper = normalizeText(card.supertype);
      if (normFilter !== normCardSuper) {
        return false;
      }
    }

    // 2. Set code filter
    if (filters?.setCode && filters.setCode !== 'ALL') {
      const cardPrintings = card.printings || [];
      const hasSetMatch = cardPrintings.some(
        (p) => p.setCode.toUpperCase() === filters.setCode?.toUpperCase()
      );
      if (!hasSetMatch) return false;
    }

    // 3. Rarity filter
    if (filters?.rarity && filters.rarity !== 'ALL') {
      const cardPrintings = card.printings || [];
      const hasRarityMatch = cardPrintings.some((p) => p.rarity === filters.rarity);
      if (!hasRarityMatch) return false;
    }

    // If query is empty, return true if pass filters
    if (queryTokens.length === 0) {
      return true;
    }

    // Prepare search fields for this card
    const normName = normalizeText(card.name);
    const normSupertype = normalizeText(card.supertype);
    const normSubtype = normalizeText(card.subtype || '');
    const normRules = normalizeText((card.rules || []).join(' '));
    const normTypes = normalizeText((card.types || []).join(' '));

    const printings = card.printings || [];

    // Check if EVERY token in the user query matches at least ONE field on the card or its printings
    return queryTokens.every((token) => {
      // Handle "basic" query token matching subtype or card attributes
      if (token === 'basic' && (normSubtype.includes('basic') || normName.includes('basic'))) {
        return true;
      }

      // Handle "energy" query token matching supertype or name
      if (token === 'energy' && (normSupertype.includes('energy') || normName.includes('energy'))) {
        return true;
      }

      // Handle "pokemon" / "poke" query token matching supertype or name
      if ((token === 'pokemon' || token === 'poke') && (normSupertype.includes('pokemon') || normName.includes('pokemon'))) {
        return true;
      }

      // Direct card field matches
      if (normName.includes(token)) return true;
      if (normSupertype.includes(token)) return true;
      if (normSubtype.includes(token)) return true;
      if (normTypes.includes(token)) return true;
      if (normRules.includes(token)) return true;

      // Check printings
      return printings.some((p) => {
        const normSetCode = normalizeText(p.setCode);
        const normSetName = normalizeText(p.setName);
        const normCardNumber = normalizeText(p.cardNumber);
        const normRarity = normalizeText(p.rarity);
        const normVariant = normalizeText(p.variant);

        return (
          normSetCode.includes(token) ||
          normSetName.includes(token) ||
          normCardNumber === token ||
          normRarity.includes(token) ||
          normVariant.includes(token)
        );
      });
    });
  });
}

