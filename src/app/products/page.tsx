'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package, Plus, Search, Edit2, Trash2, AlertTriangle, Eye, History, ArrowDownRight, Building, Scale } from 'lucide-react';
import { db, Product, Category, Company, Unit, InvoiceItem, Invoice, Customer, recordTombstone, subscribeDataChanged } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';
import SearchableCompanySelect from '@/components/SearchableCompanySelect';

function ProductsContent() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'units' ? 'units' : tabParam === 'companies' ? 'companies' : 'products';

  const [activeTab, setActiveTab] = useState<'products' | 'companies' | 'units'>(initialTab);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [currency, setCurrency] = useState('Rs.');

  // Filters & Modal state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  // Form Fields & Restock state
  const [modalMode, setModalMode] = useState<'details' | 'restock'>('details');
  const [formData, setFormData] = useState<{
    name: string;
    category_id: number;
    company_id?: number;
    unit: string;
    custom_unit: string;
    price: number;
    purchase_price: number;
    stock_quantity: number;
    min_stock_warning: number;
  }>({
    name: '',
    category_id: 0,
    company_id: undefined,
    unit: '800 ml bottle',
    custom_unit: '',
    price: 0,
    purchase_price: 0,
    stock_quantity: 0,
    min_stock_warning: 10
  });

  // Company Modal State
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyNameInput, setCompanyNameInput] = useState('');

  // Packaging Unit Modal State
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitNameInput, setUnitNameInput] = useState('');

  // Restock calculation fields
  const [restockQty, setRestockQty] = useState<number>(0);
  const [restockPrice, setRestockPrice] = useState<number>(0);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const unsub = subscribeDataChanged(() => loadData());
    return () => unsub();
  }, []);

  async function loadData() {
    try {
      const prods = await db.products.toArray();
      const cats = await db.categories.toArray();
      const comps = await db.companies.toArray();
      const uList = await db.units.toArray();
      const invs = await db.invoices.toArray();
      const custs = await db.customers.toArray();
      const items = await db.invoice_items.toArray();
      const curr = await db.settings.get('currency_symbol');

      // Sort lists alphabetically
      comps.sort((a, b) => a.name.localeCompare(b.name));
      uList.sort((a, b) => a.name.localeCompare(b.name));

      setProducts(prods);
      setCategories(cats);
      setCompanies(comps);
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
  const companyMap = new Map(companies.map(c => [c.id!, c.name]));
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
        company_id: product.company_id,
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
        company_id: undefined,
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

  // Company Handlers
  function handleOpenCompanyModal(company?: Company) {
    if (company) {
      setEditingCompany(company);
      setCompanyNameInput(company.name);
    } else {
      setEditingCompany(null);
      setCompanyNameInput('');
    }
    setIsCompanyModalOpen(true);
  }

  async function handleSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = companyNameInput.trim();
    if (!trimmed) return;

    try {
      const allCompanies = await db.companies.toArray();
      const isDuplicate = allCompanies.some(
        (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase() && c.id !== editingCompany?.id
      );

      if (isDuplicate) {
        showToast(`Company "${trimmed}" already exists in the system.`, 'error');
        return;
      }

      if (editingCompany?.id) {
        await db.companies.update(editingCompany.id, { name: trimmed });
        showToast(`Company "${trimmed}" updated successfully!`, 'success');
      } else {
        await db.companies.add({
          name: trimmed,
          created_at: new Date().toISOString()
        });
        showToast(`Company "${trimmed}" added successfully!`, 'success');
      }

      setIsCompanyModalOpen(false);
      setCompanyNameInput('');
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save company record.', 'error');
    }
  }

  async function handleDeleteCompany(id: number) {
    const comp = companies.find((c) => c.id === id);
    const prodCount = products.filter((p) => p.company_id === id).length;
    if (prodCount > 0) {
      showToast(`Cannot delete "${comp?.name}" because it is linked to ${prodCount} active product(s).`, 'error');
      return;
    }

    if (confirm(`Are you sure you want to delete "${comp?.name}"?`)) {
      await db.companies.delete(id);
      await recordTombstone('companies', id);
      showToast(`Company "${comp?.name || ''}" deleted successfully!`, 'success');
      loadData();
    }
  }

  // Packaging Unit Handlers
  function handleOpenUnitModal(unit?: Unit) {
    if (unit) {
      setEditingUnit(unit);
      setUnitNameInput(unit.name);
    } else {
      setEditingUnit(null);
      setUnitNameInput('');
    }
    setIsUnitModalOpen(true);
  }

  async function handleSaveUnit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = unitNameInput.trim();
    if (!trimmed) return;

    try {
      const allUnits = await db.units.toArray();
      const isDuplicate = allUnits.some(
        (u) => u.name.trim().toLowerCase() === trimmed.toLowerCase() && u.id !== editingUnit?.id
      );

      if (isDuplicate) {
        showToast(`Packaging unit "${trimmed}" already exists in the system.`, 'error');
        return;
      }

      if (editingUnit?.id) {
        await db.units.update(editingUnit.id, { name: trimmed });
        showToast(`Packaging unit "${trimmed}" updated successfully!`, 'success');
      } else {
        await db.units.add({ name: trimmed });
        showToast(`Packaging unit "${trimmed}" added successfully!`, 'success');
      }

      setIsUnitModalOpen(false);
      setUnitNameInput('');
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save packaging unit.', 'error');
    }
  }

  async function handleDeleteUnit(id: number) {
    const unitObj = units.find(u => u.id === id);
    const prodCount = products.filter(p => p.unit.trim().toLowerCase() === unitObj?.name.trim().toLowerCase()).length;
    if (prodCount > 0) {
      showToast(`Cannot delete '${unitObj?.name}' because it is assigned to ${prodCount} product(s).`, 'error');
      return;
    }

    if (confirm(`Are you sure you want to delete "${unitObj?.name}"?`)) {
      await db.units.delete(id);
      await recordTombstone('units', id);
      showToast(`Packaging unit "${unitObj?.name || ''}" deleted successfully!`, 'success');
      loadData();
    }
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
            company_id: formData.company_id,
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
          company_id: formData.company_id,
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
      await recordTombstone('products', id);
      showToast(`Product "${prod?.name || ''}" deleted successfully!`, 'success');
      loadData();
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category_id === Number(selectedCategory);
    const matchesCompany = selectedCompany === 'all' || p.company_id === Number(selectedCompany);
    return matchesSearch && matchesCategory && matchesCompany;
  });

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredUnits = units.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

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
        unitPrice: item.unit_price,
        itemDiscount: item.item_discount,
        totalPrice: item.line_total
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Module Header & Sub-Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <div className="flex items-center space-x-3">
            {activeTab === 'products' ? (
              <Package className="text-emerald-400" size={28} />
            ) : activeTab === 'companies' ? (
              <Building className="text-emerald-400" size={28} />
            ) : (
              <Scale className="text-emerald-400" size={28} />
            )}
            <h1 className="text-2xl font-extrabold text-white">Product Module</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {activeTab === 'products'
              ? 'Manage Product Catalog, Stock Inventory & Purchase Prices'
              : activeTab === 'companies'
              ? 'Manage Companies & Brand Manufacturers'
              : 'Manage Packaging & Measurement Units'}
          </p>
        </div>

        {/* Header Action Button */}
        {activeTab === 'products' ? (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
          >
            <Plus size={18} />
            <span>Add New Product</span>
          </button>
        ) : activeTab === 'companies' ? (
          <button
            onClick={() => handleOpenCompanyModal()}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
          >
            <Plus size={18} />
            <span>Add New Company</span>
          </button>
        ) : (
          <button
            onClick={() => handleOpenUnitModal()}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
          >
            <Plus size={18} />
            <span>Add New Unit</span>
          </button>
        )}
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => {
            setActiveTab('products');
            setSearch('');
          }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'products'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Package size={16} />
          <span>Products ({products.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('companies');
            setSearch('');
          }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'companies'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building size={16} />
          <span>Companies ({companies.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('units');
            setSearch('');
          }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'units'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Scale size={16} />
          <span>Packaging Units ({units.length})</span>
        </button>
      </div>

      {/* Filters Bar */}
      {activeTab === 'products' ? (
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search product by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            {/* Company Filter */}
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Companies</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={activeTab === 'companies' ? "Search company name..." : "Search unit name..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      )}

      {/* TAB 1: PRODUCTS CATALOG GRID */}
      {activeTab === 'products' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading products...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              No products found matching your filter criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProducts.map((prod) => {
                const isLowStock = prod.stock_quantity <= (prod.min_stock_warning || 10);
                const categoryName = categoryMap.get(prod.category_id) || 'Uncategorized';
                const companyName = prod.company_id ? companyMap.get(prod.company_id) : undefined;
                const purchasePrice = prod.purchase_price ?? prod.cost_price ?? 0;

                return (
                  <div
                    key={prod.id}
                    className={`bg-slate-900 border ${
                      isLowStock ? 'border-amber-500/50' : 'border-slate-800'
                    } rounded-2xl p-5 shadow-card hover:border-slate-700 transition flex flex-col justify-between space-y-4`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[10px] bg-slate-800 text-slate-300 font-semibold px-2 py-0.5 rounded-md">
                              {categoryName}
                            </span>
                            {companyName && (
                              <span className="inline-flex items-center space-x-1 text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 font-semibold px-2 py-0.5 rounded-md">
                                <Building size={11} />
                                <span>{companyName}</span>
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-lg text-white">{prod.name}</h3>
                          <p className="text-xs text-slate-400">Unit: {prod.unit}</p>
                        </div>
                        {isLowStock && (
                          <span className="flex items-center space-x-1 text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded-md font-semibold">
                            <AlertTriangle size={14} />
                            <span>Low Stock</span>
                          </span>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[10px] text-slate-500 font-semibold uppercase">Purchase Price</p>
                          <p className="font-bold text-slate-300">
                            {currency} {purchasePrice.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 font-semibold uppercase">Sale Price</p>
                          <p className="font-extrabold text-emerald-400">
                            {currency} {prod.price.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Available Stock:</span>
                        <span className={`font-bold ${isLowStock ? 'text-amber-400' : 'text-white'}`}>
                          {prod.stock_quantity} {prod.unit}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenModal(prod, 'restock')}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-600 hover:text-white"
                          title="Restock Product & Calculate Weighted Avg Price"
                        >
                          <ArrowDownRight size={15} />
                          <span>Restock</span>
                        </button>
                        <button
                          onClick={() => {
                            setViewingProduct(prod);
                            setIsDetailModalOpen(true);
                          }}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="View Product Sales History"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleOpenModal(prod, 'details')}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition"
                          title="Edit Product Details"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod.id!)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                          title="Delete Product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: COMPANIES GRID */}
      {activeTab === 'companies' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading companies...</div>
          ) : filteredCompanies.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              No companies found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCompanies.map((comp) => {
                const prodCount = products.filter(p => p.company_id === comp.id).length;

                return (
                  <div
                    key={comp.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card hover:border-slate-700 transition flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <h3 className="font-bold text-lg text-white">{comp.name}</h3>
                      <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
                        <Package size={14} />
                        <span>{prodCount} Products Linked</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenCompanyModal(comp)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Edit Company"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteCompany(comp.id!)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                        title="Delete Company"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 3: PACKAGING UNITS GRID */}
      {activeTab === 'units' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading units...</div>
          ) : filteredUnits.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              No packaging units found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredUnits.map((u) => {
                const prodCount = products.filter(p => p.unit.trim().toLowerCase() === u.name.trim().toLowerCase()).length;

                return (
                  <div
                    key={u.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card hover:border-slate-700 transition flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <h3 className="font-bold text-lg text-white">{u.name}</h3>
                      <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
                        <Package size={14} />
                        <span>{prodCount} Products using this unit</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenUnitModal(u)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Edit Packaging Unit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteUnit(u.id!)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                        title="Delete Packaging Unit"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                {modalMode === 'restock' ? (
                  <>
                    <ArrowDownRight className="text-emerald-400" size={24} />
                    <span>Restock Inventory</span>
                  </>
                ) : (
                  <>
                    <Package className="text-emerald-400" size={24} />
                    <span>{editingProduct ? 'Edit Product' : 'Add New Product'}</span>
                  </>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {modalMode === 'restock' ? (
                <>
                  {/* Restock Mode Form Fields */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                    <p className="font-bold text-white text-base">{formData.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <p>Current Stock: <span className="font-semibold text-white">{currentOldStock}</span></p>
                      <p>Avg Pur Price: <span className="font-semibold text-emerald-400">{currency} {currentOldPrice}</span></p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      New Batch Quantity <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 50"
                      value={restockQty || ''}
                      onChange={(e) => setRestockQty(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      New Batch Purchase Price / Unit ({currency}) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      placeholder="e.g. 350"
                      value={restockPrice || ''}
                      onChange={(e) => setRestockPrice(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Weighted Avg Calculation Preview */}
                  <div className="bg-emerald-950/40 border border-emerald-800/60 p-4 rounded-xl space-y-1">
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Weighted Avg Preview</p>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Total New Stock:</span>
                      <span className="font-bold text-white">{totalCombinedStock}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>New Weighted Avg Purchase Price:</span>
                      <span className="font-extrabold text-emerald-400">{currency} {calculatedWeightedAvgPrice}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Standard Product Edit Form Fields */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      Product Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharbat Bazoori"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Category <span className="text-rose-400">*</span>
                      </label>
                      <select
                        required
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value={0} disabled>Select Category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Company <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                      </label>
                      <SearchableCompanySelect
                        companies={companies}
                        selectedCompanyId={formData.company_id}
                        onSelectCompany={(compId) => setFormData({ ...formData, company_id: compId })}
                        onCompanyCreated={() => loadData()}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Packaging Unit <span className="text-rose-400">*</span>
                      </label>
                      <select
                        value={formData.unit}
                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.name}>
                            {u.name}
                          </option>
                        ))}
                        <option value="CUSTOM">+ Add Custom Unit...</option>
                      </select>
                    </div>

                    {formData.unit === 'CUSTOM' && (
                      <div>
                        <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                          Custom Unit Name <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 250 ml bottle"
                          value={formData.custom_unit}
                          onChange={(e) => setFormData({ ...formData, custom_unit: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Purchase Price / Unit ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="e.g. 320"
                        value={formData.purchase_price || ''}
                        onChange={(e) => setFormData({ ...formData, purchase_price: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Sale Price / Unit ({currency}) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="any"
                        placeholder="e.g. 480"
                        value={formData.price || ''}
                        onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Stock Quantity <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        placeholder="e.g. 100"
                        value={formData.stock_quantity}
                        onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                        Low Stock Alert Threshold
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Default 10"
                        value={formData.min_stock_warning}
                        onChange={(e) => setFormData({ ...formData, min_stock_warning: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </>
              )}

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
                  {modalMode === 'restock' ? 'Confirm Restock' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Company Modal */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-white">
              {editingCompany ? 'Edit Company' : 'Add New Company'}
            </h2>
            <form onSubmit={handleSaveCompany} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Company Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Hamdard, Qarshi, Saeed Ghani..."
                  value={companyNameInput}
                  onChange={(e) => setCompanyNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-md"
                >
                  Save Company
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Packaging Unit Modal */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-white">
              {editingUnit ? 'Edit Packaging Unit' : 'Add New Packaging Unit'}
            </h2>
            <form onSubmit={handleSaveUnit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Unit Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. 800 ml bottle, 250 g jar, Pack of 10..."
                  value={unitNameInput}
                  onChange={(e) => setUnitNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUnitModalOpen(false)}
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

      {/* Product History & Details Modal */}
      {isDetailModalOpen && viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span>{viewingProduct.name}</span>
                  {viewingProduct.company_id && companyMap.get(viewingProduct.company_id) && (
                    <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold px-2 py-0.5 rounded-md">
                      {companyMap.get(viewingProduct.company_id)}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Category: {categoryMap.get(viewingProduct.category_id) || 'Uncategorized'} | Unit: {viewingProduct.unit}
                </p>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Product Metrics Summary */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Available Stock</p>
                <p className="text-lg font-bold text-white">{viewingProduct.stock_quantity}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Purchase Price</p>
                <p className="text-lg font-bold text-slate-300">
                  {currency} {viewingProduct.purchase_price ?? viewingProduct.cost_price ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Sale Price</p>
                <p className="text-lg font-extrabold text-emerald-400">
                  {currency} {viewingProduct.price}
                </p>
              </div>
            </div>

            {/* Sales Transaction History */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <History size={16} className="text-emerald-400" />
                <span>Sales Transaction History</span>
              </h3>

              {getProductHistory(viewingProduct.id!).length === 0 ? (
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center text-xs text-slate-500 italic">
                  No invoice sales transactions recorded yet for this product.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Invoice #</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3 text-right">Qty Sold</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {getProductHistory(viewingProduct.id!).map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3">{tx.date}</td>
                          <td className="py-2.5 px-3 font-semibold text-emerald-400">{tx.invoiceNumber}</td>
                          <td className="py-2.5 px-3">{tx.customerName}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">{tx.quantitySold}</td>
                          <td className="py-2.5 px-3 text-right">{currency} {tx.unitPrice}</td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-emerald-400">
                            {currency} {tx.totalPrice}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-slate-400">Loading Product Module...</div>}>
      <ProductsContent />
    </Suspense>
  );
}
