import { config } from 'dotenv';
import { LogicalCard, CardPrinting, Supertype, Subtype, CardRarity, CardVariant, CardSet, PokemonTcgSet, Attack, Ability, Weakness, Resistance, Legalities } from '../src/types/tcg';

// Load environment variables
config();

const POKEMON_TCG_API_BASE = 'https://api.pokemontcg.io/v2';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const FAILURE_CACHE_TTL_MS = 30 * 1000; // 30 seconds for failures to prevent retry storms
const API_TIMEOUT_MS = 15000;
const MAX_TRANSIENT_ATTEMPTS = 4;
const searchCache = new Map<string, CacheEntry<{ cards: LogicalCard[]; totalCount: number; page: number; pageSize: number }>>();
const cardByIdCache = new Map<string, CacheEntry<{ card: LogicalCard; printing: CardPrinting }>>();
const setsCache = new Map<string, CacheEntry<{ sets: PokemonTcgSet[] }>>();
const failureCache = new Map<string, { timestamp: number; error: string }>();
const KNOWN_SET_CODE_ALIASES: Record<string, string> = {
  pfl: 'me2',
};

// Rate limiting to respect Pokémon TCG API limits (30/minute without key, higher with key)
const lastRequestTime = new Map<string, number>();
const MIN_REQUEST_INTERVAL_MS = 500; // Reduced to 500ms since we're doing less API calls now

// In-flight request deduplication
const inFlightRequests = new Map<string, Promise<any>>();

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

  for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt++) {
    await rateLimit('fetchSets');
    const apiUrl = `${POKEMON_TCG_API_BASE}/sets`;
    console.log(`[CardDataProvider] Fetching sets: ${apiUrl}`);

    try {
      const res = await fetch(apiUrl, {
        headers: getApiHeaders(),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          if (attempt === MAX_TRANSIENT_ATTEMPTS) {
            console.warn(`[CardDataProvider] Failed to fetch sets: HTTP ${res.status} after ${attempt} attempts`);
            return [];
          }

          const delay = getRetryDelayMs(attempt, res.headers.get('Retry-After'));
          console.warn(`[CardDataProvider] Failed to fetch sets: HTTP ${res.status} - retrying in ${delay}ms (${attempt}/${MAX_TRANSIENT_ATTEMPTS})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

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
      if (isTransientFetchError(err) && attempt < MAX_TRANSIENT_ATTEMPTS) {
        const delay = getRetryDelayMs(attempt);
        console.warn(`[CardDataProvider] Failed to fetch sets: ${err.message || err.name} - retrying in ${delay}ms (${attempt}/${MAX_TRANSIENT_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error('[CardDataProvider] Failed to fetch sets:', err);
      return [];
    }
  }

  return [];
}

/**
 * Checks if a given code matches a known Pokémon TCG set ID or ptcgoCode.
 * Enhanced to handle common set codes like MEG, PBL that may not be in current API.
 */
export async function isValidSetCode(code: string): Promise<boolean> {
  return Boolean(await resolveApiSetId(code));
}

async function resolveApiSetId(code: string): Promise<string | null> {
  if (!code) return null;

  const normalizedCode = code.toLowerCase();
  if (KNOWN_SET_CODE_ALIASES[normalizedCode]) {
    return KNOWN_SET_CODE_ALIASES[normalizedCode];
  }

  const sets = await fetchPokemonTcgSets();

  // Check against official API data
  const matchingSet = sets.find(set =>
    set.id.toLowerCase() === normalizedCode ||
    (set.ptcgoCode && set.ptcgoCode.toLowerCase() === normalizedCode)
  );
  if (matchingSet) {
    return matchingSet.id.toLowerCase();
  }

  // Handle special cases for sets that may not be in current API data
  // This provides fallback support for common set codes
  const knownSetCodes = [
    'meg', // Mega Evolution
    'pfl', // Phantasmal Flames
    'pbl', // Pokémon League / Promo
    'sv1', 'sv2', 'sv3', 'sv4', 'sv5', 'sv6', // Scarlet & Violet series
    'swsh1', 'swsh2', 'swsh3', 'swsh4', 'swsh5', // Sword & Shield series
    'sm1', 'sm2', 'sm3', 'sm4', // Sun & Moon series
    'xy1', 'xy2', 'xy3', // XY series
  ];

  return knownSetCodes.includes(normalizedCode) ? normalizedCode : null;
}

/**
 * Sanitizes a string into a clean ID slug while preserving meaningful characters.
 * Used for generating consistent card IDs from API data.
 */
function slugify(text: string): string {
  if (!text) return 'unknown';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accent marks for ID generation only
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

  // Map attacks
  const attacks: Attack[] = (apiCard.attacks || []).map((a: any) => ({
    name: a.name || '',
    cost: a.cost || [],
    convertedEnergyCost: a.cost?.length || 0,
    damage: a.damage || '',
    text: a.text || '',
  }));

  // Map abilities
  const abilities: Ability[] = (apiCard.abilities || []).map((a: any) => ({
    name: a.name || '',
    text: a.text || '',
    type: a.type || '',
  }));

  // Map weaknesses
  const weaknesses: Weakness[] = (apiCard.weaknesses || []).map((w: any) => ({
    type: w.type || '',
    value: w.value || '',
  }));

  // Map resistances
  const resistances: Resistance[] = (apiCard.resistances || []).map((r: any) => ({
    type: r.type || '',
    value: r.value || '',
  }));

  // Map legalities
  const legalities: Legalities = {
    unlimited: apiCard.legalities?.unlimited || false,
    standard: apiCard.legalities?.standard || false,
    expanded: apiCard.legalities?.expanded || false,
  };

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
    // Extended fields
    attacks,
    abilities,
    weaknesses,
    resistances,
    retreatCost: typeof apiCard.convertedRetreatCost === 'number' ? apiCard.convertedRetreatCost : undefined,
    nationalPokedexNumbers: apiCard.nationalPokedexNumbers,
    regulationMark: apiCard.regulationMark,
    legalities,
    artist: apiCard.artist,
    imageUrlSmall: apiCard.images?.small,
    imageUrlLarge: apiCard.images?.large,
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
 * Maps a Pokemontcg.io raw API set object to our CardSet interface.
 */
export function transformApiSetToSet(apiSet: PokemonTcgSet): CardSet {
  return {
    id: apiSet.id,
    name: apiSet.name,
    series: apiSet.series,
    ptcgoCode: apiSet.ptcgoCode,
    releaseDate: apiSet.releaseDate,
    printedTotal: apiSet.printedTotal,
    total: apiSet.total,
    updatedAt: apiSet.updatedAt,
  };
}

/**
 * Parses a search query into structured components for intelligent search.
 */
export interface ParsedQuery {
  cardName: string;
  setCode: string;
  cardNumber: string;
  hasSetCode: boolean;
  hasCardNumber: boolean;
  suspectedSetCodes: string[]; // Store potential set codes for validation
}

export async function parseSearchQuery(rawQuery: string): Promise<ParsedQuery> {
  const clean = rawQuery.trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  const tokenParts: { token: string; kind: 'name' | 'setCandidate' | 'number' }[] = [];
  
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
  
  // Pattern for card numbers: standalone numbers, optionally prefixed by '#'
  const cardNumberPattern = /^#?\d+[a-z]?$/i;

  // Handle ex/EX/Mega/V/VMAX/VSTAR subtypes - these should be part of card name, not treated as set codes
  const subtypePatterns = ['ex', 'EX', 'Mega', 'V', 'VMAX', 'VSTAR', 'GX', 'TAG TEAM', 'RESTORED'];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const upperToken = token.toUpperCase();

    // Check if token is a subtype marker - these should be part of card name
    if (subtypePatterns.includes(upperToken) || 
        upperToken.includes('EX') || 
        upperToken.includes('MEGA') || 
        upperToken.includes('VMAX') || 
        upperToken.includes('VSTAR')) {
      // Treat as part of card name
      tokenParts.push({ token, kind: 'name' });
      continue;
    }

    // Check if token might be a set code (pattern match). Validation happens after
    // tokenization so invalid guesses like "Dawn" can fall back into cardName.
    if (setCodePattern.test(upperToken)) {
      result.suspectedSetCodes.push(upperToken.toLowerCase());
      tokenParts.push({ token, kind: 'setCandidate' });
    }
    // Check if token is a card number (and not part of set code)
    else if (cardNumberPattern.test(token) && !result.hasCardNumber) {
      result.cardNumber = token.replace(/^#/, '');
      result.hasCardNumber = true;
      tokenParts.push({ token, kind: 'number' });
    }
    // Otherwise, treat as part of card name
    else {
      tokenParts.push({ token, kind: 'name' });
    }
  }

  // Validate suspected set codes against actual API metadata
  let selectedSetCandidate = '';
  if (result.suspectedSetCodes.length > 0) {
    const resolvedSetCodes = await Promise.all(
      result.suspectedSetCodes.map(code => resolveApiSetId(code))
    );
    
    // Use only validated set codes
    const selectedIdx = resolvedSetCodes.findIndex(Boolean);
    const validCode = selectedIdx !== -1 ? resolvedSetCodes[selectedIdx] : null;
    if (validCode) {
      selectedSetCandidate = result.suspectedSetCodes[selectedIdx];
      result.setCode = validCode;
      result.hasSetCode = true;
    } else {
      // No valid set codes found, treat as card name instead
      result.setCode = '';
      result.hasSetCode = false;
      result.suspectedSetCodes = [];
    }
  }

  result.cardName = tokenParts
    .filter((part) => {
      if (part.kind === 'number') return false;
      if (part.kind === 'setCandidate' && part.token.toLowerCase() === selectedSetCandidate) return false;
      return true;
    })
    .map((part) => part.token)
    .join(' ');

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
        // Use wildcard for partial matching, preserving original characters including accents
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
  errorType?: 'transient' | 'permanent';
  status?: number;
}

function createFailedSearchResult(
  page: number,
  pageSize: number,
  error: string,
  errorType: 'transient' | 'permanent',
  status?: number
): CardSearchResult {
  return {
    success: false,
    cards: [],
    printings: [],
    totalCount: 0,
    page,
    pageSize,
    error,
    errorType,
    status,
  };
}

function getRetryDelayMs(attempt: number, retryAfter?: string | null): number {
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 30000);
  }

  const baseDelay = 1000 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(baseDelay + jitter, 10000);
}

function isTransientFetchError(err: any): boolean {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError' || err instanceof TypeError;
}

/**
 * Searches cards from Pokémon TCG API v2 with simplified fallback strategy.
 * No aggressive retry loops - single primary query, one fallback if needed.
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
  
  // Simplified fallback: only try name-only wildcard if primary fails
  if (!result.success || result.cards.length === 0) {
    console.log('[CardDataProvider] Primary query failed, trying name-only wildcard fallback');
    let fallbackQuery = `name:"*${query}*"`;
    if (options?.supertype && options.supertype !== 'ALL') {
      fallbackQuery += ` supertype:"${options.supertype}"`;
    }
    if (options?.setCode && options.setCode !== 'ALL') {
      fallbackQuery += ` set.id:"${options.setCode.toLowerCase()}"`;
    }
    result = await executeSearch(fallbackQuery, page, pageSize);
  }

  return result;
}

export async function searchPokemonTcgSetCards(
  setId: string,
  options?: { page?: number; pageSize?: number }
): Promise<CardSearchResult> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 250;
  return executeSearch(`set.id:"${setId.toLowerCase()}"`, page, pageSize);
}

/**
 * Executes a search with the given Lucene query.
 * Includes request deduplication and intelligent error handling.
 */
async function executeSearch(
  luceneQ: string,
  page: number,
  pageSize: number
): Promise<CardSearchResult> {
  const cacheKey = `${luceneQ}_p${page}_s${pageSize}`;
  
  // Check cache first
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

  // Check failure cache to prevent retry storms
  const failure = failureCache.get(cacheKey);
  if (failure && Date.now() - failure.timestamp < FAILURE_CACHE_TTL_MS) {
    console.log(`[CardDataProvider] Using cached failure for: ${cacheKey}`);
    return {
      success: false,
      cards: [],
      printings: [],
      totalCount: 0,
      page,
      pageSize,
      error: failure.error,
    };
  }

  // Check for in-flight request (deduplication)
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    console.log(`[CardDataProvider] Waiting for in-flight request: ${cacheKey}`);
    return inFlight;
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      const params = new URLSearchParams();
      if (luceneQ) {
        params.append('q', luceneQ);
      }
      params.append('page', String(page));
      params.append('pageSize', String(pageSize));

      const apiUrl = `${POKEMON_TCG_API_BASE}/cards?${params.toString()}`;

      for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt++) {
        await rateLimit('searchCards');
        console.log(`[CardDataProvider] Fetching: ${apiUrl}`);

        try {
          const res = await fetch(apiUrl, {
            headers: getApiHeaders(),
            signal: AbortSignal.timeout(API_TIMEOUT_MS),
          });

          if (res.ok) {
            const json = await res.json();
            return processApiResponse(json, cacheKey, page, pageSize);
          }

          const status = res.status;
          const statusText = res.statusText;

          if (status === 402) {
            const error = 'Pokémon TCG API request failed (402)';
            console.warn(`[CardDataProvider] ${error} - not retrying`);
            failureCache.set(cacheKey, { timestamp: Date.now(), error });
            return createFailedSearchResult(page, pageSize, error, 'permanent', status);
          }

          if (status === 429 || (status >= 500 && status < 600)) {
            const error = status === 429
              ? 'Rate limited by Pokémon TCG API (429)'
              : `Pokémon TCG API returned HTTP ${status}`;

            if (attempt === MAX_TRANSIENT_ATTEMPTS) {
              console.warn(`[CardDataProvider] ${error} after ${attempt} attempts`);
              failureCache.set(cacheKey, { timestamp: Date.now(), error });
              return createFailedSearchResult(page, pageSize, error, 'transient', status);
            }

            const delay = getRetryDelayMs(attempt, res.headers.get('Retry-After'));
            console.warn(`[CardDataProvider] Pokémon TCG API returned HTTP ${status} (${statusText}) - retrying in ${delay}ms (${attempt}/${MAX_TRANSIENT_ATTEMPTS})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          const error = `Pokémon TCG API returned HTTP ${status}`;
          console.warn(`[CardDataProvider] ${error} (${statusText}) - not retrying`);
          failureCache.set(cacheKey, { timestamp: Date.now(), error });
          return createFailedSearchResult(page, pageSize, error, 'permanent', status);
        } catch (err: any) {
          if (isTransientFetchError(err)) {
            const error = err.name === 'TimeoutError' || err.name === 'AbortError'
              ? `Request timed out after ${API_TIMEOUT_MS / 1000} seconds`
              : 'Network error while contacting Pokémon TCG API';

            if (attempt === MAX_TRANSIENT_ATTEMPTS) {
              console.warn(`[CardDataProvider] ${error} after ${attempt} attempts`);
              failureCache.set(cacheKey, { timestamp: Date.now(), error });
              return createFailedSearchResult(page, pageSize, error, 'transient');
            }

            const delay = getRetryDelayMs(attempt);
            console.warn(`[CardDataProvider] ${error} - retrying in ${delay}ms (${attempt}/${MAX_TRANSIENT_ATTEMPTS})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw err;
        }
      }

      const error = 'Pokémon TCG API request failed';
      failureCache.set(cacheKey, { timestamp: Date.now(), error });
      return createFailedSearchResult(page, pageSize, error, 'transient');
    } catch (err: any) {
      console.error('[CardDataProvider] Request failed:', err);
      const error = 'Card search is temporarily unavailable. Please try again.';
      failureCache.set(cacheKey, { timestamp: Date.now(), error });
      return createFailedSearchResult(page, pageSize, error, 'transient');
    } finally {
      // Clean up in-flight request
      inFlightRequests.delete(cacheKey);
    }
  })();

  // Store in-flight request
  inFlightRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Process API response and group printings by logical card.
 */
function processApiResponse(json: any, cacheKey: string, page: number, pageSize: number): CardSearchResult {
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
