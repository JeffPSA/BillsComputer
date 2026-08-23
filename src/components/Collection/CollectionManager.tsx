import React, { useState } from 'react';
import {
  Box,
  Plus,
  Minus,
  Search,
  Filter,
  DollarSign,
  Share2,
  Trash2,
  Edit,
  Tag,
  Check,
  Eye
  , Grid3X3
  , List
  , ZoomIn
  , ZoomOut
} from 'lucide-react';
import { Condition } from '../../types/tcg';
import { CardDetailModal } from '../CardDetailModal';
import { searchCards } from '../../services/cardSearch';
import { getImageUrl, handleImageError } from '../../utils/imageUtils';
import { formatZarFromUsd } from '../../utils/currency';

interface CollectionManagerProps {
  collection: any[];
  allCards: any[];
  onUpdateItem: (item: any) => void;
  onOpenQuickAdd: () => void;
}

export const CollectionManager: React.FC<CollectionManagerProps> = ({
  collection,
  allCards,
  onUpdateItem,
  onOpenQuickAdd,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [supertypeFilter, setSupertypeFilter] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [cardZoom, setCardZoom] = useState<0 | 1 | 2>(1);
  const [viewingCardModal, setViewingCardModal] = useState<{ card: any; printing?: any } | null>(null);

  // Metrics
  const totalOwnedCount = collection.reduce((sum, item) => sum + item.quantity, 0);
  const totalAvailableCount = collection.reduce((sum, item) => sum + item.availableQuantity, 0);
  const totalAllocatedCount = collection.reduce((sum, item) => sum + item.allocatedQuantity, 0);
  const totalEstimatedValue = collection.reduce(
    (sum, item) => sum + (item.printing?.marketPrice || 0) * item.quantity,
    0
  );

  // Filter items using searchCards logic
  const filteredCollection = collection.filter((item) => {
    if (!item.card) return false;
    
    // Test search match on card & printing
    const matchesSearch = searchQuery
      ? searchCards([item.card], searchQuery, { supertype: supertypeFilter }).length > 0
      : supertypeFilter === 'ALL' || item.card.supertype === supertypeFilter;

    let matchesAvail = true;
    if (availabilityFilter === 'AVAILABLE_ONLY') matchesAvail = item.availableQuantity > 0;
    if (availabilityFilter === 'ALLOCATED_ONLY') matchesAvail = item.allocatedQuantity > 0;

    return matchesSearch && matchesAvail;
  });

  const gridImageClasses = [
    'h-52',
    'h-64',
    'h-80',
  ][cardZoom];

  const gridColumnsClass = [
    'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  ][cardZoom];

  const decreaseItemQuantity = (item: any) => {
    const newQuantity = item.quantity - 1;
    if (newQuantity < item.allocatedQuantity) {
      alert(`Cannot decrease below ${item.allocatedQuantity} allocated copies. Release allocations first.`);
      return;
    }
    onUpdateItem({
      id: item.id,
      cardId: item.cardId || item.card?.id,
      printingId: item.printingId || item.printing?.id,
      quantity: Math.max(0, newQuantity),
    });
  };

  const increaseItemQuantity = (item: any) => {
    onUpdateItem({
      id: item.id,
      cardId: item.cardId || item.card?.id,
      printingId: item.printingId || item.printing?.id,
      quantity: item.quantity + 1,
    });
  };

  const deleteItem = (item: any) => {
    if (item.allocatedQuantity > 0) {
      const deckNames = item.allocatedDetails?.map((a: any) => a.deckName).join(', ') || 'decks';
      alert(`This card is currently allocated to ${deckNames} and cannot be removed until released.`);
      return;
    }
    if (window.confirm(`Delete ${item.card?.name || 'this card'} from collection?`)) {
      onUpdateItem({
        id: item.id,
        cardId: item.cardId || item.card?.id,
        quantity: 0,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <Box className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Physical Collection Inventory</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            The collection is the single source of truth for all decks, allocations, and bulk hunting.
          </p>
        </div>

        <button
          onClick={onOpenQuickAdd}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black uppercase text-xs rounded-2xl shadow-md transition"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Physical Cards</span>
        </button>
      </div>

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">TOTAL PHYSICAL COPIES</div>
          <div className="text-2xl font-black text-slate-900">{totalOwnedCount}</div>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">AVAILABLE (UNALLOCATED)</div>
          <div className="text-2xl font-black text-emerald-600">{totalAvailableCount}</div>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">ALLOCATED TO DECKS</div>
          <div className="text-2xl font-black text-indigo-700">{totalAllocatedCount}</div>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">ESTIMATED MARKET VALUE</div>
          <div className="text-2xl font-black text-amber-600">{formatZarFromUsd(totalEstimatedValue)}</div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white border border-slate-200 p-4 rounded-3xl shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter collection by card name..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition font-medium"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <select
            value={supertypeFilter}
            onChange={(e) => setSupertypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            <option value="Pokémon">Pokémon Only</option>
            <option value="Trainer">Trainers Only</option>
            <option value="Energy">Energy Only</option>
          </select>

          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none"
          >
            <option value="ALL">All Inventory</option>
            <option value="AVAILABLE_ONLY">Unallocated Only</option>
            <option value="ALLOCATED_ONLY">Allocated Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-2xl p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-xl transition ${viewMode === 'table' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              title="Table view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-xl transition ${viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              title="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-2xl p-1">
            <button
              onClick={() => setCardZoom((z) => Math.max(0, z - 1) as 0 | 1 | 2)}
              disabled={cardZoom === 0}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 disabled:opacity-40 transition"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCardZoom((z) => Math.min(2, z + 1) as 0 | 1 | 2)}
              disabled={cardZoom === 2}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 disabled:opacity-40 transition"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'grid' && (
        <div className={`grid ${gridColumnsClass} gap-4`}>
          {filteredCollection.map((item) => {
            const card = item.card;
            const prt = item.printing;

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:border-indigo-300 transition"
              >
                <button
                  onClick={() => card && setViewingCardModal({ card, printing: prt })}
                  className="block w-full bg-slate-100"
                  title="Open card detail"
                >
                  <img
                    src={getImageUrl(prt, card)}
                    alt={card?.name || 'Pokémon Card'}
                    onError={handleImageError}
                    className={`w-full ${gridImageClasses} object-contain bg-slate-100 transition`}
                    referrerPolicy="no-referrer"
                  />
                </button>

                <div className="p-3.5 space-y-3">
                  <div className="space-y-1 min-h-14">
                    <button
                      onClick={() => card && setViewingCardModal({ card, printing: prt })}
                      className="text-left font-black text-sm text-slate-900 hover:text-indigo-700 transition line-clamp-2"
                    >
                      {card?.name || 'Unknown Card'}
                    </button>
                    <div className="text-[10px] text-indigo-700 font-bold">
                      {prt ? `${prt.setCode} #${prt.cardNumber} • ${prt.rarity}` : 'Default Printing'}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
                      <div className="text-[9px] font-black uppercase text-slate-400">Owned</div>
                      <div className="text-sm font-black text-slate-900">{item.quantity}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
                      <div className="text-[9px] font-black uppercase text-slate-400">Alloc</div>
                      <div className="text-sm font-black text-indigo-700">{item.allocatedQuantity}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
                      <div className="text-[9px] font-black uppercase text-slate-400">Free</div>
                      <div className="text-sm font-black text-emerald-700">{item.availableQuantity}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-black text-amber-700">
                      {formatZarFromUsd((prt?.marketPrice || 0) * item.quantity)}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => decreaseItemQuantity(item)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                        title="Decrease quantity"
                      >
                        <Minus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                      <button
                        onClick={() => increaseItemQuantity(item)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                        title="Increase quantity"
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                      <button
                        onClick={() => deleteItem(item)}
                        className={`p-1.5 rounded-lg border transition ${
                          item.allocatedQuantity > 0
                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-500 border-slate-200'
                        }`}
                        title={item.allocatedQuantity > 0 ? 'Cannot delete allocated card' : 'Delete item'}
                      >
                        <Trash2 className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredCollection.length === 0 && (
            <div className="col-span-full bg-white border border-slate-200 p-8 rounded-3xl text-center text-slate-400 italic">
              No physical cards match your search filter.
            </div>
          )}
        </div>
      )}

      {/* Collection Table */}
      {viewMode === 'table' && (
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                <th className="py-3.5 px-4">Card / Printing</th>
                <th className="py-3.5 px-4">Supertype</th>
                <th className="py-3.5 px-4">Condition</th>
                <th className="py-3.5 px-4">Owned</th>
                <th className="py-3.5 px-4">Allocated</th>
                <th className="py-3.5 px-4">Available</th>
                <th className="py-3.5 px-4">Est. Price</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
              {filteredCollection.map((item) => {
                const card = item.card;
                const prt = item.printing;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div
                        className="flex items-center space-x-3 cursor-pointer group"
                        onClick={() => card && setViewingCardModal({ card, printing: prt })}
                      >
                        <img
                          src={getImageUrl(prt, card)}
                          alt={card?.name || 'Pokémon Card'}
                          onError={handleImageError}
                          className="w-10 h-14 object-cover rounded-md border border-slate-200 shadow-xs flex-shrink-0 group-hover:scale-105 transition-transform bg-slate-100"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-indigo-700 transition flex items-center space-x-1">
                            <span>{card?.name || 'Unknown Card'}</span>
                            <Eye className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                          </div>
                          <div className="text-[10px] text-indigo-700 font-bold">
                            {prt ? `${prt.setName} (${prt.setCode} #${prt.cardNumber})` : 'Default Printing'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-[10px] px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-lg font-bold border border-slate-200">
                        {card?.supertype}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-700">{item.condition}</span>
                    </td>

                    <td className="py-3.5 px-4 font-black text-slate-900">{item.quantity}</td>

                    <td className="py-3.5 px-4">
                      {item.allocatedQuantity > 0 ? (
                        <div className="space-y-0.5">
                          <span className="font-bold text-indigo-700">
                            {item.allocatedQuantity} copies
                          </span>
                          <div className="text-[10px] text-slate-500">
                            {item.allocatedDetails?.map((a: any) => a.deckName).join(', ')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-black text-emerald-700">
                      {item.availableQuantity}
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {formatZarFromUsd((prt?.marketPrice || 0) * item.quantity)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => decreaseItemQuantity(item)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                          title="Decrease Quantity"
                        >
                          <Minus className="w-3 h-3 stroke-[2.5]" />
                        </button>
                        <button
                          onClick={() => increaseItemQuantity(item)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                          title="Increase Quantity"
                        >
                          <Plus className="w-3 h-3 stroke-[2.5]" />
                        </button>
                        <button
                          onClick={() => deleteItem(item)}
                          className={`p-1.5 rounded-lg border transition ${
                            item.allocatedQuantity > 0
                              ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-500 border-slate-200'
                          }`}
                          title={item.allocatedQuantity > 0 ? 'Cannot delete allocated card' : 'Delete Item'}
                        >
                          <Trash2 className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredCollection.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                    No physical cards match your search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
