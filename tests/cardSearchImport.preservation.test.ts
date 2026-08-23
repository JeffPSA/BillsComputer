/**
 * Preservation Property Tests — card-search-import-fix
 *
 * PURPOSE: Protect correct existing behaviors from regression.
 * These tests encode the CURRENT (correct) behavior of the unfixed code for inputs that
 * do NOT trigger any of the four bug sub-conditions.
 *
 * IMPORTANT: ALL tests in this file MUST PASS on unfixed code.
 * They must CONTINUE TO PASS after the fix is applied.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery } from '../server/cardDataProvider.js';
import { normalizeText, searchLocalCards, resolveCardForImport, findCardsByName } from '../server/localCardSearch.js';
import type { LogicalCard } from '../src/types/tcg.js';

// ---------------------------------------------------------------------------
// Shared mock card database
// ---------------------------------------------------------------------------

const CHARIZARD_EX: LogicalCard = {
  id: 'card_charizard_ex',
  name: 'Charizard ex',
  supertype: 'Pokémon',
  subtype: 'Basic',
  defaultPrintingId: 'sv1-196',
  printings: [
    {
      id: 'sv1-196',
      cardId: 'card_charizard_ex',
      cardName: 'Charizard ex',
      setCode: 'SVI',
      setName: 'Scarlet & Violet',
      cardNumber: '196',
      rarity: 'Double Rare',
      variant: 'Normal',
      language: 'English',
      imageUrl: '',
      marketPrice: 10.00,
    },
  ],
};

const PIKACHU_VMAX: LogicalCard = {
  id: 'card_pikachu_vmax',
  name: 'Pikachu VMAX',
  supertype: 'Pokémon',
  subtype: 'Basic' as any,
  defaultPrintingId: 'swsh4-44',
  printings: [
    {
      id: 'swsh4-44',
      cardId: 'card_pikachu_vmax',
      cardName: 'Pikachu VMAX',
      setCode: 'VIV',
      setName: 'Vivid Voltage',
      cardNumber: '44',
      rarity: 'Rare Holo VMAX' as any,
      variant: 'Normal',
      language: 'English',
      imageUrl: '',
      marketPrice: 5.00,
    },
  ],
};

const BULBASAUR: LogicalCard = {
  id: 'card_bulbasaur',
  name: 'Bulbasaur',
  supertype: 'Pokémon',
  subtype: 'Basic',
  defaultPrintingId: 'sv1-1',
  printings: [
    {
      id: 'sv1-1',
      cardId: 'card_bulbasaur',
      cardName: 'Bulbasaur',
      setCode: 'SVI',
      setName: 'Scarlet & Violet',
      cardNumber: '1',
      rarity: 'Common',
      variant: 'Normal',
      language: 'English',
      imageUrl: '',
      marketPrice: 0.25,
    },
  ],
};

const ERIKA: LogicalCard = {
  id: 'card_erika',
  name: "Erika's Hospitality",
  supertype: 'Trainer',
  subtype: 'Supporter',
  defaultPrintingId: 'cel25-167',
  printings: [
    {
      id: 'cel25-167',
      cardId: 'card_erika',
      cardName: "Erika's Hospitality",
      setCode: 'CEL25',
      setName: 'Celebrations',
      cardNumber: '167',
      rarity: 'Rare',
      variant: 'Normal',
      language: 'English',
      imageUrl: '',
      marketPrice: 1.50,
    },
  ],
};

const MOCK_CARDS: LogicalCard[] = [CHARIZARD_EX, PIKACHU_VMAX, BULBASAUR, ERIKA];

// ---------------------------------------------------------------------------
// Preservation 1: parseSearchQuery("SVI 196") — confirmed set code + number
//
// "SVI" is a real Pokémon TCG set code (Scarlet & Violet base). In a two-token
// query where the first token is a validated set code and the second is numeric,
// the function MUST continue to extract setCode and cardNumber correctly.
//
// Observed on unfixed code: { setCode: 'svi', hasSetCode: true, cardNumber: '196',
//                              hasCardNumber: true }
// This is the CORRECT behavior — it must be preserved after the fix.
//
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------
test('Preservation 1: parseSearchQuery("SVI 196") extracts setCode and cardNumber (not cardName)', async () => {
  /**
   * Validates: Requirements 3.1
   *
   * "SVI" is a confirmed valid set code with a corroborating numeric token.
   * The fix for single-token ambiguity (sub-condition 1) must NOT affect this
   * two-token case — validated set codes must still be extracted correctly.
   */
  const result = await parseSearchQuery('SVI 196');

  assert.equal(
    result.hasSetCode,
    true,
    `Expected hasSetCode=true for "SVI 196" but got ${result.hasSetCode}. ` +
    `"SVI" is a confirmed valid Pokémon TCG set code. The fix must not suppress it.`,
  );

  assert.equal(
    result.setCode,
    'svi',
    `Expected setCode='svi' but got '${result.setCode}'.`,
  );

  assert.equal(
    result.hasCardNumber,
    true,
    `Expected hasCardNumber=true for "SVI 196" but got ${result.hasCardNumber}.`,
  );

  assert.equal(
    result.cardNumber,
    '196',
    `Expected cardNumber='196' but got '${result.cardNumber}'.`,
  );
});

// ---------------------------------------------------------------------------
// Preservation 2: resolveCardForImport with canonicalId → exact_id match
//
// When a canonical API card ID is provided (e.g. "sv1-196"), resolveCardForImport
// must find the card via exact printing ID match at the highest priority level,
// without any name-based or set-number fallback.
//
// Validates: Requirements 3.5
// ---------------------------------------------------------------------------
test('Preservation 2: resolveCardForImport with canonicalId returns exact_id', () => {
  /**
   * Validates: Requirements 3.5
   */
  const result = resolveCardForImport(MOCK_CARDS, 'Charizard ex', undefined, undefined, 'sv1-196');

  assert.equal(
    result.matchType,
    'exact_id',
    `Expected matchType='exact_id' but got '${result.matchType}'. ` +
    `canonicalId lookup must remain the highest-priority resolution path.`,
  );

  assert.ok(
    result.card !== null,
    `Expected a non-null card but got null.`,
  );

  assert.equal(
    result.card?.id,
    'card_charizard_ex',
    `Expected card.id='card_charizard_ex' but got '${result.card?.id}'.`,
  );
});

// ---------------------------------------------------------------------------
// Preservation 3: resolveCardForImport with set code + card number → set_number match
//
// When a card is in the local DB and both setCode and cardNumber are provided,
// the function must resolve via set_number priority without invoking any API.
//
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------
test('Preservation 3: resolveCardForImport with setCode + cardNumber returns set_number', () => {
  /**
   * Validates: Requirements 3.2
   */
  const result = resolveCardForImport(MOCK_CARDS, 'Charizard ex', 'SVI', '196');

  assert.equal(
    result.matchType,
    'set_number',
    `Expected matchType='set_number' but got '${result.matchType}'. ` +
    `A local set+number match must continue to resolve without API fallback.`,
  );

  assert.ok(
    result.card !== null,
    `Expected a non-null card for SVI/196 but got null.`,
  );

  assert.equal(
    result.card?.id,
    'card_charizard_ex',
    `Expected card.id='card_charizard_ex' but got '${result.card?.id}'.`,
  );
});

// ---------------------------------------------------------------------------
// Preservation 4: normalizeText on plain ASCII names is unchanged
//
// For card names with no apostrophes and no special characters, normalizeText
// must produce the same output before and after the fix. The fix adds new
// apostrophe-variant characters to the strip regex but must not affect plain text.
//
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------
test('Preservation 4: normalizeText on plain ASCII card names produces the same output as expected', () => {
  /**
   * Validates: Requirements 3.3
   */
  const cases: Array<{ input: string; expected: string }> = [
    { input: 'Charizard',           expected: 'charizard' },
    { input: 'Bulbasaur',           expected: 'bulbasaur' },
    { input: 'Squirtle',            expected: 'squirtle' },
    { input: 'Trainer Supporter',   expected: 'trainer supporter' },
    { input: 'Basic Energy',        expected: 'basic energy' },
    { input: 'Double Rare',         expected: 'double rare' },
    { input: 'ACE SPEC',            expected: 'ace spec' },
    { input: 'Scarlet & Violet',    expected: 'scarlet & violet' },
    { input: 'Erika',               expected: 'erika' },
  ];

  for (const { input, expected } of cases) {
    const result = normalizeText(input);
    assert.equal(
      result,
      expected,
      `normalizeText("${input}") → "${result}" but expected "${expected}". ` +
      `Plain ASCII names must not be affected by the apostrophe regex expansion.`,
    );
  }
});

// ---------------------------------------------------------------------------
// Preservation 5: parseSearchQuery("Pikachu VMAX") — subtype token stays in name
//
// "VMAX" is a subtype marker. Even though it matches the uppercase pattern,
// it must be treated as part of the card name, not as a set code.
// This behavior must be preserved exactly as-is after the fix.
//
// Validates: Requirements 3.6
// ---------------------------------------------------------------------------
test('Preservation 5: parseSearchQuery("Pikachu VMAX") treats "VMAX" as part of card name', async () => {
  /**
   * Validates: Requirements 3.6
   */
  const result = await parseSearchQuery('Pikachu VMAX');

  assert.equal(
    result.hasSetCode,
    false,
    `Expected hasSetCode=false for "Pikachu VMAX" but got ${result.hasSetCode}. ` +
    `"VMAX" is a subtype marker and must never be extracted as a set code.`,
  );

  assert.ok(
    result.cardName.toLowerCase().includes('vmax'),
    `Expected cardName to include "vmax" but got '${result.cardName}'. ` +
    `"VMAX" must be preserved as part of the card name.`,
  );

  assert.ok(
    result.cardName.toLowerCase().includes('pikachu'),
    `Expected cardName to include "pikachu" but got '${result.cardName}'.`,
  );
});

// ---------------------------------------------------------------------------
// Preservation 6: searchLocalCards("", { supertype: "Pokémon" }) returns all Pokémon
//
// An empty query with a supertype filter must return all cards of that supertype.
// This tests the filter-only path in searchLocalCards.
//
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------
test('Preservation 6: empty query with supertype filter returns all cards of that type', () => {
  /**
   * Validates: Requirements 3.4
   */
  const result = searchLocalCards(MOCK_CARDS, '', { supertype: 'Pokémon' });
  const pokemonCards = MOCK_CARDS.filter(c => c.supertype === 'Pokémon');

  assert.equal(
    result.length,
    pokemonCards.length,
    `Expected ${pokemonCards.length} Pokémon cards but got ${result.length}. ` +
    `Empty query + supertype filter must return all cards of that supertype.`,
  );

  for (const card of pokemonCards) {
    assert.ok(
      result.some(c => c.id === card.id),
      `Expected card "${card.name}" (id: ${card.id}) in results but it was missing.`,
    );
  }
});

// ---------------------------------------------------------------------------
// Preservation 7: findCardsByName with exact ASCII name finds the card
//
// A card stored with a plain straight-apostrophe name must be findable by
// exact name match using a straight-apostrophe query. This is the baseline
// behavior for the name-matching path.
//
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------
test('Preservation 7: findCardsByName with exact ASCII name (including straight apostrophe) returns the card', () => {
  /**
   * Validates: Requirements 3.3
   */
  const result = findCardsByName(MOCK_CARDS, "Erika's Hospitality");

  assert.ok(
    result.length > 0,
    `findCardsByName with exact name "Erika's Hospitality" returned [] but expected a match. ` +
    `Straight-apostrophe exact match must continue to work.`,
  );

  assert.ok(
    result.some(c => c.id === 'card_erika'),
    `Expected 'card_erika' in results but got: ${JSON.stringify(result.map(c => c.id))}`,
  );
});

// ---------------------------------------------------------------------------
// Preservation 8 (Property): two-token queries where second token is numeric
//
// For all two-token inputs of the form "<LETTERS> <NUMBER>" where the first
// token is a known valid set code, parseSearchQuery must:
//   - set hasCardNumber = true
//   - populate cardNumber with the numeric token
//
// This property ensures the fix for single-token ambiguity (task 3.3) does not
// inadvertently break the set+number extraction for legitimate two-token queries.
//
// Validates: Requirements 3.1, 3.2
// ---------------------------------------------------------------------------
test('Preservation 8 (Property): two-token queries with numeric second token always populate cardNumber', async () => {
  /**
   * Validates: Requirements 3.1, 3.2
   *
   * Generator: representative set of two-token queries using known valid
   * Pokémon TCG set codes paired with card numbers of varying lengths.
   * These are real set codes verified by the live API (confirmed during observation).
   */
  const twoTokenCases: Array<{ query: string; expectedCardNumber: string }> = [
    { query: 'SVI 196',  expectedCardNumber: '196' },
    { query: 'SVI 1',    expectedCardNumber: '1' },
    { query: 'PGO 50',   expectedCardNumber: '50' },
    { query: 'BRS 1',    expectedCardNumber: '1' },
    { query: 'MEW 100',  expectedCardNumber: '100' },
    { query: 'OBF 225',  expectedCardNumber: '225' },
    { query: 'PAL 196',  expectedCardNumber: '196' },
    { query: 'PRE 1',    expectedCardNumber: '1' },
    { query: 'TWM 50',   expectedCardNumber: '50' },
    { query: 'TEF 25',   expectedCardNumber: '25' },
  ];

  const failures: string[] = [];

  for (const { query, expectedCardNumber } of twoTokenCases) {
    const result = await parseSearchQuery(query);

    if (!result.hasCardNumber) {
      failures.push(
        `parseSearchQuery("${query}") → hasCardNumber=false (expected true)`,
      );
    } else if (result.cardNumber !== expectedCardNumber) {
      failures.push(
        `parseSearchQuery("${query}") → cardNumber='${result.cardNumber}' (expected '${expectedCardNumber}')`,
      );
    }
  }

  assert.equal(
    failures.length,
    0,
    `Property violation: two-token queries with numeric second token failed to populate cardNumber.\n` +
    failures.map(f => `  • ${f}`).join('\n'),
  );
});

// ---------------------------------------------------------------------------
// Preservation 9: exact_id priority beats set_number priority
//
// When both a canonicalId and a setCode+cardNumber are provided, the
// exact_id path must win. Priority ordering must be preserved.
//
// Validates: Requirements 3.5
// ---------------------------------------------------------------------------
test('Preservation 9: exact_id priority is higher than set_number when both are provided', () => {
  /**
   * Validates: Requirements 3.5
   */
  // Provide both canonicalId AND setCode+cardNumber — exact_id must win
  const result = resolveCardForImport(MOCK_CARDS, 'Charizard ex', 'SVI', '196', 'sv1-196');

  assert.equal(
    result.matchType,
    'exact_id',
    `Expected matchType='exact_id' but got '${result.matchType}'. ` +
    `exact_id must have higher priority than set_number.`,
  );
});
