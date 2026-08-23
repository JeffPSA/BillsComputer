import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Search,
  Download,
  Copy,
  Check,
  ExternalLink,
  Store,
  Layers,
  Sparkles
} from 'lucide-react';
import { fetchShoppingOptimization, searchMarketplace } from '../../services/api';
import { ShoppingOptimizationResult, MarketplaceListing } from '../../types/tcg';
import { CardDetailModal } from '../CardDetailModal';
import { formatZarFromUsd, usdToZar } from '../../utils/currency';

interface ShoppingAssistantProps {
  allCards?: any[];
}

export const ShoppingAssistant: React.FC<ShoppingAssistantProps> = ({ allCards = [] }) => {
  const [optMode, setOptMode] = useState<'CHEAPEST_TOTAL' | 'FEWEST_SELLERS'>('CHEAPEST_TOTAL');
  const [optResult, setOptResult] = useState<ShoppingOptimizationResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MarketplaceListing[]>([]);
  const [copiedText, setCopiedText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewingCardModal, setViewingCardModal] = useState<{ card: any; printing?: any } | null>(null);

  const findListingCard = (listing: MarketplaceListing) => {
    const normalizedName = listing.cardName.trim().toLowerCase();
    const card = allCards.find((c) => c.name?.trim().toLowerCase() === normalizedName);
    if (!card) return null;

    const printing = card.printings?.find((p: any) =>
      listing.printingString.includes(p.setCode) && listing.printingString.includes(p.cardNumber)
    ) || card.printings?.[0];

    return { card, printing };
  };

  const renderListingCardName = (listing: MarketplaceListing, label: React.ReactNode) => {
    const match = findListingCard(listing);
    if (!match) return label;

    return (
      <button
        onClick={() => setViewingCardModal(match)}
        className="text-left hover:text-indigo-700 transition"
        title="Open card detail"
      >
        {label}
      </button>
    );
  };

  useEffect(() => {
    setLoading(true);
    fetchShoppingOptimization(optMode)
      .then((res) => {
        setOptResult(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Opt error:', err);
        setLoading(false);
      });
  }, [optMode]);

  const handleSearchMarketplace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    searchMarketplace(searchQuery).then((res) => setSearchResults(res));
  };

  const handleExportCSV = () => {
    if (!optResult) return;
    const headers = ['Card Name', 'Printing', 'Required Quantity', 'Seller', 'Item Price (ZAR)', 'Shipping Price (ZAR)'];
    const rows = optResult.items.map((i) => [
      `"${i.cardName}"`,
      `"${i.printingString}"`,
      i.requiredQty,
      `"${i.listing.sellerName}"`,
      usdToZar(i.listing.itemPrice).toFixed(2),
      usdToZar(i.listing.shippingPrice).toFixed(2),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PokeDeck_Shopping_List_${optMode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyMassEntry = () => {
    if (!optResult) return;
    const lines = optResult.items.map((i) => `${i.requiredQty} ${i.cardName}`);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <ShoppingBag className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Marketplace Shopping Assistant & Optimizer</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            Compare TCGPlayer, eBay, and BOB's Shop. Calculate cheapest total purchase accounting for item prices and seller shipping.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopyMassEntry}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold rounded-2xl transition flex items-center space-x-1"
          >
            {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedText ? 'Copied Mass Entry!' : 'Copy TCGPlayer Mass Entry'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black uppercase text-xs rounded-2xl shadow-md transition"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Optimizer Mode Switcher */}
      <div className="bg-white border border-slate-200 p-4 rounded-3xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={() => setOptMode('CHEAPEST_TOTAL')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              optMode === 'CHEAPEST_TOTAL' ? 'bg-yellow-400 text-indigo-950 font-black shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            💰 Cheapest Total (With Shipping)
          </button>
          <button
            onClick={() => setOptMode('FEWEST_SELLERS')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              optMode === 'FEWEST_SELLERS' ? 'bg-yellow-400 text-indigo-950 font-black shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📦 Fewest Sellers (Maximum Convenience)
          </button>
        </div>

        {optResult && (
          <div className="flex items-center space-x-4 text-xs font-bold text-slate-700">
            <div>
              Cards: <span className="text-slate-900 font-black">{formatZarFromUsd(optResult.totalCardCost)}</span>
            </div>
            <div>
              Shipping: <span className="text-amber-600 font-black">{formatZarFromUsd(optResult.totalShippingCost)}</span>
            </div>
            <div className="text-emerald-800 font-black text-sm bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-300">
              Total: {formatZarFromUsd(optResult.grandTotal)}
            </div>
          </div>
        )}
      </div>

      {/* Shopping Optimization Results List */}
      {loading && (
        <div className="py-12 text-center text-xs text-slate-400 font-bold animate-pulse">
          Calculating cheapest seller combinations across TCGPlayer & eBay...
        </div>
      )}

      {!loading && optResult && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 bg-slate-100 border-b border-slate-200 font-black italic uppercase text-xs text-slate-900 flex justify-between">
            <span>Missing Physical Shortfall Cart ({optResult.items.length} unique cards needed)</span>
            <span className="text-indigo-700">{optResult.selectedSellersCount} Sellers Selected</span>
          </div>

          <div className="divide-y divide-slate-100 font-medium">
            {optResult.items.map((item, idx) => (
              <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-slate-900">
                      {renderListingCardName(item.listing, `${item.requiredQty}x ${item.cardName}`)}
                    </span>
                    <span className="text-[10px] px-2.5 py-0.5 bg-indigo-50 text-indigo-800 rounded-lg font-bold border border-indigo-100">
                      {item.printingString}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 flex items-center space-x-2">
                    <Store className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Seller: {item.listing.sellerName}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-4 text-right">
                  <div className="text-xs">
                    <div className="text-slate-900 font-black">{formatZarFromUsd(item.listing.itemPrice * item.requiredQty)}</div>
                    <div className="text-slate-400 text-[10px] font-bold">
                      + {formatZarFromUsd(item.listing.shippingPrice)} ship
                    </div>
                  </div>

                  <a
                    href={item.listing.listingUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition"
                    title="Find on TCGPlayer/eBay"
                  >
                    <ExternalLink className="w-4 h-4 stroke-[2.5]" />
                  </a>
                </div>
              </div>
            ))}

            {optResult.items.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400 italic font-medium">
                Zero missing cards required! All active decks are fully owned.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Marketplace Search Section */}
      <div className="bg-white border border-slate-200 p-6 rounded-3xl space-y-4 shadow-sm">
        <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900 border-b border-slate-100 pb-3">
          Search Marketplaces Directly
        </h2>

        <form onSubmit={handleSearchMarketplace} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search card name..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 font-medium transition"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white font-black uppercase text-xs rounded-2xl shadow-md transition"
          >
            Search
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="space-y-2 pt-2">
            {searchResults.map((listing) => (
              <div
                key={listing.id}
                className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">
                    {renderListingCardName(listing, `${listing.cardName} — ${listing.printingString}`)}
                  </div>
                  <div className="text-slate-500 font-medium">
                    {listing.marketplace} • {listing.sellerName} ({listing.condition})
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-emerald-700 font-black">{formatZarFromUsd(listing.itemPrice)}</div>
                  <a
                    href={listing.listingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                  </a>
                </div>
              </div>
            ))}
          </div>
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
