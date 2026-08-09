'use client';

import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, Edit2, Trash2, AlertTriangle, Eye, History, ArrowDownRight } from 'lucide-react';
import { db, Product, Category, Unit, InvoiceItem, Invoice, Customer } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';

export default function ProductsPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [currency, setCurrency] = useState('Rs.');

  // Filters & Modal state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  // Form Fields & Restock state
  const [modalMode, setModalMode] = useState<'details' | 'restock'>('details');
  const [formData, setFormData] = useState({
    name: '',
    category_id: 0,
    unit: '800 ml bottle',
    custom_unit: '',
    price: 0, // Sale Price
    purchase_price: 0, // Purchase Price
    stock_quantity: 0,
    min_stock_warning: 10
  });

  // Restock calculation fields
  const [restockQty, setRestockQty] = useState<number>(0);
  const [restockPrice, setRestockPrice] = useState<number>(0);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const prods = await db.products.toArray();
      const cats = await db.categories.toArray();
      const uList = await db.units.toArray();
      const invs = await db.invoices.toArray();
      const custs = await db.customers.toArray();
      const items = await db.invoice_items.toArray();
      const curr = await db.settings.get('currency_symbol');

      setProducts(prods);
      setCategories(cats);
      setUnits(uList);
      setInvoices(invs);
      setCustomers(custs);
      setInvoiceItems(items);
      if (curr) setCurrency(curr.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const categoryMap = new Map(categories.map(c => [c.id!, c.name]));
  const customerMap = new Map(customers.map(c => [c.id!, c.name]));
  const invoiceMap = new Map(invoices.map(i => [i.id!, i]));

  function handleOpenModal(product?: Product, initialMode: 'details' | 'restock' = 'details') {
    setModalMode(initialMode);
    if (product) {
      setEditingProduct(product);
      const pPrice = product.purchase_price ?? product.cost_price ?? 0;
      setFormData({
        name: product.name,
        category_id: product.category_id,
        unit: product.unit,
        custom_unit: '',
        price: product.price,
        purchase_price: pPrice,
        stock_quantity: product.stock_quantity,
        min_stock_warning: product.min_stock_warning || 10
      });
      setRestockQty(0);
      setRestockPrice(pPrice);
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        category_id: categories.length > 0 ? categories[0].id! : 0,
        unit: units.length > 0 ? units[0].name : '800 ml bottle',
        custom_unit: '',
        price: 0,
        purchase_price: 0,
        stock_quantity: 0,
        min_stock_warning: 10
      });
      setRestockQty(0);
      setRestockPrice(0);
    }
    setIsModalOpen(true);
  }

  // Calculate live weighted average purchase price for restock mode
  const currentOldStock = formData.stock_quantity;
  const currentOldPrice = formData.purchase_price;
  const addedQty = Math.max(0, restockQty);
  const newBatchPrice = Math.max(0, restockPrice);
  const totalCombinedStock = currentOldStock + addedQty;
  const calculatedWeightedAvgPrice = totalCombinedStock > 0
    ? Number((((currentOldStock * currentOldPrice) + (addedQty * newBatchPrice)) / totalCombinedStock).toFixed(2))
    : newBatchPrice;

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim() || formData.category_id === 0) {
      alert('Please fill out product name and select a valid category.');
      return;
    }

    const finalUnit = formData.unit === 'CUSTOM' ? formData.custom_unit.trim() : formData.unit.trim();
    if (!finalUnit) {
      alert('Please specify a valid packaging unit.');
      return;
    }

    // Save unit to db if custom
    if (formData.unit === 'CUSTOM' && formData.custom_unit.trim()) {
      const exists = units.some(u => u.name.toLowerCase() === formData.custom_unit.trim().toLowerCase());
      if (!exists) {
        await db.units.add({ name: formData.custom_unit.trim() });
      }
    }

    try {
      if (editingProduct?.id) {
        if (modalMode === 'restock') {
          // Update product using weighted average purchase price & updated total stock
          await db.products.update(editingProduct.id, {
            stock_quantity: totalCombinedStock,
            purchase_price: calculatedWeightedAvgPrice,
            cost_price: calculatedWeightedAvgPrice
          });
          showToast(`Added ${addedQty} units to "${formData.name.trim()}". New weighted avg purchase price: ${currency} ${calculatedWeightedAvgPrice}`, 'success');
        } else {
          // Standard detail edit
          const updatedPurPrice = Number(formData.purchase_price || 0);
          await db.products.update(editingProduct.id, {
            name: formData.name.trim(),
            category_id: Number(formData.category_id),
            unit: finalUnit,
            price: Number(formData.price),
            purchase_price: updatedPurPrice,
            cost_price: updatedPurPrice,
            stock_quantity: Number(formData.stock_quantity),
            min_stock_warning: Number(formData.min_stock_warning)
          });
          showToast(`Product "${formData.name.trim()}" updated successfully!`, 'success');
        }
      } else {
        const initialPurPrice = Number(formData.purchase_price || 0);
        await db.products.add({
          name: formData.name.trim(),
          category_id: Number(formData.category_id),
          unit: finalUnit,
          price: Number(formData.price),
          purchase_price: initialPurPrice,
          cost_price: initialPurPrice,
          stock_quantity: Number(formData.stock_quantity),
          min_stock_warning: Number(formData.min_stock_warning)
        });
        showToast(`Product "${formData.name.trim()}" added successfully!`, 'success');
      }

      setIsModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save product.', 'error');
    }
  }

  async function handleDeleteProduct(id: number) {
    const prod = products.find(p => p.id === id);
    if (confirm('Are you sure you want to delete this product?')) {
      await db.products.delete(id);
      showToast(`Product "${prod?.name || ''}" deleted successfully!`, 'success');
      loadData();
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category_id === Number(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const getProductHistory = (productId: number) => {
    const items = invoiceItems.filter(item => item.product_id === productId);
    return items.map(item => {
      const inv = item.invoice_id ? invoiceMap.get(item.invoice_id) : undefined;
      const custName = inv ? customerMap.get(inv.customer_id) || inv.customer_name || 'Walk-in' : 'Unknown';
      return {
        id: item.id,
        invoiceNumber: inv?.invoice_number || 'N/A',
        date: inv ? new Date(inv.created_at).toLocaleDateString() : 'N/A',
        customerName: custName,
        quantitySold: item.quantity,
        total: item.line_total
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-3">
            <Package className="text-emerald-400" size={28} />
            <span>Product Catalog</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage Sharbats, Majoons, Syrups & Packaging Units with Purchase & Sale Prices
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
        >
          <Plus size={18} />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by product name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="w-full sm:w-64">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Product List Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading catalog...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
          No products found matching criteria.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Product Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Unit</th>
                  <th className="py-3.5 px-4 text-right">Purchase Price</th>
                  <th className="py-3.5 px-4 text-right">Sale Price</th>
                  <th className="py-3.5 px-4 text-right text-emerald-400">Unit Profit</th>
                  <th className="py-3.5 px-4 text-center">Current Stock</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredProducts.map((p) => {
                  const isLowStock = p.stock_quantity <= (p.min_stock_warning || 10);
                  const purPrice = p.purchase_price ?? p.cost_price ?? 0;
                  const unitProfit = p.price - purPrice;
                  const marginPct = p.price > 0 ? (unitProfit / p.price) * 100 : 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-white">
                        <div className="flex items-center space-x-2">
                          <span>{p.name}</span>
                          {isLowStock && (
                            <span className="p-1 rounded bg-rose-500/10 text-rose-400" title="Low Stock Warning">
                              <AlertTriangle size={14} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {categoryMap.get(p.category_id) || 'Unassigned'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-xs font-semibold">{p.unit}</td>
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-300">
                        {currency} {purPrice.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-white">
                        {currency} {p.price.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-extrabold text-emerald-400">
                          {currency} {unitProfit.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          ({marginPct.toFixed(1)}% margin)
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                            isLowStock
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {p.stock_quantity} remaining
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => {
                              setViewingProduct(p);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="View Stock History & Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleOpenModal(p, 'restock')}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-900/50 text-emerald-400 hover:text-emerald-300 transition text-xs font-bold flex items-center space-x-1"
                            title="Add / Restock Stock Batch"
                          >
                            <Plus size={14} />
                            <span>Stock</span>
                          </button>
                          <button
                            onClick={() => handleOpenModal(p, 'details')}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition"
                            title="Edit Product Details"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id!)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal with Restock Weighted Average Calculator */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xl font-bold text-white">
                {editingProduct
                  ? (modalMode === 'restock' ? `Add Stock Batch: ${editingProduct.name}` : 'Edit Product')
                  : 'Add New Product'}
              </h2>
              {editingProduct && (
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModalMode('details')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      modalMode === 'details' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Edit Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalMode('restock')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      modalMode === 'restock' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    + Restock Batch
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {modalMode === 'restock' && editingProduct ? (
                /* Restock Mode with Weighted Average Cost Calculation */
                <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-300 pb-2 border-b border-slate-800">
                    <div>
                      <span className="text-slate-500 block uppercase">Current Stock</span>
                      <span className="font-extrabold text-white text-sm">{currentOldStock} units</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block uppercase">Current Purchase Price</span>
                      <span className="font-extrabold text-emerald-400 text-sm">{currency} {currentOldPrice}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                        + New Stock Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        placeholder="e.g. 20"
                        value={restockQty || ''}
                        onChange={(e) => setRestockQty(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                        New Batch Purchase Price ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        placeholder="e.g. 350"
                        value={restockPrice || ''}
                        onChange={(e) => setRestockPrice(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Weighted Average Summary Calculation Result */}
                  <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 text-xs space-y-1.5">
                    <div className="flex justify-between font-semibold text-emerald-300">
                      <span>Total Combined Stock:</span>
                      <span className="font-extrabold text-white">{totalCombinedStock} units</span>
                    </div>
                    <div className="flex justify-between font-semibold text-emerald-300">
                      <span>New Weighted Avg Purchase Price:</span>
                      <span className="font-black text-emerald-400 text-sm">{currency} {calculatedWeightedAvgPrice}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 pt-1 border-t border-emerald-500/20">
                      Weighted Avg = [({currentOldStock} × {currency}{currentOldPrice}) + ({addedQty} × {currency}{newBatchPrice})] ÷ {totalCombinedStock}
                    </p>
                  </div>
                </div>
              ) : (
                /* Standard Product Edit / Create Form */
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      Product Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharbat Bazoori Motadil"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Category
                      </label>
                      <select
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Packaging / Unit
                      </label>
                      <select
                        value={units.some(u => u.name === formData.unit) ? formData.unit : 'CUSTOM'}
                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 mb-2"
                      >
                        {units.map(u => (
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                        <option value="CUSTOM">+ Add Custom Unit</option>
                      </select>

                      {(formData.unit === 'CUSTOM' || !units.some(u => u.name === formData.unit)) && (
                        <input
                          type="text"
                          placeholder="Enter unit e.g. 50 ml, 20 ml, 10 grams"
                          value={formData.unit === 'CUSTOM' ? formData.custom_unit : formData.unit}
                          onChange={(e) => {
                            if (formData.unit === 'CUSTOM') {
                              setFormData({ ...formData, custom_unit: e.target.value });
                            } else {
                              setFormData({ ...formData, unit: e.target.value });
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                        Purchase Price ({currency})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        placeholder="Purchase / cost price"
                        value={formData.purchase_price || ''}
                        onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-emerald-400 mb-1.5">
                        Sale Price ({currency})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        placeholder="Selling price"
                        value={formData.price || ''}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-bold"
                      />
                    </div>
                  </div>

                  {/* Calculated Profit Preview */}
                  {formData.price > 0 && (
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                      <span className="text-slate-400">Unit Profit:</span>
                      <span className="font-extrabold text-emerald-400">
                        {currency} {(formData.price - (formData.purchase_price || 0)).toLocaleString()}
                        <span className="text-slate-400 font-normal ml-1.5">
                          ({(((formData.price - (formData.purchase_price || 0)) / formData.price) * 100).toFixed(1)}% margin)
                        </span>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Stock Quantity
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={formData.stock_quantity || ''}
                        onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Low Stock Limit
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        required
                        value={formData.min_stock_warning || ''}
                        onChange={(e) => setFormData({ ...formData, min_stock_warning: e.target.value === '' ? 10 : parseFloat(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
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
                  {modalMode === 'restock' ? 'Save Stock Batch' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Detail & Stock History Modal */}
      {isDetailModalOpen && viewingProduct && (() => {
        const purPrice = viewingProduct.purchase_price ?? viewingProduct.cost_price ?? 0;
        const unitProfit = viewingProduct.price - purPrice;
        const marginPct = viewingProduct.price > 0 ? (unitProfit / viewingProduct.price) * 100 : 0;
        const totalInventoryCost = viewingProduct.stock_quantity * purPrice;
        const totalInventoryRetail = viewingProduct.stock_quantity * viewingProduct.price;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-xl font-bold text-white">{viewingProduct.name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{categoryMap.get(viewingProduct.category_id)} | {viewingProduct.unit}</p>
                </div>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Financial & Stock Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-center text-xs">
                <div>
                  <span className="text-slate-500 uppercase font-semibold block">Purchase Price</span>
                  <span className="text-sm font-extrabold text-slate-300">{currency} {purPrice.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-semibold block">Sale Price</span>
                  <span className="text-sm font-extrabold text-white">{currency} {viewingProduct.price.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-semibold block">Unit Profit</span>
                  <span className="text-sm font-black text-emerald-400">{currency} {unitProfit.toLocaleString()} ({marginPct.toFixed(0)}%)</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-semibold block">Stock Qty</span>
                  <span className="text-sm font-extrabold text-white">{viewingProduct.stock_quantity} units</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Total Inventory Cost:</span>
                  <span className="font-bold">{currency} {totalInventoryCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Total Inventory Retail Value:</span>
                  <span className="font-bold text-emerald-400">{currency} {totalInventoryRetail.toLocaleString()}</span>
                </div>
              </div>

              {/* Stock Movement History Log */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <History size={16} className="text-emerald-400" />
                  <span>Stock Movement & Sales History</span>
                </h3>

                {getProductHistory(viewingProduct.id!).length === 0 ? (
                  <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                    No sales or stock deduction history logged yet for this product.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {getProductHistory(viewingProduct.id!).map((hist) => (
                      <div key={hist.id} className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white">{hist.invoiceNumber}</span>
                            <span className="text-slate-500">({hist.date})</span>
                          </div>
                          <p className="text-slate-400 text-[11px] mt-0.5">Customer: {hist.customerName}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-rose-400 font-bold flex items-center justify-end space-x-1">
                            <ArrowDownRight size={14} />
                            <span>-{hist.quantitySold} units</span>
                          </span>
                          <span className="text-[11px] text-slate-400 block font-semibold">{currency} {hist.total.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-semibold text-sm transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
