import React, { useState } from 'react';
import { Settings, X, Check, Trash2 } from 'lucide-react';
import { Deck } from '../../types/tcg';
import { saveDeck, deleteDeck } from '../../services/api';

interface DeckSettingsModalProps {
  deck: Deck;
  onClose: () => void;
  onSaveSuccess: () => void;
  onDeleted?: () => void;
}

export const DeckSettingsModal: React.FC<DeckSettingsModalProps> = ({
  deck,
  onClose,
  onSaveSuccess,
  onDeleted,
}) => {
  const [name, setName] = useState(deck.name);
  const [version, setVersion] = useState(deck.version || 'v1.0');
  const [format, setFormat] = useState(deck.format || 'Standard');
  const [status, setStatus] = useState(deck.status || 'Active');
  const [isPermanentlyAssembled, setIsPermanentlyAssembled] = useState(
    !!deck.isPermanentlyAssembled
  );
  const [notes, setNotes] = useState(deck.notes || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    await saveDeck({
      id: deck.id,
      name: name.trim(),
      version: version.trim(),
      format,
      status: status as any,
      isPermanentlyAssembled,
      notes: notes.trim(),
    });
    setLoading(false);
    onSaveSuccess();
    onClose();
  };

  const handleDelete = async () => {
    if (
      window.confirm(
        `Are you sure you want to delete "${deck.name}"? All card allocations will be released back to your physical collection.`
      )
    ) {
      setLoading(true);
      await deleteDeck(deck.id);
      setLoading(false);
      if (onDeleted) onDeleted();
      onSaveSuccess();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white border-4 border-indigo-900 rounded-[32px] max-w-lg w-full p-6 space-y-5 shadow-2xl relative my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-indigo-700 stroke-[2.5]" />
            <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900">
              Deck Settings & Metadata
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-xl transition font-black"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-700">Deck Name:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100"
              placeholder="e.g. Charizard ex / Pidgeot ex"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-slate-700">Format:</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none"
              >
                <option value="Standard">Standard</option>
                <option value="Expanded">Expanded</option>
                <option value="Gym Leader Challenge">Gym Leader Challenge</option>
                <option value="Casual">Casual</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-slate-700">Version Tag:</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none"
                placeholder="v1.0"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-700">Deck Status:</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none"
            >
              <option value="Active">Active (Participates in physical card allocation)</option>
              <option value="Inactive">Inactive (Does not claim collection cards)</option>
              <option value="Archived">Archived</option>
            </select>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="permAssembled"
              checked={isPermanentlyAssembled}
              onChange={(e) => setIsPermanentlyAssembled(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-700 focus:ring-indigo-500"
            />
            <label htmlFor="permAssembled" className="text-xs font-bold text-slate-800 cursor-pointer">
              🔒 Permanently Assembled Box (Cards locked into this deck physical box)
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-700">Notes / Strategy:</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-medium text-slate-900 focus:outline-none"
              placeholder="e.g., Tech for Regional Championship, target matchup plan..."
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleDelete}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-600 text-xs font-bold rounded-2xl transition border border-slate-200 flex items-center space-x-1"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Deck</span>
            </button>

            <div className="flex items-center space-x-2">
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
                className="px-5 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-black uppercase rounded-2xl shadow-md transition"
              >
                {loading ? 'Saving...' : 'Save Deck Settings'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
