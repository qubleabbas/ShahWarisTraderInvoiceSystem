'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  FileClock,
  AlertTriangle,
  Users,
  Plus,
  ArrowRight,
  TrendingUp,
  PackageCheck,
  Package,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { db, Invoice, Product, Customer, subscribeDataChanged } from '@/lib/db';
import { statusBadgeClasses, displayStatus } from '@/lib/ledger';

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currency, setCurrency] = useState('Rs.');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const invs = await db.invoices.orderBy('created_at').reverse().toArray();
        const prods = await db.products.toArray();
        const custs = await db.customers.toArray();
        const curr = await db.settings.get('currency_symbol');

        // Populate customer names for invoices
        const custMap = new Map(custs.map(c => [c.id, c.name]));
        const enrichedInvs = invs.map(inv => ({
          ...inv,
          customer_name: custMap.get(inv.customer_id) || 'Walk-in Customer'
        }));

        setInvoices(enrichedInvs);
        setProducts(prods);
        setCustomers(custs);
        if (curr) setCurrency(curr.value);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
    const unsub = subscribeDataChanged(() => loadStats());
    return () => unsub();
  }, []);

  // Compute metrics
  const totalSales = invoices.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);
  // Any invoice that is not fully paid counts as pending; outstanding uses the
  // remaining balance (total - amount already paid), not the full invoice total.
  const pendingInvoices = invoices.filter(inv => inv.status !== 'Paid');
  const pendingAmount = pendingInvoices.reduce(
    (acc, curr) => acc + Math.max(0, (curr.total_amount || 0) - (curr.amount_paid || 0)),
    0
  );
  
  // Low stock products filter (stock <= min_stock_warning)
  const lowStockProducts = products.filter(p => p.stock_quantity <= (p.min_stock_warning || 10));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Dashboard & Business Overview
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Qureshi Sharbat, Majoon & Syrup Management
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/invoices/new"
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition transform hover:-translate-y-0.5"
          >
            <Plus size={18} />
            <span>Create Invoice</span>
          </Link>
        </div>
      </div>

      {/* 4 Stat Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Sales */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Sales</span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
              <DollarSign size={22} />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-3">{currency} {totalSales.toLocaleString()}</p>
          <div className="flex items-center space-x-1 text-xs text-emerald-400 mt-2">
            <TrendingUp size={14} />
            <span>Lifetime Revenue</span>
          </div>
        </div>

        {/* Pending Invoices */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Invoices</span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
              <FileClock size={22} />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-3">{pendingInvoices.length} Bills</p>
          <p className="text-xs text-amber-400 mt-2 font-medium">
            {currency} {pendingAmount.toLocaleString()} Outstanding
          </p>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Low Stock Warning</span>
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400">
              <AlertTriangle size={22} />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-3">{lowStockProducts.length} Items</p>
          <p className="text-xs text-rose-400 mt-2 font-medium">
            {lowStockProducts.length > 0 ? 'Requires Re-stocking' : 'All stocks healthy'}
          </p>
        </div>

        {/* Total Customers */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Customers</span>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
              <Users size={22} />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-3">{customers.length}</p>
          <p className="text-xs text-blue-400 mt-2 font-medium">Registered Buyers</p>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Recent Invoices Table (2 cols wide) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <FileClock size={20} className="text-emerald-400" />
              <span>Recent Invoices</span>
            </h2>
            <Link href="/invoices" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1">
              <span>View All</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {invoices.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No invoices created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3">Invoice #</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {invoices.slice(0, 5).map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-semibold text-white">{inv.invoice_number}</td>
                      <td className="py-3 px-3 text-slate-300">{inv.customer_name}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeClasses(inv.status)}`}
                        >
                          {displayStatus(inv.status)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-white">
                        {currency} {inv.total_amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="inline-flex p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                        >
                          <Eye size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Low Stock Alerts Widget */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <AlertTriangle size={20} className="text-rose-400" />
              <span>Low Stock Alerts</span>
            </h2>
            <Link href="/products" className="text-xs font-semibold text-rose-400 hover:text-rose-300">
              Manage
            </Link>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-2" />
              <p className="text-sm font-medium">All products have sufficient stock!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lowStockProducts.slice(0, 6).map((prod) => (
                <div
                  key={prod.id}
                  className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-semibold text-sm text-white">{prod.name}</h3>
                    <p className="text-xs text-slate-400">{prod.unit}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20">
                      {prod.stock_quantity} left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
