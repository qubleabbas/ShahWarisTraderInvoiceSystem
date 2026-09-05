'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Package, X, Filter, Tag, Layers, Building2 } from 'lucide-react';
import { Product, Category, Company, db } from '@/lib/db';
import { fuzzyFilter } from '@/lib/fuzzySearch';

interface SearchableProductSelectProps {
  products: Product[];
  categories: Category[];
  companies?: Company[];
  selectedProductId: number;
  onSelectProduct: (productId: number) => void;
  currency?: string;
  effectiveStockMap?: Map<number, number>;
  rowIndex?: number;
}

export default function SearchableProductSelect({
  products,
  categories,
  companies: initialCompanies,
  selectedProductId,
  onSelectProduct,
  currency = 'Rs.',
  effectiveStockMap,
  rowIndex
}: SearchableProductSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'id'>('name');
  const [companies, setCompanies] = useState<Company[]>(initialCompanies || []);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | 'all'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync initialCompanies or fetch from db if not passed
  useEffect(() => {
    if (initialCompanies && initialCompanies.length > 0) {
      setCompanies(initialCompanies);
    } else {
      db.companies.toArray().then((comps) => setCompanies(comps)).catch(console.error);
    }
  }, [initialCompanies]);

  const categoryMap = new Map(categories.map((c) => [c.id!, c.name]));
  const companyMap = new Map(companies.map((c) => [c.id!, c.name]));
  const selectedProduct = products.find((p) => p.id === selectedProductId);

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

  // Filter products by company, category, and segment search (Name vs Exact Product ID)
  const filteredProducts = products.filter((p) => {
    // Company filter
    if (selectedCompanyId !== 'all') {
      if (p.company_id !== selectedCompanyId) return false;
    }

    // Category filter
    if (selectedCategoryId !== 'all') {
      if (p.category_id !== selectedCategoryId) return false;
    }

    const query = search.trim();
    if (!query) return true;

    if (searchMode === 'id') {
      // Clean leading # and whitespace
      const cleanId = query.replace(/^#/, '').trim();
      return String(p.id) === cleanId;
    } else {
      // Search by Name / Details
      return fuzzyFilter([p], query, (prod) => [
        prod.name,
        prod.unit,
        categoryMap.get(prod.category_id) || '',
        companyMap.get(prod.company_id || 0) || ''
      ]).length > 0;
    }
  });

  return (
    <div className="w-full">
      {/* Selected Product Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white flex items-center justify-between transition shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 group"
      >
        <div className="flex items-center space-x-2 truncate">
          <Package size={14} className="text-emerald-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
          <span className="font-semibold truncate">
            {selectedProduct
              ? `#${selectedProduct.id} - ${selectedProduct.name} (${selectedProduct.unit})`
              : 'Select Product...'}
          </span>
        </div>
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {selectedProduct && (
            <span className="text-[11px] font-bold text-emerald-400">
              {currency} {selectedProduct.price}
            </span>
          )}
          <ChevronDown size={14} className="text-slate-400 group-hover:text-white transition" />
        </div>
      </button>

      {/* Large Product Selection Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span>Select Product {rowIndex !== undefined ? `for Item #${rowIndex + 1}` : ''}</span>
                    <span className="text-xs font-mono font-normal bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                      {filteredProducts.length} items
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Filter by company, category or search by product name/ID</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-col gap-3">
              {/* Row 1: Segment Switcher & Dropdown Filters */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                {/* Segmented Control Search Mode Switcher */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode('name');
                      setSearch('');
                    }}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      searchMode === 'name'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    Search by Name / Details
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode('id');
                      setSearch('');
                    }}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      searchMode === 'id'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    Search by Product ID
                  </button>
                </div>

                {/* Company Filter Dropdown */}
                <div className="relative w-full sm:w-56 flex items-center space-x-1.5">
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">All Companies ({companies.length})</option>
                    {companies.map((comp) => {
                      const count = products.filter((p) => p.company_id === comp.id).length;
                      return (
                        <option key={comp.id} value={comp.id}>
                          {comp.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Category Filter Dropdown */}
                <div className="relative w-full sm:w-48 flex items-center space-x-1.5">
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">All Categories ({categories.length})</option>
                    {categories.map((cat) => {
                      const count = products.filter((p) => p.category_id === cat.id).length;
                      return (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Row 2: Search Input */}
              <div className="relative w-full">
                <Search size={18} className="absolute left-3.5 top-2.5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={
                    searchMode === 'id'
                      ? 'Enter exact Product ID (e.g. 5 or #5)...'
                      : 'Search by product name, unit, category, or company...'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Product Table Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredProducts.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <Package size={40} className="mx-auto text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">
                    {searchMode === 'id' && search.trim()
                      ? `No product found matching exact ID #${search.replace(/^#/, '').trim()}`
                      : 'No products found'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {searchMode === 'id'
                      ? 'Try typing a valid numeric product ID or switch to "Search by Name"'
                      : 'Try adjusting your search query, company filter, or category filter.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-950 text-slate-400 text-xs font-semibold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Product ID</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Company</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4 text-center">Available Stock</th>
                      <th className="py-3 px-4 text-right">Price</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {filteredProducts.map((p) => {
                      const isSelected = p.id === selectedProductId;
                      const catName = categoryMap.get(p.category_id) || 'General';
                      const compName = p.company_id ? companyMap.get(p.company_id) : undefined;
                      const stockVal = effectiveStockMap
                        ? (effectiveStockMap.get(p.id!) ?? p.stock_quantity)
                        : p.stock_quantity;

                      return (
                        <tr
                          key={p.id}
                          onClick={() => {
                            onSelectProduct(p.id!);
                            setIsOpen(false);
                          }}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? 'bg-emerald-950/40 text-white font-bold'
                              : 'hover:bg-slate-800/60 text-slate-200'
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono">
                            <span className="bg-slate-950 text-slate-300 px-2 py-1 rounded border border-slate-800 font-bold">
                              #{p.id}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-white text-sm">
                            <div className="flex items-center space-x-2">
                              <span>{p.name}</span>
                              {isSelected && (
                                <span className="bg-emerald-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                  Selected
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {compName ? (
                              <span className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-medium">
                                {compName}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                              {catName}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300 font-medium">{p.unit}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full font-bold text-xs inline-block ${
                                stockVal <= 0
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : stockVal <= 10
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              {stockVal} {p.unit}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-extrabold text-white text-sm">
                            {currency} {p.price.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectProduct(p.id!);
                                setIsOpen(false);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-800 text-slate-300 hover:bg-emerald-600 hover:text-white'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer Bar */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
              <span>Showing {filteredProducts.length} of {products.length} total products</span>
              <span className="text-slate-500">Press <kbd className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 text-[10px] font-mono">ESC</kbd> to close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
