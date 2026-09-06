import assert from 'node:assert';
import { buildBobShopShoppingList, calculatePrintingAwareShoppingNeeds } from '../src/services/shoppingList';
import { CardPrinting, CollectionItem, Deck, DeckRequirement, LogicalCard } from '../src/types/tcg';

const decks: Deck[] = [
  { id: 'active', name: 'Active Deck', version: '1', format: 'Standard', status: 'Active', isPermanentlyAssembled: false, updatedAt: '' },
  { id: 'inactive', name: 'Inactive Deck', version: '1', format: 'Standard', status: 'Inactive', isPermanentlyAssembled: false, updatedAt: '' },
];
const cards: LogicalCard[] = [
  { id: 'shaymin', name: 'Shaymin', supertype: 'Pokémon', subtype: 'Basic', defaultPrintingId: 'dri-10' },
];
const printings: CardPrinting[] = [
  {
    id: 'dri-10', cardId: 'shaymin', cardName: 'Shaymin', setCode: 'DRI', setName: 'Destined Rivals',
    cardNumber: '10', rarity: 'Uncommon', variant: 'Normal', language: 'English', imageUrl: '', marketPrice: 0,
  },
  {
    id: 'pre-87', cardId: 'shaymin', cardName: 'Shaymin', setCode: 'PRE', setName: 'Prismatic Evolutions',
    cardNumber: '87', rarity: 'Uncommon', variant: 'Normal', language: 'English', imageUrl: '', marketPrice: 0,
  },
];

function run() {
  const requirements: DeckRequirement[] = [
    { id: 'exact', deckId: 'active', cardId: 'shaymin', quantity: 2, requirementMode: 'SPECIFIC_PRINTING', preferredPrintingId: 'dri-10' },
    { id: 'any', deckId: 'active', cardId: 'shaymin', quantity: 2, requirementMode: 'ANY_PRINTING' },
    { id: 'ignored', deckId: 'inactive', cardId: 'shaymin', quantity: 4, requirementMode: 'ANY_PRINTING' },
  ];
  const collectionItems: CollectionItem[] = [
    { id: 'owned-dri', cardId: 'shaymin', printingId: 'dri-10', quantity: 1, condition: 'NM', language: 'English' },
    { id: 'owned-pre', cardId: 'shaymin', printingId: 'pre-87', quantity: 1, condition: 'NM', language: 'English' },
  ];

  const needs = calculatePrintingAwareShoppingNeeds(decks, requirements, collectionItems, cards);
  assert.deepStrictEqual(needs, [
    { cardId: 'shaymin', cardName: 'Shaymin', requirementMode: 'ANY_PRINTING', requiredQty: 1 },
    { cardId: 'shaymin', cardName: 'Shaymin', requirementMode: 'SPECIFIC_PRINTING', preferredPrintingId: 'dri-10', requiredQty: 1 },
  ]);

  const result = buildBobShopShoppingList(decks, requirements, collectionItems, cards, printings);
  assert.strictEqual(result.marketplace, 'Bob Shop');
  assert.strictEqual(result.totalMissingCards, 2);
  assert.strictEqual(result.uniqueItems, 2);
  const exact = result.items.find((item) => item.preferredPrintingId === 'dri-10');
  assert.ok(exact?.printingString.includes('DRI #10'));
  assert.ok(exact?.searchUrl.startsWith('https://www.bobshop.co.za/'));
  assert.ok(exact?.searchUrl.includes('IncludedKeywords='));

  console.log('✅ Bob Shop list respects active decks, exact printings, owned surplus, and real search links');
}

run();
