import React, { useState, useEffect, useRef } from 'react';
import { Box, Search, Loader2, AlertCircle, Eye } from 'lucide-react';
import { updateCollectionItem, searchCardsApi } from '../services/api';
import { getImageUrl, handleImageError } from '../utils/imageUtils';
import { CardDetailModal } from './CardDetailModal';
import { formatZarFromUsd, usdToZar } from '../utils/currency';

interface QuickAddCollectionModalProps {
  allCards: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export const QuickAddCollectionModal: React.FC<QuickAddCollectionModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestId = useRef(0);

  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [selectedPrintingId, setSelectedPrintingId] = useState<string>('');
  const [viewingCardModal, setViewingCardModal] = useState<{ card: any; printing?: any } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState('NM');
  const [source, setSource] = useState('Local Game Store Single');
  const [cost, setCost] = useState(usdToZar(1).toFixed(2));
  const [loading, setLoading] = useState(false);

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

  const handleSelectCard = (card: any) => {
    setSelectedCard(card);
    const printings = card.printings || [];
    if (printings.length > 0) {
      setSelectedPrintingId(printings[0].id);
      if (printings[0].marketPrice) {
        setCost(usdToZar(printings[0].marketPrice).toFixed(2));
      }
    } else {
      setSelectedPrintingId(card.defaultPrintingId || '');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard) return;

    setLoading(true);
    await updateCollectionItem({
      cardId: selectedCard.id,
      printingId: selectedPrintingId || selectedCard.defaultPrintingId,
      quantity,
      condition: condition as any,
      acquisitionSource: source,
      acquisitionCost: parseFloat(cost) || 0,
    });

    setLoading(false);
    onSuccess();
    onClose();
  };

  const selectedPrinting = selectedCard?.printings?.find((p: any) => p.id === selectedPrintingId) || selectedCard?.printings?.[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border-4 border-indigo-900 rounded-[32px] max-w-lg w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2">
            <Box className="w-5 h-5 text-indigo-700 stroke-[2.5]" />
            <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900">Add Cards to Physical Collection</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-black text-lg">
            ✕
          </button>
        </div>

        {!selectedCard ? (
          <div className="space-y-3">
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
                placeholder="Search canonical Pokémon card (e.g. Ultra Ball, Charizard ex, Darkrai)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 font-medium"
              />
            </div>

            {searchError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center space-x-2 text-red-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            {!isSearching && searchQuery.trim() && searchResults.length === 0 && !searchError && (
              <div className="p-6 text-center text-slate-500 text-xs font-medium">
                No cards found matching "{searchQuery}" on Pokémon TCG API.
              </div>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {searchResults.map((card) => {
                const defaultPrt = card.printings?.[0];
                const printingsCount = card.printings?.length || 1;

                return (
                  <div
                    key={card.id}
                    className="bg-slate-50 hover:bg-indigo-50/50 p-3 rounded-2xl border border-slate-200 hover:border-indigo-400 transition flex items-center space-x-3 group"
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
                        className="w-10 h-14 object-cover rounded-md border border-slate-200 shadow-xs group-hover:scale-105 transition-transform bg-slate-100"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setViewingCardModal({ card, printing: defaultPrt })}
                        className="w-full text-xs font-bold text-slate-900 group-hover:text-indigo-950 hover:text-indigo-700 flex items-center justify-between text-left transition"
                      >
                        <span className="truncate">{card.name}</span>
                        {defaultPrt?.marketPrice && (
                          <span className="text-emerald-700 font-black text-[11px] ml-2">
                            {formatZarFromUsd(defaultPrt.marketPrice)}
                          </span>
                        )}
                      </button>
                      <div className="text-[10px] text-slate-500 font-medium flex items-center space-x-2 mt-0.5">
                        <span className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-700 font-bold">
                          {card.supertype}
                        </span>
                        {card.subtype && <span>{card.subtype}</span>}
                      </div>
                      {defaultPrt && (
                        <div className="text-[10px] text-indigo-700 font-bold mt-1">
                          {defaultPrt.setName} ({defaultPrt.setCode} #{defaultPrt.cardNumber}) • {defaultPrt.rarity || 'Common'}
                          {printingsCount > 1 && (
                            <span className="ml-1.5 text-indigo-500 font-normal">
                              ({printingsCount} versions)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setViewingCardModal({ card, printing: defaultPrt })}
                        className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 hover:text-indigo-700 rounded-lg border border-slate-200 transition"
                        title="View card"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectCard(card)}
                        className="text-xs text-indigo-700 hover:text-indigo-900 font-black"
                      >
                        Select →
                      </button>
                    </div>
                  </div>
                );
              })}

              {!isSearching && searchQuery.trim() && searchResults.length === 0 && !searchError && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No cards found matching "{searchQuery}".
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="bg-indigo-50 p-3.5 rounded-2xl border border-indigo-200 flex items-center space-x-3">
              <img
                src={getImageUrl(selectedPrinting, selectedCard)}
                alt={selectedCard.name}
                onError={handleImageError}
                className="w-12 h-16 object-cover rounded-md border border-indigo-200 shadow-sm flex-shrink-0 bg-white"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-indigo-950 truncate">{selectedCard.name}</div>
                <div className="text-[10px] text-indigo-700 font-medium">{selectedCard.supertype} • {selectedCard.subtype || 'Card'}</div>
                {selectedPrinting && (
                  <div className="text-[10px] text-indigo-900 font-bold mt-0.5">
                    {selectedPrinting.setName} ({selectedPrinting.setCode} #{selectedPrinting.cardNumber})
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="text-[11px] text-indigo-700 font-bold hover:underline flex-shrink-0"
              >
                Change
              </button>
            </div>

            {/* Version Selection dropdown if multiple printings exist */}
            {selectedCard.printings && selectedCard.printings.length > 1 && (
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-700">Printing / Version:</label>
                <select
                  value={selectedPrintingId}
                  onChange={(e) => {
                    setSelectedPrintingId(e.target.value);
                    const prt = selectedCard.printings.find((p: any) => p.id === e.target.value);
                    if (prt?.marketPrice) setCost(usdToZar(prt.marketPrice).toFixed(2));
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                >
                  {selectedCard.printings.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.setName} ({p.setCode} #{p.cardNumber}) - {p.rarity || 'Normal'} ({formatZarFromUsd(p.marketPrice || 1.0)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-700">Quantity:</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-700">Condition:</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="NM">Near Mint (NM)</option>
                  <option value="LP">Lightly Played (LP)</option>
                  <option value="MP">Moderately Played (MP)</option>
                  <option value="HP">Heavily Played (HP)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-700">Source:</label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-700">Cost per unit (ZAR):</label>
                <input
                  type="text"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-2xl border border-slate-200 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 text-xs font-black uppercase rounded-2xl shadow-md transition"
              >
                {loading ? 'Adding...' : 'Add to Collection'}
              </button>
            </div>
          </form>
        )}
      </div>

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
