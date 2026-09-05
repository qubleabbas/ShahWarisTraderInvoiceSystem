'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Users, Plus, Search, Edit2, Trash2, Phone, MapPin, Eye, Wallet, Building2, Tag, Percent } from 'lucide-react';
import { db, Customer, City, Invoice, recordTombstone, subscribeDataChanged } from '@/lib/db';
import { statusBadgeClasses, displayStatus, formatDateTime } from '@/lib/ledger';
import { useToast } from '@/components/ToastProvider';
import SearchableCitySelect from '@/components/SearchableCitySelect';
import { fuzzyFilter } from '@/lib/fuzzySearch';
import Pagination from '@/components/Pagination';

function CustomersContent() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'cities' ? 'cities' : 'customers';

  const [activeTab, setActiveTab] = useState<'customers' | 'cities'>(initialTab);
  const [customers, setCustomers] = useState<(Customer & { invoiceCount?: number; totalSpent?: number; outstanding?: number })[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [currency, setCurrency] = useState('Rs.');
  const [search, setSearch] = useState('');

  // Customer Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  // Customer Form State
  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    address: string;
    city_id?: number;
    ntn_number: string;
    stn_number: string;
    discount_percentage: string;
  }>({
    name: '',
    phone: '',
    address: '',
    city_id: undefined,
    ntn_number: '',
    stn_number: '',
    discount_percentage: ''
  });

  // City Modal states
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [cityNameInput, setCityNameInput] = useState('');

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const unsub = subscribeDataChanged(() => loadData());
    return () => unsub();
  }, []);

  async function loadData() {
    try {
      const custs = await db.customers.toArray();
      const cityList = await db.cities.toArray();
      const invs = await db.invoices.toArray();
      const curr = await db.settings.get('currency_symbol');

      const invCounts = new Map<number, number>();
      const spentSums = new Map<number, number>();
      const outstandingSums = new Map<number, number>();

      invs.forEach(inv => {
        invCounts.set(inv.customer_id, (invCounts.get(inv.customer_id) || 0) + 1);
        spentSums.set(inv.customer_id, (spentSums.get(inv.customer_id) || 0) + inv.total_amount);
        const due = Math.max(0, (inv.total_amount || 0) - (inv.amount_paid || 0));
        outstandingSums.set(inv.customer_id, (outstandingSums.get(inv.customer_id) || 0) + due);
      });

      const enriched = custs.map(c => ({
        ...c,
        invoiceCount: invCounts.get(c.id!) || 0,
        totalSpent: spentSums.get(c.id!) || 0,
        outstanding: outstandingSums.get(c.id!) || 0
      }));

      // Sort cities alphabetically
      cityList.sort((a, b) => a.name.localeCompare(b.name));

      setCustomers(enriched);
      setCities(cityList);
      setInvoices(invs);
      if (curr) setCurrency(curr.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const cityMap = new Map(cities.map(c => [c.id!, c.name]));

  // Customer Handlers
  function handleOpenCustomerModal(customer?: Customer) {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        city_id: customer.city_id,
        ntn_number: customer.ntn_number || '',
        stn_number: customer.stn_number || '',
        discount_percentage: customer.discount_percentage !== undefined && customer.discount_percentage !== null ? String(customer.discount_percentage) : ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        phone: '',
        address: '',
        city_id: undefined,
        ntn_number: '',
        stn_number: '',
        discount_percentage: ''
      });
    }
    setIsModalOpen(true);
  }

  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    let parsedDiscount: number | undefined = undefined;
    if (formData.discount_percentage.trim() !== '') {
      const d = parseFloat(formData.discount_percentage);
      if (isNaN(d) || d < 0 || d > 100) {
        showToast('Discount percentage must be a number between 0 and 100.', 'error');
        return;
      }
      parsedDiscount = d;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        city_id: formData.city_id,
        ntn_number: formData.ntn_number.trim() || undefined,
        stn_number: formData.stn_number.trim() || undefined,
        discount_percentage: parsedDiscount
      };

      if (editingCustomer?.id) {
        await db.customers.update(editingCustomer.id, payload);
        showToast(`Customer "${formData.name.trim()}" updated successfully!`, 'success');
      } else {
        await db.customers.add({
          ...payload,
          created_at: new Date().toISOString()
        });
        showToast(`Customer "${formData.name.trim()}" added successfully!`, 'success');
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save customer.', 'error');
    }
  }

  async function handleDeleteCustomer(id: number) {
    const cust = customers.find(c => c.id === id);
    const custInvoices = invoices.filter(inv => inv.customer_id === id);
    if (custInvoices.length > 0) {
      showToast(`Cannot delete this customer because they have ${custInvoices.length} associated invoice(s).`, 'error');
      return;
    }

    if (confirm('Are you sure you want to delete this customer record?')) {
      await db.customers.delete(id);
      await recordTombstone('customers', id);
      showToast(`Customer "${cust?.name || ''}" deleted successfully!`, 'success');
      loadData();
    }
  }

  // City Handlers
  function handleOpenCityModal(city?: City) {
    if (city) {
      setEditingCity(city);
      setCityNameInput(city.name);
    } else {
      setEditingCity(null);
      setCityNameInput('');
    }
    setIsCityModalOpen(true);
  }

  async function handleSaveCity(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = cityNameInput.trim();
    if (!trimmed) return;

    try {
      const allCities = await db.cities.toArray();
      const isDuplicate = allCities.some(
        (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase() && c.id !== editingCity?.id
      );

      if (isDuplicate) {
        showToast(`City "${trimmed}" already exists in the system.`, 'error');
        return;
      }

      if (editingCity?.id) {
        await db.cities.update(editingCity.id, { name: trimmed });
        showToast(`City "${trimmed}" updated successfully!`, 'success');
      } else {
        await db.cities.add({
          name: trimmed,
          created_at: new Date().toISOString()
        });
        showToast(`City "${trimmed}" added successfully!`, 'success');
      }

      setIsCityModalOpen(false);
      setCityNameInput('');
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save city record.', 'error');
    }
  }

  async function handleDeleteCity(id: number) {
    const city = cities.find((c) => c.id === id);
    const custCount = customers.filter((c) => c.city_id === id).length;
    if (custCount > 0) {
      showToast(`Cannot delete "${city?.name}" because it is linked to ${custCount} active customer(s).`, 'error');
      return;
    }

    if (confirm(`Are you sure you want to delete "${city?.name}"?`)) {
      await db.cities.delete(id);
      await recordTombstone('cities', id);
      showToast(`City "${city?.name || ''}" deleted successfully!`, 'success');
      loadData();
    }
  }

  // Pagination states
  const [custPage, setCustPage] = useState(1);
  const [custPageSize, setCustPageSize] = useState(25);
  const [cityPage, setCityPage] = useState(1);
  const [cityPageSize, setCityPageSize] = useState(25);

  useEffect(() => {
    setCustPage(1);
    setCityPage(1);
  }, [search]);

  const filteredCustomers = fuzzyFilter(customers, search, c => [
    c.id,
    c.name,
    c.phone,
    c.address,
    c.city_id ? cityMap.get(c.city_id) : undefined,
    c.ntn_number,
    c.stn_number
  ]);

  const filteredCities = fuzzyFilter(cities, search, c => [c.id, c.name]);

  const paginatedCustomers = filteredCustomers.slice(0, custPage * custPageSize);
  const paginatedCities = filteredCities.slice(0, cityPage * cityPageSize);

  return (
    <div className="space-y-6">
      {/* Module Header & Sub-Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <div className="flex items-center space-x-3">
            {activeTab === 'customers' ? (
              <Users className="text-emerald-400" size={28} />
            ) : (
              <Building2 className="text-emerald-400" size={28} />
            )}
            <h1 className="text-2xl font-extrabold text-white">Customer Module</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {activeTab === 'customers'
              ? 'Manage Client Profiles, Contact Info & Ledger Accounts'
              : 'Manage Cities & Geographic Regions'}
          </p>
        </div>

        {/* Action Button */}
        {activeTab === 'customers' ? (
          <button
            onClick={() => handleOpenCustomerModal()}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
          >
            <Plus size={18} />
            <span>Add New Customer</span>
          </button>
        ) : (
          <button
            onClick={() => handleOpenCityModal()}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
          >
            <Plus size={18} />
            <span>Add New City</span>
          </button>
        )}
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => {
            setActiveTab('customers');
            setSearch('');
          }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'customers'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users size={16} />
          <span>Customers ({customers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('cities');
            setSearch('');
          }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'cities'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 size={16} />
          <span>Cities ({cities.length})</span>
        </button>
      </div>

      {/* Search Bar Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
        <input
          type="text"
          placeholder={
            activeTab === 'customers'
              ? 'Search customer by name, phone, city, address...'
              : 'Search city name...'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* TAB 1: CUSTOMERS DIRECTORY GRID */}
      {activeTab === 'customers' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading customers...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              No customers found.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginatedCustomers.map((cust) => {
                  const custInvs = invoices.filter(inv => inv.customer_id === cust.id);
                  const totalSpent = custInvs.reduce((acc, curr) => acc + curr.total_amount, 0);
                  const cityName = cust.city_id ? cityMap.get(cust.city_id) : undefined;

                  return (
                    <div
                      key={cust.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card hover:border-slate-700 transition flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-bold text-lg text-white">{cust.name}</h3>
                            {cityName && (
                              <span className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/40 mt-1">
                                <Building2 size={12} />
                                <span>{cityName}</span>
                              </span>
                            )}
                          </div>
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                            {custInvs.length} Invoices
                          </span>
                        </div>

                        <div className="space-y-1 text-xs text-slate-400 pt-1">
                          <p className="flex items-center space-x-2">
                            <Phone size={14} className="text-emerald-400 flex-shrink-0" />
                            <span>{cust.phone || 'No phone provided'}</span>
                          </p>
                          <p className="flex items-center space-x-2">
                            <MapPin size={14} className="text-emerald-400 flex-shrink-0" />
                            <span>{cust.address || 'No address provided'}</span>
                          </p>
                          {(cust.ntn_number || cust.stn_number) && (
                            <p className="flex items-center space-x-2 text-slate-300">
                              <Tag size={14} className="text-emerald-400 flex-shrink-0" />
                              <span>
                                {[
                                  cust.ntn_number ? `NTN: ${cust.ntn_number}` : '',
                                  cust.stn_number ? `STN: ${cust.stn_number}` : ''
                                ].filter(Boolean).join(' | ')}
                              </span>
                            </p>
                          )}
                          {cust.discount_percentage !== undefined && cust.discount_percentage !== null && (
                            <p className="flex items-center space-x-2 text-slate-300">
                              <Percent size={14} className="text-emerald-400 flex-shrink-0" />
                              <span>Default Discount: {cust.discount_percentage}%</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] uppercase font-semibold text-slate-500">Total Spent</p>
                            <p className="text-sm font-extrabold text-emerald-400">
                              {currency} {totalSpent.toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase font-semibold text-slate-500">Outstanding</p>
                            <p className={`text-sm font-extrabold ${(cust.outstanding || 0) > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                              {currency} {(cust.outstanding || 0).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/customers/${cust.id}/ledger`}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-600 hover:text-white"
                            title="Open Customer Ledger"
                          >
                            <Wallet size={15} />
                            <span>Ledger</span>
                          </Link>
                          <button
                            onClick={() => {
                              setViewingCustomer(cust);
                              setIsDetailOpen(true);
                            }}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="View Customer Details & History"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleOpenCustomerModal(cust)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition"
                            title="Edit Customer"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(cust.id!)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                            title="Delete Customer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination
                currentPage={custPage}
                totalPages={Math.ceil(filteredCustomers.length / custPageSize)}
                totalItems={filteredCustomers.length}
                pageSize={custPageSize}
                onPageChange={setCustPage}
                onPageSizeChange={setCustPageSize}
                itemName="customers"
              />
            </div>
          )}
        </>
      )}

      {/* TAB 2: CITY MASTER DATA GRID */}
      {activeTab === 'cities' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading cities...</div>
          ) : filteredCities.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              No cities found.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginatedCities.map((c) => {
                  const custCount = customers.filter(cust => cust.city_id === c.id).length;

                  return (
                    <div
                      key={c.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card hover:border-slate-700 transition flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <h3 className="font-bold text-lg text-white">{c.name}</h3>
                        <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
                          <Users size={14} />
                          <span>{custCount} Customers</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleOpenCityModal(c)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          title="Edit City"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteCity(c.id!)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                          title="Delete City"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination
                currentPage={cityPage}
                totalPages={Math.ceil(filteredCities.length / cityPageSize)}
                totalItems={filteredCities.length}
                pageSize={cityPageSize}
                onPageChange={setCityPage}
                onPageSizeChange={setCityPageSize}
                itemName="cities"
              />
            </div>
          )}
        </>
      )}

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white">
              {editingCustomer ? 'Edit Customer' : 'Add Customer'}
            </h2>
            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Customer / Business Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Al-Madina Medical Hall"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="+92 300 1234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  City <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                </label>
                <SearchableCitySelect
                  cities={cities}
                  selectedCityId={formData.city_id}
                  onSelectCity={(cityId) => setFormData({ ...formData, city_id: cityId })}
                  onCityCreated={() => loadData()}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Full Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Main Bazaar, Street..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                    NTN Number <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1234567-8"
                    value={formData.ntn_number}
                    onChange={(e) => setFormData({ ...formData, ntn_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                    STN Number <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543-2"
                    value={formData.stn_number}
                    onChange={(e) => setFormData({ ...formData, stn_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                    Discount (%) <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    placeholder="e.g. 5"
                    value={formData.discount_percentage}
                    onChange={(e) => setFormData({ ...formData, discount_percentage: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-sm"
                  />
                </div>
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
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit City Modal */}
      {isCityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-white">
              {editingCity ? 'Edit City' : 'Add New City'}
            </h2>
            <form onSubmit={handleSaveCity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  City Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Lahore, Islamabad, Multan..."
                  value={cityNameInput}
                  onChange={(e) => setCityNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCityModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-md"
                >
                  Save City
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Detail & Purchase History Modal */}
      {isDetailOpen && viewingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-bold text-white">{viewingCustomer.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {viewingCustomer.phone} | {viewingCustomer.address}
                  {viewingCustomer.city_id && cityMap.get(viewingCustomer.city_id) ? ` (${cityMap.get(viewingCustomer.city_id)})` : ''}
                </p>
                {(viewingCustomer.ntn_number || viewingCustomer.stn_number || (viewingCustomer.discount_percentage !== undefined && viewingCustomer.discount_percentage !== null)) && (
                  <p className="text-xs text-emerald-400 font-medium mt-1 space-x-3">
                    {(viewingCustomer.ntn_number || viewingCustomer.stn_number) && (
                      <span>
                        {[
                          viewingCustomer.ntn_number ? `NTN: ${viewingCustomer.ntn_number}` : '',
                          viewingCustomer.stn_number ? `STN: ${viewingCustomer.stn_number}` : ''
                        ].filter(Boolean).join(' | ')}
                      </span>
                    )}
                    {viewingCustomer.discount_percentage !== undefined && viewingCustomer.discount_percentage !== null && <span>Default Discount: {viewingCustomer.discount_percentage}%</span>}
                  </p>
                )}
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {/* Purchase Summary */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-around text-center">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Total Bills</p>
                <p className="text-xl font-bold text-white">
                  {invoices.filter(i => i.customer_id === viewingCustomer.id).length}
                </p>
              </div>
              <div className="border-r border-slate-800" />
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Total Purchased</p>
                <p className="text-xl font-extrabold text-emerald-400">
                  {currency} {invoices.filter(i => i.customer_id === viewingCustomer.id).reduce((a, b) => a + b.total_amount, 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Invoice History List */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Invoice History</h3>
              {invoices.filter(i => i.customer_id === viewingCustomer.id).length === 0 ? (
                <p className="text-sm text-slate-500 italic py-4">No invoice history found for this customer.</p>
              ) : (
                <div className="space-y-2">
                  {invoices.filter(i => i.customer_id === viewingCustomer.id).map(inv => (
                    <div key={inv.id} className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-white">{inv.invoice_number}</p>
                        <p className="text-xs text-slate-400">{formatDateTime(inv.created_at).date} · {formatDateTime(inv.created_at).time}</p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClasses(inv.status)}`}>
                          {displayStatus(inv.status)}
                        </span>
                        <span className="font-extrabold text-sm text-white">
                          {currency} {inv.total_amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Link
                href={`/customers/${viewingCustomer.id}/ledger`}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm"
              >
                <Wallet size={16} />
                Open Full Ledger
              </Link>
              <button
                onClick={() => setIsDetailOpen(false)}
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

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-slate-400">Loading Customer Module...</div>}>
      <CustomersContent />
    </Suspense>
  );
}
