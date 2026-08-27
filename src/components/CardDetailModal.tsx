import React, { useEffect, useMemo, useState } from 'react';
import { X, Tag, Sparkles, CircleDollarSign, Layers, Loader2, MinusCircle, PlusCircle } from 'lucide-react';
import { LogicalCard, CardPrinting } from '../types/tcg';
import { getImageUrl, handleImageError } from '../utils/imageUtils';
import { formatZarFromUsd } from '../utils/currency';
import { allocateToDeck, fetchCardDeckUsage, releaseAllocation } from '../services/api';

interface CardDetailModalProps {
  card: LogicalCard;
  printing?: CardPrinting;
  allPrintings?: CardPrinting[];
  onClose: () => void;
  onSelectPrinting?: (printing: CardPrinting) => void;
  collectionItem?: any;
  decks?: any[];
  onAllocationsChanged?: () => Promise<void> | void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  printing,
  allPrintings = [],
  onClose,
  onSelectPrinting,
  collectionItem,
  decks = [],
  onAllocationsChanged,
}) => {
  const currentPrinting = printing || (allPrintings.length > 0 ? allPrintings[0] : undefined);
  const printingsList = allPrintings.length > 0 ? allPrintings : card.printings || [];
  const [deckUsage, setDeckUsage] = useState<any | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageVersion, setUsageVersion] = useState(0);
  const [selectedRequirementId, setSelectedRequirementId] = useState('');
  const [allocationQuantity, setAllocationQuantity] = useState(1);
  const [allocationBusy, setAllocationBusy] = useState(false);
  const [allocationMessage, setAllocationMessage] = useState('');

  const eligibleRequirements = useMemo(() => decks
    .filter((deck) => deck.status === 'Active')
    .flatMap((deck) => (deck.requirements || []).map((row: any) => {
      const requirement = row.requirement || row;
      const remaining = row.ownership?.remainingNeeded
        ?? Math.max(0, Number(requirement.quantity || 0) - Number(row.ownership?.allocatedToThisDeck || 0));
      return { deck, row, requirement, remaining };
    }))
    .filter(({ requirement, remaining }) => {
      if (requirement.cardId !== card.id || remaining < 1) return false;
      if (requirement.requirementMode === 'SPECIFIC_PRINTING' && requirement.preferredPrintingId) {
        return requirement.preferredPrintingId === collectionItem?.printingId;
      }
      return true;
    }), [card.id, collectionItem?.printingId, decks]);

  const selectedRequirement = eligibleRequirements.find(({ requirement }) => requirement.id === selectedRequirementId);
  const maxAllocationQuantity = selectedRequirement && collectionItem
    ? Math.min(selectedRequirement.remaining, Number(collectionItem.availableQuantity || 0))
    : 0;

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    fetchCardDeckUsage(card.id)
      .then((result) => {
        if (!cancelled) setDeckUsage(result);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [card.id, usageVersion]);

  const refreshAfterAllocation = async (message: string) => {
    await onAllocationsChanged?.();
    setUsageVersion((version) => version + 1);
    setAllocationMessage(message);
    setSelectedRequirementId('');
    setAllocationQuantity(1);
  };

  const handleAllocate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!collectionItem || !selectedRequirement || maxAllocationQuantity < 1) return;
    setAllocationBusy(true);
    setAllocationMessage('');
    const quantity = Math.min(Math.max(1, allocationQuantity), maxAllocationQuantity);
    const result = await allocateToDeck(
      selectedRequirement.deck.id,
      selectedRequirement.requirement.id,
      collectionItem.id,
      quantity
    );
    if (result.success) {
      await refreshAfterAllocation(`Assigned ${quantity} ${quantity === 1 ? 'copy' : 'copies'} to ${selectedRequirement.deck.name}.`);
    } else {
      setAllocationMessage(result.error || 'Unable to assign that physical copy.');
    }
    setAllocationBusy(false);
  };

  const handleRelease = async (allocationId: string, quantity?: number) => {
    setAllocationBusy(true);
    setAllocationMessage('');
    const result = await releaseAllocation(allocationId, quantity);
    if (result.success) {
      await refreshAfterAllocation(quantity ? 'Released one copy.' : 'Released this deck assignment.');
    } else {
      setAllocationMessage(result.error || 'Unable to release that assignment.');
    }
    setAllocationBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white border-4 border-indigo-900 rounded-[32px] max-w-2xl w-full p-6 space-y-6 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] px-2.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-lg font-black uppercase tracking-wider">
                {card.supertype} • {card.subtype || 'Standard'}
              </span>
              {currentPrinting && (
                <span className="text-[10px] px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-lg font-bold">
                  {currentPrinting.rarity}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black italic uppercase text-slate-900 pt-1">{card.name}</h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition font-black"
          >
            <X className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Card Image Display */}
          <div className="flex flex-col items-center justify-center bg-slate-900 p-6 rounded-3xl border-2 border-slate-800 shadow-inner space-y-3">
            <img
              src={getImageUrl(currentPrinting, card)}
              alt={card.name}
              onError={handleImageError}
              className="w-56 h-80 object-cover rounded-2xl shadow-2xl border border-slate-700 hover:scale-105 transition-transform duration-200 bg-slate-800"
              referrerPolicy="no-referrer"
            />

            {currentPrinting && (
              <div className="text-center space-y-0.5">
                <div className="text-xs font-bold text-slate-300">
                  {currentPrinting.setName} ({currentPrinting.setCode} #{currentPrinting.cardNumber})
                </div>
                <div className="text-sm font-black text-amber-400 flex items-center justify-center space-x-1">
                  <CircleDollarSign className="w-4 h-4 stroke-[2.5]" />
                  <span>Est. Market: {formatZarFromUsd(currentPrinting.marketPrice || 1.0)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Details & Printings Selector */}
          <div className="space-y-5">
            {/* Metadata Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center space-x-1.5">
                <Tag className="w-4 h-4 text-indigo-700 stroke-[2.5]" />
                <span>Card Attributes</span>
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Supertype</span>
                  <span className="font-bold text-slate-900">{card.supertype}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Subtype</span>
                  <span className="font-bold text-slate-900">{card.subtype || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Expansion Set</span>
                  <span className="font-bold text-indigo-700">{currentPrinting?.setName || 'Standard Set'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Set Code / Number</span>
                  <span className="font-bold text-slate-900">
                    {currentPrinting?.setCode} #{currentPrinting?.cardNumber}
                  </span>
                </div>
              </div>
            </div>

            {collectionItem && onAllocationsChanged && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3">
                <h3 className="text-xs font-black uppercase text-indigo-950 tracking-wider flex items-center space-x-1.5">
                  <Layers className="w-4 h-4 text-indigo-700 stroke-[2.5]" />
                  <span>Manage this physical printing</span>
                </h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white border border-indigo-100 rounded-xl py-2"><div className="text-[9px] font-black uppercase text-slate-400">Owned</div><div className="text-sm font-black">{collectionItem.quantity}</div></div>
                  <div className="bg-white border border-indigo-100 rounded-xl py-2"><div className="text-[9px] font-black uppercase text-slate-400">Assigned</div><div className="text-sm font-black text-indigo-700">{collectionItem.allocatedQuantity || 0}</div></div>
                  <div className="bg-white border border-indigo-100 rounded-xl py-2"><div className="text-[9px] font-black uppercase text-slate-400">Unassigned</div><div className="text-sm font-black text-emerald-700">{collectionItem.availableQuantity || 0}</div></div>
                </div>

                {(collectionItem.allocatedDetails || []).length > 0 && (
                  <div className="space-y-1.5">
                    {(collectionItem.allocatedDetails || []).map((allocation: any) => (
                      <div key={allocation.allocationId} className="bg-white border border-indigo-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                        <div><div className="font-black text-slate-900">{allocation.deckName}</div><div className="text-[9px] font-bold text-slate-500">{allocation.allocatedQuantity} assigned</div></div>
                        <div className="flex gap-1">
                          {allocation.allocatedQuantity > 1 && (
                            <button disabled={allocationBusy} onClick={() => handleRelease(allocation.allocationId, 1)} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-black text-slate-700 disabled:opacity-40">Release 1</button>
                          )}
                          <button disabled={allocationBusy} onClick={() => handleRelease(allocation.allocationId)} className="inline-flex items-center gap-1 px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-black disabled:opacity-40"><MinusCircle className="w-3 h-3" /> Release all</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleAllocate} className="space-y-2 border-t border-indigo-200 pt-3">
                  <div className="text-[10px] font-black uppercase text-indigo-900 flex items-center gap-1"><PlusCircle className="w-3.5 h-3.5" /> Assign unassigned copies</div>
                  <select value={selectedRequirementId} onChange={(event) => { setSelectedRequirementId(event.target.value); setAllocationQuantity(1); }} disabled={Number(collectionItem.availableQuantity || 0) < 1 || allocationBusy} className="w-full bg-white border border-indigo-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-900 disabled:opacity-50">
                    <option value="">{eligibleRequirements.length > 0 ? 'Choose a deck requirement...' : 'No compatible unfilled deck requirements'}</option>
                    {eligibleRequirements.map(({ deck, requirement, remaining }) => <option key={requirement.id} value={requirement.id}>{deck.name} · {remaining} still needed</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="number" min={1} max={Math.max(1, maxAllocationQuantity)} value={Math.min(allocationQuantity, Math.max(1, maxAllocationQuantity))} onChange={(event) => setAllocationQuantity(Math.max(1, Number(event.target.value) || 1))} disabled={maxAllocationQuantity < 1 || allocationBusy} className="w-20 bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" />
                    <button type="submit" disabled={maxAllocationQuantity < 1 || allocationBusy} className="flex-1 inline-flex items-center justify-center gap-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-xl text-[11px] font-black uppercase disabled:opacity-40">
                      {allocationBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Assign to deck
                    </button>
                  </div>
                </form>
                {allocationMessage && <div className="text-[10px] font-bold text-indigo-900 bg-white border border-indigo-100 rounded-xl p-2.5">{allocationMessage}</div>}
              </div>
            )}

            {/* Deck usage and physical assignment summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-indigo-700 stroke-[2.5]" />
                <span>Deck Usage</span>
              </h3>

              {usageLoading ? (
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Checking deck assignments...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white border border-slate-200 rounded-xl py-2">
                      <div className="text-[9px] font-black uppercase text-slate-400">Owned</div>
                      <div className="text-sm font-black text-slate-900">{deckUsage?.totalOwned || 0}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl py-2">
                      <div className="text-[9px] font-black uppercase text-slate-400">In Use</div>
                      <div className="text-sm font-black text-indigo-700">{deckUsage?.totalAllocated || 0}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl py-2">
                      <div className="text-[9px] font-black uppercase text-slate-400">Free</div>
                      <div className="text-sm font-black text-emerald-700">{deckUsage?.availableQuantity || 0}</div>
                    </div>
                  </div>

                  {deckUsage?.deckUsage?.length > 0 ? (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {deckUsage.deckUsage.map((usage: any) => (
                        <div key={usage.deckId} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px]">
                          <div className="min-w-0">
                            <div className="font-black text-slate-900 truncate">{usage.deckName}</div>
                            <div className="text-[9px] font-bold text-slate-500">{usage.deckVersion} • {usage.deckStatus}</div>
                          </div>
                          <div className="font-black text-indigo-700 whitespace-nowrap">
                            {usage.allocatedQuantity}/{usage.requiredQuantity} assigned
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 font-medium">Not used by any deck.</div>
                  )}
                </>
              )}
            </div>

            {/* Printings Variation Switcher */}
            {printingsList.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-yellow-500 stroke-[2.5]" />
                  <span>Available Printings / Sets ({printingsList.length})</span>
                </h3>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {printingsList.map((prt) => {
                    const isSelected = currentPrinting?.id === prt.id;
                    return (
                      <div
                        key={prt.id}
                        onClick={() => onSelectPrinting && onSelectPrinting(prt)}
                        className={`p-3 rounded-2xl border transition cursor-pointer flex justify-between items-center text-xs ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {prt.setName} ({prt.setCode} #{prt.cardNumber})
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            {prt.rarity} • {prt.variant || 'Normal'}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-black text-slate-900">{formatZarFromUsd(prt.marketPrice || 1.0)}</div>
                          {onSelectPrinting && isSelected && (
                            <span className="text-[10px] text-indigo-700 font-black uppercase">Active ✓</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white font-black uppercase text-xs rounded-2xl shadow-md transition"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
