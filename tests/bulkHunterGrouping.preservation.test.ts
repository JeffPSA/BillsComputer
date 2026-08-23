/**
 * Bulk Hunter Grouping — Preservation Property Tests
 *
 * These tests verify that CORRECTLY ROUTED cards continue to be routed
 * identically before and after the fix. All assertions were observed on
 * UNFIXED code first; the recorded outputs are encoded here as the
 * authoritative expected values.
 *
 * ALL tests in this file MUST PASS on unfixed code.
 * ALL tests in this file MUST CONTINUE TO PASS after the fix is applied.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { resolveBulkCategoryForCard } from '../src/services/allocationEngine';
import type { LogicalCard, CardPrinting, StoreProfile, BulkLocationOverride } from '../src/types/tcg';

// ---------------------------------------------------------------------------
// Shared helpers — mirrored from the exploration test for consistency
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

function makeTrainerCard(id: string, name: string): LogicalCard {
  return {
    id,
    name,
    supertype: 'Trainer',
    subtype: 'Item',
    defaultPrintingId: `prt_${id}`,
  };
}

function makePrinting(cardId: string, rarity: CardPrinting['rarity']): CardPrinting {
  return {
    id: `prt_${cardId}`,
    cardId,
    cardName: cardId,
    setCode: 'TST',
    setName: 'Test Set',
    cardNumber: '001',
    rarity,
    variant: 'Normal',
    language: 'English',
    imageUrl: '',
    marketPrice: 0,
  };
}

// ---------------------------------------------------------------------------
// Shared store profile — en-dash range tokens, Common then Rare then Trainer
// ---------------------------------------------------------------------------

/**
 * Standard profile with en-dash range tokens in all category names.
 * Common buckets come before Rare; Trainer category included.
 * This is the representative "correct" configuration observed on unfixed code.
 */
const standardEnDashProfile: StoreProfile = {
  id: 'sp_standard',
  name: 'Standard Store',
  isDefault: true,
  categories: [
    { id: 'cat_common_af', name: 'Common — A–F',    sortOrder: 1 },
    { id: 'cat_common_gm', name: 'Common — G–M',    sortOrder: 2 },
    { id: 'cat_common_nz', name: 'Common — N–Z',    sortOrder: 3 },
    { id: 'cat_rare_af',   name: 'Rare — A–F',      sortOrder: 4 },
    { id: 'cat_rare_gm',   name: 'Rare — G–M',      sortOrder: 5 },
    { id: 'cat_rare_nz',   name: 'Rare — N–Z',      sortOrder: 6 },
    { id: 'cat_trainer',   name: 'Trainer Items Box', sortOrder: 7 },
  ],
  overrides: [],
};

/** Same layout but with hyphen-minus range tokens — tests Req 3.4/3.5/3.6 for hyphen profiles. */
const standardHyphenProfile: StoreProfile = {
  id: 'sp_hyphen',
  name: 'Hyphen Store',
  isDefault: true,
  categories: [
    { id: 'cat_common_af', name: 'Common — A-F',    sortOrder: 1 },
    { id: 'cat_common_gm', name: 'Common — G-M',    sortOrder: 2 },
    { id: 'cat_common_nz', name: 'Common — N-Z',    sortOrder: 3 },
  ],
  overrides: [],
};

// ---------------------------------------------------------------------------
// Req 3.1 — Explicit per-card cardId override always takes highest priority
// ---------------------------------------------------------------------------

test('Req 3.1: explicit cardId override routes to overridden category', () => {
  // Build a profile where Bulbasaur (name starts 'B') has a per-card override
  // pointing to a special "Staff Picks" category.
  const profileWithCardOverride: StoreProfile = {
    id: 'sp_card_override',
    name: 'Card Override Store',
    isDefault: true,
    categories: [
      { id: 'cat_staff',     name: 'Staff Picks',    sortOrder: 1 },
      { id: 'cat_common_af', name: 'Common — A–F',   sortOrder: 2 },
      { id: 'cat_rare_af',   name: 'Rare — A–F',     sortOrder: 3 },
    ],
    overrides: [
      {
        id: 'ov_bulbasaur',
        storeProfileId: 'sp_card_override',
        cardId: 'card_bulbasaur',
        categoryId: 'cat_staff',
      } as BulkLocationOverride,
    ],
  };

  const card = makePokemonCard('card_bulbasaur', 'Bulbasaur');
  const printing = makePrinting('card_bulbasaur', 'Common');

  // Observed on unfixed code: 'Staff Picks'
  const result = resolveBulkCategoryForCard(card, printing, profileWithCardOverride);

  assert.strictEqual(
    result,
    'Staff Picks',
    `Expected "Staff Picks" (cardId override) but got "${result}"`
  );
});

test('Req 3.1: cardId override wins over rarity-based routing for a Rare card', () => {
  const profileWithCardOverride: StoreProfile = {
    id: 'sp_card_override2',
    name: 'Card Override Store 2',
    isDefault: true,
    categories: [
      { id: 'cat_promo',   name: 'Promo Box',    sortOrder: 1 },
      { id: 'cat_rare_af', name: 'Rare — A–F',   sortOrder: 2 },
    ],
    overrides: [
      {
        id: 'ov_mewtwo',
        storeProfileId: 'sp_card_override2',
        cardId: 'card_mewtwo',
        categoryId: 'cat_promo',
      } as BulkLocationOverride,
    ],
  };

  const card = makePokemonCard('card_mewtwo', 'Mewtwo');
  const printing = makePrinting('card_mewtwo', 'Ultra Rare');

  // Observed on unfixed code: 'Promo Box' (override fires before rarity branch)
  const result = resolveBulkCategoryForCard(card, printing, profileWithCardOverride);

  assert.strictEqual(
    result,
    'Promo Box',
    `Expected "Promo Box" (cardId override for Rare card) but got "${result}"`
  );
});

// ---------------------------------------------------------------------------
// Req 3.2 — Per-rarity override continues to apply before heuristic matching
// ---------------------------------------------------------------------------

test('Req 3.2: per-rarity override routes a "Rare" card to the overridden category', () => {
  const profileWithRarityOverride: StoreProfile = {
    id: 'sp_rarity_override',
    name: 'Rarity Override Store',
    isDefault: true,
    categories: [
      { id: 'cat_binder',    name: 'Binder Rares', sortOrder: 1 },
      { id: 'cat_common_af', name: 'Common — A–F', sortOrder: 2 },
      { id: 'cat_rare_af',   name: 'Rare — A–F',   sortOrder: 3 },
    ],
    overrides: [
      {
        id: 'ov_rare_rarity',
        storeProfileId: 'sp_rarity_override',
        rarity: 'Rare',
        categoryId: 'cat_binder',
      } as BulkLocationOverride,
    ],
  };

  // Card starting with 'A' (would normally hit 'Rare — A–F' without override)
  const card = makePokemonCard('card_arcanine', 'Arcanine');
  const printing = makePrinting('card_arcanine', 'Rare');

  // Observed on unfixed code: 'Binder Rares' (rarity override fires first)
  const result = resolveBulkCategoryForCard(card, printing, profileWithRarityOverride);

  assert.strictEqual(
    result,
    'Binder Rares',
    `Expected "Binder Rares" (rarity override) but got "${result}"`
  );
});

test('Req 3.2: per-rarity override for "Double Rare" routes to overridden category', () => {
  const profileWithRarityOverride: StoreProfile = {
    id: 'sp_rarity_override2',
    name: 'Rarity Override Store 2',
    isDefault: true,
    categories: [
      { id: 'cat_ex_box',  name: 'EX Box',       sortOrder: 1 },
      { id: 'cat_rare_gm', name: 'Rare — G–M',   sortOrder: 2 },
    ],
    overrides: [
      {
        id: 'ov_double_rare',
        storeProfileId: 'sp_rarity_override2',
        rarity: 'Double Rare',
        categoryId: 'cat_ex_box',
      } as BulkLocationOverride,
    ],
  };

  const card = makePokemonCard('card_garchomp', 'Garchomp'); // starts 'G'
  const printing = makePrinting('card_garchomp', 'Double Rare');

  // Observed on unfixed code: 'EX Box'
  const result = resolveBulkCategoryForCard(card, printing, profileWithRarityOverride);

  assert.strictEqual(
    result,
    'EX Box',
    `Expected "EX Box" (Double Rare rarity override) but got "${result}"`
  );
});

// ---------------------------------------------------------------------------
// Req 3.3 — Per-supertype override continues to apply before heuristic matching
// ---------------------------------------------------------------------------

test('Req 3.3: per-supertype override for "Trainer" routes to overridden category', () => {
  const profileWithSupertypeOverride: StoreProfile = {
    id: 'sp_supertype_override',
    name: 'Supertype Override Store',
    isDefault: true,
    categories: [
      { id: 'cat_premium_trainer', name: 'Premium Trainer Box', sortOrder: 1 },
      { id: 'cat_trainer',         name: 'Trainer Items Box',   sortOrder: 2 },
      { id: 'cat_common_af',       name: 'Common — A–F',        sortOrder: 3 },
    ],
    overrides: [
      {
        id: 'ov_trainer_supertype',
        storeProfileId: 'sp_supertype_override',
        supertype: 'Trainer',
        categoryId: 'cat_premium_trainer',
      } as BulkLocationOverride,
    ],
  };

  const card = makeTrainerCard('card_switch', 'Switch');
  const printing = makePrinting('card_switch', 'Common');

  // Observed on unfixed code: 'Premium Trainer Box' (supertype override fires first)
  const result = resolveBulkCategoryForCard(card, printing, profileWithSupertypeOverride);

  assert.strictEqual(
    result,
    'Premium Trainer Box',
    `Expected "Premium Trainer Box" (supertype override) but got "${result}"`
  );
});

test('Req 3.3: per-supertype override for "Pokémon" routes to overridden category', () => {
  const profileWithPokemonOverride: StoreProfile = {
    id: 'sp_pokemon_override',
    name: 'Pokémon Supertype Override Store',
    isDefault: true,
    categories: [
      { id: 'cat_pokemon_box', name: 'Pokémon Bulk Box', sortOrder: 1 },
      { id: 'cat_common_af',   name: 'Common — A–F',     sortOrder: 2 },
    ],
    overrides: [
      {
        id: 'ov_pokemon_supertype',
        storeProfileId: 'sp_pokemon_override',
        supertype: 'Pokémon',
        categoryId: 'cat_pokemon_box',
      } as BulkLocationOverride,
    ],
  };

  const card = makePokemonCard('card_eevee', 'Eevee');
  const printing = makePrinting('card_eevee', 'Common');

  // Observed on unfixed code: 'Pokémon Bulk Box'
  const result = resolveBulkCategoryForCard(card, printing, profileWithPokemonOverride);

  assert.strictEqual(
    result,
    'Pokémon Bulk Box',
    `Expected "Pokémon Bulk Box" (Pokémon supertype override) but got "${result}"`
  );
});

// ---------------------------------------------------------------------------
// Req 3.4 — Common/Uncommon A–F routing continues to work (en-dash profile)
// ---------------------------------------------------------------------------

test('Req 3.4: Bulbasaur (Common, name starts B) routes to "Common — A–F" with en-dash profile', () => {
  // Observed on unfixed code: 'Common — A–F'
  const card = makePokemonCard('card_bulbasaur', 'Bulbasaur');
  const printing = makePrinting('card_bulbasaur', 'Common');

  const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

  assert.strictEqual(
    result,
    'Common — A–F',
    `Expected "Common — A–F" but got "${result}"`
  );
});

test('Req 3.4: Uncommon card starting A routes to "Common — A–F" with en-dash profile', () => {
  const card = makePokemonCard('card_abra', 'Abra');
  const printing = makePrinting('card_abra', 'Uncommon');

  // Observed on unfixed code: 'Common — A–F'
  const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

  assert.strictEqual(
    result,
    'Common — A–F',
    `Expected "Common — A–F" but got "${result}"`
  );
});

// ---------------------------------------------------------------------------
// Req 3.5 — Common/Uncommon G–M routing continues to work (en-dash profile)
// ---------------------------------------------------------------------------

test('Req 3.5: Common card starting G routes to "Common — G–M" with en-dash profile', () => {
  const card = makePokemonCard('card_geodude', 'Geodude');
  const printing = makePrinting('card_geodude', 'Common');

  // Observed on unfixed code: 'Common — G–M'
  const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

  assert.strictEqual(
    result,
    'Common — G–M',
    `Expected "Common — G–M" but got "${result}"`
  );
});

test('Req 3.5: Uncommon card starting M routes to "Common — G–M" with en-dash profile', () => {
  const card = makePokemonCard('card_magikarp', 'Magikarp');
  const printing = makePrinting('card_magikarp', 'Uncommon');

  // Observed on unfixed code: 'Common — G–M'
  const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

  assert.strictEqual(
    result,
    'Common — G–M',
    `Expected "Common — G–M" but got "${result}"`
  );
});

// ---------------------------------------------------------------------------
// Req 3.6 — Common/Uncommon N–Z routing continues to work (en-dash profile)
// ---------------------------------------------------------------------------

test('Req 3.6: Common card starting P routes to "Common — N–Z" with en-dash profile', () => {
  const card = makePokemonCard('card_psyduck', 'Psyduck');
  const printing = makePrinting('card_psyduck', 'Common');

  // Observed on unfixed code: 'Common — N–Z'
  const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

  assert.strictEqual(
    result,
    'Common — N–Z',
    `Expected "Common — N–Z" but got "${result}"`
  );
});

test('Req 3.6: Uncommon card starting Z routes to "Common — N–Z" with en-dash profile', () => {
  const card = makePokemonCard('card_zubat', 'Zubat');
  const printing = makePrinting('card_zubat', 'Uncommon');

  // Observed on unfixed code: 'Common — N–Z'
  const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

  assert.strictEqual(
    result,
    'Common — N–Z',
    `Expected "Common — N–Z" but got "${result}"`
  );
});

// ---------------------------------------------------------------------------
// Trainer routing — works on unfixed code; must continue to work after fix
// ---------------------------------------------------------------------------

test('Trainer card routes to "Trainer Items Box" when that category exists', () => {
  const card = makeTrainerCard('card_potions', 'Potion');
  const printing = makePrinting('card_potions', 'Common');

  // Observed on unfixed code: 'Trainer Items Box'
  const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

  assert.strictEqual(
    result,
    'Trainer Items Box',
    `Expected "Trainer Items Box" but got "${result}"`
  );
});

test('Trainer card starting P routes to "Trainer Items Box", not to alphabetical bucket', () => {
  const card = makeTrainerCard('card_professor', "Professor's Research");
  const printing = makePrinting('card_professor', 'Uncommon');

  // Observed on unfixed code: 'Trainer Items Box' (trainer branch fires before fallback)
  const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

  assert.strictEqual(
    result,
    'Trainer Items Box',
    `Expected "Trainer Items Box" but got "${result}"`
  );
});

// ---------------------------------------------------------------------------
// Req 3.4/3.5/3.6 — Common/Uncommon routing also works with hyphen-minus profile
// (this already works on unfixed code because the fallback branch checks both
//  en-dash and hyphen variants via includes('A–F') || includes('A-F') etc.)
// ---------------------------------------------------------------------------

test('Common card starting A routes correctly with hyphen-minus profile ("Common — A-F")', () => {
  const card = makePokemonCard('card_abra', 'Abra');
  const printing = makePrinting('card_abra', 'Common');

  // Observed on unfixed code: 'Common — A-F'
  const result = resolveBulkCategoryForCard(card, printing, standardHyphenProfile);

  assert.strictEqual(
    result,
    'Common — A-F',
    `Expected "Common — A-F" but got "${result}"`
  );
});

test('Common card starting N routes correctly with hyphen-minus profile ("Common — N-Z")', () => {
  const card = makePokemonCard('card_nidoran', 'Nidoran');
  const printing = makePrinting('card_nidoran', 'Common');

  // Observed on unfixed code: 'Common — N-Z'
  const result = resolveBulkCategoryForCard(card, printing, standardHyphenProfile);

  assert.strictEqual(
    result,
    'Common — N-Z',
    `Expected "Common — N-Z" but got "${result}"`
  );
});

// ---------------------------------------------------------------------------
// Property test — Common/Uncommon cards always land in the correct alphabetical
// bucket, regardless of whether the profile uses en-dash or hyphen-minus.
//
// Validates: Requirements 3.4, 3.5, 3.6
// ---------------------------------------------------------------------------

test('Property — Common/Uncommon cards route to the correct alphabetical bucket (en-dash profile)', () => {
  /**
   * Validates: Requirements 3.4, 3.5, 3.6
   *
   * Generator: cross-product of Common/Uncommon rarities × names spanning each
   * alphabetical bucket (A–F, G–M, N–Z). All should land in the matching
   * Common bucket on both unfixed and fixed code.
   */
  const commonRarities: CardPrinting['rarity'][] = ['Common', 'Uncommon'];

  const nameBuckets: { names: string[]; expectedBucket: string }[] = [
    { names: ['Abra', 'Bulbasaur', 'Caterpie', 'Diglett', 'Eevee', 'Flareon'], expectedBucket: 'Common — A–F' },
    { names: ['Geodude', 'Haunter', 'Ivysaur', 'Jigglypuff', 'Krabby', 'Lapras', 'Magikarp'], expectedBucket: 'Common — G–M' },
    { names: ['Nidoran', 'Oddish', 'Paras', 'Rattata', 'Sandshrew', 'Tentacool', 'Vulpix', 'Weedle', 'Zubat'], expectedBucket: 'Common — N–Z' },
  ];

  const failures: string[] = [];

  for (const rarity of commonRarities) {
    for (const { names, expectedBucket } of nameBuckets) {
      for (const name of names) {
        const card = makePokemonCard(`card_${name.toLowerCase()}`, name);
        const printing = makePrinting(`card_${name.toLowerCase()}`, rarity);

        const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

        if (result !== expectedBucket) {
          failures.push(`rarity="${rarity}" name="${name}" → "${result}" (expected "${expectedBucket}")`);
        }
      }
    }
  }

  assert.strictEqual(
    failures.length,
    0,
    `Common/Uncommon cards routed to wrong bucket:\n` +
      failures.map((f) => `  • ${f}`).join('\n')
  );
});

test('Property — Common/Uncommon cards route to correct alphabetical bucket (hyphen-minus profile)', () => {
  /**
   * Validates: Requirements 3.4, 3.5, 3.6
   *
   * Same cross-product test for the hyphen-minus profile variant.
   * This tests the already-working path in the Common/Uncommon fallback branch
   * (which checks both en-dash and hyphen-minus via includes('A–F') || includes('A-F')).
   * After the fix the normalizeDashes approach replaces this; the outcome must be identical.
   */
  const nameBuckets: { names: string[]; expectedBucket: string }[] = [
    { names: ['Abra', 'Bulbasaur', 'Caterpie', 'Eevee', 'Flareon'], expectedBucket: 'Common — A-F' },
    { names: ['Geodude', 'Haunter', 'Lapras', 'Magikarp'],           expectedBucket: 'Common — G-M' },
    { names: ['Nidoran', 'Psyduck', 'Rattata', 'Zubat'],             expectedBucket: 'Common — N-Z' },
  ];

  const failures: string[] = [];

  for (const { names, expectedBucket } of nameBuckets) {
    for (const name of names) {
      const card = makePokemonCard(`card_${name.toLowerCase()}`, name);
      const printing = makePrinting(`card_${name.toLowerCase()}`, 'Common');

      const result = resolveBulkCategoryForCard(card, printing, standardHyphenProfile);

      if (result !== expectedBucket) {
        failures.push(`name="${name}" → "${result}" (expected "${expectedBucket}")`);
      }
    }
  }

  assert.strictEqual(
    failures.length,
    0,
    `Common cards routed to wrong bucket in hyphen-minus profile:\n` +
      failures.map((f) => `  • ${f}`).join('\n')
  );
});

test('Property — explicit cardId overrides are always respected regardless of card name or rarity', () => {
  /**
   * Validates: Requirement 3.1
   *
   * Generator: build a set of cards across all alphabetical ranges with various
   * rarities. Each card has an explicit cardId override. Assert the override
   * category is always returned, never the heuristic routing result.
   */
  const testCards: { id: string; name: string; rarity: CardPrinting['rarity'] }[] = [
    { id: 'c_abra',     name: 'Abra',     rarity: 'Common'        },
    { id: 'c_gengar',   name: 'Gengar',   rarity: 'Rare'          },
    { id: 'c_lapras',   name: 'Lapras',   rarity: 'Ultra Rare'    },
    { id: 'c_ninetales',name: 'Ninetales',rarity: 'Double Rare'   },
    { id: 'c_zapdos',   name: 'Zapdos',   rarity: 'Illustration Rare' },
  ];

  const failures: string[] = [];

  for (const tc of testCards) {
    const overrideCategoryId = `cat_override_${tc.id}`;
    const profile: StoreProfile = {
      id: `sp_${tc.id}`,
      name: `Override Store for ${tc.name}`,
      isDefault: true,
      categories: [
        { id: overrideCategoryId,  name: 'Override Category', sortOrder: 1 },
        { id: 'cat_common_af',     name: 'Common — A–F',      sortOrder: 2 },
        { id: 'cat_rare_nz',       name: 'Rare — N–Z',        sortOrder: 3 },
      ],
      overrides: [
        {
          id: `ov_${tc.id}`,
          storeProfileId: `sp_${tc.id}`,
          cardId: tc.id,
          categoryId: overrideCategoryId,
        } as BulkLocationOverride,
      ],
    };

    const card = makePokemonCard(tc.id, tc.name);
    const printing = makePrinting(tc.id, tc.rarity);
    const result = resolveBulkCategoryForCard(card, printing, profile);

    if (result !== 'Override Category') {
      failures.push(`card="${tc.name}" rarity="${tc.rarity}" → "${result}" (expected "Override Category")`);
    }
  }

  assert.strictEqual(
    failures.length,
    0,
    `cardId overrides were not respected:\n` +
      failures.map((f) => `  • ${f}`).join('\n')
  );
});

test('Property — Trainer cards always route to Trainer category when one exists', () => {
  /**
   * Validates: Requirement 3.3 (Trainer routing)
   *
   * Generator: build Trainer cards with names spanning all alphabetical ranges.
   * All must route to "Trainer Items Box", never to an alphabetical bucket.
   */
  const trainerNames = [
    'Arven',          // A–F
    'Boss\'s Orders', // A–F
    'Counter Catcher', // A–F
    'Iono',           // G–M
    'Judge',          // G–M
    'Nest Ball',      // N–Z
    'Poké Ball',      // N–Z (P comes after N)
    'Ultra Ball',     // N–Z
  ];

  const failures: string[] = [];

  for (const name of trainerNames) {
    const card = makeTrainerCard(`card_${name.replace(/[^a-z]/gi, '_').toLowerCase()}`, name);
    const printing = makePrinting(`card_${name.replace(/[^a-z]/gi, '_').toLowerCase()}`, 'Common');

    const result = resolveBulkCategoryForCard(card, printing, standardEnDashProfile);

    if (result !== 'Trainer Items Box') {
      failures.push(`Trainer card "${name}" → "${result}" (expected "Trainer Items Box")`);
    }
  }

  assert.strictEqual(
    failures.length,
    0,
    `Trainer cards routed to wrong category:\n` +
      failures.map((f) => `  • ${f}`).join('\n')
  );
});
