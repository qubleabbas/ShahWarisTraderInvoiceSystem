'use client';

import { useEffect } from 'react';
import { initSeedData } from '@/lib/db';
import { reconcileAllLedger } from '@/lib/ledger';
import { initSyncOnStartup } from '@/lib/gdrive';

/**
 * Boots local data and the multi-device sync engine on app load:
 *  1. Seed defaults if the DB is empty.
 *  2. Start the background sync engine and do the initial sync — a fresh device
 *     pulls the cloud copy wholesale; a returning device merges both ways.
 *     Ongoing changes from other devices are pulled automatically (on focus and
 *     on a short interval) and applied silently, so screens stay up to date.
 *  3. Reconcile the ledger once data has settled.
 */
export default function InitDbWrapper() {
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        await initSeedData();
      } catch (err) {
        console.error('Seed data initialization skipped:', err);
      }

      // Merge/restore from the cloud before reconciling, so we reconcile the
      // fully-synced data set. Safe to run when not connected (no-op).
      try {
        await initSyncOnStartup();
      } catch (err) {
        console.error('Startup sync skipped:', err);
      }

      if (cancelled) return;

      try {
        await reconcileAllLedger();
      } catch (err) {
        console.error('Ledger reconciliation skipped:', err);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // The engine now merges silently — no "newer backup" prompt needed.
  return null;
}
