import React, { useState } from 'react';
import { Layers, FileText, Check, AlertCircle } from 'lucide-react';
import { importLimitlessDeck } from '../services/api';

interface ImportLimitlessModalProps {
  onClose: () => void;
  onImportSuccess: (deck: any) => void;
}

export const ImportLimitlessModal: React.FC<ImportLimitlessModalProps> = ({
  onClose,
  onImportSuccess,
}) => {
  const [deckName, setDeckName] = useState('Imported Deck');
  const [deckText, setDeckText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckText.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await importLimitlessDeck(deckText, deckName);
      setLoading(false);
      if (res.success && res.deck) {
        onImportSuccess(res.deck);
      } else {
        setErrorMsg('Failed to parse deck list.');
      }
    } catch (err) {
      console.error('Import error:', err);
      setLoading(false);
      setErrorMsg('Error communicating with backend parser.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border-4 border-indigo-900 rounded-[32px] max-w-lg w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-700 stroke-[2.5]" />
            <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900">Import Deck List</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-black text-lg">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-100 border border-rose-300 p-3 rounded-2xl text-rose-900 text-xs font-bold flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-700 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleImport} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-700">Deck Name:</label>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-700">Deck List Text:</label>
            <textarea
              rows={8}
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder="Paste a deck list here..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-mono text-indigo-950 focus:outline-none focus:ring-4 focus:ring-indigo-100 font-bold"
            />
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
              {loading ? 'Parsing...' : 'Import & Evaluate Inventory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
