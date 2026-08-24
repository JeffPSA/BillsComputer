import React, { useState, useEffect } from 'react';
import {
  PackageCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
  Box,
  Printer
} from 'lucide-react';
import { getAssemblePickList } from '../../services/api';
import { getImageUrl, handleImageError } from '../../utils/imageUtils';
import { CardDetailModal } from '../CardDetailModal';

interface AssembleDeckViewProps {
  decks: any[];
  selectedDeckId: string | null;
  onSelectDeck: (deckId: string) => void;
}

export const AssembleDeckView: React.FC<AssembleDeckViewProps> = ({
  decks,
  selectedDeckId,
  onSelectDeck,
}) => {
  const [pickData, setPickData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [viewingCardModal, setViewingCardModal] = useState<{ card: any; printing?: any } | null>(null);

  const activeDecks = decks.filter((d) => d.status === 'Active');
  const currentDeckId = selectedDeckId || activeDecks[0]?.id || decks[0]?.id;

  useEffect(() => {
    if (currentDeckId) {
      setLoading(true);
      getAssemblePickList(currentDeckId)
        .then((res) => {
          setPickData(res);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Assemble error:', err);
          setLoading(false);
        });
    }
  }, [currentDeckId]);

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openCardDetail = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setViewingCardModal({ card: item.card, printing: item.printing });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <PackageCheck className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Tournament Physical Deck Assembly Pick-List</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            Tells you exactly which physical cards to pull from binders/boxes and alerts you if cards must be retrieved from another deck box.
          </p>
        </div>

        {/* Deck Selector Dropdown */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-indigo-100">Target Deck:</span>
          <select
            value={currentDeckId || ''}
            onChange={(e) => onSelectDeck(e.target.value)}
            className="bg-white border border-indigo-200 text-xs font-bold text-slate-900 rounded-2xl px-3.5 py-2 focus:outline-none shadow-sm"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.version})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center text-xs text-slate-400 font-bold animate-pulse">
          Generating physical pick list & location mapping...
        </div>
      )}

      {!loading && pickData && (
        <div className="space-y-6">
          {/* Deck Overview Status */}
          <div className="bg-white border border-slate-200 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div>
              <div className="text-xs font-black uppercase text-indigo-700">
                {pickData.deck?.format} • {pickData.deck?.version}
              </div>
              <h2 className="text-xl font-black italic uppercase text-slate-900">{pickData.deck?.name}</h2>
            </div>

            <button
              onClick={() => window.print()}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl border border-slate-200 transition"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>Print Physical Checklist</span>
            </button>
          </div>

          {/* Physical Pick List Table */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-100 border-b border-slate-200 font-black italic uppercase text-sm text-slate-900 flex justify-between items-center">
              <span>Card Pull Instructions</span>
              <span className="text-xs font-bold px-3 py-1 bg-yellow-400 text-indigo-950 rounded-full">
                {Object.values(checkedItems).filter(Boolean).length} / {pickData.pickList?.length || 0} Pulled
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {pickData.pickList?.map((item: any, idx: number) => {
                const isDone = checkedItems[item.card.id];

                return (
                  <div
                    key={idx}
                    onClick={() => toggleCheck(item.card.id)}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition ${
                      isDone ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={Boolean(isDone)}
                        onChange={() => toggleCheck(item.card.id)}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                      />

                      <button
                        onClick={(e) => openCardDetail(item, e)}
                        className="flex-shrink-0"
                        title="Open card detail"
                      >
                        <img
                          src={getImageUrl(item.printing, item.card)}
                          alt={item.card?.name}
                          onError={handleImageError}
                          className="w-10 h-14 object-cover rounded-md border border-slate-200 shadow-xs hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                      </button>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => openCardDetail(item, e)}
                            className={`font-bold text-sm text-left transition ${isDone ? 'line-through text-slate-400' : 'text-slate-900 hover:text-indigo-700'}`}
                          >
                            {item.requiredQty}x {item.card?.name}
                          </button>
                          <span className="text-[10px] px-2.5 py-0.5 bg-indigo-50 text-indigo-800 rounded-lg font-bold border border-indigo-100">
                            Box: {item.bulkCategory}
                          </span>
                        </div>

                        {/* Physical Print & Location Info */}
                        <div className="text-xs text-slate-500 font-medium space-y-0.5">
                          {item.printing && (
                            <div>
                              Printing:{' '}
                              <span className="text-slate-800 font-bold">
                                {item.printing.setName} ({item.printing.setCode} #{item.printing.cardNumber})
                              </span>
                            </div>
                          )}

                          {/* Transfer Alert Warnings if allocated elsewhere */}
                          {item.transferAlerts?.map((alert: any, aIdx: number) => (
                            <div key={aIdx} className="text-rose-600 font-bold flex items-center space-x-1 pt-0.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>
                                Retrieve {alert.count} copies currently allocated to deck: "{alert.fromDeckName}"
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-1.5 text-[10px] font-black">
                      <span className={`px-2.5 py-1 rounded-full border ${item.allocatedQty >= item.requiredQty ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-amber-100 border-amber-300 text-amber-900'}`}>
                        Assigned here: {item.allocatedQty}/{item.requiredQty}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
                        Free: {item.freeQty || 0}
                      </span>
                      {(item.allocatedElsewhereQty || 0) > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-100 border border-rose-300 text-rose-800">
                          In other decks: {item.allocatedElsewhereQty}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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
