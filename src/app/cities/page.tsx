'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CitiesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/customers?tab=cities');
  }, [router]);

  return (
    <div className="text-center py-12 text-slate-400">
      Redirecting to Customer Module (Cities)...
    </div>
  );
}
