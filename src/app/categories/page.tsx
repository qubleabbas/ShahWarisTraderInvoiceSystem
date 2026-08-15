'use client';

import React, { useState, useEffect } from 'react';
import { FolderTree, Plus, Edit2, Trash2, Search, Package } from 'lucide-react';
import { db, Category, recordTombstone, subscribeDataChanged } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';

export default function CategoriesPage() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<(Category & { productCount?: number })[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
    const unsub = subscribeDataChanged(() => loadCategories());
    return () => unsub();
  }, []);

  async function loadCategories() {
    try {
      const cats = await db.categories.toArray();
      const prods = await db.products.toArray();

      const prodCounts = new Map<number, number>();
      prods.forEach(p => {
        prodCounts.set(p.category_id, (prodCounts.get(p.category_id) || 0) + 1);
      });

      const enriched = cats.map(c => ({
        ...c,
        productCount: prodCounts.get(c.id!) || 0
      }));

      setCategories(enriched);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenModal(category?: Category) {
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
    } else {
      setEditingCategory(null);
      setCategoryName('');
    }
    setIsModalOpen(true);
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryName.trim()) return;

    try {
      if (editingCategory?.id) {
        await db.categories.update(editingCategory.id, { name: categoryName.trim() });
        showToast(`Category "${categoryName.trim()}" updated successfully!`, 'success');
      } else {
        await db.categories.add({ name: categoryName.trim() });
        showToast(`Category "${categoryName.trim()}" added successfully!`, 'success');
      }
      setIsModalOpen(false);
      setCategoryName('');
      loadCategories();
    } catch (err) {
      showToast('A category with this name already exists.', 'error');
    }
  }

  async function handleDeleteCategory(id: number) {
    const cat = categories.find(c => c.id === id);
    const prodCount = cat?.productCount || 0;
    if (prodCount > 0) {
      showToast(`Cannot delete this category because it contains ${prodCount} active product(s).`, 'error');
      return;
    }

    if (confirm('Are you sure you want to delete this category?')) {
      await db.categories.delete(id);
      await recordTombstone('categories', id);
      showToast(`Category "${cat?.name || ''}" deleted successfully!`, 'success');
      loadCategories();
    }
  }

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-3">
            <FolderTree className="text-emerald-400" size={28} />
            <span>Product Categories</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Organize products into custom categories (Sharbat, Majoon, Arq, Syrups, etc.)
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
        >
          <Plus size={18} />
          <span>Add New Category</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* Categories Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading categories...</div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
          No categories found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card hover:border-slate-700 transition flex items-center justify-between"
            >
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-white">{cat.name}</h3>
                <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
                  <Package size={14} />
                  <span>{cat.productCount} Products</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleOpenModal(cat)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDeleteCategory(cat.id!)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-white">
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </h2>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sharbat (Syrups)"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
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
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
