'use client';

import { useEffect } from 'react';
import { initSeedData } from '@/lib/db';
import { autoCheckAndRestoreFromDrive } from '@/lib/gdrive';

export default function InitDbWrapper() {
  useEffect(() => {
    async function initApp() {
      try {
        await initSeedData();
        await autoCheckAndRestoreFromDrive();
      } catch (err) {
        console.error("Failed to initialize app data storage:", err);
      }
    }

    initApp();
  }, []);

  return null;
}
