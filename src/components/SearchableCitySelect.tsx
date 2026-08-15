'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Building2, PlusCircle, X } from 'lucide-react';
import { db, City } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';

interface SearchableCitySelectProps {
  cities: City[];
  selectedCityId?: number;
  onSelectCity: (cityId: number | undefined) => void;
  onCityCreated?: (newCity: City) => void;
}

export default function SearchableCitySelect({
  cities,
  selectedCityId,
  onSelectCity,
  onCityCreated
}: SearchableCitySelectProps) {
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedCity = cities.find((c) => c.id === selectedCityId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCities = cities.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return c.name.toLowerCase().includes(q);
  });

  async function handleSaveNewCity(e?: React.SyntheticEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const nameTrimmed = newCityName.trim();
    if (!nameTrimmed) return;

    try {
      setIsSubmitting(true);
      // Case-insensitive duplicate check
      const allCities = await db.cities.toArray();
      const duplicate = allCities.find(
        (c) => c.name.trim().toLowerCase() === nameTrimmed.toLowerCase()
      );

      if (duplicate) {
        showToast(`City "${nameTrimmed}" already exists in the system.`, 'error');
        if (duplicate.id) {
          onSelectCity(duplicate.id);
        }
        setIsAddModalOpen(false);
        setNewCityName('');
        setIsOpen(false);
        return;
      }

      const newId = await db.cities.add({
        name: nameTrimmed,
        created_at: new Date().toISOString()
      });

      const newCityObj: City = {
        id: newId,
        name: nameTrimmed,
        created_at: new Date().toISOString()
      };

      showToast(`City "${nameTrimmed}" added successfully!`, 'success');
      if (onCityCreated) onCityCreated(newCityObj);
      onSelectCity(newId);
      setIsAddModalOpen(false);
      setNewCityName('');
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to add new city.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div ref={wrapperRef} className="relative w-full">
        {/* Selected City Display Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white flex items-center justify-between transition focus:outline-none focus:border-emerald-500 font-medium"
        >
          <div className="flex items-center space-x-2.5 truncate">
            <Building2 size={18} className="text-emerald-400 flex-shrink-0" />
            <span className={`truncate ${!selectedCity ? 'text-slate-500' : 'text-white'}`}>
              {selectedCity ? selectedCity.name : 'Select City...'}
            </span>
          </div>
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-64 flex flex-col">
            {/* Search Bar Input & Add Action */}
            <div className="p-2 border-b border-slate-800 relative bg-slate-950 flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search city..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddModalOpen(true);
                }}
                className="flex items-center space-x-1 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 font-semibold flex-shrink-0"
              >
                <PlusCircle size={14} />
                <span>+ Add</span>
              </button>
            </div>

            {/* "+ Add New City" Highlighted Option at Top */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsAddModalOpen(true);
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-emerald-950/40 text-emerald-400 font-semibold text-xs border-b border-slate-800/80 flex items-center space-x-2 transition"
            >
              <PlusCircle size={14} />
              <span>+ Add New City</span>
            </button>

            {/* List of Cities */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-800/50">
              {filteredCities.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">
                  No matching city found.
                </div>
              ) : (
                filteredCities.map((c) => {
                  const isSelected = c.id === selectedCityId;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelectCity(c.id);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-800 transition flex items-center justify-between text-xs ${
                        isSelected ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {isSelected && <Check size={16} className="text-emerald-400 ml-2 flex-shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inline Modal for Adding New City */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Building2 className="text-emerald-400" size={20} />
                <span>Add New City</span>
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddModalOpen(false);
                  setNewCityName('');
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  City Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Lahore, Multan, Sialkot..."
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSaveNewCity(e);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddModalOpen(false);
                    setNewCityName('');
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSaveNewCity(e)}
                  disabled={isSubmitting || !newCityName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-md transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save City'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
