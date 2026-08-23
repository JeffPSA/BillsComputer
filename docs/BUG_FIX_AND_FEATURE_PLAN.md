# Bug Fix And Feature Plan

This is the working plan for the current polish pass. Work should proceed from lowest-risk fixes to larger UI and performance changes.

## Current Ground Rules

- Preserve `data/cards.db`; do not delete or rebuild it unless there is no safer option.
- Keep fixes scoped and avoid unrelated refactors.
- Prefer existing app patterns and tests.
- Verify actual SQLite row counts when sync/cache behavior is involved.
- Rebuild after server changes so `npm start` uses the updated code.

## Phase 1: Search Stability

Status: in progress

Goal: card searches should not refresh underneath the user or show stale/random fallback cards.

Tasks:

- Done: add request cancellation and request sequence guards to Deck card search.
- Done: add request cancellation and request sequence guards to Collection quick-add/search.
- Keep previous results stable while a new query is loading only when that feels intentional.
- Done: prevent duplicate/stale empty-state rendering in Quick Add Collection.
- Done: fix exact-card parsing for examples like `Dawn PFL #87`, including `#87` and `PFL` set-code resolution.
- Done: cache `Dawn` PFL #87 locally and verify repeated local SQLite search finds it without API fallback.

## Phase 2: Deck Allocation Correctness

Status: done

Goal: deactivating a deck should release cards assigned to that deck.

Tasks:

- Done: detect deck status transitions from active to inactive.
- Done: release allocations belonging to the deactivated deck.
- Done: preserve allocations for still-active decks.
- Done: verify with existing allocation test suite.

## Phase 3: Bulk Hunter All-Deck Mode

Status: done

Goal: Bulk Hunter should show all bulk correctly, while selected-deck mode keeps working.

Tasks:

- Done: compare all-deck calculation with selected-deck calculation.
- Done: make Bulk Hunter `ALL` explicitly include inactive/draft decks, matching the selected-deck behavior.
- Done: leave shopping optimization active-deck based.
- Done: verify with type-check, build, and allocation regression tests.

## Phase 4: Dashboard Deck Jump

Status: done

Goal: selecting a deck under Dashboard deck status should jump directly into that deck's management view.

Tasks:

- Done: pass a selected deck callback from the app shell into Dashboard.
- Done: switch to the Decks area and set the selected deck from status rows.
- Done: Dashboard deck rows and buttons open Decks management instead of Assemble Deck.
- Done: verify with type-check and build.

## Phase 5: Card Detail And Collection Views

Status: done

Goal: cards should be clickable anywhere cards are shown, with a useful zoomed detail view.

Tasks:

- Done: reuse the existing card detail modal.
- Done: Collection table cards open the detail modal.
- Done: add Collection grid view.
- Done: add Collection zoom controls for card size/detail density.
- Done: keep Collection table mode available.
- Done: wire card click behavior across Decks, Bulk Hunter, Shopping, Wishlist, and Assemble Deck where applicable.
- Done: Shopping rows open details when they match a local catalog card.
- Done: card search results can open the card detail/zoom modal before selecting or adding cards.
- Done: hide Assemble Deck tab and normal UI entry points because the feature is no longer needed.
- Done: remove visible dev/example wishlist, import, and marketplace placeholder cards.
- Done: show deck allocation gap as missing allocated cards instead of counting affected requirement rows.
- Done: verify with type-check and build.

## Phase 6: Shopping Links

Status: done

Goal: South African marketplace links should be real, useful search links rather than guessed domains.

Preferred SA websites:

- https://pokeverse.co.za
- https://www.pokebulk.co.za/cards
- https://bobshop.co.za

Tasks:

- Done: replace fabricated marketplace URLs with explicit marketplace definitions.
- Done: add link templates for Pokeverse, PokeBulk, and Bob Shop.
- Done: keep TCGPlayer and eBay search links.
- Done: include card name, set code, and collector number in generated searches where the target site supports query URLs.
- Done: avoid claiming live stock availability; these are search/check links only.

## Phase 7: Dark Mode

Status: done

Goal: add dark mode without making the interface harder to scan.

Tasks:

- Done: introduce theme state and persistence.
- Done: add a visible theme toggle.
- Done: convert hardcoded light styles to theme-aware styles with a global dark theme layer.
- Done: check modal, table, card, search, and navigation contrast through build validation.

## Phase 8: Admin Portal

Status: done

Goal: add an admin portal for database health, sync control, and safe maintenance actions.

Tasks:

- Done: add an Admin navigation area protected by existing auth.
- Done: show SQLite health counts for cards, printings, sets, collection items, decks, allocations, and pending failed sync sets.
- Done: add safe sync controls for incremental sync and full resync with visible job status.
- Done: add cooperative stop sync request that halts safely between sync steps.
- Done: add sync status/progress bar with current phase, set, page, and estimated progress.
- Done: add SQLite-native database backup, allocation integrity validation, and sync metadata inspection.
- Done: add new-set scan that adds only missing sets and then syncs card data for those sets.
- Done: add individual set sync by set ID, set code, or exact set name.
- Done: add confirmation before full resync.
- Done: avoid exposing destructive database reset/delete actions.
- Pending: add retry-failed-sets-only shortcut if needed after using the portal.

## Phase 9: Performance

Status: in progress

Goal: improve responsiveness on a 2-core, 4 GB hosted system.

Tasks:

- Done: review current architecture before optimizing.
- Done: reduce repeated full-catalog reads and card/printing joins in search-heavy routes.
- Done: lazy-load full card catalog only when a screen needs it instead of on every app startup.
- Done: add targeted SQLite indexes for common card search fields.
- Done: measure/verify the improved routes against current SQLite row counts.
- Done: run type-check, production build, and existing regression suite after the first optimization pass.
- Done: optimize Bulk Hunter checklist, Shopping optimizer, marketplace search, and store-profile reads to avoid full catalog snapshots.
- Done: re-run type-check, production build, and existing regression suite after normal-use route optimizations.
- Done: investigate slow database tasks for allocations, deck deletion, collection edits, acquisitions, and store-profile writes.
- Finding: interactive writes still use the old `readDb()` + `writeDb()` snapshot path, so small actions can load and re-upsert the full cards/printings catalog before returning.
- Done: add narrow SQLite transactions for manual allocate, release allocation, move allocation, auto-allocate save, and deck deletion.
- Done: add supporting allocation/requirement indexes for targeted write validation and lookups.
- Done: add narrow SQLite transactions for deck status changes, deck requirement edits, collection quantity/delete changes, acquisitions, and store-profile writes.
- Done: keep allocation/deck validation on focused deck/allocation/collection context so it does not require loading cards and printings.
- Done: stop deck deletion from recalculating every active deck; deleting a deck now releases only that deck's allocations and leaves other active deck allocations stable.
- Done: optimize acquisition writes so adding a found card updates acquisition + collection + optional allocation without rewriting cards/printings.
- Done: keep full-snapshot writes acceptable for sync/import/admin bulk work for now, because those are background or intentionally large jobs.
- Done: smoke-test the targeted write methods against a copied SQLite database without altering the live `data/cards.db`.
- Pending: add endpoint-level timings on the hosted machine if it still feels slow under real use.
- Pending: add pagination or virtualization for large card lists if still needed after data-loading fixes.
- Done: verify production build behavior, not only local dev behavior.

## Later: Database Card Browser

Status: done

Goal: add a database browser section for browsing every local card/printing in SQLite.

Notes:

- Done: add Browser navigation section for exact local SQLite printing/variant browsing.
- Done: make it useful for master set collecting: filter by set, card type, rarity, variant, owned/missing state, and wishlist state.
- Done: add direct actions from the browser to add one copy to Collection.
- Done: add direct actions from the browser to add one copy to Wishlist.
- Done: make Wishlist persistent in SQLite so browser-added targets appear on the Wishlist page.
- Done: keep it SQLite-first and paginated so it does not slow the hosted server down.
- Done: Browser now paginates exact stored printings instead of grouping all variants under one logical card.
- Later: split Pokemon TCG API price finishes such as Normal, Holo, and Reverse Holo into separate SQLite printing rows during sync, so variants that share one API card ID can be collected separately.
- Later: add master-set completion progress by set if/when needed.

## Later: Home Dashboard Routine API

Status: later

Goal: expose a safe API route for an external home dashboard to run or inspect a weekly database routine.

Notes:

- Add a protected API route for a weekly catalogue/database routine.
- Return 7-day counts for cards, printings, sets, collection changes, deck changes, sync failures, and successful sync activity.
- Keep it dashboard-friendly: concise JSON, timestamps, status, and last-run summary.
- Make the routine idempotent so repeated dashboard calls do not start duplicate work.
- Consider a separate read-only route for the dashboard and a protected action route to trigger the routine.
- Do this much later after admin sync behavior and performance work are stable.
-  Create API documentation to follow for beginner to implement. Include examples


## Later: ZAR Pricing

Status: done

Goal: show estimates and totals in South African Rand instead of US dollars.

Notes:

- Done: replace visible `$` labels with `ZAR` / `R` formatting across Dashboard, Collection, Deck card search, Card Detail, Quick Add, Shopping, and CSV export.
- Done: keep stored API market prices unchanged and convert at display/export boundaries.
- Done: make the display exchange rate configurable with `VITE_USD_TO_ZAR_RATE`, defaulting to `18.5` when unset.
- Done: add an admin-managed exchange rate saved in SQLite metadata so the rate can change without redeploying.
- Done: load the saved exchange rate after login and apply it to visible ZAR estimates.
- Done: review hidden/import-only cost fields; acquisition writes now treat omitted costs as `0` and UI acquisition flows send ZAR values explicitly.
- Later: add automatic exchange-rate lookup only if a reliable source is chosen.

## Immediate Order

1. Search stability and stale results.
2. Exact search for `Dawn PFL #87`.
3. Deck deactivation allocation release.
4. Bulk Hunter all-deck mode.
5. Dashboard deck jump.
6. Shopping SA links.
7. Card detail/grid/zoom UI.
8. Dark mode.
9. Admin portal.
10. Performance pass.
11. Later: database card browser.
12. Later: home dashboard weekly routine API.
13. Later: ZAR pricing.
14. Later: Dynamic Web fetch USD to ZAR conversion
