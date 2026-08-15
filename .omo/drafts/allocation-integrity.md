---
slug: allocation-integrity
intent: clear
review_required: false
classification: Architecture
status: interviewing
plan_path: .omo/plans/allocation-integrity.md
pending_action: resolve interview forks, then present approval brief, then write .omo/plans/allocation-integrity.md
scaffold_deviation: "scaffold-plan.mjs could not be executed in this environment (no exec tool; task/subagent infra erroring). Draft hand-built from the ulw-plan template headers. Plan will be hand-assembled with the same headers."
---

# allocation-integrity - Work Plan (DRAFT)

## Request summary
Fix the Allocation System in the Pokémon TCG Deck Builder: eliminate duplicate/accumulating persisted allocations, enforce identity uniqueness and physical-card invariants (never allocate more than owned, backend-authoritative), add manual allocate/release/move endpoints, add allocation management UI, and lock everything with regression tests.

## TL;DR (For humans)
(TBD - filled last)

## Audit findings (PHASE 0, verified post-restore)

### Current allocation flow
- `src/services/allocationEngine.ts` - `autoAllocateDeck(deckId, requirements, collectionItems, allocations, activeDecks)`:
  - Line 149: `newAllocations = [...allocations.filter(a => a.deckId !== deckId)]` - clears ALL of the target deck's existing allocations in-memory (including `isLocked` rows).
  - Lines 190-197: pushes fresh allocations with `id: alloc_${Date.now()}_${Math.random()...}` (new id every run), `isLocked` set from `targetDeck.isPermanentlyAssembled` (line 170).
  - Matches requirements by `requirementMode` (ANY_PRINTING / SPECIFIC_PRINTING) and computes per-item availability (`itemAvailableMap`) against allocations to OTHER active decks.
- `server/database/index.ts` - `DatabaseManager`:
  - `migrateAllocations()` (lines 150-196): drops/recreates table only when legacy `cardId` column exists; else ALTER TABLE ADD COLUMN for `collectionItemId`/`requirementId`/`isLocked`. NOTE: does NOT create any unique index.
  - `writeDb()` (lines 270-507): PURE UPSERT across all tables (`ON CONFLICT(id) DO UPDATE`). **Performs NO DELETE ever.** Allocation rows whose ids are no longer present in memory are never removed from SQLite.
  - `readDb()` (lines 202-264): reads all tables; converts `isLocked` 1/0 -> boolean.
- `server.ts` endpoints (verified):
  - `GET /api/collection` (403) - enriches items with allocatedQuantity / availableQuantity from active-deck allocations.
  - `POST /api/collection` (439) - update/delete/trim collection items; refuses qty decrease below allocated; safety-net trims allocations (lines 500-515). Does NOT auto-allocate.
  - `DELETE /api/collection/:id` (550) - refuses delete while allocated; cleans orphan allocations.
  - `POST /api/decks` (624) - saves deck + requirements; cleans orphaned allocations for the deck (line 677).
  - `DELETE /api/decks/:id` (689) - removes deck + its allocations, then re-runs autoAllocateDeck on remaining active decks.
  - `POST /api/decks/:id/auto-allocate` (708) - calls autoAllocateDeck + writeDb.
  - `POST /api/allocations/move` (731) - transfers quantity between decks per cardId; finds target requirement by cardId (line 749); merges into existing target allocation by identity (762-776); filters out zero-qty rows (780).
  - `POST /api/decks/:id/assemble` (787) - pick list, no mutation.
- `src/services/api.ts` - client helpers: `fetchCollection`, `updateCollectionItem`, `deleteCollectionItem`, `autoAllocateDeck`, `moveAllocation(sourceDeckId, targetDeckId, cardId, quantity)`, `getAssemblePickList`, etc.
- UI: `src/components/Allocations/AllocationsDashboard.tsx` (transfer form via moveAllocation, shared-cards list, activate/deactivate toggles) and `src/components/Collection/CollectionManager.tsx` (owned/allocated/available columns; decrease/delete guards).

### Root cause (matches user's brief prediction)
- `autoAllocateDeck` IS idempotent IN MEMORY (it clears the deck's rows before re-adding), but **persistence is additive-only**: `writeDb` upserts by id and never deletes. Every auto-allocate run generates fresh ids (`alloc_<Date.now()>_<rand>`), so the previous run's rows for the same (deckId, requirementId, collectionItemId) identity survive as **duplicates in SQLite**. There is NO unique constraint on `allocations` (`server/database/schema.ts` lines 116-127) to stop this.
- Secondary: `POST /api/allocations/move` merges by identity in memory but can also create rows; combined with additive writes, duplicates accumulate there too.
- `calculateCardOwnershipForDeck` (lines 42-59) and `GET /api/collection` SUM quantities across allocation rows -> duplicates inflate allocated totals and deflate available totals (persisted state is WRONG, not merely hidden in UI).

### Inconsistencies / risks
- `isLocked` currently survives neither persistence nor engine behavior: writeDb preserves the column, but autoAllocateDeck discards locked rows on recalc. Lock semantics for manual allocations are undefined (no manual allocate/release endpoints exist yet; only `move`).
- `POST /api/decks` overwrites deck requirements but does NOT auto-allocate (by design per comments) - orphans cleaned, but no re-balance.
- Tests (`tests/allocationPersistence.test.ts`, `src/services/allocationEngine.test.ts`, plus tests/tcgWorkflow|adversarialAudit|functionalityPass|apiIntegration) are plain tsx scripts with console.assert, chained in `npm test`; no framework, no new deps.
- No live-DB inspection possible from this session (no shell/exec; subagent infra failing). Quantifying current duplicate rows is a worker-side verification step (see Todos).

## Components ledger (topology lock)
| id | component | outcome (one line) | status | evidence path |
|----|-----------|--------------------|--------|---------------|
| C1 | DB persistence layer (`server/database/index.ts` + `server/database/schema.ts`) | allocations get UNIQUE(deckId, requirementId, collectionItemId) + migration dedupe + writeDb reconciles (deletes stale rows) | pending | schema.ts:116-127; index.ts:150-196, 270-507 |
| C2 | Allocation engine (`src/services/allocationEngine.ts`) | idempotent + deterministic identity, locked rows preserved per decision | pending | allocationEngine.ts:142-205 |
| C3 | Backend API (`server.ts`) | manual allocate/release endpoints + backend physical-card invariant validation; move audited | pending | server.ts:708-784 |
| C4 | Frontend (`src/services/api.ts`, AllocationsDashboard, CollectionManager) | allocation management UI + invariant guards | pending | api.ts:202-266; AllocationsDashboard.tsx; CollectionManager.tsx |
| C5 | Tests (existing + new) | regression suite proving no duplicates, no over-allocation, endpoints work | pending | package.json test scripts; tests/*.ts |

## Decisions recorded
- Intent: CLEAR. review_required: false (no modifier requested). Classification: Architecture (5 components, migration + engine + API + UI + tests).
- Must-NOT-Have (from brief): no card-database rebuild, no PTCG API sync changes, no SQLite replacement, no unrelated UI/architecture redesign, no app rewrite, no unnecessary deps/abstractions. Engine must remain idempotent. Persisted allocation state must be CORRECT (not just hidden in UI). Validation is backend-authoritative; never trust frontend quantities.
- Uniqueness key: UNIQUE(deckId, requirementId, collectionItemId) - from the user's brief.
- F1 (user-approved): Migration dedupe = KEEP NEWEST PER IDENTITY. Allocation ids embed Date.now() (`alloc_<ts>_<rand>`); per (deckId, requirementId, collectionItemId) keep the row with max embedded timestamp, delete the rest, then create the unique index.
- F2 (user-approved): LOCKED ALLOCATIONS ARE PRESERVED on auto-allocate recalc. autoAllocateDeck keeps isLocked=true rows for the deck (they survive), recomputes only unlocked rows; locked rows count against the item available pool AND satisfy the requirement quantity so no over-allocation is possible.
- F3 (user-approved): TDD, EXISTING SCRIPT STYLE. Failing tests first, plain tsx + console.assert, chained in `npm test`; no new test framework/deps.
- Root-cause fix (primary): make `writeDb()` reconcile the allocations table - DELETE allocation rows whose id is not in the incoming `data.allocations` set, then upsert as today. All writeDb callers pass the full readDb()-then-mutated state, so this is exact-sync semantics and makes persistence idempotent. UNIQUE constraint is the DB-level backstop; no engine id-generation change needed.
- Manual allocation rows are created with isLocked=true (so they survive recalc per F2). Manual allocate MERGES quantity into an existing row with the same identity (mirrors move endpoint behavior server.ts:762-776); release reduces or deletes a row.
- Backend-authoritative invariant (shared helper): for every collection item, sum(allocations across active decks) <= item.quantity. Enforced in POST /api/collection (already partial), manual allocate, release, move, and auto-allocate result before writeDb.

## Approval gate
status: approved (plan written)
plan file: .omo/plans/allocation-integrity.md (hand-assembled from template headers; scaffold script unrunnable in this env — see scaffold_deviation)
metis_deviation: "metis subagent timed out (3rd subagent failure this session). Gap analysis performed by planner directly; findings folded into plan: writeDb reconciliation guard (data.allocations !== undefined), need to export migrateAllocationUniqueness for testability, locked-rows-subtract-from-availability-and-needed engine detail."
next action: handoff explanation presented; ask user start-work vs high-accuracy review (CLEAR, review_required=false).
note: review_required=false, so after plan completion present handoff and ask start-vs-high-accuracy-review per CLEAR path.
