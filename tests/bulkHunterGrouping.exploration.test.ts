/**
 * Bulk Hunter Grouping — Bug Condition Exploration Tests
 *
 * These tests encode EXPECTED (fixed) behavior and are intentionally written to
 * FAIL against the unfixed production code in src/services/allocationEngine.ts.
 * Failure here is the SUCCESS signal: it confirms the bugs exist before the fix.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 *
 * Sub-conditions tested:
 *   1. "Rare Holo" and rarity variants not in the hardcoded rarity list are
 *      misrouted to Common/Uncommon buckets instead of the Rare alphabetical bucket.
 *      The bug is exposed when Common buckets appear before Rare in the profile
 *      (the fallback branch picks the first A–F match regardless of "Rare" prefix).
 *   2. A hyphen-minus ("-") in a Rare category name fails to match the Rare
 *      branch (which only checks en-dash via c.name.includes('G–M')), causing
 *      the card to fall through to the Common/Uncommon branch.
 *   3. ACE SPEC cards with a dedicated "ACE SPEC Box" category are routed to
 *      an alphabetical Rare bucket instead of the dedicated category.
 *   4. Property: any rarity matching /holo|illustration|hyper|special/i must
 *      NEVER land in a Common/Uncommon bucket when a Rare bucket is available.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { resolveBulkCategoryForCard } from '../src/services/allocationEngine';
import type { LogicalCard, CardPrinting, StoreProfile } from '../src/types/tcg';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makePokemonCard(id: string, name: string, isAceSpec = false): LogicalCard {
  return {
    id,
    name,
    supertype: 'Pokémon',
    subtype: 'Basic',
    defaultPrintingId: `prt_${id}`,
    isAceSpec,
  };
}

function makePrinting(cardId: string, rarity: string): CardPrinting {
  return {
    id: `prt_${cardId}`,
    cardId,
    cardName: cardId,
    setCode: 'TST',
    setName: 'Test Set',
    cardNumber: '001',
    // cast: the type system uses the CardRarity union but the bug involves strings
    // outside that union; we use `as any` to exercise runtime behaviour.
    rarity: rarity as CardPrinting['rarity'],
    variant: 'Normal',
    language: 'English',
    imageUrl: '',
    marketPrice: 0,
  };
}

/**
 * Profile that lists Common buckets BEFORE Rare buckets.
 *
 * This exposes sub-condition 1: 'Rare Holo' is not in the hardcoded rarity
 * equality chain, so it falls through to the Common/Uncommon fallback branch.
 * The fallback uses c.name.includes('A–F') which matches 'Common — A–F' first
 * because Common sorts earlier in this profile. Without the fix the card lands
 * in 'Common — A–F' instead of 'Rare — A–F'.
 */
const commonBeforeRareProfile: StoreProfile = {
  id: 'sp_common_first',
  name: 'Common-First Store',
  isDefault: true,
  categories: [
    { id: 'cat_common_af', name: 'Common — A–F',    sortOrder: 1 },
    { id: 'cat_common_gm', name: 'Common — G–M',    sortOrder: 2 },
    { id: 'cat_common_nz', name: 'Common — N–Z',    sortOrder: 3 },
    { id: 'cat_rare_af',   name: 'Rare — A–F',      sortOrder: 4 },
    { id: 'cat_rare_gm',   name: 'Rare — G–M',      sortOrder: 5 },
    { id: 'cat_rare_nz',   name: 'Rare — N–Z',      sortOrder: 6 },
  ],
  overrides: [],
};

/**
 * Profile where Rare categories use hyphen-minus ("-") in range tokens.
 *
 * Exposes sub-condition 2: the Rare branch checks c.name.includes('G–M')
 * (en-dash) which doesn't match 'Rare — G-M' (hyphen-minus). The card
 * falls through to the Common fallback and, with Common buckets listed before
 * Rare, lands in the wrong bucket.
 */
const rareHyphenCommonBeforeProfile: StoreProfile = {
  id: 'sp_rare_hyphen',
  name: 'Rare-Hyphen Store',
  isDefault: true,
  categories: [
    { id: 'cat_common_af', name: 'Common — A–F',    sortOrder: 1 },
    { id: 'cat_common_gm', name: 'Common — G–M',    sortOrder: 2 },
    { id: 'cat_common_nz', name: 'Common — N–Z',    sortOrder: 3 },
    { id: 'cat_rare_af',   name: 'Rare — A-F',      sortOrder: 4 },
    { id: 'cat_rare_gm',   name: 'Rare — G-M',      sortOrder: 5 },
    { id: 'cat_rare_nz',   name: 'Rare — N-Z',      sortOrder: 6 },
  ],
  overrides: [],
};

/** A store profile that has a dedicated "ACE SPEC Box" category. */
const aceSpecProfile: StoreProfile = {
  id: 'sp_acespec',
  name: 'ACE SPEC Store',
  isDefault: true,
  categories: [
    { id: 'cat_ace',       name: 'ACE SPEC Box',    sortOrder: 1 },
    { id: 'cat_rare_af',   name: 'Rare — A–F',      sortOrder: 2 },
    { id: 'cat_rare_gm',   name: 'Rare — G–M',      sortOrder: 3 },
    { id: 'cat_rare_nz',   name: 'Rare — N–Z',      sortOrder: 4 },
    { id: 'cat_common_af', name: 'Common — A–F',    sortOrder: 5 },
  ],
  overrides: [],
};

// ---------------------------------------------------------------------------
// Sub-condition 1: "Rare Holo" not in the hardcoded rarity equality chain
// ---------------------------------------------------------------------------

test('Sub-condition 1: "Rare Holo" card routes to Rare A–F bucket, not Common — A–F', () => {
  // Profile lists Common buckets before Rare buckets.
  // On unfixed code: 'Rare Holo' is not in the hardcoded equality chain,
  // so the function falls to the Common/Uncommon fallback branch.
  // The fallback's find() returns 'Common — A–F' (first match for includes('A–F')).
  // Expected (fixed) behaviour: recognise 'Rare Holo' as rare → 'Rare — A–F'.
  const card = makePokemonCard('card_arcanine', 'Arcanine'); // starts with 'A'
  const printing = makePrinting('card_arcanine', 'Rare Holo');

  const result = resolveBulkCategoryForCard(card, printing, commonBeforeRareProfile);

  assert.strictEqual(
    result,
    'Rare — A–F',
    `Expected "Rare — A–F" but got "${result}" — ` +
      '"Rare Holo" is not in the hardcoded rarity equality chain; unfixed code ' +
      'falls to the Common/Uncommon fallback and picks "Common — A–F" first.'
  );
});

test('Sub-condition 1: "Holo Rare" card routes to Rare G–M bucket, not Common — G–M', () => {
  const card = makePokemonCard('card_gengar', 'Gengar'); // starts with 'G'
  const printing = makePrinting('card_gengar', 'Holo Rare');

  const result = resolveBulkCategoryForCard(card, printing, commonBeforeRareProfile);

  assert.strictEqual(
    result,
    'Rare — G–M',
    `Expected "Rare — G–M" but got "${result}" — "Holo Rare" not in hardcoded list.`
  );
});

test('Sub-condition 1: "Special Illustration Rare" card routes to Rare N–Z bucket, not Common — N–Z', () => {
  const card = makePokemonCard('card_ninetales', 'Ninetales'); // starts with 'N'
  const printing = makePrinting('card_ninetales', 'Special Illustration Rare');

  const result = resolveBulkCategoryForCard(card, printing, commonBeforeRareProfile);

  assert.strictEqual(
    result,
    'Rare — N–Z',
    `Expected "Rare — N–Z" but got "${result}" — "Special Illustration Rare" not in hardcoded list.`
  );
});

// ---------------------------------------------------------------------------
// Sub-condition 2: en-dash vs hyphen-minus mismatch in Rare branch
// ---------------------------------------------------------------------------

test('Sub-condition 2: Double Rare + hyphen profile starting G routes to "Rare — G-M", not Common', () => {
  // The Rare branch checks c.name.includes('G–M') (en-dash).
  // With hyphen-minus stored names like 'Rare — G-M', the en-dash check fails.
  // The card falls through to the Common fallback. Common buckets are listed
  // first in this profile so it returns 'Common — G–M'.
  const card = makePokemonCard('card_garchomp', 'Garchomp'); // starts with 'G'
  const printing = makePrinting('card_garchomp', 'Double Rare');

  const result = resolveBulkCategoryForCard(card, printing, rareHyphenCommonBeforeProfile);

  assert.strictEqual(
    result,
    'Rare — G-M',
    `Expected "Rare — G-M" but got "${result}" — ` +
      'en-dash in Rare branch check does not match hyphen-minus in category name; ' +
      'unfixed code falls to Common fallback.'
  );
});

test('Sub-condition 2: Ultra Rare + hyphen profile starting A routes to "Rare — A-F", not Common', () => {
  const card = makePokemonCard('card_alakazam', 'Alakazam'); // starts with 'A'
  const printing = makePrinting('card_alakazam', 'Ultra Rare');

  const result = resolveBulkCategoryForCard(card, printing, rareHyphenCommonBeforeProfile);

  assert.strictEqual(
    result,
    'Rare — A-F',
    `Expected "Rare — A-F" but got "${result}" — en-dash vs hyphen-minus mismatch.`
  );
});

// ---------------------------------------------------------------------------
// Sub-condition 3: ACE SPEC card with dedicated category bypasses alphabetical branch
// ---------------------------------------------------------------------------

test('Sub-condition 3: ACE SPEC card with dedicated "ACE SPEC Box" routes there, not to Rare A–F', () => {
  // On unfixed code: no dedicated ACE SPEC category check exists. The card has
  // rarity 'ACE SPEC' which IS in the hardcoded list, so the Rare branch fires
  // and routes to 'Rare — A–F' (name starts with 'C').
  const card = makePokemonCard('card_computer_search', 'Computer Search', /* isAceSpec */ true);
  const printing = makePrinting('card_computer_search', 'ACE SPEC');

  const result = resolveBulkCategoryForCard(card, printing, aceSpecProfile);

  assert.strictEqual(
    result,
    'ACE SPEC Box',
    `Expected "ACE SPEC Box" but got "${result}" — ` +
      'no dedicated ACE SPEC check exists before the alphabetical branch in unfixed code.'
  );
});

// ---------------------------------------------------------------------------
// Sub-condition 4 (Property): /holo|illustration|hyper|special/i rarities must
// never land in a Common/Uncommon bucket when a Rare bucket is available.
// ---------------------------------------------------------------------------

test('Property — holo/illustration/hyper/special rarities always route to Rare bucket (not Common)', () => {
  /**
   * Validates: Requirements 1.1, 1.4
   *
   * Generator: build a cross-product of representative "rare-variant" rarity
   * strings × card names spanning all three alphabetical ranges (A-F, G-M, N-Z).
   * Profile lists Common before Rare so the bug is observable: unfixed code picks
   * the Common bucket first via the fallback branch.
   */
  const rareVariantRarities = [
    'Rare Holo',
    'Holo Rare',
    'Rare Holo EX',
    'Special Illustration Rare',
    'Hyper Rare',
    'Illustration Rare',
    'Rare Holo VMAX',
    'Rare Holo V',
  ];

  // Names that cover each alphabetical bucket
  const cardNames = [
    'Arcanine',   // A–F
    'Bulbasaur',  // A–F
    'Flareon',    // A–F
    'Gengar',     // G–M
    'Lapras',     // G–M
    'Mewtwo',     // G–M
    'Ninetales',  // N–Z
    'Pikachu',    // N–Z
    'Zapdos',     // N–Z
  ];

  const commonBucketPattern = /common|uncommon/i;
  const failures: string[] = [];

  for (const rarity of rareVariantRarities) {
    for (const name of cardNames) {
      const card = makePokemonCard(`card_${name.toLowerCase()}`, name);
      const printing = makePrinting(`card_${name.toLowerCase()}`, rarity);

      const result = resolveBulkCategoryForCard(card, printing, commonBeforeRareProfile);

      if (commonBucketPattern.test(result)) {
        failures.push(`rarity="${rarity}" name="${name}" → "${result}" (expected a Rare bucket)`);
      }
    }
  }

  assert.strictEqual(
    failures.length,
    0,
    `The following cards were incorrectly routed to Common/Uncommon buckets:\n` +
      failures.map((f) => `  • ${f}`).join('\n')
  );
});
