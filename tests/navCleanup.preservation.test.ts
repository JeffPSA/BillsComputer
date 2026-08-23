/**
 * Nav Cleanup — Preservation Property Tests (Task 2)
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * PURPOSE: These tests encode the UNCHANGED behavior that must survive the fix.
 * They are expected to PASS on UNFIXED code and must continue to PASS after the
 * fix is applied (Task 3).
 *
 * Strategy: structural / source-level inspection of Navbar.tsx and App.tsx.
 * No React DOM rendering is required — we parse the TypeScript source directly,
 * which avoids needing a browser or jsdom environment.
 *
 * Observation methodology: each assertion was first observed on unfixed code
 * to confirm the current behavior, then encoded as a preservation invariant.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const navbarSrc = readFileSync(resolve(ROOT, 'src/components/Navbar.tsx'), 'utf-8');
const appSrc    = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf-8');

const VISIBLE_TABS = ['dashboard', 'decks', 'collection', 'bulk-hunter', 'shopping'] as const;

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Helper: extract navItems entries from Navbar.tsx source.
// Finds the navItems array literal and extracts all  id: 'xxx'  entries.
// ---------------------------------------------------------------------------
function extractNavItemIds(src: string): string[] {
  const ids: string[] = [];
  const declIdx = src.indexOf('const navItems');
  if (declIdx === -1) return ids;
  // Find the opening '[' of the navItems *assignment* (skip the type annotation's [])
  const assignMatch = src.slice(declIdx).match(/=\s*\[/);
  if (!assignMatch || assignMatch.index === undefined) return ids;
  const openBracket = declIdx + assignMatch.index + assignMatch[0].lastIndexOf('[');

  // Walk forward from '[', tracking bracket depth to find the closing ']'
  let depth = 0;
  let arraySlice = '';
  for (let i = openBracket; i < src.length; i++) {
    if (src[i] === '[') depth++;
    if (src[i] === ']') { depth--; if (depth === 0) { arraySlice = src.slice(openBracket, i + 1); break; } }
  }
  if (!arraySlice) return ids;

  const re = /\bid:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(arraySlice)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

const navItemIds = extractNavItemIds(navbarSrc);

// ---------------------------------------------------------------------------
// PROPERTY 1 — Each visible tab IS present in navItems
//
// Validates: Requirement 3.1
// Observed on unfixed code: navItems contains all 5 visible tabs → PASS
// Must continue to pass after the fix removes only the 3 hidden tabs.
// ---------------------------------------------------------------------------
console.log('\n[Property 1] All 5 visible tabs are present in Navbar navItems');
console.log(`  Observed navItems ids: [${navItemIds.join(', ')}]`);

for (const tab of VISIBLE_TABS) {
  const present = navItemIds.includes(tab);
  assert(
    present,
    `navItems contains id='${tab}'`,
    !present ? `REGRESSION: visible tab '${tab}' is missing from navItems` : undefined
  );
}

// ---------------------------------------------------------------------------
// PROPERTY 2 — Property-based: each visible tab appears EXACTLY ONCE in navItems
//
// Validates: Requirement 3.1
// Observed on unfixed code: each of the 5 visible tabs appears once → PASS
// Guards against accidental duplication during the fix.
// ---------------------------------------------------------------------------
console.log('\n[Property 2] Each visible tab appears exactly once in navItems');

for (const tab of VISIBLE_TABS) {
  const count = navItemIds.filter(id => id === tab).length;
  assert(
    count === 1,
    `Tab '${tab}' appears exactly once in navItems (count=${count})`,
    count !== 1 ? `REGRESSION: tab '${tab}' appears ${count} time(s), expected exactly 1` : undefined
  );
}

// ---------------------------------------------------------------------------
// PROPERTY 3 — Navbar header elements are present in source
//
// Validates: Requirement 3.2
// Observed on unfixed code: logo text, Add Cards button, Import Limitless Deck
// button, and logout button all exist in Navbar.tsx source → PASS
// ---------------------------------------------------------------------------
console.log('\n[Property 3] Navbar header elements are present in Navbar.tsx source');

const headerChecks: Array<{ label: string; probe: string }> = [
  { label: "Logo text \"Bill's PC\"",           probe: "Bill's PC" },
  { label: '"Add Cards" button label',           probe: 'Add Cards' },
  { label: '"Import Limitless Deck" button label', probe: 'Import Limitless Deck' },
  { label: 'Logout button (LogOut icon import)', probe: 'LogOut' },
];

for (const { label, probe } of headerChecks) {
  const found = navbarSrc.includes(probe);
  assert(
    found,
    `Navbar.tsx contains ${label}`,
    !found ? `REGRESSION: ${label} not found in Navbar.tsx source` : undefined
  );
}

// ---------------------------------------------------------------------------
// PROPERTY 4 — App.tsx contains a conditional render for each visible tab
//
// Validates: Requirement 3.1, 3.3
// Observed on unfixed code: each visible tab has an {activeTab === 'X' && ...}
// block in App.tsx → PASS. After the fix these blocks may use effectiveTab
// for hidden tabs, but visible-tab blocks must remain untouched.
// ---------------------------------------------------------------------------
console.log('\n[Property 4] App.tsx renders each visible tab view conditionally');

for (const tab of VISIBLE_TABS) {
  // Accept both raw `activeTab` and the future `effectiveTab` guard — the
  // preservation invariant is that the conditional block exists, not which
  // variable name is used.
  const rawGuard     = `activeTab === '${tab}'`;
  const effectiveGuard = `effectiveTab === '${tab}'`;
  const found = appSrc.includes(rawGuard) || appSrc.includes(effectiveGuard);
  assert(
    found,
    `App.tsx has a conditional render for '${tab}' view`,
    !found ? `REGRESSION: no conditional render block found for tab '${tab}' in App.tsx` : undefined
  );
}

// ---------------------------------------------------------------------------
// PROPERTY 5 — onHuntMissingCards callbacks navigate to 'bulk-hunter' (not hidden)
//
// Validates: Requirement 3.4
// Observed on unfixed code: both DeckList and DeckEditor callbacks call
// setActiveTab('bulk-hunter') → PASS. This must not be disturbed by the fix.
// ---------------------------------------------------------------------------
console.log("\n[Property 5] onHuntMissingCards callbacks navigate to 'bulk-hunter'");

// Count setActiveTab('bulk-hunter') calls that are inside an onHuntMissingCards callback.
// Strategy: find each `onHuntMissingCards` block and verify it contains the correct call.
const bulkHunterPattern = /onHuntMissingCards[\s\S]{0,120}setActiveTab\(['"]bulk-hunter['"]\)/g;
const bulkHunterMatches = appSrc.match(bulkHunterPattern) || [];

assert(
  bulkHunterMatches.length >= 1,
  `App.tsx has at least one onHuntMissingCards callback navigating to 'bulk-hunter'`,
  bulkHunterMatches.length === 0
    ? "REGRESSION: no onHuntMissingCards callback setting activeTab to 'bulk-hunter' found in App.tsx"
    : undefined
);

// Also confirm there are no onHuntMissingCards callbacks that set a hidden tab
const hiddenHuntPattern = /onHuntMissingCards[\s\S]{0,120}setActiveTab\(['"](?:assemble|wishlist|allocations)['"]\)/g;
const hiddenHuntMatches = appSrc.match(hiddenHuntPattern) || [];

assert(
  hiddenHuntMatches.length === 0,
  "No onHuntMissingCards callback navigates to a hidden tab",
  hiddenHuntMatches.length > 0
    ? `REGRESSION: found ${hiddenHuntMatches.length} onHuntMissingCards callback(s) routing to a hidden tab`
    : undefined
);

// ---------------------------------------------------------------------------
// PROPERTY 6 — Visible-tab component imports are present in App.tsx
//
// Validates: Requirement 3.1, 3.5
// Observed on unfixed code: Dashboard, DeckList, DeckEditor, CollectionManager,
// BulkHunterView, ShoppingAssistant all imported → PASS. These imports must
// survive the fix unchanged.
// ---------------------------------------------------------------------------
console.log('\n[Property 6] Visible-tab component imports are present in App.tsx');

const visibleImports: Array<{ label: string; probe: string }> = [
  { label: 'Dashboard',         probe: "from './components/Dashboard'" },
  { label: 'DeckList',          probe: "from './components/DeckBuilder/DeckList'" },
  { label: 'DeckEditor',        probe: "from './components/DeckBuilder/DeckEditor'" },
  { label: 'CollectionManager', probe: "from './components/Collection/CollectionManager'" },
  { label: 'BulkHunterView',    probe: "from './components/BulkHunter/BulkHunterView'" },
  { label: 'ShoppingAssistant', probe: "from './components/Shopping/ShoppingAssistant'" },
];

for (const { label, probe } of visibleImports) {
  const found = appSrc.includes(probe);
  assert(
    found,
    `App.tsx imports ${label}`,
    !found ? `REGRESSION: ${label} import missing from App.tsx` : undefined
  );
}

// ---------------------------------------------------------------------------
// PROPERTY 7 — Hidden-tab component files still compile (imports present)
//
// Validates: Requirement 3.5
// Observed on unfixed code: AssembleDeckView, WishlistManager, AllocationsDashboard
// all imported in App.tsx → PASS. These imports must not be removed by the fix
// so the components remain compilable for future re-enablement.
// ---------------------------------------------------------------------------
console.log('\n[Property 7] Hidden-tab component imports are still present in App.tsx (compile preservation)');

const hiddenImports: Array<{ label: string; probe: string }> = [
  { label: 'AssembleDeckView',    probe: "from './components/AssembleDeck/AssembleDeckView'" },
  { label: 'WishlistManager',     probe: "from './components/Wishlist/WishlistManager'" },
  { label: 'AllocationsDashboard', probe: "from './components/Allocations/AllocationsDashboard'" },
];

for (const { label, probe } of hiddenImports) {
  const found = appSrc.includes(probe);
  assert(
    found,
    `App.tsx still imports ${label} (component file stays compilable)`,
    !found ? `REGRESSION: ${label} import was removed — component can no longer be re-enabled` : undefined
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n--- PRESERVATION TEST SUMMARY ---');
console.log(`Passed: ${passed} | Failed: ${failed}`);

if (failed > 0) {
  console.log('\n❌ REGRESSION detected — some preserved behaviors have been broken.');
  process.exit(1);
} else {
  console.log('\n✅ All preservation assertions passed — no regressions detected.');
}
