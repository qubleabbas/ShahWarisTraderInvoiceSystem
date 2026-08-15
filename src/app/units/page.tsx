'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UnitsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/products?tab=units');
  }, [router]);

  return (
    <div className="text-center py-12 text-slate-400">
      Redirecting to Product Module (Packaging Units)...
    </div>
  );
}
