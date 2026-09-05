'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, User, PlusCircle } from 'lucide-react';
import { Customer } from '@/lib/db';
import { fuzzyFilter } from '@/lib/fuzzySearch';

interface SearchableCustomerSelectProps {
  customers: Customer[];
  selectedCustomerId: number;
  onSelectCustomer: (customerId: number) => void;
  onAddQuickCustomer?: () => void;
}

export default function SearchableCustomerSelect({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onAddQuickCustomer
}: SearchableCustomerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCustomers = fuzzyFilter(customers, search, (c) => [
    c.id,
    c.name,
    c.phone,
    c.address
  ]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Selected Customer Display Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-4 py-3 text-sm text-white flex items-center justify-between transition focus:outline-none focus:border-emerald-500 font-semibold"
      >
        <div className="flex items-center space-x-2.5 truncate">
          <User size={18} className="text-emerald-400 flex-shrink-0" />
          <span className="truncate">
            {selectedCustomer
              ? `${selectedCustomer.name} (${selectedCustomer.phone || 'No phone'})`
              : 'Select Customer...'}
          </span>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-72 flex flex-col">
          {/* Search Bar Input */}
          <div className="p-2.5 border-b border-slate-800 relative bg-slate-950 flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search customer name, phone, address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            {onAddQuickCustomer && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddQuickCustomer();
                }}
                className="flex items-center space-x-1 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 font-semibold flex-shrink-0"
              >
                <PlusCircle size={14} />
                <span>+ Add</span>
              </button>
            )}
          </div>

          {/* List of Customers */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-800/50">
            {filteredCustomers.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching customer found.
              </div>
            ) : (
              filteredCustomers.map((c) => {
                const isSelected = c.id === selectedCustomerId;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelectCustomer(c.id!);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full text-left p-3 hover:bg-slate-800/80 transition flex items-center justify-between text-xs ${
                      isSelected ? 'bg-slate-800/90 text-emerald-400 font-bold' : 'text-slate-200'
                    }`}
                  >
                    <div className="space-y-0.5 truncate">
                      <div className="font-bold text-white text-sm truncate">{c.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-2 truncate">
                        <span>Phone: {c.phone || 'N/A'}</span>
                        {c.address && (
                          <>
                            <span>•</span>
                            <span className="truncate">{c.address}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={16} className="text-emerald-400 ml-2 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
