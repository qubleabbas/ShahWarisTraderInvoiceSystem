'use client';

import React, { useState, useEffect } from 'react';
import { Scale, Plus, Edit2, Trash2, Search, Package } from 'lucide-react';
import { db, Unit } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';

export default function UnitsPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<(Unit & { productCount?: number })[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitName, setUnitName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUnits();
  }, []);

  async function loadUnits() {
    try {
      const uList = await db.units.toArray();
      const prods = await db.products.toArray();

      const counts = new Map<string, number>();
      prods.forEach(p => {
        const u = p.unit.trim().toLowerCase();
        counts.set(u, (counts.get(u) || 0) + 1);
      });

      const enriched = uList.map(u => ({
        ...u,
        productCount: counts.get(u.name.trim().toLowerCase()) || 0
      }));

      setUnits(enriched);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenModal(unit?: Unit) {
    if (unit) {
      setEditingUnit(unit);
      setUnitName(unit.name);
    } else {
      setEditingUnit(null);
      setUnitName('');
    }
    setIsModalOpen(true);
  }

  async function handleSaveUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!unitName.trim()) return;

    try {
      if (editingUnit?.id) {
        await db.units.update(editingUnit.id, { name: unitName.trim() });
        showToast(`Packaging unit "${unitName.trim()}" updated successfully!`, 'success');
      } else {
        await db.units.add({ name: unitName.trim() });
        showToast(`Packaging unit "${unitName.trim()}" added successfully!`, 'success');
      }
      setIsModalOpen(false);
      setUnitName('');
      loadUnits();
    } catch (err) {
      showToast('A unit with this name already exists.', 'error');
    }
  }

  async function handleDeleteUnit(id: number) {
    const unitObj = units.find(u => u.id === id);
    if (unitObj && (unitObj.productCount || 0) > 0) {
      showToast(`Cannot delete '${unitObj.name}' because it is assigned to ${unitObj.productCount} product(s).`, 'error');
      return;
    }

    if (confirm('Are you sure you want to delete this packaging unit?')) {
      await db.units.delete(id);
      showToast(`Packaging unit "${unitObj?.name || ''}" deleted successfully!`, 'success');
      loadUnits();
    }
  }

  const filteredUnits = units.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-3">
            <Scale className="text-emerald-400" size={28} />
            <span>Product Packaging Units</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage custom measurement units (e.g., 50 ml, 20 ml, 10 grams, 800 ml bottle, 250 g jar)
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
        >
          <Plus size={18} />
          <span>Add New Unit</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search units (e.g. 50 ml, 10 grams)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* Units Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading units...</div>
      ) : filteredUnits.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
          No packaging units found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredUnits.map((unit) => (
            <div
              key={unit.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card hover:border-slate-700 transition flex items-center justify-between"
            >
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-white">{unit.name}</h3>
                <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
                  <Package size={14} />
                  <span>{unit.productCount} Products using this unit</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleOpenModal(unit)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDeleteUnit(unit.id!)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Unit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-white">
              {editingUnit ? 'Edit Unit' : 'Add Packaging Unit'}
            </h2>
            <form onSubmit={handleSaveUnit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Unit Name / Packaging
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 50 ml, 20 ml, 10 grams, 800 ml bottle"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-md"
                >
                  Save Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
