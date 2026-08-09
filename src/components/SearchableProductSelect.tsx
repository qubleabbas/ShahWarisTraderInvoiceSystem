'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Package } from 'lucide-react';
import { Product, Category } from '@/lib/db';

interface SearchableProductSelectProps {
  products: Product[];
  categories: Category[];
  selectedProductId: number;
  onSelectProduct: (productId: number) => void;
  currency?: string;
}

export default function SearchableProductSelect({
  products,
  categories,
  selectedProductId,
  onSelectProduct,
  currency = 'Rs.'
}: SearchableProductSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const categoryMap = new Map(categories.map((c) => [c.id!, c.name]));
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const catName = (categoryMap.get(p.category_id) || '').toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.unit.toLowerCase().includes(q) ||
      catName.includes(q)
    );
  });

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Selected Product Display Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs text-white flex items-center justify-between transition focus:outline-none focus:border-emerald-500"
      >
        <div className="flex items-center space-x-2 truncate">
          <Package size={14} className="text-emerald-400 flex-shrink-0" />
          <span className="font-semibold truncate">
            {selectedProduct ? `${selectedProduct.name} (${selectedProduct.unit})` : 'Select Product...'}
          </span>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-64 flex flex-col">
          {/* Search Bar Input */}
          <div className="p-2 border-b border-slate-800 relative bg-slate-950">
            <Search size={14} className="absolute left-4 top-3.5 text-slate-400" />
            <input
              type="text"
              autoFocus
              placeholder="Search product name, unit, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* List of Products */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-800/50">
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching products found.
              </div>
            ) : (
              filteredProducts.map((p) => {
                const isSelected = p.id === selectedProductId;
                const catName = categoryMap.get(p.category_id) || 'General';

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectProduct(p.id!);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full text-left p-2.5 hover:bg-slate-800/80 transition flex items-center justify-between text-xs ${
                      isSelected ? 'bg-slate-800/90 text-emerald-400 font-bold' : 'text-slate-200'
                    }`}
                  >
                    <div className="space-y-0.5 truncate">
                      <div className="font-semibold text-white truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center space-x-2">
                        <span>{p.unit}</span>
                        <span>•</span>
                        <span className="text-emerald-400/90">{catName}</span>
                        <span>•</span>
                        <span className="text-slate-300">Stock: {p.stock_quantity}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                      <span className="font-extrabold text-white">
                        {currency} {p.price}
                      </span>
                      {isSelected && <Check size={14} className="text-emerald-400" />}
                    </div>
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
