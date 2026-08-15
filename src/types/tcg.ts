export type Supertype = 'Pokémon' | 'Trainer' | 'Energy';

export type Subtype = 
  | 'Item' 
  | 'Supporter' 
  | 'Stadium' 
  | 'Tool' 
  | 'Basic' 
  | 'Stage 1' 
  | 'Stage 2' 
  | 'Special Energy' 
  | 'Basic Energy';

export type PokemonType = 
  | 'Fire' 
  | 'Water' 
  | 'Grass' 
  | 'Lightning' 
  | 'Psychic' 
  | 'Fighting' 
  | 'Darkness' 
  | 'Metal' 
  | 'Dragon' 
  | 'Colorless';

export type CardRarity = 
  | 'Common' 
  | 'Uncommon' 
  | 'Rare' 
  | 'Double Rare' 
  | 'Ultra Rare' 
  | 'Illustration Rare' 
  | 'Special Illustration Rare' 
  | 'Hyper Rare' 
  | 'ACE SPEC' 
  | 'Radiant Rare'
  | 'Promo';

export type CardVariant = 
  | 'Normal' 
  | 'Holo' 
  | 'Reverse Holo' 
  | 'Full Art' 
  | 'Secret Rare' 
  | 'Gold' 
  | 'Stamped Promo';

export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'Damaged';

export interface PokemonTcgSet {
  id: string;
  name: string;
  series: string;
  ptcgoCode?: string;
  releaseDate: string;
  printedTotal: number;
  total: number;
  updatedAt: string;
}

export interface CardSet {
  id: string;
  name: string;
  series: string;
  ptcgoCode?: string;
  releaseDate: string;
  printedTotal: number;
  total: number;
  updatedAt: string;
}

export interface LogicalCard {
  id: string;
  name: string;
  supertype: Supertype;
  subtype: Subtype;
  types?: PokemonType[];
  hp?: number;
  rules?: string[];
  isAceSpec?: boolean;
  defaultPrintingId: string;
  printings?: CardPrinting[];
}

export interface CardPrinting {
  id: string;
  cardId: string;
  cardName: string;
  setCode: string;
  setName: string;
  cardNumber: string;
  rarity: CardRarity;
  variant: CardVariant;
  language: string;
  imageUrl: string;
  marketPrice: number;
  // Extended fields from Pokémon TCG API
  attacks?: Attack[];
  abilities?: Ability[];
  weaknesses?: Weakness[];
  resistances?: Resistance[];
  retreatCost?: number;
  nationalPokedexNumbers?: number[];
  regulationMark?: string;
  legalities?: Legalities;
  artist?: string;
  imageUrlSmall?: string;
  imageUrlLarge?: string;
}

export interface Attack {
  name: string;
  cost?: string[];
  convertedEnergyCost?: number;
  damage?: string;
  text?: string;
}

export interface Ability {
  name: string;
  text: string;
  type: string;
}

export interface Weakness {
  type: string;
  value: string;
}

export interface Resistance {
  type: string;
  value: string;
}

export interface Legalities {
  unlimited?: boolean;
  standard?: boolean;
  expanded?: boolean;
}

export interface CollectionItem {
  id: string;
  printingId: string;
  cardId: string;
  quantity: number;
  condition: Condition;
  language: string;
  acquisitionSource?: string;
  acquisitionDate?: string;
  acquisitionCost?: number;
  notes?: string;
}

export type RequirementMode = 'ANY_PRINTING' | 'SPECIFIC_PRINTING';

export interface DeckRequirement {
  id: string;
  deckId: string;
  cardId: string;
  quantity: number;
  requirementMode: RequirementMode;
  preferredPrintingId?: string;
}

export interface Allocation {
  id: string;
  collectionItemId: string;
  deckId: string;
  requirementId: string;
  quantity: number;
  isLocked?: boolean;
}

export type DeckStatus = 'Active' | 'Inactive' | 'Archived';

export interface Deck {
  id: string;
  name: string;
  version: string;
  format: 'Standard' | 'Expanded';
  status: DeckStatus;
  isPermanentlyAssembled: boolean;
  notes?: string;
  updatedAt: string;
}

export type AcquisitionPreference = 'Bulk' | 'Local Singles' | 'Online' | 'Cheapest' | 'Wishlist' | "Don't Care";

export interface WishlistItem {
  id: string;
  cardId: string;
  preferredPrintingId?: string;
  targetQuantity: number;
  preferredAcquisition: AcquisitionPreference;
  priority: 'High' | 'Medium' | 'Low';
  notes?: string;
}

export interface BulkCategory {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
}

export type StoreCategory = BulkCategory;

export interface BulkLocationOverride {
  id: string;
  storeProfileId: string;
  cardId?: string;
  rarity?: CardRarity;
  supertype?: Supertype;
  categoryId: string;
}

export interface StoreProfile {
  id: string;
  name: string;
  isDefault: boolean;
  categories: BulkCategory[];
  overrides: BulkLocationOverride[];
}

export interface Acquisition {
  id: string;
  cardName: string;
  printingId: string;
  quantity: number;
  source: string;
  method: 'Bulk' | 'Local Shop' | 'Online Marketplace' | 'Trade' | 'Pack Pull';
  date: string;
  costPerUnit: number;
  notes?: string;
}

export type OwnershipStatus = 'FULLY_OWNED' | 'PARTIALLY_OWNED' | 'ALLOCATED_ELSEWHERE' | 'NOT_OWNED';

export interface CalculatedCardOwnership {
  cardId: string;
  cardName: string;
  required: number;
  allocatedToThisDeck: number;
  availableInCollection: number;
  totalOwnedInCollection: number;
  allocatedToOtherDecks: number;
  missing: number;
  status: OwnershipStatus;
  requirementMode: RequirementMode;
  preferredPrintingId?: string;
}

export interface MarketplaceListing {
  id: string;
  marketplace: 'TCGPlayer' | 'eBay' | "BOB's Shop" | 'PokeBulk' | 'Local Game Store';
  cardName: string;
  printingString: string;
  sellerName: string;
  condition: Condition;
  itemPrice: number;
  shippingPrice: number;
  availableQty: number;
  listingUrl?: string;
}

export interface ShoppingOptimizationResult {
  mode: 'CHEAPEST_TOTAL' | 'FEWEST_SELLERS';
  totalCardCost: number;
  totalShippingCost: number;
  grandTotal: number;
  selectedSellersCount: number;
  items: {
    cardId: string;
    cardName: string;
    printingString: string;
    requiredQty: number;
    listing: MarketplaceListing;
  }[];
}
