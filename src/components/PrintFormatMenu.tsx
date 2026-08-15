'use client';

import React, { useState } from 'react';
import { FileText, Receipt, ChevronDown } from 'lucide-react';
import type { PrintFormat } from '@/lib/pdfPrint';

interface PrintFormatMenuProps {
  onSelect: (format: PrintFormat) => void;
  label: string;
  icon: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Small dropdown that lets the user pick the print/export layout:
 *   - A4 Invoice (standard full-page)
 *   - Thermal Receipt (80mm POS roll)
 * Format-agnostic: the parent decides what to do with the chosen format.
 */
export default function PrintFormatMenu({
  onSelect,
  label,
  icon,
  busy = false,
  disabled = false,
  variant = 'secondary',
  align = 'right',
  className = '',
}: PrintFormatMenuProps) {
  const [open, setOpen] = useState(false);

  const base =
    variant === 'primary'
      ? 'bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 shadow-md'
      : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700';

  function choose(format: PrintFormat) {
    setOpen(false);
    onSelect(format);
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50 ${base}`}
      >
        {icon}
        <span>{busy ? 'Working…' : label}</span>
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-50 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            <button
              type="button"
              onClick={() => choose('a4')}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-800"
            >
              <FileText size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <span>
                <span className="block text-sm font-semibold text-white">A4 Invoice</span>
                <span className="block text-[11px] text-slate-400">Standard full-page format</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => choose('thermal')}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-800"
            >
              <Receipt size={18} className="mt-0.5 shrink-0 text-sky-400" />
              <span>
                <span className="block text-sm font-semibold text-white">Thermal Receipt</span>
                <span className="block text-[11px] text-slate-400">80mm POS / grocery printer</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
