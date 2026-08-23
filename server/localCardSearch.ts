import { LogicalCard, CardPrinting, CardSet } from '../src/types/tcg';

export interface SearchFilters {
  supertype?: string;
  setCode?: string;
  rarity?: string;
  type?: string;
  regulationMark?: string;
  standardLegal?: boolean;
}

/**
 * LOCAL CARD SEARCH - Searches against local database only.
 * 
 * This is the primary search method for the application.
 * The Pokémon TCG API is only used as a fallback when a card is not found locally.
 */

/**
 * Normalizes text for robust search while preserving meaningful characters.
 * Preserves accented characters (é, ñ, etc.) for better Pokémon name matching.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/['''"`]/g, '') // remove quotes and apostrophes only
    .replace(/#/g, '') // let searches like "#87" match card number "87"
    .replace(/\s+/g, ' ') // normalize multiple spaces to single space
    .trim();
}

/**
 * High-performance local card search across card attributes and printing variations.
 */
export function searchLocalCards(
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

    // 4. Type filter
    if (filters?.type && filters.type !== 'ALL') {
      const normFilter = normalizeText(filters.type);
      const cardTypes = (card.types || []).map(t => normalizeText(t));
      if (!cardTypes.includes(normFilter)) return false;
    }

    // 5. Regulation mark filter
    if (filters?.regulationMark) {
      const cardPrintings = card.printings || [];
      const hasRegulationMatch = cardPrintings.some(
        (p) => p.regulationMark === filters.regulationMark
      );
      if (!hasRegulationMatch) return false;
    }

    // 6. Standard legality filter
    if (filters?.standardLegal !== undefined) {
      const cardPrintings = card.printings || [];
      const hasLegalMatch = cardPrintings.some(
        (p) => p.legalities?.standard === filters.standardLegal
      );
      if (!hasLegalMatch) return false;
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

      // Handle subtype markers (ex, EX, Mega, V, VMAX, VSTAR, etc.)
      const subtypeMarkers = ['ex', 'ex', 'mega', 'v', 'vmax', 'vstar', 'gx', 'tag team', 'restored'];
      if (subtypeMarkers.includes(token) && (normName.includes(token) || normSubtype.includes(token))) {
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
        const normArtist = normalizeText(p.artist || '');

        return (
          normSetCode.includes(token) ||
          normSetName.includes(token) ||
          normCardNumber === token ||
          normRarity.includes(token) ||
          normVariant.includes(token) ||
          normArtist.includes(token)
        );
      });
    });
  });
}

/**
 * Find a specific card by set code and card number.
 * Used for precise deck import matching.
 */
export function findCardBySetAndNumber(
  cards: LogicalCard[],
  setCode: string,
  cardNumber: string
): LogicalCard | null {
  const normSetCode = setCode.toLowerCase();
  const normCardNumber = cardNumber.toLowerCase();

  for (const card of cards) {
    const printings = card.printings || [];
    const matchingPrinting = printings.find(
      (p) => p.setCode.toLowerCase() === normSetCode && p.cardNumber.toLowerCase() === normCardNumber
    );
    if (matchingPrinting) {
      return card;
    }
  }

  return null;
}

/**
 * Find cards by set code and card name.
 * Used for deck import matching.
 */
export function findCardsBySetAndName(
  cards: LogicalCard[],
  setCode: string,
  cardName: string
): LogicalCard[] {
  const normSetCode = setCode.toLowerCase();
  const normCardName = normalizeText(cardName);

  return cards.filter((card) => {
    if (normalizeText(card.name) !== normCardName) return false;
    
    const printings = card.printings || [];
    return printings.some((p) => p.setCode.toLowerCase() === normSetCode);
  });
}

/**
 * Find cards by exact name.
 * Used for deck import fallback.
 */
export function findCardsByName(cards: LogicalCard[], cardName: string): LogicalCard[] {
  const normCardName = normalizeText(cardName);
  return cards.filter((card) => normalizeText(card.name) === normCardName);
}

/**
 * Find cards by partial name match.
 * Used for flexible search.
 */
export function findCardsByPartialName(cards: LogicalCard[], partialName: string): LogicalCard[] {
  const normPartial = normalizeText(partialName);
  return cards.filter((card) => normalizeText(card.name).includes(normPartial));
}

/**
 * Resolve a card from deck import with strict matching priority.
 * Returns the matched card and the match type, or null if not found/ambiguous.
 */
export interface CardResolution {
  card: LogicalCard | null;
  matchType: 'exact_id' | 'set_number' | 'set_name' | 'name_metadata' | 'name_unambiguous' | 'not_found' | 'ambiguous';
  possiblePrintings?: CardPrinting[];
}

export function resolveCardForImport(
  cards: LogicalCard[],
  cardName: string,
  setCode?: string,
  cardNumber?: string,
  canonicalId?: string
): CardResolution {
  // Priority 1: Exact canonical API card ID
  if (canonicalId) {
    const card = cards.find((c) => c.printings?.some((p) => p.id === canonicalId));
    if (card) {
      return { card, matchType: 'exact_id' };
    }
  }

  // Priority 2: Set ID + card number
  if (setCode && cardNumber) {
    const card = findCardBySetAndNumber(cards, setCode, cardNumber);
    if (card) {
      return { card, matchType: 'set_number' };
    }
  }

  // Priority 3: Set ID + normalized card name
  if (setCode) {
    const matches = findCardsBySetAndName(cards, setCode, cardName);
    if (matches.length === 1) {
      return { card: matches[0], matchType: 'set_name' };
    }
    if (matches.length > 1) {
      // Multiple matches - ambiguous
      const allPrintings = matches.flatMap((c) => c.printings || []);
      return { card: null, matchType: 'ambiguous', possiblePrintings: allPrintings };
    }
  }

  // Priority 4: Exact name + printing metadata (if multiple printings exist)
  const exactNameMatches = findCardsByName(cards, cardName);
  if (exactNameMatches.length > 1) {
    // Check if we can disambiguate by set code (if provided)
    if (setCode) {
      const setMatches = exactNameMatches.filter((c) =>
        c.printings?.some((p) => p.setCode.toLowerCase() === setCode.toLowerCase())
      );
      if (setMatches.length === 1) {
        return { card: setMatches[0], matchType: 'name_metadata' };
      }
    }
    // Still ambiguous
    const allPrintings = exactNameMatches.flatMap((c) => c.printings || []);
    return { card: null, matchType: 'ambiguous', possiblePrintings: allPrintings };
  }

  // Priority 5: Name-only matching ONLY when unambiguous
  if (exactNameMatches.length === 1) {
    return { card: exactNameMatches[0], matchType: 'name_unambiguous' };
  }

  // Not found
  return { card: null, matchType: 'not_found' };
}
