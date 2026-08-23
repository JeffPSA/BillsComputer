import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  RotateCcw,
  Square,
} from 'lucide-react';
import { createAdminBackup, fetchAdminHealth, startAdminSync, stopAdminSync } from '../../services/api';

export const AdminPortal: React.FC = () => {
  const [health, setHealth] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [setCode, setSetCode] = useState('');

  const refreshHealth = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminHealth();
      setHealth(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshHealth();
  }, []);

  useEffect(() => {
    if (!health?.syncJob?.running) return;
    const timer = window.setInterval(refreshHealth, 3000);
    return () => window.clearInterval(timer);
  }, [health?.syncJob?.running]);

  const handleSync = async (mode: 'incremental' | 'force' | 'sets-only') => {
    const label =
      mode === 'force' ? 'full resync' :
      mode === 'sets-only' ? 'new-set scan' :
      'incremental sync';
    if (mode === 'force' && !window.confirm('Run a full card database resync? This can take a long time and will use the Pokémon TCG API heavily.')) {
      return;
    }

    setActionMessage(`Starting ${label}...`);
    const result = await startAdminSync(mode);
    setActionMessage(result.message || `${label} requested`);
    await refreshHealth();
  };

  const handleSingleSetSync = async () => {
    const trimmed = setCode.trim();
    if (!trimmed) {
      setActionMessage('Enter a set code or set ID first.');
      return;
    }

    setActionMessage(`Starting sync for ${trimmed}...`);
    const result = await startAdminSync('single-set', { setCode: trimmed });
    setActionMessage(result.message || `Single-set sync requested for ${trimmed}`);
    await refreshHealth();
  };

  const handleStopSync = async () => {
    setActionMessage('Requesting sync stop...');
    const result = await stopAdminSync();
    setActionMessage(result.message || 'Stop requested');
    await refreshHealth();
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupMessage(null);
    setActionMessage('Creating database backup...');
    try {
      const result = await createAdminBackup();
      if (result.success) {
        const sizeMb = result.sizeBytes ? (result.sizeBytes / 1024 / 1024).toFixed(1) : '?';
        const backupName = result.backupPath?.split(/[\\/]/).pop() || 'SQLite backup';
        const message = `Backup created: ${backupName} (${sizeMb} MB)`;
        setBackupMessage({ type: 'success', text: message });
        setActionMessage(message);
      } else {
        const message = result.error || 'Backup failed';
        setBackupMessage({ type: 'error', text: message });
        setActionMessage(message);
      }
    } catch (err: any) {
      const message = err?.message || 'Backup failed';
      setBackupMessage({ type: 'error', text: message });
      setActionMessage(message);
    } finally {
      setBackupLoading(false);
      await refreshHealth();
    }
  };

  const stats = health?.stats || {};
  const metadata = health?.syncMetadata || {};
  const syncJob = health?.syncJob || {};
  const progress = syncJob.progress || {};
  const integrity = health?.allocationIntegrity;
  const pendingFailedSets = Array.isArray(metadata.failedSetIds) ? metadata.failedSetIds : [];
  const progressPercent = typeof progress.percent === 'number'
    ? Math.max(0, Math.min(100, progress.percent))
    : syncJob.running
      ? 12
      : syncJob.status === 'completed'
        ? 100
        : 0;

  const statCards = [
    ['Cards', stats.totalCards],
    ['Printings', stats.totalPrintings],
    ['Sets', stats.totalSets],
    ['Collection Items', stats.totalCollectionItems],
    ['Decks', stats.totalDecks],
    ['Requirements', stats.totalDeckRequirements],
    ['Allocations', stats.totalAllocations],
    ['Acquisitions', stats.totalAcquisitions],
  ];

  return (
    <div className="space-y-6">
      <div className="bg-indigo-700 border-4 border-indigo-900 p-6 rounded-[32px] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black italic uppercase tracking-tight text-white flex items-center space-x-2">
            <Database className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
            <span>Admin Portal</span>
          </h1>
          <p className="text-xs text-indigo-100 font-medium pt-0.5">
            Database health, sync controls, backups, and maintenance checks.
          </p>
        </div>

        <button
          onClick={refreshHealth}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-black uppercase rounded-2xl border border-indigo-200 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 stroke-[2.5]" />}
          <span>Refresh</span>
        </button>
      </div>

      {actionMessage && (
        <div className="bg-white border border-indigo-200 p-4 rounded-3xl text-xs font-bold text-indigo-900 shadow-sm">
          {actionMessage}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(([label, value]) => (
          <div key={label} className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
            <div className="text-2xl font-black text-slate-900">{value ?? '-'}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-black italic uppercase text-slate-900">Sync Controls</h2>
            {syncJob.running && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
                Running
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => handleSync('incremental')}
              disabled={syncJob.running}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-black uppercase rounded-2xl shadow-sm transition"
            >
              <RotateCcw className="w-4 h-4 stroke-[2.5]" />
              <span>Incremental Sync</span>
            </button>
            <button
              onClick={() => handleSync('force')}
              disabled={syncJob.running}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-indigo-950 text-xs font-black uppercase rounded-2xl shadow-sm transition"
            >
              <RefreshCw className="w-4 h-4 stroke-[2.5]" />
              <span>Full Resync</span>
            </button>
            <button
              onClick={handleStopSync}
              disabled={!syncJob.running || syncJob.stopRequested}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black uppercase rounded-2xl shadow-sm transition"
            >
              <Square className="w-4 h-4 stroke-[2.5]" />
              <span>{syncJob.running && syncJob.stopRequested ? 'Stopping...' : 'Stop Sync'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => handleSync('sets-only')}
              disabled={syncJob.running}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 text-xs font-black uppercase rounded-2xl border border-slate-200 transition"
            >
              <Database className="w-4 h-4 stroke-[2.5]" />
              <span>Find & Sync New Sets</span>
            </button>

            <div className="flex gap-2">
              <input
                type="text"
                value={setCode}
                onChange={(e) => setSetCode(e.target.value)}
                placeholder="Set code, e.g. PFL"
                className="min-w-0 flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 font-bold"
              />
              <button
                onClick={handleSingleSetSync}
                disabled={syncJob.running || !setCode.trim()}
                className="px-4 py-2.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-black uppercase rounded-2xl transition"
              >
                Sync Set
              </button>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sync Status</div>
                <div className="text-xs font-black text-slate-900 truncate">
                  {progress.message || (syncJob.running ? 'Sync running...' : syncJob.status || 'Idle')}
                </div>
              </div>
              <div className="text-xs font-black text-indigo-700">
                {syncJob.running ? `${Math.round(progressPercent)}%` : syncJob.status || 'idle'}
              </div>
            </div>

            <div className="h-3 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
              <div
                className={`h-full transition-all ${syncJob.stopRequested ? 'bg-rose-500' : syncJob.running ? 'bg-indigo-600' : 'bg-emerald-500'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-bold">
              <div>Phase: <span className="text-slate-800">{progress.phase || '-'}</span></div>
              <div>Set: <span className="text-slate-800">{progress.currentSetName || progress.currentSetId || '-'}</span></div>
              <div>Page: <span className="text-slate-800">{progress.currentPage || '-'}</span></div>
              <div>
                Sets: <span className="text-slate-800">
                  {progress.currentSetIndex && progress.totalSets ? `${progress.currentSetIndex}/${progress.totalSets}` : '-'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2 font-medium">
            <div>Last sync: <span className="font-black text-slate-900">{metadata.lastSyncTimestamp ? new Date(metadata.lastSyncTimestamp).toLocaleString() : 'Never'}</span></div>
            <div>Last synced set: <span className="font-black text-slate-900">{metadata.lastSyncedSetId || '-'}</span></div>
            <div>Pending failed sets: <span className="font-black text-slate-900">{pendingFailedSets.length}</span></div>
            {syncJob.startedAt && (
              <div>Current/last job: <span className="font-black text-slate-900">{syncJob.mode} sync started {new Date(syncJob.startedAt).toLocaleString()}</span></div>
            )}
            {syncJob.error && (
              <div className="text-rose-700 font-bold">Last sync error: {syncJob.error}</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-black italic uppercase text-slate-900">Maintenance</h2>
            {integrity?.ok ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Healthy
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-rose-700 bg-rose-100 border border-rose-300 px-2.5 py-1 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" />
                Check Needed
              </span>
            )}
          </div>

          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 text-xs font-black uppercase rounded-2xl border border-slate-200 transition"
          >
            {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 stroke-[2.5]" />}
            <span>{backupLoading ? 'Creating Backup...' : 'Create SQLite Backup'}</span>
          </button>

          {backupMessage && (
            <div
              className={`rounded-2xl border p-3 text-xs font-bold ${
                backupMessage.type === 'success'
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                  : 'bg-rose-100 border-rose-300 text-rose-900'
              }`}
            >
              {backupMessage.text}
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2 font-medium">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-700 flex-shrink-0 mt-0.5" />
              <span>
                Allocation integrity: <span className="font-black text-slate-900">{integrity?.ok ? 'No over-allocation detected' : integrity?.error || 'Unknown'}</span>
              </span>
            </div>
            <div>Failed-set retry queue: <span className="font-black text-slate-900">{pendingFailedSets.length ? pendingFailedSets.join(', ') : 'Empty'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};
