import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Share2,
  PackageCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Copy,
  Check,
  Compass,
  Settings,
  Loader2
} from 'lucide-react';
import { DeckSettingsModal } from './DeckSettingsModal';

interface DeckListProps {
  decks: any[];
  onSelectDeck: (deckId: string) => void;
  onCreateNewDeck: () => void;
  onDeleteDeck: (deckId: string) => Promise<void>;
  onAutoAllocate: (deckId: string) => void;
  onOpenImportModal: () => void;
  onAssembleDeck: (deckId: string) => void;
  onHuntMissingCards?: (deckId: string) => void;
}

export const DeckList: React.FC<DeckListProps> = ({
  decks,
  onSelectDeck,
  onCreateNewDeck,
  onDeleteDeck,
  onAutoAllocate,
  onOpenImportModal,
  onAssembleDeck,
  onHuntMissingCards,
}) => {
  const [copiedDeckId, setCopiedDeckId] = React.useState<string | null>(null);
  const [editingDeck, setEditingDeck] = useState<any | null>(null);
  const [deletingDeckId, setDeletingDeckId] = React.useState<string | null>(null);

  const handleCopyLimitlessText = (deck: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const reqs = deck.requirements || [];
    const lines = reqs.map((r: any) => {
      const cardName = r.card?.name || 'Card';
      const prt = r.printing;
      if (prt && r.requirement.requirementMode === 'SPECIFIC_PRINTING') {
        return `${r.requirement.quantity} ${cardName} ${prt.setCode} ${prt.cardNumber}`;
      }
      return `${r.requirement.quantity} ${cardName}`;
    });

    const fullText = `# ${deck.name} (${deck.version})\nFormat: ${deck.format}\n\n` + lines.join('\n');
    navigator.clipboard.writeText(fullText);
    setCopiedDeckId(deck.id);
    setTimeout(() => setCopiedDeckId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-indigo-700 p-6 rounded-[32px] border-4 border-indigo-900 text-white shadow-xl">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Pokémon TCG Deck Lists</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            Decks evaluate real physical collection inventory. Click any deck to edit cards or swap printings.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenImportModal}
            className="px-3.5 py-2 bg-indigo-900 hover:bg-indigo-950 text-yellow-300 border border-indigo-500 text-xs font-black uppercase tracking-wider rounded-2xl transition shadow-sm"
          >
            Import Limitless List
          </button>
          <button
            onClick={onCreateNewDeck}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 text-xs font-black uppercase tracking-wider rounded-2xl transition shadow-md"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Deck</span>
          </button>
        </div>
      </div>

      {/* Decks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {decks.map((deck) => {
          const reqs = deck.requirements || [];
          const missingReqs = reqs.filter((r: any) => r.ownership?.status !== 'FULLY_OWNED');

          return (
            <div
              key={deck.id}
              onClick={() => onSelectDeck(deck.id)}
              className="bg-white border border-slate-200 hover:border-indigo-400 rounded-3xl p-5 space-y-4 cursor-pointer transition-all shadow-sm group relative flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Header & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-black text-indigo-700">
                      {deck.format} • {deck.version}
                    </span>
                    <h2 className="text-lg font-black italic uppercase text-slate-900 group-hover:text-indigo-700 transition">
                      {deck.name}
                    </h2>
                  </div>

                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                      deck.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border border-slate-300'
                    }`}
                  >
                    {deck.status}
                  </span>
                </div>

                {/* Ownership Badge */}
                <div>
                  {deck.isFullyOwned ? (
                    <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>🟢 Fully Owned in Collection</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold rounded-xl">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                      <span>⚠️ Needs {missingReqs.length} Physical Cards</span>
                    </div>
                  )}
                </div>

                {/* Requirements Breakdown Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500 font-medium">
                    <span>Physical Allocation:</span>
                    <span className="font-bold text-slate-800">
                      {deck.totalAllocatedCards} / {deck.totalRequiredCards} cards
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className="h-full bg-gradient-to-r from-yellow-400 via-amber-500 to-emerald-500 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          deck.totalRequiredCards > 0
                            ? (deck.totalAllocatedCards / deck.totalRequiredCards) * 100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Card Sample List */}
                <div className="space-y-1 pt-1">
                  {reqs.slice(0, 4).map((r: any, idx: number) => {
                    const status = r.ownership?.status;
                    let badge = '🟢';
                    if (status === 'PARTIALLY_OWNED') badge = '🟡';
                    if (status === 'ALLOCATED_ELSEWHERE') badge = '🟠';
                    if (status === 'NOT_OWNED') badge = '🔴';

                    return (
                      <div key={idx} className="flex items-center justify-between text-xs py-0.5 font-medium">
                        <span className="text-slate-800 truncate max-w-[180px]">
                          {badge} {r.requirement.quantity}x {r.card.name}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          {r.ownership?.allocatedToThisDeck || 0}/{r.requirement.quantity}
                        </span>
                      </div>
                    );
                  })}
                  {reqs.length > 4 && (
                    <div className="text-[11px] text-slate-400 italic pt-0.5">
                      + {reqs.length - 4} more cards in deck
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div
                className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => onAutoAllocate(deck.id)}
                    title="Auto-allocate unallocated cards from physical collection"
                    className="p-2 bg-slate-100 hover:bg-yellow-400 hover:text-indigo-950 text-slate-700 rounded-xl border border-slate-200 transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleCopyLimitlessText(deck, e)}
                    title="Copy Limitless TCG Text Format"
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition"
                  >
                    {copiedDeckId === deck.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingDeck(deck);
                    }}
                    title="Deck Settings & Rename"
                    className="p-2 bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 rounded-xl border border-slate-200 transition"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeletingDeckId(deck.id);
                      onDeleteDeck(deck.id);
                      // Reset loading state after a delay (assume operation completes)
                      setTimeout(() => setDeletingDeckId(null), 2000);
                    }}
                    title="Delete Deck"
                    disabled={deletingDeckId === deck.id}
                    className="p-2 bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-500 rounded-xl border border-slate-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingDeckId === deck.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center space-x-1.5">
                  {missingReqs.length > 0 && onHuntMissingCards && (
                    <button
                      onClick={() => onHuntMissingCards(deck.id)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 text-xs font-black uppercase tracking-wider rounded-xl transition shadow-xs"
                      title="Hunt missing cards in local store bulk boxes"
                    >
                      <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Bulk Hunt</span>
                    </button>
                  )}

                  <button
                    onClick={() => onAssembleDeck(deck.id)}
                    className="inline-flex items-center space-x-1 px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-sm"
                  >
                    <PackageCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Assemble</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingDeck && (
        <DeckSettingsModal
          deck={editingDeck}
          onClose={() => setEditingDeck(null)}
          onSaveSuccess={() => {
            setEditingDeck(null);
            // Refresh parent state if needed
            window.location.reload();
          }}
        />
      )}
    </div>
  );
};
