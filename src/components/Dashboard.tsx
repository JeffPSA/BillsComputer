import React from 'react';
import {
  Box,
  Layers,
  Share2,
  Compass,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { ActiveTab } from './Navbar';
import { formatZarFromUsd } from '../utils/currency';

interface DashboardProps {
  decks: any[];
  collection: any[];
  setActiveTab: (tab: ActiveTab) => void;
  onSelectDeck: (deckId: string) => void;
  onOpenImportModal: () => void;
  onOpenQuickAddCollection: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  decks,
  collection,
  setActiveTab,
  onSelectDeck,
  onOpenImportModal,
  onOpenQuickAddCollection,
}) => {
  const totalOwnedCards = collection.reduce((sum, item) => sum + item.quantity, 0);
  const totalAvailableCards = collection.reduce((sum, item) => sum + item.availableQuantity, 0);
  const totalAllocatedCards = collection.reduce((sum, item) => sum + item.allocatedQuantity, 0);
  const totalEstimatedValue = collection.reduce(
    (sum, item) => sum + (item.printing?.marketPrice || 0) * item.quantity,
    0
  );

  const activeDecks = decks.filter((d) => d.status === 'Active');
  const fullyOwnedDecks = activeDecks.filter((d) => d.isFullyOwned);

  // Shared cards in high demand (Ultra Ball, Nest Ball, Boss's Orders, etc.)
  const sharedCards = collection.filter((item) => item.allocatedDetails && item.allocatedDetails.length > 1);

  return (
    <div className="space-y-6">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-widest">
            <span>TOTAL PHYSICAL CARDS</span>
            <Box className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">{totalOwnedCards}</div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1 font-medium">
            <span>{collection.length} Unique Printings</span>
            <span className="text-emerald-700 font-bold">Est. {formatZarFromUsd(totalEstimatedValue)}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-widest">
            <span>AVAILABLE (UNALLOCATED)</span>
            <Box className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-emerald-600">{totalAvailableCards}</div>
          <div className="text-xs text-slate-500 pt-1 font-medium">
            <span>{totalAllocatedCards} cards assigned to decks</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-widest">
            <span>ACTIVE DECKS</span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">{activeDecks.length}</div>
          <div className="text-xs text-slate-500 flex items-center space-x-2 pt-1 font-medium">
            <span className="inline-flex items-center text-emerald-700 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              {fullyOwnedDecks.length} Fully Owned
            </span>
            <span>/ {activeDecks.length - fullyOwnedDecks.length} Need Cards</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-widest">
            <span>SHARED CARDS</span>
            <Share2 className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-black text-slate-900">{sharedCards.length}</div>
          <div className="text-xs text-slate-500 pt-1 font-medium">
            <span>Staples used simultaneously in 2+ decks</span>
          </div>
        </div>
      </div>

      {/* Active Decks & Shared Staples Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Decks Overview */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-700" />
              <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900">Active Decks Status</h2>
            </div>
            <button
              onClick={() => setActiveTab('decks')}
              className="text-xs text-indigo-700 hover:text-indigo-900 font-bold flex items-center space-x-1 uppercase tracking-wider"
            >
              <span>Manage All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {activeDecks.map((deck) => {
              const allocationMissingCards =
                deck.totalAllocationMissingCards ?? Math.max(0, (deck.totalRequiredCards || 0) - (deck.totalAllocatedCards || 0));

              return (
                <div
                  key={deck.id}
                  onClick={() => onSelectDeck(deck.id)}
                  className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer"
                >
                  <div className="min-w-0 w-full sm:w-auto space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-black text-sm text-slate-900">{deck.name}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-700 font-bold rounded-lg uppercase">
                        {deck.version}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
                      <span>Format: {deck.format}</span>
                      <span>•</span>
                      <span>{deck.totalAllocatedCards} / {deck.totalRequiredCards} cards physical</span>
                    </div>
                  </div>

                  <div className="flex w-full sm:w-auto flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3">
                    {deck.isFullyOwned ? (
                      <span className="inline-flex items-center px-2.5 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl">
                        🟢 Fully Owned
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold rounded-xl">
                        ⚠️ {allocationMissingCards} Not Allocated
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDeck(deck.id);
                      }}
                      className="shrink-0 px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-sm"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shared Staples Panel */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <Share2 className="w-5 h-5 text-rose-500" />
              <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900">Shared Staples</h2>
            </div>
            <button
              onClick={() => setActiveTab('allocations')}
              className="text-xs text-indigo-700 hover:text-indigo-900 font-bold flex items-center space-x-1 uppercase tracking-wider"
            >
              <span>Allocations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-slate-500 font-medium">
            Cards shared across multiple active decks. Check physical distribution before tournament play.
          </p>

          <div className="space-y-3">
            {sharedCards.slice(0, 5).map((item) => (
              <div key={item.id} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-indigo-900">{item.card?.name}</span>
                  <span className="text-[10px] font-bold text-slate-500">
                    Owned: {item.quantity} | Available: {item.availableQuantity}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 space-y-0.5 font-medium">
                  {item.allocatedDetails.map((a: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span className="text-slate-800">• {a.deckName}</span>
                      <span className="font-bold text-indigo-700">{a.allocatedQuantity} copies</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {sharedCards.length === 0 && (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                No shared staple cards currently allocated across 2+ active decks.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <button
          onClick={() => setActiveTab('bulk-hunter')}
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 hover:border-indigo-300 text-left space-y-2 group transition-all shadow-sm"
        >
          <div className="w-10 h-10 rounded-2xl bg-yellow-400 text-indigo-950 flex items-center justify-center font-bold group-hover:scale-105 transition-transform shadow-md">
            <Compass className="w-5 h-5 stroke-[2.5]" />
          </div>
          <h3 className="font-black text-sm text-slate-900 group-hover:text-indigo-700 transition">
            Local Store Bulk Hunter
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Generate phone-friendly bulk box checklists ordered by your local store's physical boxes.
          </p>
        </button>

        <button
          onClick={() => setActiveTab('shopping')}
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 hover:border-indigo-300 text-left space-y-2 group transition-all shadow-sm"
        >
          <div className="w-10 h-10 rounded-2xl bg-indigo-700 text-white flex items-center justify-center font-bold group-hover:scale-105 transition-transform shadow-md">
            <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
          </div>
          <h3 className="font-black text-sm text-slate-900 group-hover:text-indigo-700 transition">
            Marketplace Optimizer
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Compare TCGPlayer, eBay, and BOB's Shop to calculate cheapest totals including shipping.
          </p>
        </button>

        <button
          onClick={onOpenQuickAddCollection}
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 hover:border-indigo-300 text-left space-y-2 group transition-all shadow-sm"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-bold group-hover:scale-105 transition-transform shadow-md">
            <Box className="w-5 h-5 stroke-[2.5]" />
          </div>
          <h3 className="font-black text-sm text-slate-900 group-hover:text-indigo-700 transition">
            Quick Add Collection Items
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Add new booster pulls, singles, or bulk purchases directly into physical inventory.
          </p>
        </button>
      </div>
    </div>
  );
};
