import React, { useState, useEffect } from 'react';
import {
  Compass,
  CheckCircle2,
  Store,
  Plus,
  Settings,
  Check,
  PackageCheck,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { fetchBulkHuntChecklist, recordAcquisition, fetchStoreProfiles } from '../../services/api';
import { getImageUrl, handleImageError } from '../../utils/imageUtils';

import { StoreProfileModal } from './StoreProfileModal';

interface BulkHunterViewProps {
  decks: any[];
  allCards?: any[];
  initialDeckId?: string;
  onRefreshCollection: () => void;
}

export const BulkHunterView: React.FC<BulkHunterViewProps> = ({
  decks,
  allCards = [],
  initialDeckId,
  onRefreshCollection,
}) => {
  const [storeProfiles, setStoreProfiles] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [selectedDeckId, setSelectedDeckId] = useState<string>(initialDeckId || 'ALL');
  const [checklistData, setChecklistData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);

  useEffect(() => {
    if (initialDeckId) {
      setSelectedDeckId(initialDeckId);
    }
  }, [initialDeckId]);

  // Found counts state: cardId -> count
  const [foundCounts, setFoundCounts] = useState<Record<string, number>>({});
  const [acquiredSuccessMsg, setAcquiredSuccessMsg] = useState<string | null>(null);

  const refreshStoreProfiles = () => {
    fetchStoreProfiles().then((spList) => {
      setStoreProfiles(spList);
      if (spList.length > 0 && !selectedStoreId) {
        setSelectedStoreId(spList[0].id);
      }
    });
  };

  useEffect(() => {
    refreshStoreProfiles();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      setLoading(true);
      fetchBulkHuntChecklist(selectedDeckId, selectedStoreId)
        .then((res) => {
          setChecklistData(res);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Bulk hunt checklist error:', err);
          setLoading(false);
        });
    }
  }, [selectedStoreId, selectedDeckId]);

  const handleIncrementFound = (cardId: string, maxNeed: number) => {
    setFoundCounts((prev) => {
      const current = prev[cardId] || 0;
      const next = current < maxNeed ? current + 1 : 0; // Tapping cycles: 0 -> 1 -> 2 -> max -> 0
      return { ...prev, [cardId]: next };
    });
  };

  const handleAcquireAllFound = async () => {
    if (!checklistData) return;

    let totalAcquiredCount = 0;
    for (const group of checklistData.groupedList || []) {
      for (const item of group.items) {
        const found = foundCounts[item.cardId] || 0;
        if (found > 0) {
          await recordAcquisition({
            cardId: item.cardId,
            printingId: item.printing?.id,
            quantity: found,
            source: checklistData.storeProfile?.name || 'Local Game Store',
            method: 'Bulk',
            costPerUnit: 0.25,
            deckIdToAllocate: selectedDeckId !== 'ALL' ? selectedDeckId : undefined,
          });
          totalAcquiredCount += found;
        }
      }
    }

    if (totalAcquiredCount > 0) {
      setAcquiredSuccessMsg(`Successfully added ${totalAcquiredCount} bulk cards into collection and updated deck allocations!`);
      setFoundCounts({});
      onRefreshCollection();
      setTimeout(() => setAcquiredSuccessMsg(null), 4000);

      // Refresh checklist
      const updated = await fetchBulkHuntChecklist(selectedDeckId, selectedStoreId);
      setChecklistData(updated);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-yellow-400 text-indigo-950 rounded-full text-[11px] font-black uppercase">
            <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Mobile-First Bulk Hunting Mode</span>
          </div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white">Local Store Bulk Hunter</h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            Checklist ordered strictly by your local card store's physical box layout.
          </p>
        </div>

        {/* Store & Deck Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1">
            <Store className="w-4 h-4 text-yellow-400 stroke-[2.5]" />
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-white border border-indigo-200 text-xs font-bold text-slate-900 rounded-2xl px-3.5 py-2 focus:outline-none shadow-sm"
            >
              {storeProfiles.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowStoreModal(true)}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition border border-indigo-400"
              title="Configure Store Layout & Overrides"
            >
              <Settings className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          <select
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
            className="bg-white border border-indigo-200 text-xs font-bold text-slate-900 rounded-2xl px-3.5 py-2 focus:outline-none shadow-sm"
          >
            <option value="ALL">All Missing Deck Cards</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.version})
              </option>
            ))}
          </select>
        </div>
      </div>

      {acquiredSuccessMsg && (
        <div className="bg-emerald-100 border border-emerald-300 p-4 rounded-2xl text-emerald-900 text-xs font-bold flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
          <span>{acquiredSuccessMsg}</span>
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-xs text-slate-400 font-bold animate-pulse">
          Sorting missing cards by store physical box locations...
        </div>
      )}

      {!loading && checklistData && (
        <div className="space-y-6">
          {/* Action Header */}
          <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-600 font-medium">
              Tap any card row as you search bulk boxes to increment found count.
            </div>

            <button
              onClick={handleAcquireAllFound}
              disabled={(Object.values(foundCounts) as number[]).reduce((a: number, b: number) => a + b, 0) === 0}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black uppercase rounded-2xl shadow-md transition"
            >
              <PackageCheck className="w-4 h-4 stroke-[2.5]" />
              <span>
                Acquire Found ({(Object.values(foundCounts) as number[]).reduce((a: number, b: number) => a + b, 0)}) into Collection
              </span>
            </button>
          </div>

          {/* Grouped Box Categories */}
          <div className="space-y-6">
            {checklistData.groupedList?.map((group: any, gIdx: number) => (
              <div key={gIdx} className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                {/* Category Header */}
                <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-700" />
                    <h2 className="font-black italic uppercase text-sm text-slate-900">{group.categoryName}</h2>
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-xs">
                    {group.items.length} cards needed
                  </span>
                </div>

                {/* Items List */}
                <div className="divide-y divide-slate-100">
                  {group.items.map((item: any) => {
                    const found = foundCounts[item.cardId] || 0;
                    const isFullyFound = found >= item.needQty;

                    return (
                      <div
                        key={item.cardId}
                        onClick={() => handleIncrementFound(item.cardId, item.needQty)}
                        className={`p-4 flex items-center justify-between gap-4 cursor-pointer select-none transition ${
                          isFullyFound ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={getImageUrl(item.printing, { name: item.cardName })}
                            alt={item.cardName}
                            onError={handleImageError}
                            className="w-10 h-14 object-cover rounded-md border border-slate-200 shadow-xs flex-shrink-0 bg-slate-100"
                            referrerPolicy="no-referrer"
                          />
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm text-slate-900">{item.cardName}</span>
                              <span className="text-[10px] px-2.5 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200">
                                {item.supertype}
                              </span>
                            </div>

                            <div className="text-xs text-slate-500 font-medium">
                              {item.printing ? `${item.printing.setName} (${item.printing.setCode} #${item.printing.cardNumber})` : 'Any Printing'}
                            </div>
                          </div>
                        </div>

                        {/* Interactive Tap Counter & Quick Fill */}
                        <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setFoundCounts((prev) => ({
                                ...prev,
                                [item.cardId]: isFullyFound ? 0 : item.needQty,
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase transition ${
                              isFullyFound
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 hover:bg-yellow-400 text-slate-700 hover:text-indigo-950 border border-slate-200'
                            }`}
                          >
                            {isFullyFound ? 'Found All' : `Fill All (${item.needQty})`}
                          </button>

                          <div
                            onClick={() => handleIncrementFound(item.cardId, item.needQty)}
                            className={`px-3.5 py-2 rounded-2xl text-xs font-black transition flex items-center space-x-1.5 cursor-pointer ${
                              isFullyFound
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : found > 0
                                ? 'bg-yellow-400 text-indigo-950 shadow-xs'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {isFullyFound ? (
                              <>
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>{found}/{item.needQty}</span>
                              </>
                            ) : (
                              <span>
                                {found}/{item.needQty}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {checklistData.groupedList?.length === 0 && (
              <div className="bg-white border border-slate-200 p-8 rounded-3xl text-center space-y-2 shadow-sm">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h3 className="font-black italic uppercase text-slate-900 text-base">Zero Missing Cards!</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Your physical collection fully satisfies all requirements for this deck.
                </p>
              </div>
            )}
          </div>

          {/* Sticky Mobile Bottom Bar when cards are found */}
          {(Object.values(foundCounts) as number[]).reduce((a: number, b: number) => a + b, 0) > 0 && (
            <div className="fixed bottom-4 left-4 right-4 z-40 bg-indigo-950 text-white p-4 rounded-3xl shadow-2xl border-2 border-indigo-700 flex items-center justify-between gap-4 max-w-2xl mx-auto backdrop-blur-md">
              <div>
                <div className="text-xs font-black uppercase text-yellow-400">Cards Selected in Bulk</div>
                <div className="text-sm font-bold text-white">
                  {Object.values(foundCounts).reduce((a: number, b: number) => a + b, 0)} cards ready to acquire
                </div>
              </div>

              <button
                onClick={handleAcquireAllFound}
                className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition flex items-center space-x-2"
              >
                <PackageCheck className="w-4 h-4 stroke-[2.5]" />
                <span>Acquire All Now</span>
              </button>
            </div>
          )}
        </div>
      )}

      {showStoreModal && checklistData?.storeProfile && (
        <StoreProfileModal
          storeProfile={checklistData.storeProfile}
          allCards={allCards}
          onClose={() => setShowStoreModal(false)}
          onSaveSuccess={() => {
            refreshStoreProfiles();
            if (selectedStoreId) {
              fetchBulkHuntChecklist(selectedDeckId, selectedStoreId).then((res) => setChecklistData(res));
            }
          }}
        />
      )}
    </div>
  );
};
