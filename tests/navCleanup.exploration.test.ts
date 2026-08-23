/**
 * Nav Cleanup — Bug Condition Exploration Test (Task 1)
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * PURPOSE: These tests encode the EXPECTED (fixed) behavior.
 * On UNFIXED code they are expected to FAIL — failure confirms the bugs exist.
 * After the fix is applied (Task 3), re-running this suite should produce all PASS.
 *
 * Strategy: structural / source-level inspection of Navbar.tsx and App.tsx.
 * No React DOM rendering is required — we parse the TypeScript source directly,
 * which avoids needing a browser or jsdom environment.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const navbarSrc = readFileSync(resolve(ROOT, 'src/components/Navbar.tsx'), 'utf-8');
const appSrc    = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf-8');

const HIDDEN_TABS = ['assemble', 'wishlist', 'allocations'] as const;
const VISIBLE_TABS = ['dashboard', 'decks', 'collection', 'bulk-hunter', 'shopping'] as const;
const ALL_TABS = [...VISIBLE_TABS, ...HIDDEN_TABS] as const;

let passed = 0;
let failed = 0;
const counterexamples: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.log(`  ❌ ${msg}`);
    counterexamples.push(msg);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Helper: extract navItems entries from Navbar.tsx source
// Finds the navItems array literal and extracts all  id: 'xxx'  entries.
// ---------------------------------------------------------------------------
function extractNavItemIds(src: string): string[] {
  const ids: string[] = [];
  const declIdx = src.indexOf('const navItems');
  if (declIdx === -1) return ids;
  // Find the opening '[' of the navItems *assignment* (skip the type annotation's [])
  // Look for '= [' or '=[' after the declaration
  const assignMatch = src.slice(declIdx).match(/=\s*\[/);
  if (!assignMatch || assignMatch.index === undefined) return ids;
  const openBracket = declIdx + assignMatch.index + assignMatch[0].lastIndexOf('[');

  // Walk forward from the '[', tracking bracket depth to find the closing ']'
  let depth = 0;
  let arraySlice = '';
  for (let i = openBracket; i < src.length; i++) {
    if (src[i] === '[') depth++;
    if (src[i] === ']') { depth--; if (depth === 0) { arraySlice = src.slice(openBracket, i + 1); break; } }
  }
  if (!arraySlice) return ids;

  // Extract all  id: 'xxx'  or  id: "xxx"  within the array slice
  const re = /\bid:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(arraySlice)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// PROPERTY 1 — Bug Condition: Hidden tabs must NOT appear in navItems
//
// On unfixed code: navItems contains 'assemble', 'wishlist', 'allocations'
//                  → all three assertions FAIL
// ---------------------------------------------------------------------------
console.log('\n[Property 1] Hidden tabs absent from Navbar navItems');

const navItemIds = extractNavItemIds(navbarSrc);
console.log(`  Observed navItems ids: [${navItemIds.join(', ')}]`);

for (const tab of HIDDEN_TABS) {
  const present = navItemIds.includes(tab);
  assert(
    !present,
    `navItems must NOT contain id='${tab}'`,
    present ? `COUNTEREXAMPLE: navItems contains '${tab}' — hidden tab is visible in the navbar` : undefined
  );
}

// ---------------------------------------------------------------------------
// PROPERTY 2 — Bug Condition: effectiveTab guard must exist for hidden tabs
//
// Expected (fixed) code contains a local constant `effectiveTab` that maps
// 'assemble' | 'wishlist' | 'allocations' → 'dashboard'.
// On unfixed code: no such guard exists → assertion FAILS
// ---------------------------------------------------------------------------
console.log('\n[Property 2] effectiveTab render guard exists in App.tsx');

const hasEffectiveTab = appSrc.includes('effectiveTab');
assert(
  hasEffectiveTab,
  "App.tsx defines an 'effectiveTab' render guard",
  !hasEffectiveTab
    ? "COUNTEREXAMPLE: App.tsx has no 'effectiveTab' constant — hidden activeTab values render their views without redirection"
    : undefined
);

// For each hidden tab, confirm the conditional render references effectiveTab (not raw activeTab)
// On unfixed code every render block uses `activeTab ===` directly → assertion FAILS
console.log('\n[Property 2b] Conditional renders use effectiveTab (not raw activeTab) for hidden tab views');

for (const tab of HIDDEN_TABS) {
  // Unfixed code has:  {activeTab === 'allocations' && ...}  etc.
  const rawGuard = `activeTab === '${tab}'`;
  const fixedGuard = `effectiveTab === '${tab}'`;
  const usesRaw = appSrc.includes(rawGuard);
  const usesFixed = appSrc.includes(fixedGuard);

  // After the fix, the raw guard should be gone; the fixed guard (or no guard) should be present.
  // We assert the raw guard is absent as the failure signal on unfixed code.
  assert(
    !usesRaw,
    `App.tsx must NOT use raw 'activeTab === '${tab}'' in render block`,
    usesRaw
      ? `COUNTEREXAMPLE: App.tsx still guards '${tab}' view with raw activeTab — renders hidden view instead of Dashboard`
      : undefined
  );
}

// ---------------------------------------------------------------------------
// PROPERTY 3 — Bug Condition: onAssembleDeck callbacks must NOT navigate to 'assemble'
//
// On unfixed code: both DeckList and DeckEditor callbacks call setActiveTab('assemble') → FAIL
// ---------------------------------------------------------------------------
console.log("\n[Property 3] onAssembleDeck callbacks must navigate to 'decks', not 'assemble'");

// Count occurrences of setActiveTab('assemble') in App.tsx
const assembleCalls = (appSrc.match(/setActiveTab\(['"]assemble['"]\)/g) || []).length;
assert(
  assembleCalls === 0,
  "App.tsx must have 0 calls to setActiveTab('assemble')",
  assembleCalls > 0
    ? `COUNTEREXAMPLE: found ${assembleCalls} call(s) to setActiveTab('assemble') — onAssembleDeck navigates to hidden tab`
    : undefined
);

// ---------------------------------------------------------------------------
// PROPERTY 4 — Property-based: ONLY visible tabs appear in navItems
//
// For ALL 8 ActiveTab values: only the 5 visible ones should be in navItems.
// On unfixed code: 8 tabs are present → 3 of the following assertions FAIL
// ---------------------------------------------------------------------------
console.log('\n[Property 4] navItems contains exactly the 5 visible tabs and no others');

console.log(`  navItems length: ${navItemIds.length} (expected 5)`);
assert(
  navItemIds.length === 5,
  `navItems must have exactly 5 entries`,
  navItemIds.length !== 5
    ? `COUNTEREXAMPLE: navItems has ${navItemIds.length} entries — extra entries: [${navItemIds.filter(id => !(VISIBLE_TABS as readonly string[]).includes(id)).join(', ')}]`
    : undefined
);

for (const tab of ALL_TABS) {
  const shouldBeVisible = (VISIBLE_TABS as readonly string[]).includes(tab);
  const isPresent = navItemIds.includes(tab);
  if (shouldBeVisible) {
    assert(isPresent, `Visible tab '${tab}' IS in navItems`);
  } else {
    assert(
      !isPresent,
      `Hidden tab '${tab}' is NOT in navItems`,
      isPresent ? `COUNTEREXAMPLE: hidden tab '${tab}' appears in navItems` : undefined
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n--- EXPLORATION TEST SUMMARY ---');
console.log(`Passed: ${passed} | Failed: ${failed}`);

if (counterexamples.length > 0) {
  console.log('\nCounterexamples found (confirming bug exists on unfixed code):');
  counterexamples.forEach((ce, i) => console.log(`  ${i + 1}. ${ce}`));
}

if (failed > 0) {
  console.log('\n⚠️  Tests FAILED as expected on unfixed code — bug confirmed.');
  console.log('   Re-run after applying Task 3 fixes to validate the bug is resolved.');
  process.exit(1);
} else {
  console.log('\n✅ All assertions passed — fix has been applied correctly.');
}
