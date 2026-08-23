import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Plus,
  Trash2,
  Compass,
  ShoppingBag,
  Eye
} from 'lucide-react';
import { AcquisitionPreference } from '../../types/tcg';
import { CardDetailModal } from '../CardDetailModal';
import { addWishlistItem, deleteWishlistItem, fetchWishlist } from '../../services/api';

interface WishlistManagerProps {
  allCards: any[];
  onNavigateToBulk: () => void;
  onNavigateToShopping: () => void;
}

export const WishlistManager: React.FC<WishlistManagerProps> = ({
  allCards,
  onNavigateToBulk,
  onNavigateToShopping,
}) => {
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);

  const [newCardName, setNewCardName] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newPref, setNewPref] = useState<AcquisitionPreference>('Bulk');
  const [newPriority, setNewPriority] = useState<'High' | 'Medium' | 'Low'>('High');
  const [viewingCardModal, setViewingCardModal] = useState<{ card: any; printing?: any } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadWishlist = async () => {
    const items = await fetchWishlist();
    setWishlistItems(Array.isArray(items) ? items : []);
  };

  useEffect(() => {
    loadWishlist();
  }, []);

  const findWishlistCard = (cardName: string) => {
    const normalizedName = cardName.trim().toLowerCase();
    return allCards.find((card) => card.name?.trim().toLowerCase() === normalizedName);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardName) return;
    const matchedCard = findWishlistCard(newCardName);
    if (!matchedCard) {
      setMessage('Card must exist in the local database before it can be wishlisted.');
      return;
    }

    const result = await addWishlistItem({
      cardId: matchedCard.id,
      printingId: matchedCard.defaultPrintingId,
      quantity: newQty,
      priority: newPriority,
      notes: `Preferred channel: ${newPref}`,
    });

    if (result?.success === false || result?.error) {
      setMessage(result.error || 'Unable to add wishlist item.');
      return;
    }

    setMessage(`Added ${matchedCard.name} to wishlist.`);
    setNewCardName('');
    await loadWishlist();
  };

  const removeItem = async (id: string) => {
    await deleteWishlistItem(id);
    await loadWishlist();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <Bookmark className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Persistent Collection Wishlist</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            Collection-level desired acquisitions. Assign preferred acquisition modes (e.g. Bulk vs Online) to direct items to the right workflow.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onNavigateToBulk}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold rounded-2xl transition flex items-center space-x-1"
          >
            <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Find Bulk Items</span>
          </button>
          <button
            onClick={onNavigateToShopping}
            className="px-3.5 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black uppercase text-xs rounded-2xl shadow-md transition flex items-center space-x-1"
          >
            <ShoppingBag className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Buy Online Items</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-white border border-indigo-200 p-4 rounded-3xl text-xs font-bold text-indigo-900 shadow-sm">
          {message}
        </div>
      )}

      {/* Add New Wishlist Item Form */}
      <form onSubmit={handleAddItem} className="bg-white border border-slate-200 p-5 rounded-3xl space-y-3 shadow-sm">
        <div className="text-xs font-black uppercase text-slate-900">Add Desired Card to Wishlist</div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            value={newCardName}
            onChange={(e) => setNewCardName(e.target.value)}
            placeholder="Card name..."
            className="bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 font-medium"
          />

          <select
            value={newPref}
            onChange={(e) => setNewPref(e.target.value as AcquisitionPreference)}
            className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none"
          >
            <option value="Bulk">Preferred: Local Store Bulk</option>
            <option value="Local Singles">Preferred: Local Singles Binder</option>
            <option value="Online">Preferred: Online Marketplace</option>
            <option value="Cheapest">Preferred: Absolute Cheapest</option>
          </select>

          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none"
          >
            <option value="High">Priority: High (Needed ASAP)</option>
            <option value="Medium">Priority: Medium</option>
            <option value="Low">Priority: Low</option>
          </select>

          <button
            type="submit"
            className="bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black uppercase text-xs rounded-2xl shadow-md transition flex items-center justify-center space-x-1 py-2.5"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Wishlist Item</span>
          </button>
        </div>
      </form>

      {/* Wishlist Items Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="divide-y divide-slate-100">
          {wishlistItems.map((item) => {
            const matchedCard = item.card || findWishlistCard(item.cardName);
            const matchedPrinting = item.printing || matchedCard?.printings?.[0];

            return (
            <div key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  {matchedCard ? (
                    <button
                      onClick={() => setViewingCardModal({ card: matchedCard, printing: matchedPrinting })}
                      className="font-bold text-sm text-slate-900 hover:text-indigo-700 transition flex items-center gap-1.5 text-left"
                    >
                      <span>{item.cardName}</span>
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ) : (
                    <span className="font-bold text-sm text-slate-900">{item.cardName}</span>
                  )}
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                      item.priority === 'High'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {item.priority} Priority
                  </span>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  Preferred Channel: <span className="text-indigo-700 font-bold">{item.preferredAcquisition}</span>
                </div>

                {item.notes && <div className="text-[11px] text-slate-400 italic">{item.notes}</div>}
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-xs text-slate-900 font-black">{item.targetQuantity || item.quantity}x Needed</span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-400 rounded-xl transition border border-slate-200"
                >
                  <Trash2 className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>
            );
          })}

          {wishlistItems.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400 italic font-medium">Wishlist is empty.</div>
          )}
        </div>
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
