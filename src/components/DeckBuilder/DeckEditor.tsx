import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  Share2,
  Copy,
  Check,
  Layers,
  Sparkles,
  HelpCircle,
  ExternalLink,
  Compass,
  Settings,
  Loader2,
  AlertCircle,
  Eye
} from 'lucide-react';
import { RequirementMode } from '../../types/tcg';
import { searchCardsApi } from '../../services/api';
import { getImageUrl, handleImageError } from '../../utils/imageUtils';
import { DeckSettingsModal } from './DeckSettingsModal';
import { CardDetailModal } from '../CardDetailModal';

interface DeckEditorProps {
  deck: any;
  allCards: any[];
  onBack: () => void;
  onUpdateDeckRequirement: (reqId: string, quantity: number, mode?: RequirementMode, preferredPrintingId?: string) => void;
  onAddCardToDeck: (cardId: string, quantity: number) => void;
  onRemoveRequirement: (reqId: string) => void;
  onAutoAllocate: (deckId: string) => void;
  onHuntMissingCards?: (deckId: string) => void;
}

export const DeckEditor: React.FC<DeckEditorProps> = ({
  deck,
  onBack,
  onUpdateDeckRequirement,
  onAddCardToDeck,
  onRemoveRequirement,
  onAutoAllocate,
  onHuntMissingCards,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestId = useRef(0);

  const [selectedPrintingReq, setSelectedPrintingReq] = useState<any | null>(null);
  const [viewingCardModal, setViewingCardModal] = useState<{ card: any; printing?: any } | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const reqs = deck.requirements || [];

  useEffect(() => {
    if (!searchQuery.trim()) {
      searchRequestId.current += 1;
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    const controller = new AbortController();

    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      const res = await searchCardsApi(searchQuery, { signal: controller.signal });
      if (requestId !== searchRequestId.current) return;

      setIsSearching(false);
      if (res.success) {
        setSearchResults(res.cards || []);
      } else if (res.error !== 'Search cancelled') {
        setSearchResults([]);
        setSearchError(res.error || 'Failed to search cards');
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const handleCopyLimitless = () => {
    const lines = reqs.map((r: any) => {
      const prt = r.printing;
      if (prt && r.requirement.requirementMode === 'SPECIFIC_PRINTING') {
        return `${r.requirement.quantity} ${r.card.name} ${prt.setCode} ${prt.cardNumber}`;
      }
      return `${r.requirement.quantity} ${r.card.name}`;
    });

    const fullText = `# ${deck.name} (${deck.version})\nFormat: ${deck.format}\n\n` + lines.join('\n');
    navigator.clipboard.writeText(fullText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Group requirements by Supertype (Pokémon, Trainer, Energy)
  const pokemonReqs = reqs.filter((r: any) => r.card.supertype === 'Pokémon');
  const trainerReqs = reqs.filter((r: any) => r.card.supertype === 'Trainer');
  const energyReqs = reqs.filter((r: any) => r.card.supertype === 'Energy');

  const countSupertype = (group: any[]) => group.reduce((sum, r) => sum + r.requirement.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="bg-white border border-slate-200 p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2.5 bg-slate-100 hover:bg-indigo-700 hover:text-white text-slate-700 rounded-2xl border border-slate-200 transition"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-black italic uppercase text-slate-900">{deck.name}</h1>
              <span className="text-xs px-2.5 py-0.5 bg-indigo-100 font-bold text-indigo-800 rounded-lg">
                {deck.version}
              </span>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-800 rounded-xl transition border border-slate-200"
                title="Edit Deck Name, Version & Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium pt-0.5">
              Total Cards: <span className="text-slate-900 font-bold">{deck.totalRequiredCards}</span> / 60 • Allocated Physical:{' '}
              <span className="text-emerald-700 font-bold">{deck.totalAllocatedCards}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onHuntMissingCards && (
            <button
              onClick={() => onHuntMissingCards(deck.id)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black text-xs uppercase tracking-wider rounded-2xl transition shadow-sm"
              title="Hunt missing cards in local store bulk boxes"
            >
              <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Bulk Hunt</span>
            </button>
          )}

          <button
            onClick={() => onAutoAllocate(deck.id)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-black uppercase tracking-wider rounded-2xl transition"
          >
            <Share2 className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Auto-Allocate Collection</span>
          </button>

          <button
            onClick={handleCopyLimitless}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold rounded-2xl transition"
          >
            {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedText ? 'Copied!' : 'Copy Limitless Text'}</span>
          </button>

        </div>
      </div>

      {/* Card Search & Add Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-3xl space-y-3 shadow-sm">
        <div className="relative">
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin absolute left-3.5 top-3.5" />
          ) : (
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          )}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search canonical Pokémon TCG API to add (e.g. Ultra Ball, Dragapult ex, Boss's Orders)..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition font-medium"
          />
        </div>

        {searchError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center space-x-2 text-red-700 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {!isSearching && searchQuery.trim() && searchResults.length === 0 && !searchError && (
          <div className="p-4 text-center text-slate-500 text-xs font-medium border-t border-slate-100">
            No cards found matching "{searchQuery}" on Pokémon TCG API.
          </div>
        )}

        {/* Search Results Dropdown Grid */}
        {searchResults.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 max-h-80 overflow-y-auto">
            {searchResults.map((card) => {
              const defaultPrt = card.printings?.[0];
              const printingsCount = card.printings?.length || 1;

              return (
                <div
                  key={card.id}
                  className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 flex items-center space-x-3 hover:border-indigo-400 transition group"
                >
                  <button
                    type="button"
                    onClick={() => setViewingCardModal({ card, printing: defaultPrt })}
                    className="flex-shrink-0"
                    title="View card"
                  >
                    <img
                      src={getImageUrl(defaultPrt, card)}
                      alt={card.name}
                      onError={handleImageError}
                      className="w-9 h-12 object-cover rounded-md border border-slate-200 shadow-xs group-hover:scale-105 transition-transform bg-white"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <button
                      onClick={() => setViewingCardModal({ card, printing: defaultPrt })}
                      className="block w-full text-left text-xs font-bold text-slate-900 hover:text-indigo-700 truncate transition"
                    >
                      {card.name}
                    </button>
                    <div className="text-[10px] text-slate-500 font-medium truncate">
                      {card.supertype} {card.subtype ? `• ${card.subtype}` : ''}
                    </div>
                    {defaultPrt && (
                      <div className="text-[10px] text-indigo-700 font-bold truncate">
                        {defaultPrt.setCode} #{defaultPrt.cardNumber} • ${defaultPrt.marketPrice ? defaultPrt.marketPrice.toFixed(2) : '0.50'}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col space-y-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewingCardModal({ card, printing: defaultPrt })}
                      className="self-end p-1.5 bg-white hover:bg-slate-100 text-slate-600 hover:text-indigo-700 rounded-lg border border-slate-200 transition"
                      title="View card"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center space-x-1">
                      {[1, 2, 4].map((qty) => (
                        <button
                          key={qty}
                          onClick={() => {
                            onAddCardToDeck(card.id, qty);
                            setSearchQuery('');
                          }}
                          className="px-1.5 py-0.5 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black text-[11px] rounded-lg shadow-xs transition"
                          title={`Add ${qty} copies`}
                        >
                          +{qty}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ownership Legend */}
      <div className="bg-indigo-50/80 p-3.5 rounded-2xl border border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900 font-medium">
        <span className="font-bold text-indigo-950">Physical Inventory Status:</span>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="inline-flex items-center font-bold text-emerald-800">
            🟢 Fully Owned & Unallocated
          </span>
          <span className="inline-flex items-center font-bold text-amber-900">
            🟡 Partially Owned
          </span>
          <span className="inline-flex items-center font-bold text-rose-800">
            🟠 Owned but Allocated Elsewhere
          </span>
          <span className="inline-flex items-center font-bold text-slate-600">
            🔴 Not Owned
          </span>
        </div>
      </div>

      {/* Limitless Style Deck Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Pokémon */}
        <DeckSection
          title="Pokémon"
          count={countSupertype(pokemonReqs)}
          items={pokemonReqs}
          onUpdate={onUpdateDeckRequirement}
          onRemove={onRemoveRequirement}
          onOpenPrintingModal={setSelectedPrintingReq}
          onOpenCardDetail={setViewingCardModal}
        />

        {/* Column 2: Trainer */}
        <DeckSection
          title="Trainer Cards"
          count={countSupertype(trainerReqs)}
          items={trainerReqs}
          onUpdate={onUpdateDeckRequirement}
          onRemove={onRemoveRequirement}
          onOpenPrintingModal={setSelectedPrintingReq}
          onOpenCardDetail={setViewingCardModal}
        />

        {/* Column 3: Energy */}
        <DeckSection
          title="Energy Cards"
          count={countSupertype(energyReqs)}
          items={energyReqs}
          onUpdate={onUpdateDeckRequirement}
          onRemove={onRemoveRequirement}
          onOpenPrintingModal={setSelectedPrintingReq}
          onOpenCardDetail={setViewingCardModal}
        />
      </div>

      {/* Change Printing Modal */}
      {selectedPrintingReq && (
        <PrintingSelectorModal
          reqItem={selectedPrintingReq}
          onClose={() => setSelectedPrintingReq(null)}
          onSelectPrinting={(mode, printingId) => {
            onUpdateDeckRequirement(
              selectedPrintingReq.requirement.id,
              selectedPrintingReq.requirement.quantity,
              mode,
              printingId
            );
            setSelectedPrintingReq(null);
          }}
        />
      )}

      {/* Deck Settings & Rename Modal */}
      {showSettingsModal && (
        <DeckSettingsModal
          deck={deck}
          onClose={() => setShowSettingsModal(false)}
          onSaveSuccess={() => {
            setShowSettingsModal(false);
            onAutoAllocate(deck.id);
          }}
          onDeleted={() => {
            setShowSettingsModal(false);
            onBack();
          }}
        />
      )}

      {viewingCardModal && (
        <CardDetailModal
          card={viewingCardModal.card}
          printing={viewingCardModal.printing}
          allPrintings={viewingCardModal.card.printings}
          onClose={() => setViewingCardModal(null)}
        />
      )}
    </div>
  );
};

// Section Helper Component
const DeckSection: React.FC<{
  title: string;
  count: number;
  items: any[];
  onUpdate: (id: string, qty: number, mode?: RequirementMode, prtId?: string) => void;
  onRemove: (id: string) => void;
  onOpenPrintingModal: (reqItem: any) => void;
  onOpenCardDetail: (cardDetail: { card: any; printing?: any }) => void;
}> = ({ title, count, items, onUpdate, onRemove, onOpenPrintingModal, onOpenCardDetail }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h2 className="font-black italic uppercase text-sm text-slate-900">{title}</h2>
        <span className="text-xs font-black px-2.5 py-0.5 bg-yellow-400 text-indigo-950 rounded-full">
          {count}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const req = item.requirement;
          const card = item.card;
          const prt = item.printing;
          const ownership = item.ownership;

          let badgeIcon = '🟢';
          let borderClass = 'border-slate-200';
          if (ownership?.status === 'PARTIALLY_OWNED') {
            badgeIcon = '🟡';
            borderClass = 'border-amber-300';
          }
          if (ownership?.status === 'ALLOCATED_ELSEWHERE') {
            badgeIcon = '🟠';
            borderClass = 'border-rose-300';
          }
          if (ownership?.status === 'NOT_OWNED') {
            badgeIcon = '🔴';
            borderClass = 'border-slate-200';
          }

          return (
            <div
              key={req.id}
              className={`bg-slate-50 p-3.5 rounded-2xl border ${borderClass} space-y-2 hover:border-indigo-300 transition`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <button
                    onClick={() => onOpenCardDetail({ card, printing: prt })}
                    className="flex-shrink-0"
                    title="Open card detail"
                  >
                    <img
                      src={getImageUrl(prt, card)}
                      alt={card?.name || 'Pokémon Card'}
                      onError={handleImageError}
                      className="w-8 h-11 object-cover rounded-md border border-slate-200 shadow-xs bg-white hover:scale-105 transition-transform"
                      referrerPolicy="no-referrer"
                    />
                  </button>

                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-1.5">
                      <span>{badgeIcon}</span>
                      <button
                        onClick={() => onOpenCardDetail({ card, printing: prt })}
                        className="font-bold text-xs text-slate-900 hover:text-indigo-700 text-left transition"
                      >
                        {card.name}
                      </button>
                    </div>

                    <button
                      onClick={() => onOpenPrintingModal(item)}
                      className="text-[10px] text-indigo-700 hover:underline flex items-center space-x-1 font-bold"
                    >
                      <span>
                        {req.requirementMode === 'SPECIFIC_PRINTING' && prt
                          ? `${prt.setCode} ${prt.cardNumber} (${prt.rarity})`
                          : 'Any Compatible Printing'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm">
                  <button
                    onClick={() => {
                      if (req.quantity > 1) {
                        onUpdate(req.id, req.quantity - 1);
                      } else {
                        onRemove(req.id);
                      }
                    }}
                    className="p-1 hover:bg-slate-100 text-slate-700 rounded-lg transition"
                  >
                    <Minus className="w-3 h-3 stroke-[2.5]" />
                  </button>
                  <span className="text-xs font-bold font-mono px-1.5 text-slate-900">{req.quantity}</span>
                  <button
                    onClick={() => onUpdate(req.id, req.quantity + 1)}
                    className="p-1 hover:bg-slate-100 text-slate-700 rounded-lg transition"
                  >
                    <Plus className="w-3 h-3 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {/* Inventory Breakdown Row */}
              <div className="flex items-center justify-between text-[10px] text-slate-600 bg-slate-200/60 px-2.5 py-1 rounded-xl font-medium">
                <span>Allocated: {ownership?.allocatedToThisDeck || 0}/{req.quantity}</span>
                <span>Avail: {ownership?.availableInCollection || 0}</span>
                <button
                  onClick={() => onRemove(req.id)}
                  className="text-rose-600 hover:text-rose-800 transition"
                  title="Remove from deck"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="text-xs text-slate-400 italic py-6 text-center">
            No {title.toLowerCase()} added yet.
          </div>
        )}
      </div>
    </div>
  );
};

// Printing Modal Helper
const PrintingSelectorModal: React.FC<{
  reqItem: any;
  onClose: () => void;
  onSelectPrinting: (mode: RequirementMode, printingId?: string) => void;
}> = ({ reqItem, onClose, onSelectPrinting }) => {
  const card = reqItem.card;
  const printings = card.printings || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-black italic uppercase text-slate-900">Select Card Printing — {card.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold">
            ✕
          </button>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {/* Option 1: Any Printing */}
          <div
            onClick={() => onSelectPrinting('ANY_PRINTING')}
            className="bg-slate-50 p-3.5 rounded-2xl border border-indigo-200 hover:border-indigo-400 cursor-pointer transition flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-bold text-indigo-900">Any Compatible Printing</div>
              <div className="text-[11px] text-slate-500 font-medium">
                Any legal owned copy of {card.name} satisfy this requirement.
              </div>
            </div>
            <span className="text-xs font-black text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full">Default</span>
          </div>

          <div className="text-xs font-bold text-slate-500 pt-2 uppercase tracking-wider">Specific Printing Variations:</div>

          {printings.map((prt: any) => (
            <div
              key={prt.id}
              onClick={() => onSelectPrinting('SPECIFIC_PRINTING', prt.id)}
              className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-300 cursor-pointer transition flex items-center justify-between"
            >
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {prt.setName} ({prt.setCode} #{prt.cardNumber})
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  Rarity: {prt.rarity} • Variant: {prt.variant}
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700">
                ${prt.marketPrice?.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
