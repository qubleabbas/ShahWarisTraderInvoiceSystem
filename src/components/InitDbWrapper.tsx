'use client';

import { useEffect, useState } from 'react';
import { Cloud, RefreshCw, X } from 'lucide-react';
import { initSeedData } from '@/lib/db';
import {
  getStartupSyncAction,
  downloadAndRestoreFromDrive,
  registerLifecycleAutoBackup
} from '@/lib/gdrive';
import { useToast } from '@/components/ToastProvider';

export default function InitDbWrapper() {
  const { showToast } = useToast();
  const [promptOpen, setPromptOpen] = useState(false);
  const [cloudTime, setCloudTime] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    async function initApp() {
      // Seeding is best-effort — a failure here must not disable cloud sync.
      try {
        await initSeedData();
      } catch (err) {
        console.error('Seed data initialization skipped:', err);
      }

      try {
        // Back up automatically when the user leaves or closes the site.
        registerLifecycleAutoBackup();

        // Decide what to do with the cloud backup on this open.
        const action = await getStartupSyncAction();
        if (action.type === 'auto-restore') {
          // Fresh device — pull the latest data silently, then refresh the views.
          const ok = await downloadAndRestoreFromDrive();
          if (ok) {
            showToast('Restored your data from Google Drive.', 'success');
            setTimeout(() => window.location.reload(), 800);
          }
        } else if (action.type === 'prompt') {
          setCloudTime(action.cloudModifiedTime);
          setPromptOpen(true);
        }
      } catch (err) {
        console.error('Failed to initialize app data storage:', err);
      }
    }

    initApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRestoreNewer() {
    setIsRestoring(true);
    try {
      const ok = await downloadAndRestoreFromDrive();
      if (ok) {
        showToast('Data restored from Google Drive.', 'success');
        setPromptOpen(false);
        setTimeout(() => window.location.reload(), 600);
      } else {
        showToast('Could not restore from Google Drive.', 'error');
        setIsRestoring(false);
      }
    } catch (err) {
      console.error(err);
      showToast('Could not restore from Google Drive.', 'error');
      setIsRestoring(false);
    }
  }

  function handleKeepLocal() {
    // User chose to keep this device's data. The next auto-backup will overwrite
    // the cloud copy with this device's version.
    setPromptOpen(false);
  }

  if (!promptOpen) return null;

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <Cloud size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Newer backup found</h2>
              <p className="text-xs text-slate-400">On your Google Drive</p>
            </div>
          </div>
          <button
            onClick={handleKeepLocal}
            disabled={isRestoring}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-slate-300">
          Your Google Drive backup was updated on another device
          {cloudTime ? (
            <> (<span className="font-semibold text-white">{new Date(cloudTime).toLocaleString()}</span>)</>
          ) : null}
          . Restore it to bring this device up to date?
        </p>
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
          Restoring replaces the data currently on this device with the cloud version.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={handleKeepLocal}
            disabled={isRestoring}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            Keep this device&apos;s data
          </button>
          <button
            onClick={handleRestoreNewer}
            disabled={isRestoring}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRestoring ? 'animate-spin' : ''} />
            <span>{isRestoring ? 'Restoring…' : 'Restore from Drive'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
