'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CategoriesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/products?tab=categories');
  }, [router]);

  return (
    <div className="text-center py-12 text-slate-400">
      Redirecting to Products & Categories...
    </div>
  );
}
