'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, ArrowDownCircle } from 'lucide-react';

interface PaginationProps {
  currentPage: number; // 1-indexed
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  itemName?: string;
  className?: string;
  enableAutoLoadOnScroll?: boolean;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemName = 'items',
  className = '',
  enableAutoLoadOnScroll = true
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const startItem = totalItems === 0 ? 0 : 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const lastTriggeredPageRef = useRef<number>(safeCurrentPage);

  useEffect(() => {
    lastTriggeredPageRef.current = safeCurrentPage;
    setIsAutoLoading(false);
  }, [safeCurrentPage]);

  // Track if user has scrolled to avoid triggering on initial load without user intent
  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(true);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto load next page when sentinel becomes visible near bottom of scroll container / window
  useEffect(() => {
    if (!enableAutoLoadOnScroll || safeCurrentPage >= safeTotalPages) return;

    const triggerNextPage = () => {
      if (lastTriggeredPageRef.current < safeTotalPages && !isAutoLoading) {
        setIsAutoLoading(true);
        const nextPage = lastTriggeredPageRef.current + 1;
        lastTriggeredPageRef.current = nextPage;
        onPageChange(nextPage);
      }
    };

    // Intersection Observer
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasScrolled) {
          triggerNextPage();
        }
      },
      {
        root: null,
        rootMargin: '300px', // Trigger 300px before reaching bottom
        threshold: 0.05
      }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    // Scroll listener fallback for container scrollable divs
    const handleScrollFallback = () => {
      if (!hasScrolled || isAutoLoading) return;
      if (sentinelRef.current) {
        const rect = sentinelRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        if (rect.top <= windowHeight + 300) {
          triggerNextPage();
        }
      }
    };

    window.addEventListener('scroll', handleScrollFallback, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScrollFallback);
    };
  }, [safeCurrentPage, safeTotalPages, onPageChange, enableAutoLoadOnScroll, hasScrolled, isAutoLoading]);

  return (
    <div className="w-full">
      {/* Sentinel element placed right above pagination bar */}
      <div ref={sentinelRef} className="h-1 w-full pointer-events-none opacity-0" />

      <div className={`p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 bg-slate-950/90 rounded-b-2xl ${className}`}>
        {/* Items count & page size select */}
        <div className="flex items-center space-x-3">
          <span>
            Showing <span className="font-semibold text-white">{startItem}</span>–<span className="font-semibold text-white">{endItem}</span> of{' '}
            <span className="font-semibold text-white">{totalItems}</span> {itemName}
          </span>
          {onPageSizeChange && (
            <div className="flex items-center space-x-1.5 border-l border-slate-800 pl-3">
              <span className="text-slate-500">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  onPageSizeChange(Number(e.target.value));
                  onPageChange(1); // Reset to page 1 when size changes
                }}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          )}
        </div>

        {/* Page controls & Auto-load status */}
        <div className="flex items-center space-x-2">
          {safeCurrentPage < safeTotalPages && enableAutoLoadOnScroll && (
            <span className="text-[10px] text-emerald-400/90 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20 font-medium flex items-center space-x-1">
              {isAutoLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin text-emerald-400" />
                  <span>Loading next page...</span>
                </>
              ) : (
                <>
                  <ArrowDownCircle size={12} className="text-emerald-400" />
                  <span>Auto-loads on scroll</span>
                </>
              )}
            </span>
          )}

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => onPageChange(1)}
              disabled={safeCurrentPage <= 1}
              title="First Page"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition text-slate-300 disabled:cursor-not-allowed"
            >
              <ChevronsLeft size={15} />
            </button>
            <button
              onClick={() => onPageChange(safeCurrentPage - 1)}
              disabled={safeCurrentPage <= 1}
              title="Previous Page"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition text-slate-300 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={15} />
            </button>

            <span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 font-semibold text-xs">
              Page {safeCurrentPage} of {safeTotalPages}
            </span>

            <button
              onClick={() => onPageChange(safeCurrentPage + 1)}
              disabled={safeCurrentPage >= safeTotalPages}
              title="Next Page"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition text-slate-300 disabled:cursor-not-allowed"
            >
              <ChevronRight size={15} />
            </button>
            <button
              onClick={() => onPageChange(safeTotalPages)}
              disabled={safeCurrentPage >= safeTotalPages}
              title="Last Page"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition text-slate-300 disabled:cursor-not-allowed"
            >
              <ChevronsRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
