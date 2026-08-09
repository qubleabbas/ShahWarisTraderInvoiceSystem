'use client';

import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Edit2, Trash2, Phone, MapPin, FileText, Eye, DollarSign } from 'lucide-react';
import { db, Customer, Invoice } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';

export default function CustomersPage() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<(Customer & { invoiceCount?: number; totalSpent?: number })[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [currency, setCurrency] = useState('Rs.');
  const [search, setSearch] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: ''
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const custs = await db.customers.toArray();
      const invs = await db.invoices.toArray();
      const curr = await db.settings.get('currency_symbol');

      const invCounts = new Map<number, number>();
      const spentSums = new Map<number, number>();

      invs.forEach(inv => {
        invCounts.set(inv.customer_id, (invCounts.get(inv.customer_id) || 0) + 1);
        spentSums.set(inv.customer_id, (spentSums.get(inv.customer_id) || 0) + inv.total_amount);
      });

      const enriched = custs.map(c => ({
        ...c,
        invoiceCount: invCounts.get(c.id!) || 0,
        totalSpent: spentSums.get(c.id!) || 0
      }));

      setCustomers(enriched);
      setInvoices(invs);
      if (curr) setCurrency(curr.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenModal(customer?: Customer) {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        address: customer.address
      });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', address: '' });
    }
    setIsModalOpen(true);
  }

  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      if (editingCustomer?.id) {
        await db.customers.update(editingCustomer.id, {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim()
        });
        showToast(`Customer "${formData.name.trim()}" updated successfully!`, 'success');
      } else {
        await db.customers.add({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
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
      showToast(`Customer "${cust?.name || ''}" deleted successfully!`, 'success');
      loadData();
    }
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-3">
            <Users className="text-emerald-400" size={28} />
            <span>Customer Directory</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage Client Records, Phone Numbers & Purchase History
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
        >
          <Plus size={18} />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search by customer name, phone, or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Customer Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading customers...</div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
          No customers found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCustomers.map((cust) => {
            const custInvs = invoices.filter(inv => inv.customer_id === cust.id);
            const totalSpent = custInvs.reduce((acc, curr) => acc + curr.total_amount, 0);

            return (
              <div
                key={cust.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card hover:border-slate-700 transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-lg text-white">{cust.name}</h3>
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                      {custInvs.length} Invoices
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-400">
                    <p className="flex items-center space-x-2">
                      <Phone size={14} className="text-emerald-400" />
                      <span>{cust.phone || 'No phone provided'}</span>
                    </p>
                    <p className="flex items-center space-x-2">
                      <MapPin size={14} className="text-emerald-400" />
                      <span>{cust.address || 'No address provided'}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-slate-500">Total Spent</p>
                    <p className="text-sm font-extrabold text-emerald-400">
                      {currency} {totalSpent.toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center space-x-1.5">
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
                      onClick={() => handleOpenModal(cust)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteCustomer(cust.id!)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
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

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-white">
              {editingCustomer ? 'Edit Customer' : 'Add Customer'}
            </h2>
            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Customer / Business Name
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
                  Full Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Main Bazaar, City..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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
                  Save Customer
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
                <p className="text-xs text-slate-400 mt-0.5">{viewingCustomer.phone} | {viewingCustomer.address}</p>
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
                        <p className="text-xs text-slate-400">{new Date(inv.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          inv.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {inv.status}
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

            <div className="flex justify-end pt-2">
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
