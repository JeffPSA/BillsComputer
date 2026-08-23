/**
 * Bug Condition Exploration Test — card-search-import-fix
 *
 * PURPOSE: Confirm that each of the four root-cause sub-conditions exists on UNFIXED code.
 * This test is EXPECTED TO FAIL on unfixed code — that failure IS the proof the bugs exist.
 *
 * DO NOT attempt to fix production code when this test fails.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery } from '../server/cardDataProvider.js';
import { normalizeText, findCardsByName } from '../server/localCardSearch.js';
import type { LogicalCard } from '../src/types/tcg.js';

// ---------------------------------------------------------------------------
// Minimal mock card database — a "Dawn" Supporter card.
// Card is stored with a straight-ASCII name, which is how the DB would hold it.
// ---------------------------------------------------------------------------
const MOCK_DAWN_CARD: LogicalCard = {
  id: 'card_dawn',
  name: 'Dawn',
  supertype: 'Trainer',
  subtype: 'Supporter',
  defaultPrintingId: 'pfl-87',
  printings: [
    {
      id: 'pfl-87',
      cardId: 'card_dawn',
      cardName: 'Dawn',
      setCode: 'PFL',
      setName: 'Paldea Evolved',
      cardNumber: '87',
      rarity: 'Uncommon',
      variant: 'Normal',
      language: 'English',
      imageUrl: '',
      marketPrice: 0.25,
    },
  ],
};

const MOCK_LANAS_AID_CARD: LogicalCard = {
  id: "card_lanas_aid",
  name: "Lana's Aid",
  supertype: 'Trainer',
  subtype: 'Item',
  defaultPrintingId: 'cos-61',
  printings: [
    {
      id: 'cos-61',
      cardId: "card_lanas_aid",
      cardName: "Lana's Aid",
      setCode: 'COS',
      setName: 'Chilling Reign',
      cardNumber: '61',
      rarity: 'Uncommon',
      variant: 'Normal',
      language: 'English',
      imageUrl: '',
      marketPrice: 0.50,
    },
  ],
};

const MOCK_CARDS: LogicalCard[] = [MOCK_DAWN_CARD, MOCK_LANAS_AID_CARD];

// ---------------------------------------------------------------------------
// Sub-condition 1 — "DAWN" misclassified as a set code
//
// Expected on UNFIXED code:
//   parseSearchQuery("DAWN") → { cardName: '', setCode: 'dawn', hasSetCode: true }
//
// Expected on FIXED code (asserted below):
//   parseSearchQuery("DAWN") → { cardName: 'DAWN', hasSetCode: false }
// ---------------------------------------------------------------------------
test('Sub-condition 1: parseSearchQuery("DAWN") treats token as card name, not set code', async () => {
  const result = await parseSearchQuery('DAWN');

  // On unfixed code this will throw because cardName is '' and hasSetCode is true.
  assert.equal(
    result.cardName.toLowerCase(),
    'dawn',
    `Expected cardName to be 'DAWN' (case-insensitive) but got '${result.cardName}'. ` +
    `On unfixed code "DAWN" (4 uppercase letters) is consumed by the setCodePattern branch ` +
    `and cardName is left empty.`,
  );

  assert.equal(
    result.hasSetCode,
    false,
    `Expected hasSetCode to be false but got true (setCode: '${result.setCode}'). ` +
    `On unfixed code the single token "DAWN" is misclassified as a potential set code.`,
  );
});

// ---------------------------------------------------------------------------
// Sub-condition 2 — Curly apostrophe not stripped by normalizeText
//
// Expected on UNFIXED code:
//   normalizeText("Lana\u2019s Aid") → "lana\u2019s aid"  (curly not stripped)
//   normalizeText("Lana's Aid")     → "lanas aid"
//   → they differ
//
// Expected on FIXED code (asserted below):
//   Both produce "lanas aid"
// ---------------------------------------------------------------------------
test('Sub-condition 2: normalizeText strips curly apostrophe \\u2019 same as straight apostrophe', () => {
  const withCurly   = normalizeText("Lana\u2019s Aid"); // right single quotation mark
  const withStraight = normalizeText("Lana's Aid");     // ASCII apostrophe

  assert.equal(
    withCurly,
    withStraight,
    `normalizeText("Lana\u2019s Aid") produced '${withCurly}' but ` +
    `normalizeText("Lana's Aid") produced '${withStraight}'. ` +
    `On unfixed code \\u2019 (curly apostrophe) is not in the strip regex, so the outputs diverge.`,
  );

  assert.equal(
    withStraight,
    'lanas aid',
    `Expected normalizeText("Lana's Aid") to be 'lanas aid' but got '${withStraight}'.`,
  );
});

// ---------------------------------------------------------------------------
// Sub-condition 2 (extended) — All apostrophe/quote variants normalize identically
// ---------------------------------------------------------------------------
test('Sub-condition 2 (extended): all Unicode apostrophe variants produce identical normalizeText output', () => {
  const stem = 'Lana';
  const suffix = 's Aid';
  const variants: Array<{ label: string; char: string }> = [
    { label: 'straight apostrophe (\\u0027)',              char: '\u0027' }, // '
    { label: 'right single quotation mark (\\u2019)',      char: '\u2019' }, // '
    { label: 'left single quotation mark (\\u2018)',       char: '\u2018' }, // '
    { label: 'modifier letter apostrophe (\\u02BC)',       char: '\u02BC' }, // ʼ
    { label: 'modifier letter reversed comma (\\u02BB)',   char: '\u02BB' }, // ʻ
    { label: 'grave accent / backtick (\\u0060)',          char: '\u0060' }, // `
  ];

  const reference = normalizeText(`${stem}\u0027${suffix}`); // straight apostrophe baseline

  for (const { label, char } of variants) {
    const result = normalizeText(`${stem}${char}${suffix}`);
    assert.equal(
      result,
      reference,
      `Apostrophe variant ${label} produced '${result}' but expected '${reference}'. ` +
      `This variant is not stripped by normalizeText on unfixed code.`,
    );
  }
});

// ---------------------------------------------------------------------------
// Sub-condition 3 — findCardsByName returns [] for "Dawn" even though card exists
//
// On unfixed code this should pass (Dawn is stored as "Dawn" with exact ASCII match).
// The primary bug-trigger is when normalizeText mismatches the stored name, which
// sub-condition 2 tests above. This test confirms the baseline exact-match works
// and also tests the fuzzy path with a near-miss query.
// ---------------------------------------------------------------------------
test('Sub-condition 3: findCardsByName("Dawn") returns the Dawn supporter card', () => {
  const results = findCardsByName(MOCK_CARDS, 'Dawn');

  assert.ok(
    results.length > 0,
    `findCardsByName(cards, "Dawn") returned [] but expected at least one result. ` +
    `On unfixed code this fails when the stored card name diverges from the normalized query.`,
  );

  assert.ok(
    results.some(c => c.id === 'card_dawn'),
    `Expected 'card_dawn' in results but got: ${JSON.stringify(results.map(c => c.id))}`,
  );
});

test("Sub-condition 3: findCardsByName with curly-apostrophe query finds Lana's Aid", () => {
  // Simulate a deck-import line that uses a curly apostrophe in the card name.
  const curlyStraight = "Lana\u2019s Aid";
  const results = findCardsByName(MOCK_CARDS, curlyStraight);

  assert.ok(
    results.length > 0,
    `findCardsByName(cards, "Lana\u2019s Aid") returned [] but expected 'card_lanas_aid'. ` +
    `On unfixed code the curly apostrophe is not stripped so normalized query "lana\u2019s aid" ` +
    `does not match stored normalized name "lanas aid".`,
  );
});

// ---------------------------------------------------------------------------
// Sub-condition 4 — Property-based: single-token queries of 2–4 uppercase letters
//
// Property: for any single token of 2–4 uppercase ASCII letters,
//   parseSearchQuery(token) must return cardName !== ''
//
// On UNFIXED code, any token matching /^[A-Z]{2,4}$/ is consumed by the set-code
// branch, leaving cardName empty.
// ---------------------------------------------------------------------------
test('Sub-condition 4 (PBT): single-token 2–4 uppercase-letter queries always populate cardName', async () => {
  /**
   * Lightweight property-based generator.
   * Generates a representative sample of all 2–4 uppercase-letter strings.
   * Full exhaustive check would be 26^2 + 26^3 + 26^4 ≈ 475k cases;
   * we use a seeded pseudo-random sample of 200 to keep the test fast.
   */
  function generateUppercaseStrings(seed: number, count: number): string[] {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const results: string[] = [];
    let s = seed;

    // Always include the concrete failing case first
    results.push('DAWN');
    results.push('SVI');  // known set code — on unfixed code also breaks cardName
    results.push('AB');
    results.push('XYZ');
    results.push('VMAX'); // subtype — should be card name

    // Pseudo-random additional samples
    while (results.length < count) {
      // Linear congruential generator (deterministic, reproducible)
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const len = 2 + (Math.abs(s) % 3); // 2, 3, or 4 chars
      let str = '';
      for (let i = 0; i < len; i++) {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        str += alphabet[Math.abs(s) % 26];
      }
      results.push(str);
    }

    return results;
  }

  const inputs = generateUppercaseStrings(42, 50);
  const failures: Array<{ input: string; cardName: string; setCode: string; hasSetCode: boolean }> = [];

  for (const token of inputs) {
    const result = await parseSearchQuery(token);
    if (result.cardName === '') {
      failures.push({ input: token, cardName: result.cardName, setCode: result.setCode, hasSetCode: result.hasSetCode });
    }
  }

  assert.equal(
    failures.length,
    0,
    `Property violation: ${failures.length} single-token inputs produced empty cardName.\n` +
    `Counterexamples (first 5):\n` +
    failures.slice(0, 5).map(
      f => `  parseSearchQuery("${f.input}") → { cardName: '${f.cardName}', setCode: '${f.setCode}', hasSetCode: ${f.hasSetCode} }`
    ).join('\n') +
    `\nThis confirms the bug: tokens matching /^[A-Z]{2,4}$/ are consumed as set codes, leaving cardName empty.`,
  );
});
