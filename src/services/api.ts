import {
  LogicalCard,
  CardPrinting,
  CollectionItem,
  Deck,
  StoreProfile,
  Acquisition,
  MarketplaceListing,
  ShoppingOptimizationResult
} from '../types/tcg';

const API_BASE = '';

// Auth helpers
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function login(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: 'Login failed' };
  }
}

export async function logout(): Promise<void> {
  try {
    const token = localStorage.getItem('authToken');
    if (token) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    }
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    localStorage.removeItem('authToken');
  }
}

export async function checkAuth(): Promise<boolean> {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return false;
    const res = await fetch(`${API_BASE}/api/auth/check`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    return data.success;
  } catch (err) {
    return false;
  }
}

export interface CardSearchApiResponse {
  success: boolean;
  cards: LogicalCard[];
  printings?: CardPrinting[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

export async function searchCardsApi(
  query: string,
  options?: { supertype?: string; setCode?: string; page?: number; pageSize?: number; signal?: AbortSignal }
): Promise<CardSearchApiResponse> {
  const q = (query || '').trim();
  try {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (options?.supertype && options.supertype !== 'ALL') params.append('supertype', options.supertype);
    if (options?.setCode && options.setCode !== 'ALL') params.append('setCode', options.setCode);
    if (options?.page) params.append('page', String(options.page));
    if (options?.pageSize) params.append('pageSize', String(options.pageSize));

    const res = await fetch(`${API_BASE}/api/cards/search?${params.toString()}`, {
      headers: getAuthHeaders(),
      signal: options?.signal,
    });
    if (!res.ok) {
      return {
        success: false,
        cards: [],
        error: 'Card search is temporarily unavailable. Please try again.',
      };
    }
    const data = await res.json();
    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        cards: [],
        error: 'Search cancelled',
      };
    }
    console.error('API card search error:', err);
    return {
      success: false,
      cards: [],
      error: 'Card search is temporarily unavailable. Please try again.',
    };
  }
}

export async function getCardDetailsApi(id: string): Promise<{ card?: LogicalCard; printing?: CardPrinting; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/cards/${encodeURIComponent(id)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      return { error: 'Card details unavailable' };
    }
    return await res.json();
  } catch (err) {
    console.error('Error fetching card details:', err);
    return { error: 'Card details unavailable' };
  }
}

export async function fetchCards(query = '', supertype = ''): Promise<LogicalCard[]> {
  try {
    if (!query.trim() && !supertype.trim()) {
      const res = await fetch(`${API_BASE}/api/cards`, {
        headers: getAuthHeaders(),
      });
      return await res.json();
    }

    const searchRes = await searchCardsApi(query, { supertype });
    if (searchRes.success) {
      return searchRes.cards;
    }
    return [];
  } catch (err) {
    console.warn('API error in fetchCards:', err);
    return [];
  }
}

export async function browseDatabaseCards(options: {
  query?: string;
  supertype?: string;
  setCode?: string;
  rarity?: string;
  variant?: string;
  ownership?: string;
  wishlist?: string;
  page?: number;
  pageSize?: number;
}): Promise<any> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.append(key, String(value));
    }
  }

  const res = await fetch(`${API_BASE}/api/cards/browser?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function createCustomCard(cardData: Partial<LogicalCard> & { setCode?: string; marketPrice?: number }) {
  const res = await fetch(`${API_BASE}/api/cards`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(cardData),
  });
  return await res.json();
}

export async function fetchCollection(): Promise<(CollectionItem & { card: LogicalCard; printing: any; availableQuantity: number; allocatedQuantity: number; allocatedDetails: any[] })[]> {
  const res = await fetch(`${API_BASE}/api/collection`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function updateCollectionItem(item: Partial<CollectionItem>) {
  const res = await fetch(`${API_BASE}/api/collection`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(item),
  });
  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to update collection item' };
  }
  return { success: true, ...data };
}

export async function deleteCollectionItem(id: string) {
  const res = await fetch(`${API_BASE}/api/collection/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function fetchDecks(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/decks`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function saveDeck(deckData: Partial<Deck> & { requirements?: any[] }) {
  const res = await fetch(`${API_BASE}/api/decks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(deckData),
  });
  return await res.json();
}

export async function deleteDeck(deckId: string) {
  const res = await fetch(`${API_BASE}/api/decks/${deckId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function autoAllocateDeck(deckId: string) {
  const res = await fetch(`${API_BASE}/api/decks/${deckId}/auto-allocate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function getAssemblePickList(deckId: string) {
  const res = await fetch(`${API_BASE}/api/decks/${deckId}/assemble`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export function fetchStoreProfiles(): Promise<StoreProfile[]> {
  return fetch(`${API_BASE}/api/store-profiles`, {
    headers: getAuthHeaders(),
  }).then((res) => res.json());
}

export async function saveStoreProfile(profileData: Partial<StoreProfile>) {
  const res = await fetch(`${API_BASE}/api/store-profiles`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(profileData),
  });
  return await res.json();
}

export async function duplicateStoreProfile(id: string) {
  const res = await fetch(`${API_BASE}/api/store-profiles/duplicate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ id }),
  });
  return await res.json();
}

export async function setDefaultStoreProfile(id: string) {
  const res = await fetch(`${API_BASE}/api/store-profiles/default`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ id }),
  });
  return await res.json();
}

export async function deleteStoreProfile(id: string) {
  const res = await fetch(`${API_BASE}/api/store-profiles/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function moveAllocation(sourceDeckId: string, targetDeckId: string, cardId: string, quantity = 1) {
  const res = await fetch(`${API_BASE}/api/allocations/move`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ sourceDeckId, targetDeckId, cardId, quantity }),
  });
  return await res.json();
}

export async function allocateToDeck(
  deckId: string,
  requirementId: string,
  collectionItemId: string,
  quantity: number
) {
  const res = await fetch(`${API_BASE}/api/allocations/allocate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ deckId, requirementId, collectionItemId, quantity }),
  });
  return await res.json();
}

export async function releaseAllocation(allocationId: string, quantity?: number) {
  const res = await fetch(`${API_BASE}/api/allocations/release`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(
      quantity === undefined ? { allocationId } : { allocationId, quantity }
    ),
  });
  return await res.json();
}

export async function fetchBulkHuntChecklist(deckId = 'ALL', storeProfileId = '') {
  const res = await fetch(`${API_BASE}/api/bulk-hunt?deckId=${deckId}&storeProfileId=${storeProfileId}`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function recordAcquisition(acquisitionData: {
  cardId: string;
  printingId?: string;
  quantity: number;
  source?: string;
  method?: string;
  costPerUnit?: number;
  deckIdToAllocate?: string;
}) {
  const res = await fetch(`${API_BASE}/api/acquisitions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(acquisitionData),
  });
  return await res.json();
}

export async function searchMarketplace(query: string): Promise<MarketplaceListing[]> {
  const res = await fetch(`${API_BASE}/api/marketplace/search?query=${encodeURIComponent(query)}`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function fetchAdminHealth(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/health`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function fetchCurrencySettings(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/settings/currency`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function updateCurrencySettings(usdToZarRate: number): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/settings/currency`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ usdToZarRate }),
  });
  return await res.json();
}

export async function startAdminSync(
  mode: 'incremental' | 'force' | 'sets-only' | 'single-set',
  options?: { setCode?: string }
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/sync`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ mode, ...options }),
  });
  return await res.json();
}

export async function stopAdminSync(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/sync/stop`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function createAdminBackup(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/backup`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function fetchWishlist(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/wishlist`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function addWishlistItem(item: {
  cardId: string;
  printingId?: string;
  quantity?: number;
  priority?: string;
  notes?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/wishlist`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(item),
  });
  return await res.json();
}

export async function deleteWishlistItem(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/wishlist/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function fetchShoppingOptimization(mode: 'CHEAPEST_TOTAL' | 'FEWEST_SELLERS' = 'CHEAPEST_TOTAL'): Promise<ShoppingOptimizationResult> {
  const res = await fetch(`${API_BASE}/api/marketplace/optimize?mode=${mode}`, {
    headers: getAuthHeaders(),
  });
  return await res.json();
}

export async function importLimitlessDeck(text: string, deckName: string) {
  const res = await fetch(`${API_BASE}/api/import-export/deck`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ text, deckName }),
  });
  return await res.json();
}
