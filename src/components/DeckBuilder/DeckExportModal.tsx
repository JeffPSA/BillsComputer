import React, { useMemo, useState } from 'react';
import { Check, Clipboard, Download, FileDown, Printer, X } from 'lucide-react';
import {
  buildDeckText,
  DeckListPlayerDetails,
  DeckTextFormat,
  downloadDeckText,
  printDeckList,
} from '../../utils/deckExport';

interface DeckExportModalProps {
  deck: any;
  onClose: () => void;
}

const formatLabels: Record<DeckTextFormat, string> = {
  PTCGL: 'Pokémon TCG Live',
  LIMITLESS: 'Limitless',
  TCGPLAYER: 'TCGplayer Mass Entry',
};

export const DeckExportModal: React.FC<DeckExportModalProps> = ({ deck, onClose }) => {
  const [format, setFormat] = useState<DeckTextFormat>('PTCGL');
  const [copied, setCopied] = useState(false);
  const [printError, setPrintError] = useState('');
  const [player, setPlayer] = useState<DeckListPlayerDetails>({
    playerName: '',
    playerId: '',
    dateOfBirth: '',
    ageDivision: '',
  });
  const text = useMemo(() => buildDeckText(deck, format), [deck, format]);

  const copyText = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const openPrintView = () => {
    setPrintError('');
    if (!printDeckList(deck, player)) {
      setPrintError('The print window was blocked. Allow pop-ups for Bills Computer and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-4 border-indigo-900 rounded-[32px] max-w-4xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-black italic uppercase text-slate-900 flex items-center gap-2">
              <FileDown className="w-5 h-5 text-indigo-700" /> Deck List Export
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">{deck.name} · {deck.version}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition" aria-label="Close export options">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900">Text export</h3>
              <p className="text-[11px] text-slate-500 mt-1">Choose the destination before copying or downloading.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(formatLabels) as DeckTextFormat[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setFormat(value)}
                  className={`px-3 py-2 rounded-xl border text-[11px] font-black transition ${format === value ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'}`}
                >
                  {formatLabels[value]}
                </button>
              ))}
            </div>
            <textarea readOnly value={text} className="w-full h-64 resize-none bg-white border border-slate-200 rounded-2xl p-3 text-[11px] font-mono text-slate-800 focus:outline-none" />
            <div className="flex flex-wrap gap-2">
              <button onClick={copyText} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-xl text-xs font-black transition">
                {copied ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy text'}
              </button>
              <button onClick={() => downloadDeckText(deck, format)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-black transition">
                <Download className="w-4 h-4" /> Download .txt
              </button>
            </div>
          </section>

          <section className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900">Printable deck list</h3>
              <p className="text-[11px] text-slate-500 mt-1">Player details are optional. In the print dialog choose “Save as PDF” to keep a PDF file.</p>
            </div>
            <label className="block text-[10px] font-black uppercase text-slate-500">Player name
              <input value={player.playerName} onChange={(event) => setPlayer({ ...player, playerName: event.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 normal-case font-medium" />
            </label>
            <label className="block text-[10px] font-black uppercase text-slate-500">Player ID
              <input value={player.playerId} onChange={(event) => setPlayer({ ...player, playerId: event.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 normal-case font-medium" />
            </label>
            <label className="block text-[10px] font-black uppercase text-slate-500">Date of birth
              <input type="date" value={player.dateOfBirth} onChange={(event) => setPlayer({ ...player, dateOfBirth: event.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 normal-case font-medium" />
            </label>
            <label className="block text-[10px] font-black uppercase text-slate-500">Age division
              <select value={player.ageDivision} onChange={(event) => setPlayer({ ...player, ageDivision: event.target.value as DeckListPlayerDetails['ageDivision'] })} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 normal-case font-medium">
                <option value="">Leave blank</option><option value="Junior">Junior</option><option value="Senior">Senior</option><option value="Masters">Masters</option>
              </select>
            </label>
            {printError && <div className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{printError}</div>}
            <button onClick={openPrintView} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 rounded-2xl text-xs font-black uppercase transition shadow-sm">
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
