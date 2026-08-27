# Bug Fix And Feature Plan

This is the working plan for the current polish pass. Work should proceed from lowest-risk fixes to larger UI and performance changes.

## Current Ground Rules

- Preserve `data/cards.db`; do not delete or rebuild it unless there is no safer option.
- Keep fixes scoped and avoid unrelated refactors.
- Prefer existing app patterns and tests.
- Verify actual SQLite row counts when sync/cache behavior is involved.
- Rebuild after server changes so `npm start` uses the updated code.
- Record every new bug or feature request in this document before or alongside implementation.
- Slot new work by dependency and risk: data integrity/correctness first, blocked workflows second, usability improvements third, and optional polish last.
- Do not mark an item Done until the code or data change was actually completed and verified. Use Blocked when a required deck, record, decision, or external system does not exist yet.
- Keep low-priority requests visible under a Later phase instead of silently dropping them.

## Planning And Intake Process

When a new request arrives:

1. Add it to the most relevant existing phase when it is small, shares the same subsystem, and does not disrupt higher-risk work.
2. Create a new numbered phase when it introduces a separate workflow, schema change, integration, or deliverable.
3. Record dependencies and blockers before implementation.
4. Place it in Current Execution Order according to correctness, user impact, dependencies, and implementation risk.
5. After implementation, record verification performed and leave any incomplete data operation or manual QA item explicitly Pending or Blocked.

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
- Done: add retry-failed-sets-only shortcut so remaining failed sets can be synced without redoing every set.

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

## Phase 10: Home Dashboard API

Status: in progress

Goal: expose safe API routes for an external home dashboard to inspect and trigger the weekly database routine.

Tasks:

- Done: add a protected read-only weekly routine summary endpoint.
- Done: add a protected idempotent routine trigger endpoint that reuses the existing sync job guard.
- Done: support a stable `DASHBOARD_API_TOKEN` / `HOME_DASHBOARD_API_TOKEN` bearer token for external dashboards.
- Done: keep normal logged-in app bearer tokens working for the same routes.
- Done: return 7-day counts, database totals, sync state, pending failed sets, and last dashboard routine result.
- Pending: test against the real home dashboard client once it exists.

## Phase 11: Deck Workflow, Allocation Detail, And Export

Status: in progress

Goal: make deck printing choices reliable, make physical allocation wording and controls understandable, and provide useful deck-list exports.

Tasks:

- Done: restore the normal `npm run build` and `npm start` workflow. The production build stalled because Vite/Rollup resolved Lucide's per-icon ESM barrel inside an iCloud-synced `node_modules` tree containing dataless placeholders.
- Done: alias `lucide-react` to its already-materialized bundled entry for builds, avoiding thousands of individual icon-module reads.
- Done: explicitly limit Tailwind source detection to the React app/component files so printable raw HTML/CSS utilities and unrelated project data are not scanned for UI classes.
- Done: make server `HOST` and `PORT` configurable without changing the hosted defaults.
- Done: verify `npm run build` completes, verify `npm start` serves HTTP 200 on localhost using a temporary SQLite copy, and rerun the complete automated test suite.
- Done: resolve the subsequent `EADDRINUSE` start failure by confirming port 3000 belonged to a stale Bills Computer Node process, stopping only that process gracefully, and verifying the normal production server returns HTTP 200 on port 3000.
- Done: load every locally known printing for cards in the Deck editor instead of returning only the default/preferred printing.
- Done: show the other printing variations when the Deck editor printing popup opens.
- Done: add a backward-compatible SQLite migration for `deck_requirements.preferredPrintingId`.
- Done: persist a selected exact printing across saves and reloads.
- Done: rewrite Deck physical allocation labels using clearer terms: in collection, unassigned, other decks, and this deck.
- Done: add allocation management to the Collection detailed card view for an exact physical printing.
- Done: allow compatible unassigned copies to be assigned to an active deck requirement from card detail.
- Done: allow one copy or a complete allocation to be released from card detail.
- Done: add one Deck Export panel accessible from the Deck list and Deck editor.
- Done: add text exports for Pokemon TCG Live, Limitless, and TCGplayer Mass Entry.
- Done: allow exported deck text to be copied or downloaded as a `.txt` file.
- Done: add an optional player-information form and a landscape Print / Save PDF deck-list layout based on `Print Decklist_Example.pdf`.
- Done: add automated export-format coverage and update the allocation persistence regression test.
- Done: run the complete automated project test suite successfully.
- Done: verify the frontend and server bundles compile.
- Done: test the schema migration and full-printing Deck context against a temporary copy of the real SQLite database.
- Done: make every deck-list export use the exact set, collector number, and finish of the physical collection copies currently assigned to that deck.
- Done: treat set/collector metadata in a newly imported deck list as card-resolution metadata, not as a forced physical printing requirement. A printing becomes mandatory only when it is explicitly selected in the Deck editor.
- Done: normalize older imported `SPECIFIC_PRINTING` requirements that never stored a preferred printing back to `ANY_PRINTING` during the schema migration.
- Done: when a requirement is only partly assigned, export assigned copies using their real physical printings and use the requirement/default printing only for the unassigned remainder so the exported deck still contains the full required quantity.
- Done: update the quick Copy Deck Text actions to use the same physical-allocation-aware export builder as the full export panel.
- Done: verify fully assigned, split-printing, and partly assigned export behavior in the automated export test, then run the complete project test suite and compile both bundles.
- Done: investigate the apparent missing-database regression before reverting changes. SQLite `quick_check` passed and the authenticated health API confirmed 3,374 cards, 13,490 printings, 22 collection items, 2 decks, 47 requirements, and 2 allocations were intact.
- Done: fix the `/api/decks` runtime failure caused by physical-printing lookup maps being scoped inside `/api/collection`; the failed deck request had caused the dashboard to replace both deck and collection state with empty arrays.
- Done: make the normal production build run TypeScript validation first, and stop TypeScript from silently accepting generated JavaScript in `dist`, so out-of-scope server references fail the build before startup.
- Done: freeze feature work and complete a read-only regression audit of SQLite integrity, orphan relationships, allocation invariants, every important read-only API, all navigation sections, the Deck printing popup, Deck Export panel, and Collection allocation detail. No audit action changed the live database.
- Done: test the new startup migration against a temporary copy of the August 23 backup. It preserved all 3 decks, 71 requirement identities, 21 collection items, and 14 allocations exactly; its only data transformation was the planned conversion of legacy imported requirements without a saved printing id to `ANY_PRINTING`.
- Done: confirm the historical `AnchorsAway PT2` difference was intentional; the user deleted that test deck after the August 23 backup. No restoration or merge is needed.
- Pending: visually verify the final print dialog/PDF output in the desktop browser during the next safe local app run.

## Phase 12: Deck Activity History

Status: planned

Goal: keep a trustworthy, human-readable history of deck changes so intentional testing actions can be distinguished from regressions or unexpected data loss.

Tasks:

- Add an append-only SQLite deck activity table with timestamp, action type, deck id, preserved deck name, source, and a concise summary.
- Record deck creation, import, rename/settings changes, activation/deactivation, requirement additions/removals/quantity changes, exact-printing changes, auto-allocation, manual allocation/release/move, and deck deletion.
- Preserve enough before/after detail to explain what changed without storing passwords, authentication tokens, or unrelated card-database payloads.
- Ensure deletion history survives after the deck itself is deleted; the activity table must not cascade away with the deck.
- Write each activity record in the same SQLite transaction as its deck mutation so the history cannot claim a change that failed, or miss a change that committed.
- Add read-only activity views on the Deck and Admin screens with deck/action/date filters.
- Add regression coverage proving read-only actions create no log entries and destructive deck actions remain traceable.
- Keep automatic restore/undo out of this phase; recovery should continue to use explicit SQLite backups until a separately designed safe undo workflow exists.

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
- Done: split Pokemon TCG API price finishes such as Normal, Holo, Reverse Holo, and recognized promo/cosmo holo price keys into separate SQLite printing rows during sync, while keeping the original API ID as the primary/default printing.
- Done: add master-set completion progress by set in the Browser when a set filter is selected.
- Later: refine promo/cosmo holo detection if real API examples expose extra finish keys outside the current mapping.
- Deferred, low priority: investigate sets such as PBL that do not show expected Reverse Holo printings.
- For that follow-up, first verify whether the upstream card price/finish data exposes a Reverse Holo key for the affected cards.
- If upstream data exists, trace sync transformation, SQLite upsert, Browser variant filtering, and pagination before changing the finish-mapping rules.
- Keep the PBL follow-up after Phase 11 completion unless missing variants begin affecting collection accuracy or exact-printing deck requirements.

## Later: Home Dashboard Routine API Polish

Status: in progress

Goal: expose a safe API route for an external home dashboard to run or inspect a weekly database routine.

Notes:

- Done: add a protected API route for a weekly catalogue/database routine.
- Done: return 7-day counts for recent set releases, set metadata updates, collection changes, deck changes, sync failures, and successful sync activity.
- Keep it dashboard-friendly: concise JSON, timestamps, status, and last-run summary.
- Done: make the routine idempotent so repeated dashboard calls do not start duplicate work.
- Done: add a separate read-only route for the dashboard and a protected action route to trigger the routine.
- Done: create API documentation to follow for beginner to implement, including examples.


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

## Current Execution Order

1. Finish Phase 11 by visually checking the printable deck-list/PDF output during the next safe local app run.
2. Implement Phase 12 Deck Activity History as the next reliability feature before lower-priority feature work.
3. Finish the remaining Phase 1 search-loading behavior only if stale/unstable results are still observable in normal use.
4. Collect hosted endpoint timings for Phase 9 only if the 2-core/4 GB deployment still feels slow after the completed targeted-write work.
5. Test Phase 10 against the real home dashboard client once that client exists.
6. Investigate the deferred PBL/Reverse Holo Browser completeness issue.
7. Later: add automatic USD-to-ZAR lookup after choosing a reliable source and fallback policy.
8. Later: add deck value totals based on printing values and required quantities.
