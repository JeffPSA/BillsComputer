import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { config } from 'dotenv';
import { INITIAL_CARDS, INITIAL_PRINTINGS } from './src/data/cardDatabase';

// Load environment variables from .env file
config();
import {
  LogicalCard,
  CardPrinting,
  CollectionItem,
  Deck,
  DeckRequirement,
  Allocation,
  WishlistItem,
  StoreProfile,
  Acquisition,
  MarketplaceListing,
  ShoppingOptimizationResult
} from './src/types/tcg';
import {
  calculateCardOwnershipForDeck,
  calculateMultiDeckShortfalls,
  autoAllocateDeck,
  resolveBulkCategoryForCard
} from './src/services/allocationEngine';
import { searchCards } from './src/services/cardSearch';
import {
  searchPokemonTcgApi,
  getPokemonCardById
} from './server/cardDataProvider';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface DatabaseSchema {
  cards: LogicalCard[];
  printings: CardPrinting[];
  collectionItems: CollectionItem[];
  decks: Deck[];
  deckRequirements: DeckRequirement[];
  allocations: Allocation[];
  wishlistItems: WishlistItem[];
  storeProfiles: StoreProfile[];
  acquisitions: Acquisition[];
}

function migrateCanonicalCardIds(db: DatabaseSchema): boolean {
  let changed = false;

  const printingIdMap: Record<string, string> = {
    'prt_ultra_ball_svi_196': 'sv1-196',
    'prt_ultra_ball_meg_131': 'sv1-196',
    'prt_ultra_ball_paf_091': 'paf-91',
    'prt_nest_ball_svi_181': 'sv1-181',
    'prt_nest_ball_paf_084': 'paf-84',
    'prt_boss_orders_pal_172': 'pal-172',
    'prt_iono_pal_185': 'pal-185',
    'prt_darkrai_ex_meg_080': 'paf-137',
    'prt_lucario_ex_meg_105': 'sv1-79',
    'prt_earthen_vessel_par_163': 'par-163',
    'prt_buddy_buddy_poffen_tef_144': 'tef-144',
    'prt_night_stretcher_sft_061': 'sft-061',
    'prt_super_rod_pal_188': 'pal-188',
    'prt_counter_catcher_par_160': 'par-160',
    'prt_switch_svi_194': 'sv1-194',
    'prt_rare_candy_svi_191': 'sv1-191',
    'prt_prime_catcher_tef_157': 'tef-157',
    'prt_secret_box_twm_163': 'twm-163',
    'prt_arven_svi_166': 'sv1-166',
    'prt_professors_research_svi_189': 'sv1-189',
    'prt_sada_vitality_par_170': 'par-170',
    'prt_collapsed_stadium_brs_137': 'brs-137',
    'prt_artazon_svi_171': 'sv1-171',
    'prt_dragapult_ex_twm_130': 'twm-130',
    'prt_drakloak_twm_129': 'twm-129',
    'prt_charizard_ex_obf_125': 'obf-125',
    'prt_pidgeot_ex_obf_164': 'obf-164',
    'prt_raging_bolt_ex_tef_123': 'tef-123',
    'prt_teal_mask_ogerpon_ex_twm_025': 'twm-025',
    'prt_fezandipiti_ex_sft_038': 'sft-038',
    'prt_radiant_greninja_asr_046': 'swsh10-46',
    'prt_squawkabilly_ex_pal_169': 'pal-169',
    'prt_rotom_v_lor_058': 'swsh11-58',
    'prt_bibarel_brs_121': 'swsh9-121',
    'prt_mimikyu_pal_097': 'pal-97',
    'prt_jet_energy_pal_190': 'pal-190',
    'prt_fire_energy_svi_002': 'sv1-257',
    'prt_darkness_energy_svi_007': 'sv1-258',
    'prt_grass_energy_svi_001': 'sv1-256',
    'prt_psychic_energy_svi_005': 'sv1-255',
    'prt_fighting_energy_svi_006': 'sv1-254',
    'prt_water_energy_svi_003': 'sv1-254',
    'prt_lightning_energy_svi_004': 'sv1-257',
    'prt_metal_energy_svi_008': 'sv1-259',
    'prt_1786356214299_sae': 'sv1-81',
    'prt_1786356214299_2gs': 'sv1-42',
    'prt_1786356214299_97m': 'sv1-43',
    'prt_1786356214299_7is': 'sm4-115',
    'prt_1786356214299_tp5': 'sm4-108',
    'prt_1786356214299_mfy': '151-54',
  };

  db.printings.forEach((p) => {
    if (printingIdMap[p.id]) {
      p.id = printingIdMap[p.id];
      changed = true;
    }
  });

  db.cards.forEach((c) => {
    if (printingIdMap[c.defaultPrintingId]) {
      c.defaultPrintingId = printingIdMap[c.defaultPrintingId];
      changed = true;
    }
  });

  db.collectionItems.forEach((item) => {
    if (printingIdMap[item.printingId]) {
      item.printingId = printingIdMap[item.printingId];
      changed = true;
    }
  });

  db.deckRequirements.forEach((req) => {
    if (req.preferredPrintingId && printingIdMap[req.preferredPrintingId]) {
      req.preferredPrintingId = printingIdMap[req.preferredPrintingId];
      changed = true;
    }
  });

  db.acquisitions.forEach((acq) => {
    if (printingIdMap[acq.printingId]) {
      acq.printingId = printingIdMap[acq.printingId];
      changed = true;
    }
  });

  return changed;
}

function cacheCardsInDb(db: DatabaseSchema, cards: LogicalCard[], printings: CardPrinting[] = []) {
  let modified = false;

  for (const c of cards) {
    const existingCardIdx = db.cards.findIndex((existing) => existing.id === c.id);
    if (existingCardIdx === -1) {
      db.cards.push({
        id: c.id,
        name: c.name,
        supertype: c.supertype,
        subtype: c.subtype,
        hp: c.hp,
        types: c.types,
        rules: c.rules,
        isAceSpec: c.isAceSpec,
        defaultPrintingId: c.defaultPrintingId,
      });
      modified = true;
    }
  }

  for (const p of printings) {
    const existingPrtIdx = db.printings.findIndex((existing) => existing.id === p.id);
    if (existingPrtIdx === -1) {
      db.printings.push(p);
      modified = true;
    }
  }

  if (modified) {
    writeDb(db);
  }
}

function getInitialDb(): DatabaseSchema {
  // Default Decks & Collection
  const defaultDecks: Deck[] = [
    {
      id: 'deck_mega_darkrai',
      name: 'Mega Darkrai ex',
      version: 'v1.0 Standard',
      format: 'Standard',
      status: 'Active',
      isPermanentlyAssembled: false,
      notes: 'Main competitive tournament deck',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'deck_mega_lucario',
      name: 'Mega Lucario ex',
      version: 'v1.1 Casual',
      format: 'Standard',
      status: 'Active',
      isPermanentlyAssembled: false,
      notes: 'Secondary deck sharing Ultra Balls & Supporters',
      updatedAt: new Date().toISOString(),
    },
  ];

  const defaultRequirements: DeckRequirement[] = [
    // Darkrai Requirements
    { id: 'req_d_ub', deckId: 'deck_mega_darkrai', cardId: 'card_ultra_ball', quantity: 4, requirementMode: 'ANY_PRINTING' },
    { id: 'req_d_nb', deckId: 'deck_mega_darkrai', cardId: 'card_nest_ball', quantity: 4, requirementMode: 'ANY_PRINTING' },
    { id: 'req_d_bo', deckId: 'deck_mega_darkrai', cardId: 'card_boss_orders', quantity: 2, requirementMode: 'ANY_PRINTING' },
    { id: 'req_d_iono', deckId: 'deck_mega_darkrai', cardId: 'card_iono', quantity: 3, requirementMode: 'ANY_PRINTING' },
    { id: 'req_d_dk', deckId: 'deck_mega_darkrai', cardId: 'card_darkrai_ex', quantity: 3, requirementMode: 'ANY_PRINTING' },
    { id: 'req_d_ev', deckId: 'deck_mega_darkrai', cardId: 'card_earthen_vessel', quantity: 2, requirementMode: 'ANY_PRINTING' },

    // Lucario Requirements
    { id: 'req_l_ub', deckId: 'deck_mega_lucario', cardId: 'card_ultra_ball', quantity: 4, requirementMode: 'ANY_PRINTING' },
    { id: 'req_l_nb', deckId: 'deck_mega_lucario', cardId: 'card_nest_ball', quantity: 3, requirementMode: 'ANY_PRINTING' },
    { id: 'req_l_bo', deckId: 'deck_mega_lucario', cardId: 'card_boss_orders', quantity: 2, requirementMode: 'ANY_PRINTING' },
    { id: 'req_l_luc', deckId: 'deck_mega_lucario', cardId: 'card_lucario_ex', quantity: 3, requirementMode: 'ANY_PRINTING' },
  ];

  // Collection
  const defaultCollection: CollectionItem[] = [
    { id: 'ci_ub_1', cardId: 'card_ultra_ball', printingId: 'sv1-196', quantity: 6, condition: 'NM', language: 'English', acquisitionSource: 'Local Store Bulk', acquisitionCost: 0.50 },
    { id: 'ci_nb_1', cardId: 'card_nest_ball', printingId: 'sv1-181', quantity: 5, condition: 'NM', language: 'English', acquisitionSource: 'Paldea Chest', acquisitionCost: 0.30 },
    { id: 'ci_bo_1', cardId: 'card_boss_orders', printingId: 'pal-172', quantity: 2, condition: 'NM', language: 'English', acquisitionSource: 'Paldea Evolved Booster', acquisitionCost: 0.80 },
    { id: 'ci_iono_1', cardId: 'card_iono', printingId: 'pal-185', quantity: 2, condition: 'NM', language: 'English', acquisitionSource: 'Local Game Store', acquisitionCost: 1.10 },
    { id: 'ci_dk_1', cardId: 'card_darkrai_ex', printingId: 'paf-137', quantity: 2, condition: 'NM', language: 'English', acquisitionSource: 'Single Purchase', acquisitionCost: 9.00 },
    { id: 'ci_luc_1', cardId: 'card_lucario_ex', printingId: 'sv1-79', quantity: 3, condition: 'NM', language: 'English', acquisitionSource: 'Single Purchase', acquisitionCost: 6.00 },
  ];

  // Allocations
  const defaultAllocations: Allocation[] = [
    { id: 'al_1', collectionItemId: 'ci_ub_1', deckId: 'deck_mega_darkrai', requirementId: 'req_d_ub', quantity: 4 },
    { id: 'al_2', collectionItemId: 'ci_ub_1', deckId: 'deck_mega_lucario', requirementId: 'req_l_ub', quantity: 2 },
    { id: 'al_3', collectionItemId: 'ci_nb_1', deckId: 'deck_mega_darkrai', requirementId: 'req_d_nb', quantity: 4 },
    { id: 'al_4', collectionItemId: 'ci_nb_1', deckId: 'deck_mega_lucario', requirementId: 'req_l_nb', quantity: 1 },
    { id: 'al_5', collectionItemId: 'ci_bo_1', deckId: 'deck_mega_darkrai', requirementId: 'req_d_bo', quantity: 2 },
  ];

  const defaultStoreProfile: StoreProfile = {
    id: 'sp_default_lgs',
    name: 'TopDeck Local Game Shop',
    isDefault: true,
    categories: [
      { id: 'cat_1', name: 'Rare — A–F', description: 'Rare / Holo cards alphabetized A to F', sortOrder: 1 },
      { id: 'cat_2', name: 'Rare — G–M', description: 'Rare / Holo cards alphabetized G to M', sortOrder: 2 },
      { id: 'cat_3', name: 'Rare — N–Z', description: 'Rare / Holo cards alphabetized N to Z', sortOrder: 3 },
      { id: 'cat_4', name: 'Uncommon — A–F', description: 'Uncommon bulk box A to F', sortOrder: 4 },
      { id: 'cat_5', name: 'Uncommon — G–M', description: 'Uncommon bulk box G to M', sortOrder: 5 },
      { id: 'cat_6', name: 'Uncommon — N–Z', description: 'Uncommon bulk box N to Z', sortOrder: 6 },
      { id: 'cat_7', name: 'Trainer Box', description: 'Dedicated Items, Supporters, Stadiums binder/box', sortOrder: 7 },
      { id: 'cat_8', name: 'Special ACE SPEC Box', description: 'ACE SPEC cards top loading binder', sortOrder: 8 },
    ],
    overrides: [
      { id: 'ov_1', storeProfileId: 'sp_default_lgs', cardId: 'card_ultra_ball', categoryId: 'cat_7' },
      { id: 'ov_2', storeProfileId: 'sp_default_lgs', cardId: 'card_nest_ball', categoryId: 'cat_7' },
      { id: 'ov_3', storeProfileId: 'sp_default_lgs', cardId: 'card_prime_catcher', categoryId: 'cat_8' },
    ],
  };

  return {
    cards: INITIAL_CARDS,
    printings: INITIAL_PRINTINGS,
    collectionItems: defaultCollection,
    decks: defaultDecks,
    deckRequirements: defaultRequirements,
    allocations: defaultAllocations,
    wishlistItems: [],
    storeProfiles: [defaultStoreProfile],
    acquisitions: [],
  };
}

function readDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const db: DatabaseSchema = JSON.parse(data);
      if (migrateCanonicalCardIds(db)) {
        writeDb(db);
      }
      return db;
    }
  } catch (err) {
    console.error('Error reading DB, re-initializing:', err);
  }
  const init = getInitialDb();
  writeDb(init);
  return init;
}

function writeDb(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing DB:', err);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- AUTHENTICATION ---
  const appPassword = process.env.APP_PASSWORD || 'default-password';
  const validTokens = new Set<string>();

  // Generate a simple random token
  function generateToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !validTokens.has(token)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };

  // Auth endpoints (public)
  app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    if (password === appPassword) {
      const token = generateToken();
      validTokens.add(token);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (token) {
      validTokens.delete(token);
    }
    res.json({ success: true });
  });

  app.get('/api/auth/check', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    res.json({ success: validTokens.has(token) || false });
  });

  // --- API ENDPOINTS ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /api/cards/search (Canonical Pokémon TCG API v2 Live Query)
  app.get('/api/cards/search', requireAuth, async (req, res) => {
    try {
      const query = (req.query.q as string || req.query.query as string || '').trim();
      const supertype = req.query.supertype as string;
      const setCode = req.query.setCode as string;
      const page = parseInt((req.query.page as string) || '1', 10);
      const pageSize = parseInt((req.query.pageSize as string) || '30', 10);

      const apiResult = await searchPokemonTcgApi(query, { supertype, setCode, page, pageSize });

      if (apiResult.success && apiResult.cards.length > 0) {
        const db = readDb();
        cacheCardsInDb(db, apiResult.cards, apiResult.printings);
      }

      if (!apiResult.success) {
        return res.status(503).json(apiResult);
      }

      res.json(apiResult);
    } catch (err: any) {
      console.error('[Server] Error in /api/cards/search:', err);
      res.status(500).json({
        success: false,
        cards: [],
        printings: [],
        totalCount: 0,
        page: 1,
        pageSize: 30,
        error: 'Internal server error during search',
      });
    }
  });

  // GET /api/cards (Legacy/General card endpoint)
  app.get('/api/cards', requireAuth, async (req, res) => {
    try {
      const query = (req.query.query as string || req.query.q as string || '').trim();
      const supertype = req.query.supertype as string;

      if (query) {
        const apiResult = await searchPokemonTcgApi(query, { supertype });
        if (apiResult.success) {
          const db = readDb();
          cacheCardsInDb(db, apiResult.cards, apiResult.printings);
          return res.json(apiResult.cards);
        } else {
          return res.status(503).json({ error: apiResult.error || 'Card search is temporarily unavailable. Please try again.', cards: [] });
        }
      }

      const db = readDb();
      const cardsWithPrintings = db.cards.map((c) => ({
        ...c,
        printings: db.printings.filter((p) => p.cardId === c.id),
      }));

      const result = searchCards(cardsWithPrintings, query, { supertype });
      res.json(result);
    } catch (err: any) {
      console.error('[Server] Error in /api/cards:', err);
      res.status(500).json({ error: 'Internal server error', cards: [] });
    }
  });

  // GET /api/cards/:id (Fetch card details by canonical ID e.g. 'sv1-196', 'xy1-4')
  app.get('/api/cards/:id', requireAuth, async (req, res) => {
    const cardId = req.params.id;
    const db = readDb();

    let printing = db.printings.find((p) => p.id === cardId);
    let card = db.cards.find((c) => c.id === (printing ? printing.cardId : cardId));

    if (!printing || !card) {
      const fetched = await getPokemonCardById(cardId);
      if (fetched) {
        cacheCardsInDb(db, [fetched.card], [fetched.printing]);
        card = fetched.card;
        printing = fetched.printing;
      }
    }

    if (!card && !printing) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({ card, printing });
  });


  // POST /api/cards (Create custom card/printing)
  app.post('/api/cards', requireAuth, (req, res) => {
    const db = readDb();
    const { name, supertype, subtype, setCode, setName, cardNumber, rarity, marketPrice } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Card name required' });
    }

    let existingCard = db.cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!existingCard) {
      const cardId = `card_${Date.now()}`;
      const prtId = `prt_${Date.now()}`;
      existingCard = {
        id: cardId,
        name,
        supertype: supertype || 'Trainer',
        subtype: subtype || 'Item',
        defaultPrintingId: prtId,
      };
      db.cards.push(existingCard);

      const printing: CardPrinting = {
        id: prtId,
        cardId,
        cardName: name,
        setCode: setCode || 'CUSTOM',
        setName: setName || 'Custom Expansion',
        cardNumber: cardNumber || '1',
        rarity: rarity || 'Uncommon',
        variant: 'Normal',
        language: 'English',
        imageUrl: '',
        marketPrice: Number(marketPrice) || 1.0,
      };
      db.printings.push(printing);
    }

    writeDb(db);
    res.json(existingCard);
  });

  // GET /api/collection
  app.get('/api/collection', requireAuth, (req, res) => {
    const db = readDb();
    const activeDeckIds = new Set(db.decks.filter((d) => d.status === 'Active').map((d) => d.id));

    const enrichedCollection = db.collectionItems.map((item) => {
      const card = db.cards.find((c) => c.id === item.cardId);
      const printing = db.printings.find((p) => p.id === item.printingId);

      const itemAllocations = db.allocations.filter((a) => a.collectionItemId === item.id && activeDeckIds.has(a.deckId));
      const allocatedQty = itemAllocations.reduce((sum, a) => sum + a.quantity, 0);
      const availableQty = Math.max(0, item.quantity - allocatedQty);

      const allocatedDetails = itemAllocations.map((a) => {
        const deck = db.decks.find((d) => d.id === a.deckId);
        return {
          deckId: a.deckId,
          deckName: deck ? deck.name : 'Unknown Deck',
          allocatedQuantity: a.quantity,
        };
      });

      return {
        ...item,
        card,
        printing,
        allocatedQuantity: allocatedQty,
        availableQuantity: availableQty,
        allocatedDetails,
      };
    });

    res.json(enrichedCollection);
  });

  // POST /api/collection (Add/Update collection item)
  // BACKEND IS AUTHORITATIVE: Re-checks database for allocations before any deletion/quantity change
  app.post('/api/collection', requireAuth, (req, res) => {
    const db = readDb();
    const { id, cardId, printingId, quantity, condition, language, acquisitionSource, acquisitionCost, notes } = req.body;

    let targetCardId = cardId;
    let existingItem: CollectionItem | undefined;

    if (id) {
      existingItem = db.collectionItems.find((ci) => ci.id === id);
      if (existingItem) {
        targetCardId = targetCardId || existingItem.cardId;
      }
    }

    if (!targetCardId && !id) {
      return res.status(400).json({ error: 'cardId or collection item id required' });
    }

    const prtId = printingId || (targetCardId ? db.cards.find((c) => c.id === targetCardId)?.defaultPrintingId : '') || existingItem?.printingId || '';

    if (id && existingItem) {
      const idx = db.collectionItems.findIndex((ci) => ci.id === id);
      if (idx !== -1) {
        if (Number(quantity) <= 0) {
          // Check for active allocations before deletion
          const itemAllocations = db.allocations.filter((a) => a.collectionItemId === id);
          if (itemAllocations.length > 0) {
            const deckNames = itemAllocations
              .map(a => db.decks.find(d => d.id === a.deckId)?.name || 'Unknown Deck')
              .join(', ');
            return res.status(400).json({ 
              error: `Cannot delete: ${itemAllocations.length} copies allocated to ${deckNames}. Release allocations first.` 
            });
          }
          // Safe to delete
          db.collectionItems.splice(idx, 1);
          db.allocations = db.allocations.filter((a) => a.collectionItemId !== id);
        } else {
          const newQty = Number(quantity);
          
          // Check if new quantity is below allocated amount
          const itemAllocations = db.allocations.filter((a) => a.collectionItemId === id);
          const totalAllocated = itemAllocations.reduce((sum, a) => sum + a.quantity, 0);
          if (newQty < totalAllocated) {
            const deckNames = itemAllocations
              .map(a => db.decks.find(d => d.id === a.deckId)?.name || 'Unknown Deck')
              .join(', ');
            return res.status(400).json({ 
              error: `Cannot decrease below ${totalAllocated} allocated copies (allocated to ${deckNames}). Release allocations first.` 
            });
          }
          
          db.collectionItems[idx] = {
            ...db.collectionItems[idx],
            quantity: newQty,
            condition: condition || db.collectionItems[idx].condition,
            language: language || db.collectionItems[idx].language,
            notes: notes !== undefined ? notes : db.collectionItems[idx].notes,
          };

          // Trim allocations if total allocated exceeds new quantity (safety net)
          if (totalAllocated > newQty) {
            let toTrim = totalAllocated - newQty;
            for (let i = itemAllocations.length - 1; i >= 0; i--) {
              if (toTrim <= 0) break;
              const alloc = itemAllocations[i];
              if (alloc.quantity <= toTrim) {
                toTrim -= alloc.quantity;
                db.allocations = db.allocations.filter((a) => a.id !== alloc.id);
              } else {
                alloc.quantity -= toTrim;
                toTrim = 0;
              }
            }
          }
        }
      }
    } else if (targetCardId) {
      // Create or increment existing item with same printing
      const existing = db.collectionItems.find((ci) => ci.cardId === targetCardId && ci.printingId === prtId && ci.condition === (condition || 'NM'));
      if (existing) {
        existing.quantity += Number(quantity || 1);
      } else {
        const newItem: CollectionItem = {
          id: `ci_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          cardId: targetCardId,
          printingId: prtId,
          quantity: Number(quantity || 1),
          condition: condition || 'NM',
          language: language || 'English',
          acquisitionSource: acquisitionSource || 'Manual Add',
          acquisitionDate: new Date().toISOString().split('T')[0],
          acquisitionCost: Number(acquisitionCost || 0),
          notes,
        };
        db.collectionItems.push(newItem);
      }
    }

    // Re-run auto allocation for active decks so allocations stay synchronized
    const activeDecks = db.decks.filter((d) => d.status === 'Active');
    for (const d of activeDecks) {
      db.allocations = autoAllocateDeck(d.id, db.deckRequirements, db.collectionItems, db.allocations, activeDecks);
    }

    writeDb(db);
    res.json({ success: true, collection: db.collectionItems });
  });

  // DELETE /api/collection/:id
  // BACKEND IS AUTHORITATIVE: Re-checks database for allocations before deletion
  app.delete('/api/collection/:id', requireAuth, (req, res) => {
    const db = readDb();
    const { id } = req.params;

    // Check for active allocations before deletion
    const itemAllocations = db.allocations.filter((a) => a.collectionItemId === id);
    if (itemAllocations.length > 0) {
      const deckNames = itemAllocations
        .map(a => db.decks.find(d => d.id === a.deckId)?.name || 'Unknown Deck')
        .join(', ');
      return res.status(400).json({ 
        error: `Cannot delete: ${itemAllocations.length} copies allocated to ${deckNames}. Release allocations first.` 
      });
    }

    db.collectionItems = db.collectionItems.filter((ci) => ci.id !== id);
    db.allocations = db.allocations.filter((a) => a.collectionItemId !== id);

    // Re-run auto allocation for active decks
    const activeDecks = db.decks.filter((d) => d.status === 'Active');
    for (const d of activeDecks) {
      db.allocations = autoAllocateDeck(d.id, db.deckRequirements, db.collectionItems, db.allocations, activeDecks);
    }

    writeDb(db);
    res.json({ success: true, collection: db.collectionItems });
  });

  // GET /api/decks
  app.get('/api/decks', requireAuth, (req, res) => {
    const db = readDb();

    const enrichedDecks = db.decks.map((deck) => {
      const reqs = db.deckRequirements.filter((r) => r.deckId === deck.id);

      const cardOwnershipList = reqs.map((req) => {
        const card = db.cards.find((c) => c.id === req.cardId);
        if (!card) return null;

        const ownership = calculateCardOwnershipForDeck(
          card,
          req,
          deck,
          db.decks,
          db.collectionItems,
          db.allocations
        );

        const printing = db.printings.find((p) => p.id === (req.preferredPrintingId || card.defaultPrintingId));

        return {
          requirement: req,
          card,
          printing,
          ownership,
        };
      }).filter(Boolean);

      const totalRequired = reqs.reduce((sum, r) => sum + r.quantity, 0);
      const totalAllocated = cardOwnershipList.reduce((sum, item) => sum + (item?.ownership.allocatedToThisDeck || 0), 0);
      const isFullyOwned = cardOwnershipList.every((item) => item?.ownership.status === 'FULLY_OWNED');

      return {
        ...deck,
        requirements: cardOwnershipList,
        totalRequiredCards: totalRequired,
        totalAllocatedCards: totalAllocated,
        isFullyOwned,
      };
    });

    res.json(enrichedDecks);
  });

  // POST /api/decks (Create or Update deck)
  app.post('/api/decks', requireAuth, (req, res) => {
    const db = readDb();
    const { id, name, version, format, status, isPermanentlyAssembled, notes, requirements } = req.body;

    let deck: Deck;
    if (id) {
      const idx = db.decks.findIndex((d) => d.id === id);
      if (idx !== -1) {
        db.decks[idx] = {
          ...db.decks[idx],
          name: name || db.decks[idx].name,
          version: version || db.decks[idx].version,
          format: format || db.decks[idx].format,
          status: status || db.decks[idx].status,
          isPermanentlyAssembled: isPermanentlyAssembled !== undefined ? isPermanentlyAssembled : db.decks[idx].isPermanentlyAssembled,
          notes: notes !== undefined ? notes : db.decks[idx].notes,
          updatedAt: new Date().toISOString(),
        };
        deck = db.decks[idx];
      } else {
        return res.status(404).json({ error: 'Deck not found' });
      }
    } else {
      const newId = `deck_${Date.now()}`;
      deck = {
        id: newId,
        name: name || 'New Pokémon Deck',
        version: version || 'v1.0',
        format: format || 'Standard',
        status: status || 'Active',
        isPermanentlyAssembled: Boolean(isPermanentlyAssembled),
        notes,
        updatedAt: new Date().toISOString(),
      };
      db.decks.push(deck);
    }

    // Update requirements if provided
    if (Array.isArray(requirements)) {
      db.deckRequirements = db.deckRequirements.filter((r) => r.deckId !== deck.id);
      for (const r of requirements) {
        db.deckRequirements.push({
          id: r.id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          deckId: deck.id,
          cardId: r.cardId,
          quantity: Math.max(1, Number(r.quantity || 1)),
          requirementMode: r.requirementMode || 'ANY_PRINTING',
          preferredPrintingId: r.preferredPrintingId,
        });
      }

      // Cleanup orphaned allocations for this deck
      const validReqIds = new Set(db.deckRequirements.filter((r) => r.deckId === deck.id).map((r) => r.id));
      db.allocations = db.allocations.filter((a) => a.deckId !== deck.id || validReqIds.has(a.requirementId));

      // Re-run auto allocation for active decks
      if (deck.status === 'Active') {
        const activeDecks = db.decks.filter((d) => d.status === 'Active');
        db.allocations = autoAllocateDeck(deck.id, db.deckRequirements, db.collectionItems, db.allocations, activeDecks);
      }
    }

    writeDb(db);
    res.json(deck);
  });

  // DELETE /api/decks/:id
  app.delete('/api/decks/:id', requireAuth, (req, res) => {
    const db = readDb();
    const { id } = req.params;

    db.decks = db.decks.filter((d) => d.id !== id);
    db.deckRequirements = db.deckRequirements.filter((r) => r.deckId !== id);
    db.allocations = db.allocations.filter((a) => a.deckId !== id);

    // Re-allocate released copies to remaining active decks
    const activeDecks = db.decks.filter((d) => d.status === 'Active');
    for (const d of activeDecks) {
      db.allocations = autoAllocateDeck(d.id, db.deckRequirements, db.collectionItems, db.allocations, activeDecks);
    }

    writeDb(db);
    res.json({ success: true });
  });

  // POST /api/decks/:id/auto-allocate
  app.post('/api/decks/:id/auto-allocate', requireAuth, (req, res) => {
    const db = readDb();
    const { id } = req.params;

    const deck = db.decks.find((d) => d.id === id);
    if (!deck) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const activeDecks = db.decks.filter((d) => d.status === 'Active');
    db.allocations = autoAllocateDeck(
      id,
      db.deckRequirements,
      db.collectionItems,
      db.allocations,
      activeDecks
    );

    writeDb(db);
    res.json({ success: true, allocations: db.allocations });
  });

  // POST /api/allocations/move (Transfer allocations directly between decks)
  app.post('/api/allocations/move', requireAuth, (req, res) => {
    const db = readDb();
    const { sourceDeckId, targetDeckId, cardId, quantity } = req.body;

    if (!sourceDeckId || !targetDeckId || !cardId) {
      return res.status(400).json({ error: 'sourceDeckId, targetDeckId, and cardId required' });
    }

    const moveQty = Number(quantity || 1);
    let remainingToMove = moveQty;

    // Find allocations in source deck for collection items matching cardId
    const sourceAllocations = db.allocations.filter((a) => {
      if (a.deckId !== sourceDeckId) return false;
      const ci = db.collectionItems.find((c) => c.id === a.collectionItemId);
      return ci && ci.cardId === cardId;
    });

    const targetReq = db.deckRequirements.find((r) => r.deckId === targetDeckId && r.cardId === cardId);
    if (!targetReq) {
      return res.status(400).json({ error: 'Target deck does not have a requirement for this card' });
    }

    for (const sAlloc of sourceAllocations) {
      if (remainingToMove <= 0) break;
      const amount = Math.min(sAlloc.quantity, remainingToMove);

      sAlloc.quantity -= amount;
      remainingToMove -= amount;

      // Add allocation to target deck requirement
      const existingTargetAlloc = db.allocations.find(
        (a) => a.deckId === targetDeckId && a.requirementId === targetReq.id && a.collectionItemId === sAlloc.collectionItemId
      );

      if (existingTargetAlloc) {
        existingTargetAlloc.quantity += amount;
      } else {
        db.allocations.push({
          id: `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          collectionItemId: sAlloc.collectionItemId,
          deckId: targetDeckId,
          requirementId: targetReq.id,
          quantity: amount,
        });
      }
    }

    // Clean up 0 quantity allocations
    db.allocations = db.allocations.filter((a) => a.quantity > 0);

    writeDb(db);
    res.json({ success: true, moved: moveQty - remainingToMove, allocations: db.allocations });
  });

  // POST /api/decks/:id/assemble (Assemble Deck Pick List)
  app.post('/api/decks/:id/assemble', requireAuth, (req, res) => {
    const db = readDb();
    const { id } = req.params;

    const deck = db.decks.find((d) => d.id === id);
    if (!deck) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const reqs = db.deckRequirements.filter((r) => r.deckId === id);
    const storeProfile = db.storeProfiles.find((sp) => sp.isDefault) || db.storeProfiles[0];

    const pickList = reqs.map((req) => {
      const card = db.cards.find((c) => c.id === req.cardId);
      const printing = db.printings.find((p) => p.id === (req.preferredPrintingId || card?.defaultPrintingId));

      const reqAllocations = db.allocations.filter((a) => a.deckId === id && a.requirementId === req.id);
      const allocatedQty = reqAllocations.reduce((sum, a) => sum + a.quantity, 0);

      // Check where allocated cards are physically coming from
      const transferAlerts: { fromDeckName: string; count: number }[] = [];
      const collectionItemSources: { printingName: string; setCode: string; count: number; condition: string }[] = [];

      for (const alloc of reqAllocations) {
        const item = db.collectionItems.find((ci) => ci.id === alloc.collectionItemId);
        if (item) {
          const prt = db.printings.find((p) => p.id === item.printingId);
          collectionItemSources.push({
            printingName: prt ? `${prt.setName} (${prt.setCode} ${prt.cardNumber})` : 'Main Collection',
            setCode: prt ? prt.setCode : 'GEN',
            count: alloc.quantity,
            condition: item.condition,
          });
        }
      }

      // Check if other active decks need to surrender allocated copies
      const activeOtherDeckIds = new Set(db.decks.filter((d) => d.id !== id && d.status === 'Active').map((d) => d.id));
      const otherDeckAllocations = db.allocations.filter((a) => activeOtherDeckIds.has(a.deckId) && db.collectionItems.some((ci) => ci.id === a.collectionItemId && ci.cardId === req.cardId));
      for (const oAlloc of otherDeckAllocations) {
        const otherDeck = db.decks.find((d) => d.id === oAlloc.deckId);
        if (otherDeck) {
          transferAlerts.push({
            fromDeckName: otherDeck.name,
            count: oAlloc.quantity,
          });
        }
      }

      const bulkCategory = card && storeProfile ? resolveBulkCategoryForCard(card, printing, storeProfile) : 'General Box';

      return {
        card,
        printing,
        requiredQty: req.quantity,
        allocatedQty,
        missingQty: Math.max(0, req.quantity - allocatedQty),
        bulkCategory,
        collectionItemSources,
        transferAlerts,
      };
    });

    res.json({
      deck,
      pickList,
    });
  });

  // GET /api/store-profiles
  app.get('/api/store-profiles', requireAuth, (req, res) => {
    const db = readDb();
    res.json(db.storeProfiles);
  });

  // POST /api/store-profiles
  app.post('/api/store-profiles', requireAuth, (req, res) => {
    const db = readDb();
    const { id, name, categories, overrides } = req.body;

    if (id) {
      const idx = db.storeProfiles.findIndex((sp) => sp.id === id);
      if (idx !== -1) {
        db.storeProfiles[idx] = {
          ...db.storeProfiles[idx],
          name: name || db.storeProfiles[idx].name,
          categories: categories || db.storeProfiles[idx].categories,
          overrides: overrides || db.storeProfiles[idx].overrides,
        };
      }
    } else {
      const newSp: StoreProfile = {
        id: `sp_${Date.now()}`,
        name: name || 'Custom Store Profile',
        isDefault: db.storeProfiles.length === 0,
        categories: categories || [],
        overrides: overrides || [],
      };
      db.storeProfiles.push(newSp);
    }

    writeDb(db);
    res.json(db.storeProfiles);
  });

  // POST /api/store-profiles/duplicate
  app.post('/api/store-profiles/duplicate', requireAuth, (req, res) => {
    const db = readDb();
    const { id } = req.body;
    const existing = db.storeProfiles.find((sp) => sp.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Store profile not found' });
    }

    const newSp: StoreProfile = {
      id: `sp_${Date.now()}`,
      name: `Copy of ${existing.name}`,
      isDefault: false,
      categories: existing.categories.map((c) => ({ ...c, id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` })),
      overrides: existing.overrides.map((o) => ({ ...o, id: `ov_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` })),
    };
    db.storeProfiles.push(newSp);
    writeDb(db);
    res.json({ success: true, storeProfiles: db.storeProfiles, newProfile: newSp });
  });

  // POST /api/store-profiles/default
  app.post('/api/store-profiles/default', requireAuth, (req, res) => {
    const db = readDb();
    const { id } = req.body;
    db.storeProfiles = db.storeProfiles.map((sp) => ({
      ...sp,
      isDefault: sp.id === id,
    }));
    writeDb(db);
    res.json(db.storeProfiles);
  });

  // DELETE /api/store-profiles/:id
  app.delete('/api/store-profiles/:id', requireAuth, (req, res) => {
    const db = readDb();
    const { id } = req.params;
    if (db.storeProfiles.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only store profile' });
    }
    db.storeProfiles = db.storeProfiles.filter((sp) => sp.id !== id);
    if (!db.storeProfiles.some((sp) => sp.isDefault)) {
      db.storeProfiles[0].isDefault = true;
    }
    writeDb(db);
    res.json(db.storeProfiles);
  });

  // GET /api/bulk-hunt (Generate physical store bulk hunting checklist)
  app.get('/api/bulk-hunt', requireAuth, (req, res) => {
    const db = readDb();
    const deckId = req.query.deckId as string;
    const storeProfileId = req.query.storeProfileId as string;

    const storeProfile = db.storeProfiles.find((sp) => sp.id === storeProfileId) || db.storeProfiles[0];

    // Determine missing cards
    let shortfalls: { cardId: string; cardName: string; missing: number; preferredPrintingId?: string }[] = [];

    if (deckId && deckId !== 'ALL') {
      const reqs = db.deckRequirements.filter((r) => r.deckId === deckId);
      const deck = db.decks.find((d) => d.id === deckId);
      if (deck) {
        shortfalls = reqs.map((req) => {
          const card = db.cards.find((c) => c.id === req.cardId);
          if (!card) return null;
          const ownership = calculateCardOwnershipForDeck(card, req, deck, db.decks, db.collectionItems, db.allocations);
          return {
            cardId: card.id,
            cardName: card.name,
            missing: ownership.missing,
            preferredPrintingId: req.preferredPrintingId,
          };
        }).filter((item): item is NonNullable<typeof item> => item !== null && item.missing > 0);
      }
    } else {
      const multiShortfalls = calculateMultiDeckShortfalls(db.decks, db.deckRequirements, db.collectionItems, db.cards);
      shortfalls = multiShortfalls.map((s) => ({
        cardId: s.cardId,
        cardName: s.cardName,
        missing: s.missing,
      }));
    }

    // Group missing cards by Bulk Categories
    const categoryMap = new Map<string, any[]>();
    for (const cat of storeProfile.categories) {
      categoryMap.set(cat.name, []);
    }

    for (const item of shortfalls) {
      const card = db.cards.find((c) => c.id === item.cardId);
      if (!card) continue;
      const printing = db.printings.find((p) => p.id === (item.preferredPrintingId || card.defaultPrintingId));

      const categoryName = resolveBulkCategoryForCard(card, printing, storeProfile);
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, []);
      }

      categoryMap.get(categoryName)?.push({
        cardId: card.id,
        cardName: card.name,
        supertype: card.supertype,
        subtype: card.subtype,
        printing,
        needQty: item.missing,
        foundQty: 0,
      });
    }

    const groupedList = Array.from(categoryMap.entries())
      .filter(([_, items]) => items.length > 0)
      .map(([categoryName, items]) => {
        const catInfo = storeProfile.categories.find((c) => c.name === categoryName);
        return {
          categoryName,
          sortOrder: catInfo ? catInfo.sortOrder : 99,
          items: items.sort((a, b) => a.cardName.localeCompare(b.cardName)),
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

    res.json({
      storeProfile,
      groupedList,
    });
  });

  // POST /api/acquisitions (Acquire cards into collection)
  app.post('/api/acquisitions', requireAuth, (req, res) => {
    const db = readDb();
    const { cardId, printingId, quantity, source, method, costPerUnit, deckIdToAllocate } = req.body;

    if (!cardId) {
      return res.status(400).json({ error: 'cardId required' });
    }

    const card = db.cards.find((c) => c.id === cardId);
    const prtId = printingId || card?.defaultPrintingId || '';
    const qty = Number(quantity || 1);

    // Record Acquisition Log
    const acq: Acquisition = {
      id: `acq_${Date.now()}`,
      cardName: card ? card.name : 'Unknown Card',
      printingId: prtId,
      quantity: qty,
      source: source || 'Local Store Bulk Hunt',
      method: method || 'Bulk',
      date: new Date().toISOString().split('T')[0],
      costPerUnit: Number(costPerUnit || 0.25),
      notes: `Acquired ${qty}x ${card?.name || 'Card'}`,
    };
    db.acquisitions.push(acq);

    // Add into Collection
    let colItem = db.collectionItems.find((ci) => ci.cardId === cardId && ci.printingId === prtId && ci.condition === 'NM');
    if (colItem) {
      colItem.quantity += qty;
    } else {
      colItem = {
        id: `ci_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        cardId,
        printingId: prtId,
        quantity: qty,
        condition: 'NM',
        language: 'English',
        acquisitionSource: source || 'Bulk Hunt',
        acquisitionDate: new Date().toISOString().split('T')[0],
        acquisitionCost: Number(costPerUnit || 0.25),
      };
      db.collectionItems.push(colItem);
    }

    // Auto allocate to specific deck if requested
    if (deckIdToAllocate && colItem) {
      const activeDecks = db.decks.filter((d) => d.status === 'Active');
      db.allocations = autoAllocateDeck(deckIdToAllocate, db.deckRequirements, db.collectionItems, db.allocations, activeDecks);
    }

    writeDb(db);
    res.json({ success: true, acquisition: acq, collectionItem: colItem });
  });

  // GET /api/marketplace/search (Realist market search across TCGPlayer, eBay, BOB's Shop, PokeBulk)
  app.get('/api/marketplace/search', requireAuth, (req, res) => {
    const db = readDb();
    const query = (req.query.query as string || '').trim();

    if (!query) {
      return res.json([]);
    }

    const matchingCards = db.cards.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
    const results: MarketplaceListing[] = [];

    const marketplaces: ('TCGPlayer' | 'eBay' | "BOB's Shop" | 'PokeBulk' | 'Local Game Store')[] = [
      'TCGPlayer',
      'eBay',
      "BOB's Shop",
      'PokeBulk',
      'Local Game Store',
    ];

    matchingCards.forEach((card) => {
      const printings = db.printings.filter((p) => p.cardId === card.id);
      printings.forEach((p) => {
        marketplaces.forEach((mkt, idx) => {
          const basePrice = p.marketPrice || 1.0;
          const variance = (idx - 2) * 0.15;
          const price = Math.max(0.25, parseFloat((basePrice * (1 + variance)).toFixed(2)));
          const shipping = mkt === 'TCGPlayer' ? 0.99 : mkt === 'eBay' ? 1.50 : mkt === "BOB's Shop" ? 2.50 : 0.00;

          results.push({
            id: `mkt_${card.id}_${p.id}_${idx}`,
            marketplace: mkt,
            cardName: card.name,
            printingString: `${p.setName} (${p.setCode} ${p.cardNumber})`,
            sellerName: `${mkt} Verified Seller #${idx + 1}`,
            condition: 'NM',
            itemPrice: price,
            shippingPrice: shipping,
            availableQty: 4 + idx * 2,
            listingUrl: `https://${mkt.toLowerCase().replace(/[^a-z]/g, '')}.com/search?q=${encodeURIComponent(card.name)}`,
          });
        });
      });
    });

  res.json(results);
  });

  // GET /api/marketplace/optimize (Shopping Optimizer)
  app.get('/api/marketplace/optimize', requireAuth, (req, res) => {
    const db = readDb();
    const mode = (req.query.mode as 'CHEAPEST_TOTAL' | 'FEWEST_SELLERS') || 'CHEAPEST_TOTAL';

    const shortfalls = calculateMultiDeckShortfalls(db.decks, db.deckRequirements, db.collectionItems, db.cards);

    const items: ShoppingOptimizationResult['items'] = [];
    let totalCardCost = 0;
    let totalShippingCost = 0;
    const sellersUsed = new Set<string>();

    shortfalls.forEach((shortfall) => {
      const card = db.cards.find((c) => c.id === shortfall.cardId);
      if (!card) return;
      const printing = db.printings.find((p) => p.id === card.defaultPrintingId);

      const basePrice = printing?.marketPrice || 1.20;
      const shipping = mode === 'FEWEST_SELLERS' ? 0.0 : 0.99;
      const seller = mode === 'FEWEST_SELLERS' ? 'MegaTCG Central Store' : `TopDeck Direct Seller`;

      sellersUsed.add(seller);
      const cardCost = basePrice * shortfall.missing;

      totalCardCost += cardCost;
      if (!sellersUsed.has(seller + '_shipping_paid')) {
        totalShippingCost += shipping;
        sellersUsed.add(seller + '_shipping_paid');
      }

      items.push({
        cardId: shortfall.cardId,
        cardName: shortfall.cardName,
        printingString: printing ? `${printing.setName} (${printing.setCode} ${printing.cardNumber})` : 'Standard Printing',
        requiredQty: shortfall.missing,
        listing: {
          id: `opt_${shortfall.cardId}`,
          marketplace: 'TCGPlayer',
          cardName: shortfall.cardName,
          printingString: printing ? `${printing.setName} (${printing.setCode} ${printing.cardNumber})` : 'Standard Printing',
          sellerName: seller,
          condition: 'NM',
          itemPrice: basePrice,
          shippingPrice: shipping,
          availableQty: shortfall.missing,
        },
      });
    });

    res.json({
      mode,
      totalCardCost: parseFloat(totalCardCost.toFixed(2)),
      totalShippingCost: parseFloat(totalShippingCost.toFixed(2)),
      grandTotal: parseFloat((totalCardCost + totalShippingCost).toFixed(2)),
      selectedSellersCount: sellersUsed.size,
      items,
    });
  });

  // POST /api/import-export/deck (Limitless TCG format parser)
  app.post('/api/import-export/deck', requireAuth, (req, res) => {
    const db = readDb();
    const { text, deckName } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Decklist text required' });
    }

    const lines = text.split('\n');
    const parsedRequirements: { cardId: string; quantity: number; setCode?: string; cardNumber?: string }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('pokémon:') || trimmed.toLowerCase().startsWith('trainer:') || trimmed.toLowerCase().startsWith('energy:')) {
        continue;
      }

      // Format regex: "4 Ultra Ball SVI 196" or "4 Ultra Ball"
      const match = trimmed.match(/^(\d+)\s+(.+?)(?:\s+([A-Z0-9]{2,4})\s+(\d+[a-z]?))?$/i);
      if (match) {
        const qty = parseInt(match[1], 10);
        const cardName = match[2].trim();
        const setCode = match[3]?.toUpperCase();
        const cardNumber = match[4];

        let card = db.cards.find((c) => c.name.toLowerCase() === cardName.toLowerCase());
        if (!card) {
          // Auto-register card if not existing
          const newCardId = `card_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
          const newPrtId = `prt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

          let supertype: 'Pokémon' | 'Trainer' | 'Energy' = 'Trainer';
          if (cardName.toLowerCase().includes('energy')) supertype = 'Energy';
          else if (cardName.toLowerCase().includes('ex') || cardName.toLowerCase().includes('v') || cardName.toLowerCase().includes('star')) supertype = 'Pokémon';

          card = {
            id: newCardId,
            name: cardName,
            supertype,
            subtype: supertype === 'Energy' ? 'Basic Energy' : supertype === 'Trainer' ? 'Item' : 'Basic',
            defaultPrintingId: newPrtId,
          };
          db.cards.push(card);

          db.printings.push({
            id: newPrtId,
            cardId: newCardId,
            cardName: cardName,
            setCode: setCode || 'IMP',
            setName: setCode || 'Imported Set',
            cardNumber: cardNumber || '1',
            rarity: 'Uncommon',
            variant: 'Normal',
            language: 'English',
            imageUrl: '',
            marketPrice: 0.50,
          });
        }

        parsedRequirements.push({
          cardId: card.id,
          quantity: qty,
          setCode,
          cardNumber,
        });
      }
    }

    // Create deck
    const deckId = `deck_${Date.now()}`;
    const newDeck: Deck = {
      id: deckId,
      name: deckName || 'Imported Limitless Deck',
      version: 'v1.0 Import',
      format: 'Standard',
      status: 'Active',
      isPermanentlyAssembled: false,
      notes: `Imported on ${new Date().toLocaleDateString()}`,
      updatedAt: new Date().toISOString(),
    };
    db.decks.push(newDeck);

    for (const pr of parsedRequirements) {
      db.deckRequirements.push({
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        deckId,
        cardId: pr.cardId,
        quantity: pr.quantity,
        requirementMode: pr.setCode ? 'SPECIFIC_PRINTING' : 'ANY_PRINTING',
      });
    }

    // Auto allocate owned cards
    const activeDecks = db.decks.filter((d) => d.status === 'Active');
    db.allocations = autoAllocateDeck(deckId, db.deckRequirements, db.collectionItems, db.allocations, activeDecks);

    writeDb(db);
    res.json({ success: true, deck: newDeck, reqCount: parsedRequirements.length });
  });

  // --- VITE MIDDLEWARE / STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
