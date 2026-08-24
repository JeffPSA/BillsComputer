import React, { useMemo, useState } from 'react';
import {
  Share2,
  AlertTriangle,
  RefreshCw,
  Power,
  Info,
  ArrowRightLeft,
  PlusCircle,
  MinusCircle
} from 'lucide-react';
import { allocateToDeck, moveAllocation, releaseAllocation } from '../../services/api';

interface AllocationsDashboardProps {
  decks: any[];
  collection: any[];
  onAutoAllocateAll: () => void;
  onToggleDeckStatus: (deckId: string, newStatus: string) => void;
  onRefreshAllData?: () => void;
}

export const AllocationsDashboard: React.FC<AllocationsDashboardProps> = ({
  decks,
  collection,
  onAutoAllocateAll,
  onToggleDeckStatus,
  onRefreshAllData,
}) => {
  const activeDecks = decks.filter((d) => d.status === 'Active');

  // Transfer state
  const [sourceDeckId, setSourceDeckId] = useState<string>('');
  const [targetDeckId, setTargetDeckId] = useState<string>('');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [transferQty, setTransferQty] = useState<number>(1);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);

  // Manual allocate state
  const [allocDeckId, setAllocDeckId] = useState<string>('');
  const [allocReqId, setAllocReqId] = useState<string>('');
  const [allocCollectionItemId, setAllocCollectionItemId] = useState<string>('');
  const [allocQty, setAllocQty] = useState<number>(1);

  const allocDeck = activeDecks.find((d) => d.id === allocDeckId);
  const allocRequirements = useMemo(() => {
    if (!allocDeck?.requirements) return [];
    return allocDeck.requirements
      .map((row: any) => {
        const requirement = row.requirement || row;
        const allocatedHere = row.ownership?.allocatedToThisDeck || 0;
        return {
          ...requirement,
          card: row.card,
          remainingNeeded: row.ownership?.remainingNeeded ?? Math.max(0, requirement.quantity - allocatedHere),
        };
      })
      .filter((requirement: any) => requirement?.id && requirement.remainingNeeded > 0);
  }, [allocDeck]);

  const matchingCollectionItems = useMemo(() => {
    const req = allocRequirements.find((r: any) => r.id === allocReqId);
    if (!req) return [];
    return collection.filter((ci) => {
      if (ci.cardId !== req.cardId) return false;
      if (req.requirementMode === 'SPECIFIC_PRINTING' && req.preferredPrintingId) {
        return ci.printingId === req.preferredPrintingId && (ci.availableQuantity ?? ci.quantity) > 0;
      }
      return (ci.availableQuantity ?? ci.quantity) > 0;
    });
  }, [allocReqId, allocRequirements, collection]);

  const selectedAllocRequirement = allocRequirements.find((requirement: any) => requirement.id === allocReqId);
  const selectedCollectionItem = matchingCollectionItems.find((item) => item.id === allocCollectionItemId);
  const maxAssignableQuantity = selectedAllocRequirement && selectedCollectionItem
    ? Math.min(
        selectedAllocRequirement.remainingNeeded,
        selectedCollectionItem.availableQuantity ?? selectedCollectionItem.quantity
      )
    : 0;

  // Find cards allocated across 2+ decks, plus any allocated cards for release UI
  const sharedAllocatedItems = collection.filter(
    (item) => item.allocatedDetails && item.allocatedDetails.length > 1
  );
  const anyAllocatedItems = collection.filter(
    (item) => item.allocatedDetails && item.allocatedDetails.length > 0
  );

  const showMsg = (msg: string, isError = false) => {
    setTransferMsg(isError ? `Error: ${msg}` : msg);
    setTimeout(() => setTransferMsg(null), 4000);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceDeckId || !targetDeckId || !selectedCardId || sourceDeckId === targetDeckId) return;

    const res = await moveAllocation(sourceDeckId, targetDeckId, selectedCardId, transferQty);
    if (res.success) {
      showMsg(`Successfully transferred ${res.moved} physical allocation copy(s)!`);
      if (onRefreshAllData) onRefreshAllData();
    } else {
      showMsg(res.error || 'Transfer failed', true);
    }
  };

  const handleManualAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocDeckId || !allocReqId || !allocCollectionItemId || maxAssignableQuantity < 1) {
      showMsg('No physical copies are currently assignable for that selection.', true);
      return;
    }

    const quantityToAllocate = Math.min(allocQty, maxAssignableQuantity);
    const res = await allocateToDeck(allocDeckId, allocReqId, allocCollectionItemId, quantityToAllocate);
    if (res.success) {
      showMsg(`Allocated ${quantityToAllocate} copy(s) to deck.`);
      if (onRefreshAllData) onRefreshAllData();
    } else {
      showMsg(res.error || 'Allocate failed', true);
    }
  };

  const handleRelease = async (allocationId: string, quantity?: number) => {
    const res = await releaseAllocation(allocationId, quantity);
    if (res.success) {
      showMsg(quantity ? `Released ${quantity} copy(s).` : 'Released allocation.');
      if (onRefreshAllData) onRefreshAllData();
    } else {
      showMsg(res.error || 'Release failed', true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <Share2 className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Card Allocation Engine</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            Physical copies are assigned to active decks. Deactivating a deck automatically releases physical cards back to available inventory.
          </p>
        </div>

        <button
          onClick={onAutoAllocateAll}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black uppercase text-xs rounded-2xl shadow-md transition"
        >
          <RefreshCw className="w-4 h-4 stroke-[2.5]" />
          <span>Recalculate All Allocations</span>
        </button>
      </div>

      {/* Info Notice Box */}
      <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl flex items-start space-x-3 text-xs text-indigo-950 font-medium shadow-sm">
        <Info className="w-5 h-5 text-indigo-700 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-indigo-900">Explicit Physical Allocation Rule:</span> If you own 6 copies of Ultra Ball and Mega Darkrai requires 4 while Mega Lucario requires 4, the engine allocates 4 to Darkrai and 2 to Lucario. It reports Lucario missing 2 copies, preventing false reporting that both decks are fully owned independently.
        </div>
      </div>

      {/* Shared Staples Conflict Section */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900">
              Shared Cards Currently Allocated Across Multiple Decks
            </h2>
          </div>
        </div>

        {transferMsg && (
          <div
            className={`${
              transferMsg.startsWith('Error:')
                ? 'bg-rose-100 text-rose-900 border-rose-300'
                : 'bg-emerald-100 text-emerald-900 border-emerald-300'
            } border p-3 rounded-2xl text-xs font-bold`}
          >
            {transferMsg}
          </div>
        )}

        {/* Manual Allocate Form */}
        <form onSubmit={handleManualAllocate} className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl space-y-3">
          <div className="flex items-center space-x-2 text-xs font-black uppercase text-emerald-950">
            <PlusCircle className="w-4 h-4 text-emerald-700 stroke-[2.5]" />
            <span>Manual Allocate</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <select
              value={allocDeckId}
              onChange={(e) => {
                setAllocDeckId(e.target.value);
                setAllocReqId('');
                setAllocCollectionItemId('');
                setAllocQty(1);
              }}
              className="bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
            >
              <option value="">Deck...</option>
              {activeDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={allocReqId}
              onChange={(e) => {
                setAllocReqId(e.target.value);
                setAllocCollectionItemId('');
                setAllocQty(1);
              }}
              className="bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
              disabled={!allocDeckId}
            >
              <option value="">{allocRequirements.length > 0 ? 'Requirement...' : 'No unfilled requirements'}</option>
              {allocRequirements.map((r: any) => {
                const cardName = r.card?.name || r.cardId;
                return (
                  <option key={r.id} value={r.id}>
                    {cardName} ({r.remainingNeeded} remaining)
                  </option>
                );
              })}
            </select>

            <select
              value={allocCollectionItemId}
              onChange={(e) => {
                setAllocCollectionItemId(e.target.value);
                setAllocQty(1);
              }}
              className="bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
              disabled={!allocReqId}
            >
              <option value="">{matchingCollectionItems.length > 0 ? 'Assignable copy...' : 'No free matching copies'}</option>
              {matchingCollectionItems.map((ci) => (
                <option key={ci.id} value={ci.id}>
                  {ci.card?.name || ci.cardId} (avail {ci.availableQuantity ?? ci.quantity})
                </option>
              ))}
            </select>

            <input
              type="number"
              min={1}
              max={Math.max(1, maxAssignableQuantity)}
              value={Math.min(allocQty, Math.max(1, maxAssignableQuantity))}
              onChange={(e) => setAllocQty(Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, maxAssignableQuantity)))}
              disabled={maxAssignableQuantity < 1}
              className="bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
            />

            <button
              type="submit"
              disabled={!allocDeckId || !allocReqId || !allocCollectionItemId || maxAssignableQuantity < 1}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-black uppercase text-xs rounded-xl py-2 transition shadow-xs"
            >
              Allocate
            </button>
          </div>
        </form>

        {/* Transfer Allocation Quick Form */}
        <form onSubmit={handleTransfer} className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl space-y-3">
          <div className="flex items-center space-x-2 text-xs font-black uppercase text-indigo-950">
            <ArrowRightLeft className="w-4 h-4 text-indigo-700 stroke-[2.5]" />
            <span>Move Physical Card Allocation Between Active Decks</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <select
              value={sourceDeckId}
              onChange={(e) => setSourceDeckId(e.target.value)}
              className="bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
            >
              <option value="">Source Deck...</option>
              {activeDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={targetDeckId}
              onChange={(e) => setTargetDeckId(e.target.value)}
              className="bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
            >
              <option value="">Target Deck...</option>
              {activeDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={selectedCardId}
              onChange={(e) => setSelectedCardId(e.target.value)}
              className="bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
            >
              <option value="">Card to Transfer...</option>
              {collection.map((ci) => (
                <option key={ci.id} value={ci.cardId}>
                  {ci.card?.name} ({ci.quantity} owned)
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={!sourceDeckId || !targetDeckId || !selectedCardId || sourceDeckId === targetDeckId}
              className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-indigo-950 font-black uppercase text-xs rounded-xl py-2 transition shadow-xs"
            >
              Transfer Allocation
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(sharedAllocatedItems.length > 0 ? sharedAllocatedItems : anyAllocatedItems).map((item) => (
            <div key={item.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-indigo-950">{item.card?.name}</span>
                <span className="text-xs font-bold text-slate-500">
                  Owned: {item.quantity} | Avail: {item.availableQuantity}
                </span>
              </div>

              <div className="space-y-1 pt-2 border-t border-slate-200 font-medium">
                {item.allocatedDetails.map((a: any, idx: number) => (
                  <div key={a.allocationId || idx} className="flex justify-between items-center text-xs text-slate-700 gap-2">
                    <span>• {a.deckName}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-indigo-700 font-bold">{a.allocatedQuantity} physical copies</span>
                      {a.allocationId && (
                        <button
                          type="button"
                          onClick={() => handleRelease(a.allocationId)}
                          className="allocation-danger-action inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-black transition"
                          title="Release all copies of this allocation"
                        >
                          <MinusCircle className="w-3 h-3" />
                          Release
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {anyAllocatedItems.length === 0 && (
            <div className="col-span-2 text-xs text-slate-400 italic py-6 text-center">
              No physical cards are currently allocated to active decks.
            </div>
          )}
        </div>
      </div>

      {/* Active Decks & Allocation Toggles */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
        <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900 border-b border-slate-100 pb-3">
          Active vs Inactive Decks Allocation Toggles
        </h2>

        <div className="space-y-3">
          {decks.map((deck) => {
            const isActive = deck.status === 'Active';

            return (
              <div
                key={deck.id}
                className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between hover:border-indigo-300 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-sm text-slate-900">{deck.name}</span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-200 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {deck.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    Allocated Physical Cards: <span className="text-slate-900 font-bold">{deck.totalAllocatedCards}</span> / {deck.totalRequiredCards} required
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onToggleDeckStatus(deck.id, isActive ? 'Inactive' : 'Active')}
                    className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                      isActive
                        ? 'allocation-danger-action'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{isActive ? 'Deactivate (Release Cards)' : 'Activate Deck'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
