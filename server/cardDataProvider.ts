import { config } from 'dotenv';
import { LogicalCard, CardPrinting, Supertype, Subtype, CardRarity, CardVariant } from '../src/types/tcg';

// Load environment variables
config();

const POKEMON_TCG_API_BASE = 'https://api.pokemontcg.io/v2';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const searchCache = new Map<string, CacheEntry<{ cards: LogicalCard[]; totalCount: number; page: number; pageSize: number }>>();
const cardByIdCache = new Map<string, CacheEntry<{ card: LogicalCard; printing: CardPrinting }>>();
const setsCache = new Map<string, CacheEntry<{ sets: PokemonTcgSet[] }>>();

// Rate limiting to respect Pokémon TCG API limits (30/minute without key, higher with key)
const lastRequestTime = new Map<string, number>();
const MIN_REQUEST_INTERVAL_MS = 2000; // 2 seconds between requests (conservative)

interface PokemonTcgSet {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  ptcgoCode?: string;
  releaseDate: string;
  updatedAt: string;
}

/**
 * Rate limiter to respect Pokémon TCG API rate limits.
 * Ensures minimum time between requests to avoid 429/502 errors.
 */
async function rateLimit(operation: string): Promise<void> {
  const now = Date.now();
  const lastTime = lastRequestTime.get(operation) || 0;
  const elapsed = now - lastTime;
  
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const delay = MIN_REQUEST_INTERVAL_MS - elapsed;
    console.log(`[CardDataProvider] Rate limiting: waiting ${delay}ms before ${operation}`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  lastRequestTime.set(operation, Date.now());
}

/**
 * Gets HTTP headers for Pokémon TCG API, attaching X-Api-Key if configured in server env.
 */
function getApiHeaders(): Record<string, string> {
  const apiKey = process.env.POKEMONTCG_API_KEY || process.env.POKEMON_TCG_API_KEY;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  if (apiKey && apiKey.trim().length > 0) {
    headers['X-Api-Key'] = apiKey.trim();
    console.log('[CardDataProvider] Using API key for requests');
  } else {
    console.log('[CardDataProvider] No API key found - using default rate limits');
  }
  return headers;
}

/**
 * Fetches and caches Pokémon TCG API sets metadata.
 * This is the canonical source for set code validation.
 */
export async function fetchPokemonTcgSets(): Promise<PokemonTcgSet[]> {
  const cacheKey = 'sets_all';
  const cached = setsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data.sets;
  }

  try {
    await rateLimit('fetchSets');
    const apiUrl = `${POKEMON_TCG_API_BASE}/sets`;
    console.log(`[CardDataProvider] Fetching sets: ${apiUrl}`);
    
    const res = await fetch(apiUrl, {
      headers: getApiHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[CardDataProvider] Failed to fetch sets: HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    const sets: PokemonTcgSet[] = json.data || [];
    
    setsCache.set(cacheKey, {
      data: { sets },
      timestamp: Date.now(),
    });
    
    console.log(`[CardDataProvider] Cached ${sets.length} sets`);
    return sets;
  } catch (err: any) {
    console.error('[CardDataProvider] Failed to fetch sets:', err);
    return [];
  }
}

/**
 * Checks if a given code matches a known Pokémon TCG set ID or ptcgoCode.
 */
export async function isValidSetCode(code: string): Promise<boolean> {
  if (!code) return false;
  
  const normalizedCode = code.toLowerCase();
  const sets = await fetchPokemonTcgSets();
  
  return sets.some(set => 
    set.id.toLowerCase() === normalizedCode || 
    (set.ptcgoCode && set.ptcgoCode.toLowerCase() === normalizedCode)
  );
}

/**
 * Sanitizes a string into a clean ID slug.
 */
function slugify(text: string): string {
  if (!text) return 'unknown';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Maps a Pokemontcg.io raw API card object to LogicalCard and CardPrinting.
 */
export function transformApiCardToLogicalAndPrinting(apiCard: any): { card: LogicalCard; printing: CardPrinting } {
  const cardName = apiCard.name || 'Unknown Card';
  const slug = slugify(cardName);
  const cardId = `card_${slug}`;
  const printingId = apiCard.id; // Canonical ID from Pokemontcg API (e.g., 'sv1-196', 'xy1-4', 'paf-137')

  // Derive market price from TCGPlayer object if available
  let marketPrice = 0.50;
  if (apiCard.tcgplayer?.prices) {
    const prices = apiCard.tcgplayer.prices;
    const priceObj = prices.holofoil || prices.normal || prices.unlimitedHolofoil || prices.reverseHolofoil || prices['1stEditionHolofoil'] || Object.values(prices)[0];
    if (priceObj && typeof priceObj === 'object') {
      marketPrice = priceObj.market || priceObj.mid || priceObj.low || 0.50;
    }
  }

  // Subtype mapping
  const primarySubtype = (apiCard.subtypes && apiCard.subtypes.length > 0) ? apiCard.subtypes[0] : '';

  // Image URLs
  const imageUrl = apiCard.images?.large || apiCard.images?.small || 'https://images.pokemontcg.io/sv1/1_hires.png';

  const printing: CardPrinting = {
    id: printingId,
    cardId,
    cardName,
    setCode: apiCard.set?.ptcgoCode || apiCard.set?.id?.toUpperCase() || 'SVI',
    setName: apiCard.set?.name || 'Scarlet & Violet',
    cardNumber: apiCard.number || '1',
    rarity: (apiCard.rarity as CardRarity) || 'Common',
    variant: (apiCard.rarity === 'ACE SPEC' ? 'Holo' : (apiCard.rarity?.includes('Rare') ? 'Holo' : 'Normal')) as CardVariant,
    language: 'English',
    imageUrl,
    marketPrice: Number(marketPrice.toFixed(2)),
  };

  const card: LogicalCard = {
    id: cardId,
    name: cardName,
    supertype: (apiCard.supertype || 'Pokémon') as Supertype,
    subtype: (primarySubtype || 'Basic') as Subtype,
    hp: apiCard.hp ? parseInt(apiCard.hp, 10) : undefined,
    types: apiCard.types || [],
    rules: apiCard.rules || [],
    isAceSpec: apiCard.rarity === 'ACE SPEC' || (apiCard.rules || []).some((r: string) => r.includes('ACE SPEC')),
    defaultPrintingId: printingId,
    printings: [printing],
  };

  return { card, printing };
}

/**
 * Parses a search query into structured components for intelligent search.
 */
interface ParsedQuery {
  cardName: string;
  setCode: string;
  cardNumber: string;
  hasSetCode: boolean;
  hasCardNumber: boolean;
  suspectedSetCodes: string[]; // Store potential set codes for validation
}

async function parseSearchQuery(rawQuery: string): Promise<ParsedQuery> {
  const clean = rawQuery.trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  
  const result: ParsedQuery = {
    cardName: '',
    setCode: '',
    cardNumber: '',
    hasSetCode: false,
    hasCardNumber: false,
    suspectedSetCodes: [],
  };

  // Pattern for set codes: 2-4 uppercase letters, optionally followed by numbers
  const setCodePattern = /^[A-Z]{2,4}\d*$/;
  
  // Pattern for card numbers: standalone numbers
  const cardNumberPattern = /^\d+$/;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const upperToken = token.toUpperCase();

    // Check if token might be a set code (pattern match)
    if (setCodePattern.test(upperToken) && !result.hasSetCode) {
      result.suspectedSetCodes.push(upperToken.toLowerCase());
      result.setCode = upperToken.toLowerCase();
      result.hasSetCode = true;
    }
    // Check if token is a card number (and not part of set code)
    else if (cardNumberPattern.test(token) && !result.hasCardNumber) {
      result.cardNumber = token;
      result.hasCardNumber = true;
    }
    // Otherwise, treat as part of card name
    else {
      if (result.cardName) {
        result.cardName += ' ';
      }
      result.cardName += token;
    }
  }

  // Validate suspected set codes against actual API metadata
  if (result.suspectedSetCodes.length > 0) {
    const validSetCodes = await Promise.all(
      result.suspectedSetCodes.map(code => isValidSetCode(code))
    );
    
    // Use only validated set codes
    const validCodes = result.suspectedSetCodes.filter((_, i) => validSetCodes[i]);
    if (validCodes.length > 0) {
      result.setCode = validCodes[0]; // Use first valid set code
      result.hasSetCode = true;
    } else {
      // No valid set codes found, treat as card name instead
      result.setCode = '';
      result.hasSetCode = false;
      result.suspectedSetCodes = [];
    }
  }

  return result;
}

/**
 * Builds Lucene query syntax for Pokémon TCG API search endpoint with intelligent parsing.
 */
async function buildLuceneQuery(rawQuery: string, supertype?: string, setCode?: string): Promise<string> {
  const parts: string[] = [];
  const clean = rawQuery.trim();

  if (clean) {
    // If query contains Lucene syntax, use it directly
    if (clean.includes(':')) {
      parts.push(clean);
    } else {
      // Use intelligent parser
      const parsed = await parseSearchQuery(clean);
      
      // Build query based on parsed components
      if (parsed.hasSetCode) {
        parts.push(`set.id:"${parsed.setCode}"`);
      }
      
      if (parsed.hasCardNumber) {
        parts.push(`number:"${parsed.cardNumber}"`);
      }
      
      if (parsed.cardName) {
        // Use wildcard for partial matching
        parts.push(`name:"*${parsed.cardName}*"`);
      }
      
      // If no components were identified, fall back to wildcard search
      if (parts.length === 0) {
        parts.push(`name:"*${clean}*"`);
      }
    }
  }

  // Add explicit filters from parameters
  if (supertype && supertype !== 'ALL') {
    parts.push(`supertype:"${supertype}"`);
  }

  if (setCode && setCode !== 'ALL') {
    parts.push(`set.id:"${setCode.toLowerCase()}"`);
  }

  return parts.join(' ');
}

export interface CardSearchResult {
  success: boolean;
  cards: LogicalCard[];
  printings: CardPrinting[];
  totalCount: number;
  page: number;
  pageSize: number;
  error?: string;
}

/**
 * Searches cards from Pokémon TCG API v2 with fallback strategy.
 */
export async function searchPokemonTcgApi(
  query: string,
  options?: { supertype?: string; setCode?: string; page?: number; pageSize?: number }
): Promise<CardSearchResult> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 30;
  
  // Try primary query first
  let luceneQ = await buildLuceneQuery(query, options?.supertype, options?.setCode);
  let result = await executeSearch(luceneQ, page, pageSize);
  
  // Fallback strategy: if no results and query had specific components, try broader search
  if (!result.success || result.cards.length === 0) {
    const parsed = await parseSearchQuery(query);
    
    // If we had a set code, try without it
    if (parsed.hasSetCode && parsed.cardName) {
      console.log('[CardDataProvider] No results with set code, trying card name only');
      const fallbackQuery = await buildLuceneQuery(parsed.cardName, options?.supertype);
      result = await executeSearch(fallbackQuery, page, pageSize);
    }
    // If we had a card number, try without it
    else if (parsed.hasCardNumber && (parsed.cardName || parsed.hasSetCode)) {
      console.log('[CardDataProvider] No results with card number, trying without it');
      const fallbackQuery = parsed.cardName 
        ? await buildLuceneQuery(parsed.cardName, options?.supertype)
        : await buildLuceneQuery(parsed.setCode, options?.supertype);
      result = await executeSearch(fallbackQuery, page, pageSize);
    }
    // Final fallback: name-only wildcard
    else if (parsed.cardName) {
      console.log('[CardDataProvider] No results, trying name-only wildcard');
      let fallbackQuery = `name:"*${parsed.cardName}*"`;
      if (options?.supertype && options.supertype !== 'ALL') {
        fallbackQuery += ` supertype:"${options.supertype}"`;
      }
      result = await executeSearch(fallbackQuery, page, pageSize);
    }
  }

  return result;
}

/**
 * Executes a search with the given Lucene query.
 */
async function executeSearch(
  luceneQ: string,
  page: number,
  pageSize: number
): Promise<CardSearchResult> {
  const cacheKey = `${luceneQ}_p${page}_s${pageSize}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    const cards = cached.data.cards;
    const printings = cards.flatMap((c) => c.printings || []);
    return {
      success: true,
      cards,
      printings,
      totalCount: cached.data.totalCount,
      page: cached.data.page,
      pageSize: cached.data.pageSize,
    };
  }

  try {
    await rateLimit('searchCards');
    const params = new URLSearchParams();
    if (luceneQ) {
      params.append('q', luceneQ);
    }
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));

    const apiUrl = `${POKEMON_TCG_API_BASE}/cards?${params.toString()}`;
    console.log(`[CardDataProvider] Fetching: ${apiUrl}`);

    const res = await fetch(apiUrl, {
      headers: getApiHeaders(),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!res.ok) {
      console.warn(`[CardDataProvider] Pokémon TCG API returned HTTP ${res.status}: ${res.statusText}`);
      return {
        success: false,
        cards: [],
        printings: [],
        totalCount: 0,
        page,
        pageSize,
        error: `Pokémon TCG API returned HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    const rawCards: any[] = json.data || [];
    const totalCount = json.totalCount || rawCards.length;

    // Group printings by Logical Card (card_name)
    const cardMap = new Map<string, { card: LogicalCard; printings: CardPrinting[] }>();

    for (const rawCard of rawCards) {
      const { card, printing } = transformApiCardToLogicalAndPrinting(rawCard);
      if (!cardMap.has(card.id)) {
        cardMap.set(card.id, {
          card: { ...card, printings: [] },
          printings: [],
        });
      }
      const existing = cardMap.get(card.id)!;
      // Add printing if not already included
      if (!existing.printings.some((p) => p.id === printing.id)) {
        existing.printings.push(printing);
      }
    }

    const cards: LogicalCard[] = [];
    const allPrintings: CardPrinting[] = [];

    for (const entry of cardMap.values()) {
      entry.card.printings = entry.printings;
      cards.push(entry.card);
      allPrintings.push(...entry.printings);
    }

    // Update cache
    searchCache.set(cacheKey, {
      data: { cards, totalCount, page, pageSize },
      timestamp: Date.now(),
    });

    return {
      success: true,
      cards,
      printings: allPrintings,
      totalCount,
      page,
      pageSize,
    };
  } catch (err: any) {
    // Handle timeout errors specifically
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.warn('[CardDataProvider] Request timed out after 10 seconds');
      return {
        success: false,
        cards: [],
        printings: [],
        totalCount: 0,
        page,
        pageSize,
        error: 'Request timed out',
      };
    }
    console.error('[CardDataProvider] Request failed:', err);
    return {
      success: false,
      cards: [],
      printings: [],
      totalCount: 0,
      page,
      pageSize,
      error: 'Card search is temporarily unavailable. Please try again.',
    };
  }
}

/**
 * Fetches a single card by its canonical API ID (e.g. 'sv3-125', 'xy1-4').
 */
export async function getPokemonCardById(id: string): Promise<{ card: LogicalCard; printing: CardPrinting } | null> {
  const cached = cardByIdCache.get(id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const apiUrl = `${POKEMON_TCG_API_BASE}/cards/${encodeURIComponent(id)}`;
    const res = await fetch(apiUrl, {
      headers: getApiHeaders(),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (!json.data) return null;

    const transformed = transformApiCardToLogicalAndPrinting(json.data);
    cardByIdCache.set(id, { data: transformed, timestamp: Date.now() });
    return transformed;
  } catch (err) {
    console.error(`[CardDataProvider] Error fetching card ${id}:`, err);
    return null;
  }
}
