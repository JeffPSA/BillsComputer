import React, { useEffect, useMemo, useState } from 'react';
import {
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import { addWishlistItem, browseDatabaseCards, updateCollectionItem } from '../../services/api';
import { formatZarFromUsd } from '../../utils/currency';
import { getImageUrl, handleImageError } from '../../utils/imageUtils';
import { CardDetailModal } from '../CardDetailModal';

const PAGE_SIZE = 36;

export const DatabaseCardBrowser: React.FC<{ onCollectionChanged: () => void }> = ({ onCollectionChanged }) => {
  const [query, setQuery] = useState('');
  const [supertype, setSupertype] = useState('ALL');
  const [setCode, setSetCode] = useState('ALL');
  const [rarity, setRarity] = useState('ALL');
  const [variant, setVariant] = useState('ALL');
  const [ownership, setOwnership] = useState('ALL');
  const [wishlist, setWishlist] = useState('ALL');
  const [page, setPage] = useState(1);
  const [cards, setCards] = useState<any[]>([]);
  const [sets, setSets] = useState<any[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  const [variants, setVariants] = useState<string[]>([]);
  const [setCompletion, setSetCompletion] = useState<any | null>(null);
  const [ownershipByPrintingId, setOwnershipByPrintingId] = useState<Record<string, { ownedQuantity: number; wishlistQuantity: number }>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [viewingCardModal, setViewingCardModal] = useState<{ card: any; printing?: any } | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [query, supertype, setCode, rarity, variant, ownership, wishlist]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const result = await browseDatabaseCards({
          query,
          supertype,
          setCode,
          rarity,
          variant,
          ownership,
          wishlist,
          page,
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;

        setCards(result.cards || []);
        setTotalCount(result.totalCount || 0);
        setSets(result.sets || []);
        setRarities(result.rarities || []);
        setVariants(result.variants || []);
        setSetCompletion(result.setCompletion || null);
        setOwnershipByPrintingId(result.ownershipByPrintingId || {});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, supertype, setCode, rarity, variant, ownership, wishlist, page]);

  const visibleRange = useMemo(() => {
    if (totalCount === 0) return '0';
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(totalCount, page * PAGE_SIZE);
    return `${start}-${end}`;
  }, [page, totalCount]);

  const handleAddToCollection = async (card: any, printing: any) => {
    const result = await updateCollectionItem({
      cardId: card.id,
      printingId: printing?.id || card.defaultPrintingId,
      quantity: 1,
      condition: 'NM' as any,
      acquisitionSource: 'Database Browser',
      acquisitionCost: 0,
    });

    if (result?.success === false || result?.error) {
      setActionMessage(result.error || 'Unable to add card to collection');
      return;
    }

    const ownershipKey = printing?.id || card.defaultPrintingId;
    setOwnershipByPrintingId((current) => ({
      ...current,
      [ownershipKey]: {
        ownedQuantity: (current[ownershipKey]?.ownedQuantity || 0) + 1,
        wishlistQuantity: current[ownershipKey]?.wishlistQuantity || 0,
      },
    }));
    setActionMessage(`Added 1x ${card.name} to collection`);
    onCollectionChanged();
  };

  const handleAddToWishlist = async (card: any, printing: any) => {
    const result = await addWishlistItem({
      cardId: card.id,
      printingId: printing?.id || card.defaultPrintingId,
      quantity: 1,
      priority: 'Medium',
    });

    if (result?.success === false || result?.error) {
      setActionMessage(result.error || 'Unable to add card to wishlist');
      return;
    }

    const ownershipKey = printing?.id || card.defaultPrintingId;
    setOwnershipByPrintingId((current) => ({
      ...current,
      [ownershipKey]: {
        ownedQuantity: current[ownershipKey]?.ownedQuantity || 0,
        wishlistQuantity: (current[ownershipKey]?.wishlistQuantity || 0) + 1,
      },
    }));
    setActionMessage(`Added ${card.name} to wishlist`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <Database className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Database Card Browser</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            Browse exact local SQLite printings, add physical copies, and build wishlist targets.
          </p>
        </div>

        <div className="text-xs font-black bg-indigo-900/50 border border-indigo-500 rounded-2xl px-4 py-2">
          {visibleRange} of {totalCount.toLocaleString()} printings
        </div>
      </div>

      {actionMessage && (
        <div className="bg-white border border-indigo-200 p-4 rounded-3xl text-xs font-bold text-indigo-900 shadow-sm">
          {actionMessage}
        </div>
      )}

      <div className="bg-white border border-slate-200 p-4 rounded-3xl shadow-sm space-y-3">
        <div className="relative">
          {loading ? (
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin absolute left-3.5 top-3.5" />
          ) : (
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, set, card number, rarity, variant..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition font-medium"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <select value={supertype} onChange={(e) => setSupertype(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none">
            <option value="ALL">All Types</option>
            <option value="Pokémon">Pokémon</option>
            <option value="Trainer">Trainer</option>
            <option value="Energy">Energy</option>
          </select>

          <select value={setCode} onChange={(e) => setSetCode(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none">
            <option value="ALL">All Sets</option>
            {sets.map((set) => (
              <option key={set.id} value={set.ptcgoCode || set.id}>
                {set.ptcgoCode || set.id} - {set.name}
              </option>
            ))}
          </select>

          <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none">
            <option value="ALL">All Rarities</option>
            {rarities.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select value={variant} onChange={(e) => setVariant(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none">
            <option value="ALL">All Variants</option>
            {variants.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          <select value={ownership} onChange={(e) => setOwnership(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none">
            <option value="ALL">Owned + Missing</option>
            <option value="OWNED">Owned Only</option>
            <option value="MISSING">Missing Only</option>
          </select>

          <select value={wishlist} onChange={(e) => setWishlist(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-2xl px-3 py-2.5 focus:outline-none">
            <option value="ALL">Any Wishlist</option>
            <option value="WISHLIST">Wishlist Only</option>
            <option value="NOT_WISHLIST">Not Wishlisted</option>
          </select>
        </div>
      </div>

      {setCompletion && (
        <div className="bg-white border border-slate-200 p-4 rounded-3xl shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Master Set Progress</div>
              <div className="text-sm font-black text-slate-900">
                {setCompletion.setName} ({setCompletion.setCode})
              </div>
            </div>
            <div className="text-xl font-black text-indigo-700">
              {setCompletion.completionPercent}%
            </div>
          </div>
          <div className="h-3 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-400 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, setCompletion.completionPercent || 0))}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
              <div className="text-[9px] font-black uppercase text-slate-400">Owned</div>
              <div className="text-sm font-black text-slate-900">{setCompletion.ownedPrintings}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
              <div className="text-[9px] font-black uppercase text-slate-400">Missing</div>
              <div className="text-sm font-black text-rose-700">{setCompletion.missingPrintings}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
              <div className="text-[9px] font-black uppercase text-slate-400">Wishlist</div>
              <div className="text-sm font-black text-indigo-700">{setCompletion.wishlistPrintings}</div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-bold text-center">
            {setCompletion.ownedPrintings} of {setCompletion.totalPrintings} exact printings collected
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
        <button
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1 || loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-200 rounded-2xl transition"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>
        <span>Page {page} of {totalPages}</span>
        <button
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page >= totalPages || loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-200 rounded-2xl transition"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const printing = card.printings?.[0];
          const ownershipKey = printing?.id || card.defaultPrintingId;
          const owned = ownershipByPrintingId[ownershipKey]?.ownedQuantity || 0;
          const wishlisted = ownershipByPrintingId[ownershipKey]?.wishlistQuantity || 0;

          return (
            <div key={ownershipKey} className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:border-indigo-300 transition">
              <button
                onClick={() => setViewingCardModal({ card, printing })}
                className="block w-full bg-slate-100"
                title="Open card detail"
              >
                <img
                  src={getImageUrl(printing, card)}
                  alt={card.name}
                  onError={handleImageError}
                  className="w-full h-56 object-contain bg-slate-100"
                  referrerPolicy="no-referrer"
                />
              </button>

              <div className="p-3.5 space-y-3">
                <div className="min-h-16 space-y-1">
                  <button
                    onClick={() => setViewingCardModal({ card, printing })}
                    className="text-left font-black text-sm text-slate-900 hover:text-indigo-700 transition line-clamp-2"
                  >
                    {card.name}
                  </button>
                  <div className="text-[10px] text-indigo-700 font-bold">
                    {printing ? `${printing.setCode} #${printing.cardNumber} - ${printing.rarity}` : 'No printing data'}
                  </div>
                  <div className="text-[10px] text-amber-700 font-black uppercase">
                    {printing?.variant || 'Normal'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold">
                    {card.supertype} {card.subtype ? `- ${card.subtype}` : ''}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
                    <div className="text-[9px] font-black uppercase text-slate-400">Owned</div>
                    <div className="text-sm font-black text-slate-900">{owned}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
                    <div className="text-[9px] font-black uppercase text-slate-400">Wish</div>
                    <div className="text-sm font-black text-indigo-700">{wishlisted}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl py-2">
                    <div className="text-[9px] font-black uppercase text-slate-400">Est</div>
                    <div className="text-[11px] font-black text-amber-700">{formatZarFromUsd(printing?.marketPrice || 0)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setViewingCardModal({ card, printing })}
                    className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl border border-slate-200 transition"
                    title="View details"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleAddToCollection(card, printing)}
                    className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black text-[10px] uppercase rounded-2xl transition"
                    title="Add one copy to collection"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                  <button
                    onClick={() => handleAddToWishlist(card, printing)}
                    className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-indigo-700 hover:bg-indigo-600 text-white font-black text-[10px] uppercase rounded-2xl transition"
                    title="Add one copy to wishlist"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>Wish</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!loading && cards.length === 0 && (
          <div className="col-span-full bg-white border border-slate-200 p-8 rounded-3xl text-center text-slate-400 italic">
            No local cards match these filters.
          </div>
        )}
      </div>

      {loading && (
        <div className="py-10 text-center text-xs text-slate-400 font-bold animate-pulse">
          Loading local SQLite cards...
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
