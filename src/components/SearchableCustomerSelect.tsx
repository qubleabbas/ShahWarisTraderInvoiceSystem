'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, User, PlusCircle, X, MapPin, Phone, Building2, Filter } from 'lucide-react';
import { Customer, City } from '@/lib/db';
import { fuzzyFilter } from '@/lib/fuzzySearch';

interface SearchableCustomerSelectProps {
  customers: Customer[];
  cities?: City[];
  selectedCustomerId: number;
  onSelectCustomer: (customerId: number) => void;
  onAddQuickCustomer?: () => void;
}

export default function SearchableCustomerSelect({
  customers,
  cities = [],
  selectedCustomerId,
  onSelectCustomer,
  onAddQuickCustomer
}: SearchableCustomerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCityId, setSelectedCityId] = useState<number | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const cityMap = new Map(cities.map(c => [c.id!, c.name]));
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Focus search input when modal opens & listen for ESC key
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  // Filter customers by search term and city filter
  const filteredCustomers = customers.filter((c) => {
    // City filter
    if (selectedCityId !== 'all') {
      if (c.city_id !== selectedCityId) return false;
    }

    // Search query
    const query = search.trim();
    if (!query) return true;

    return fuzzyFilter([c], query, (cust) => [
      cust.name,
      cust.phone || '',
      cust.address || '',
      cust.ntn_number || '',
      cust.stn_number || '',
      cityMap.get(cust.city_id || 0) || ''
    ]).length > 0;
  });

  return (
    <div className="w-full">
      {/* Selected Customer Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-xl px-4 py-3 text-sm text-white flex items-center justify-between transition shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 group"
      >
        <div className="flex items-center space-x-3 truncate">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition">
            <User size={18} className="text-emerald-400" />
          </div>
          <div className="text-left truncate">
            <div className="font-bold text-white text-sm truncate">
              {selectedCustomer ? selectedCustomer.name : 'Select Customer...'}
            </div>
            {selectedCustomer && (
              <div className="text-xs text-slate-400 flex items-center space-x-2 truncate mt-0.5">
                <span>{selectedCustomer.phone || 'No phone'}</span>
                {selectedCustomer.city_id && cityMap.get(selectedCustomer.city_id) && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">{cityMap.get(selectedCustomer.city_id)}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="text-xs bg-slate-800 text-slate-300 group-hover:text-emerald-400 px-2.5 py-1 rounded-lg border border-slate-700 transition">
            Change
          </span>
          <ChevronDown size={16} className="text-slate-400 group-hover:text-emerald-400 transition" />
        </div>
      </button>

      {/* Large Customer Selection Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span>Select Customer</span>
                    <span className="text-xs font-mono font-normal bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                      {filteredCustomers.length} available
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Choose a customer to populate invoice details and discount rates</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {onAddQuickCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onAddQuickCustomer();
                    }}
                    className="flex items-center space-x-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl font-bold transition shadow-lg shadow-emerald-900/30"
                  >
                    <PlusCircle size={15} />
                    <span>+ Quick Add Customer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row items-center gap-3">
              {/* Search Bar Input */}
              <div className="relative flex-1 w-full">
                <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by customer name, phone number, address, NTN..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* City Filter Dropdown */}
              <div className="relative w-full sm:w-64 flex items-center space-x-2">
                <Filter size={16} className="text-slate-400 flex-shrink-0" />
                <select
                  value={selectedCityId}
                  onChange={(e) => setSelectedCityId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="all">All Cities ({customers.length} customers)</option>
                  {cities.map((city) => {
                    const count = customers.filter((c) => c.city_id === city.id).length;
                    return (
                      <option key={city.id} value={city.id}>
                        {city.name} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Customers Grid Container */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {filteredCustomers.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <User size={40} className="mx-auto text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">No customers found</p>
                  <p className="text-xs text-slate-500">Try adjusting your search query or city filter.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredCustomers.map((c) => {
                    const isSelected = c.id === selectedCustomerId;
                    const cityName = c.city_id ? cityMap.get(c.city_id) : undefined;

                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          onSelectCustomer(c.id!);
                          setIsOpen(false);
                        }}
                        className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between space-y-3 group ${
                          isSelected
                            ? 'bg-emerald-950/30 border-emerald-500 shadow-md shadow-emerald-950/50'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 truncate pr-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-white text-base group-hover:text-emerald-400 transition truncate">
                                {c.name}
                              </span>
                            </div>
                            {c.phone && (
                              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                                <Phone size={13} className="text-slate-500 flex-shrink-0" />
                                <span>{c.phone}</span>
                              </div>
                            )}
                          </div>
                          {isSelected ? (
                            <span className="bg-emerald-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase flex items-center space-x-1 flex-shrink-0">
                              <Check size={12} />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded flex-shrink-0">
                              #{c.id}
                            </span>
                          )}
                        </div>

                        {/* Customer Details Footer */}
                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 truncate">
                          <div className="flex items-center space-x-1.5 truncate">
                            <MapPin size={13} className="text-slate-500 flex-shrink-0" />
                            <span className="truncate">
                              {cityName ? `${cityName} ${c.address ? `• ${c.address}` : ''}` : c.address || 'No address specified'}
                            </span>
                          </div>
                          {c.ntn_number && (
                            <span className="text-[10px] font-mono bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 flex-shrink-0 ml-2">
                              NTN: {c.ntn_number}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer Bar */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
              <span>Showing {filteredCustomers.length} of {customers.length} total customers</span>
              <span className="text-slate-500">Press <kbd className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 text-[10px] font-mono">ESC</kbd> to close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
