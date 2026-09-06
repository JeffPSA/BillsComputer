import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { fetchBobShopShoppingList } from '../../services/api';
import { StoreShoppingListItem, StoreShoppingListResult } from '../../types/tcg';
import { CardDetailModal } from '../CardDetailModal';

interface ShoppingAssistantProps {
  allCards?: any[];
}

function escapeCsv(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export const ShoppingAssistant: React.FC<ShoppingAssistantProps> = ({ allCards = [] }) => {
  const [shoppingList, setShoppingList] = useState<StoreShoppingListResult | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewingCardModal, setViewingCardModal] = useState<{ card: any; printing?: any } | null>(null);

  const loadShoppingList = async () => {
    setLoading(true);
    setError('');
    try {
      setShoppingList(await fetchBobShopShoppingList());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the Bob Shop shopping list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShoppingList();
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) return shoppingList?.items || [];
    return (shoppingList?.items || []).filter((item) =>
      `${item.cardName} ${item.printingString}`.toLowerCase().includes(normalizedFilter)
    );
  }, [filter, shoppingList]);

  const findLocalCard = (item: StoreShoppingListItem) => {
    const card = allCards.find((candidate) => candidate.id === item.cardId);
    if (!card) return null;
    const printing = item.preferredPrintingId
      ? card.printings?.find((candidate: any) => candidate.id === item.preferredPrintingId)
      : card.printings?.[0];
    return { card, printing };
  };

  const handleCopy = async () => {
    if (!shoppingList) return;
    const text = shoppingList.items
      .map((item) => `${item.requiredQty}x ${item.cardName} — ${item.printingString}\n${item.searchUrl}`)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCsv = () => {
    if (!shoppingList) return;
    const rows = shoppingList.items.map((item) => [
      item.cardName,
      item.printingString,
      item.requiredQty,
      item.searchUrl,
    ]);
    const csv = [
      ['Card Name', 'Printing', 'Required Quantity', 'Bob Shop Search'],
      ...rows,
    ].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Bob_Shop_Shopping_List.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <ShoppingBag className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Bob Shop Shopping List</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-1 max-w-2xl">
            Missing cards across active decks, checked against your physical collection. Links open real Bob Shop searches; prices and availability must be confirmed on Bob Shop.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadShoppingList}
            disabled={loading}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold rounded-2xl transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleCopy}
            disabled={!shoppingList}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold rounded-2xl transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy List'}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={!shoppingList}
            className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black uppercase text-xs rounded-2xl shadow-md transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Store</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-black text-slate-900"><Store className="w-4 h-4 text-indigo-700" /> Bob Shop</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Missing cards</div>
          <div className="mt-1 text-xl font-black text-slate-900">{shoppingList?.totalMissingCards ?? '—'}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Search lines</div>
          <div className="mt-1 text-xl font-black text-slate-900">{shoppingList?.uniqueItems ?? '—'}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
        <label className="relative block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter this shopping list by card, set, or printing..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 font-medium transition"
          />
        </label>
      </div>

      {loading && (
        <div className="py-12 text-center text-xs text-slate-400 font-bold animate-pulse">
          Checking active deck requirements against your collection...
        </div>
      )}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-3xl p-5 text-sm font-bold">
          {error}
        </div>
      )}

      {!loading && !error && shoppingList && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 bg-slate-100 border-b border-slate-200 font-black italic uppercase text-xs text-slate-900 flex flex-wrap justify-between gap-2">
            <span>Active-deck physical shortfalls</span>
            <span className="text-indigo-700">{visibleItems.length} of {shoppingList.uniqueItems} search lines</span>
          </div>

          <div className="divide-y divide-slate-100 font-medium">
            {visibleItems.map((item) => {
              const localMatch = findLocalCard(item);
              return (
                <div key={item.key} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {localMatch ? (
                        <button
                          onClick={() => setViewingCardModal(localMatch)}
                          className="font-bold text-sm text-slate-900 hover:text-indigo-700 text-left transition"
                          title="Open card detail"
                        >
                          {item.requiredQty}x {item.cardName}
                        </button>
                      ) : (
                        <span className="font-bold text-sm text-slate-900">{item.requiredQty}x {item.cardName}</span>
                      )}
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-lg font-bold border ${
                        item.requirementMode === 'SPECIFIC_PRINTING'
                          ? 'bg-violet-50 text-violet-800 border-violet-200'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-100'
                      }`}>
                        {item.requirementMode === 'SPECIFIC_PRINTING' ? 'Exact printing' : 'Any printing'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{item.printingString}</div>
                    <div className="text-[10px] text-slate-400 truncate">Search: {item.searchQuery}</div>
                  </div>

                  <a
                    href={item.searchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase shadow-sm transition"
                  >
                    Search Bob Shop
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              );
            })}

            {visibleItems.length === 0 && (
              <div className="p-10 text-center text-xs text-slate-400 italic font-medium">
                {shoppingList.items.length === 0
                  ? 'All active-deck card requirements are covered by your collection.'
                  : 'No shopping-list items match this filter.'}
              </div>
            )}
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
