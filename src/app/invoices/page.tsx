'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  Download,
  Printer,
  CheckSquare,
  Square
} from 'lucide-react';
import { db, Invoice, Customer, Product, Category, InvoiceItem } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';
import InvoiceTemplate from '@/components/InvoiceTemplate';
import { printVectorPdf } from '@/lib/pdfPrint';

export default function InvoicesPage() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currency, setCurrency] = useState('Rs.');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [loading, setLoading] = useState(true);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [printPayload, setPrintPayload] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const invs = await db.invoices.orderBy('created_at').reverse().toArray();
      const custs = await db.customers.toArray();
      const prods = await db.products.toArray();
      const cats = await db.categories.toArray();
      const curr = await db.settings.get('currency_symbol');

      const custMap = new Map(custs.map(c => [c.id!, c.name]));
      const enriched = invs.map(i => ({
        ...i,
        customer_name: custMap.get(i.customer_id) || 'Walk-in Customer'
      }));

      setInvoices(enriched);
      setCustomers(custs);
      setProducts(prods);
      setCategories(cats);
      if (curr) setCurrency(curr.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Handle Mark as Paid
  async function handleMarkAsPaid(id: number) {
    const inv = invoices.find(i => i.id === id);
    await db.invoices.update(id, { status: 'Paid' });
    showToast(`Invoice #${inv?.invoice_number || id} marked as Paid!`, 'success');
    loadData();
  }

  // Handle Delete Invoice
  async function handleDeleteInvoice(id: number) {
    const inv = invoices.find(i => i.id === id);
    if (confirm("Are you sure you want to delete this invoice?")) {
      await db.transaction('rw', [db.invoices, db.invoice_items], async () => {
        await db.invoices.delete(id);
        await db.invoice_items.where('invoice_id').equals(id).delete();
      });
      showToast(`Invoice #${inv?.invoice_number || id} deleted!`, 'success');
      loadData();
    }
  }

  // Selection handlers
  function toggleSelectAll() {
    if (selectedIds.length === filteredInvoices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredInvoices.map(i => i.id!));
    }
  }

  function toggleSelectOne(id: number) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  // Helper to construct invoice payloads for selected or filtered invoices
  async function preparePayloads(targetIds?: number[]) {
    const idsToExport = (targetIds && targetIds.length > 0)
      ? targetIds
      : (selectedIds.length > 0 ? selectedIds : filteredInvoices.map(i => i.id!));

    if (idsToExport.length === 0) return [];

    const name = await db.settings.get('business_name');
    const tagline = await db.settings.get('business_tagline');
    const address = await db.settings.get('business_address');
    const phone = await db.settings.get('business_phone');
    const email = await db.settings.get('business_email');
    const curr = await db.settings.get('currency_symbol');
    const logo = await db.settings.get('business_logo_url');

    const businessInfo = {
      name: name?.value || 'Qureshi Sharbat & Majoon House',
      tagline: tagline?.value || 'Manufacturers of Pure Herbal Sharbats, Majoons & Distillates',
      address: address?.value || '14-B Industrial Area, Station Road, Gujranwala',
      phone: phone?.value || '+92 300 8889900',
      email: email?.value || 'orders@qureshisharbat.com',
      currency: curr?.value || 'Rs.',
      logo_url: logo?.value || undefined
    };

    const custs = await db.customers.toArray();
    const custMap = new Map(custs.map(c => [c.id!, c]));
    const prods = await db.products.toArray();
    const prodMap = new Map(prods.map(p => [p.id!, p]));
    const cats = await db.categories.toArray();
    const catMap = new Map(cats.map(c => [c.id!, c.name]));

    const payloadList = [];

    for (const invId of idsToExport) {
      const inv = await db.invoices.get(invId);
      if (!inv) continue;

      const cust = custMap.get(inv.customer_id);
      const invItems = await db.invoice_items.where('invoice_id').equals(invId).toArray();

      const enrichedItems = invItems.map(item => {
        const prod = prodMap.get(item.product_id);
        return {
          ...item,
          product_name: prod ? prod.name : 'Unknown Product',
          category_name: prod ? catMap.get(prod.category_id) || 'Herbal' : 'Herbal',
          unit: prod ? prod.unit : undefined
        };
      });

      payloadList.push({
        invoice: inv,
        customer: cust,
        items: enrichedItems,
        businessInfo
      });
    }

    return payloadList;
  }

  // Pre-sync print payload so browser Cmd+P / Print View always prints clean invoices
  useEffect(() => {
    if (loading) return;
    let isMounted = true;
    preparePayloads().then(payloads => {
      if (isMounted) setPrintPayload(payloads);
    });
    return () => { isMounted = false; };
  }, [invoices, selectedIds, search, statusFilter, startDate, endDate, loading]);

  const [isPrinting, setIsPrinting] = useState(false);

  // Exact Vector Print: Generates server-side vector PDF and triggers print dialog (100% match with Export PDF)
  async function handlePrintInvoices(targetIds?: number[]) {
    setIsPrinting(true);
    showToast("Preparing exact vector PDF for printing...", "info");
    try {
      const payloadList = await preparePayloads(targetIds);
      if (payloadList.length === 0) {
        showToast("No invoices to print.", "info");
        return;
      }
      await printVectorPdf(payloadList);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to print PDF", "error");
    } finally {
      setIsPrinting(false);
    }
  }

  // Server-Side Vector PDF Export
  async function handleBulkExportPdf(targetIds?: number[]) {
    const idsToExport = targetIds || selectedIds;
    if (idsToExport.length === 0) {
      showToast("Please select at least one invoice to export.", "info");
      return;
    }

    setIsBulkExporting(true);
    showToast(`Generating vector PDF for ${idsToExport.length} invoice(s)...`, "info");

    try {
      const payloadList = await preparePayloads(idsToExport);
      if (payloadList.length === 0) {
        throw new Error("No valid invoice data found.");
      }

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices: payloadList })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate bulk PDF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payloadList.length === 1
        ? `Invoice-${payloadList[0].invoice.invoice_number}.pdf`
        : `Invoices-Bulk-Export-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast(`Exported ${payloadList.length} invoice(s) to crisp vector PDF!`, "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to export PDF", "error");
    } finally {
      setIsBulkExporting(false);
    }
  }

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
                          (inv.customer_name && inv.customer_name.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || inv.status.toLowerCase() === statusFilter.toLowerCase();
    
    let matchesDate = true;
    const invDate = new Date(inv.created_at);
    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && invDate >= s;
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && invDate <= e;
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  return (
    <>
      {/* Dashboard Screen Content - Hidden during browser print */}
      <div className="space-y-6 no-print-dashboard">
        {/* Header Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center space-x-3">
              <FileText className="text-emerald-400" size={28} />
              <span>Billing & Invoices</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              View, Edit, Export Vector PDF, Date Range Filter & Track Payment Statuses
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {selectedIds.length > 0 && (
              <button
                onClick={() => handleBulkExportPdf()}
                disabled={isBulkExporting}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md transition disabled:opacity-50"
              >
                <Download size={18} />
                <span>{isBulkExporting ? 'Exporting...' : `Export Selected PDF (${selectedIds.length})`}</span>
              </button>
            )}
            <button
              onClick={() => handlePrintInvoices()}
              disabled={isPrinting}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl border border-slate-700 shadow-md transition disabled:opacity-50"
            >
              <Printer size={18} />
              <span>{isPrinting ? 'Opening Print...' : `Print View ${selectedIds.length > 0 ? `(${selectedIds.length})` : ''}`}</span>
            </button>
            <Link
              href="/invoices/new"
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition"
            >
              <Plus size={18} />
              <span>Create New Invoice</span>
            </Link>
          </div>
        </div>

        {/* Filter and Search controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          {/* Search Input */}
          <div className="sm:col-span-5 relative">
            <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by invoice # or customer name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Payment Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          {/* Date Range Picker */}
          <div className="sm:col-span-4 flex items-center space-x-2">
            <input
              type="date"
              title="Start Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-1/2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              title="End Date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-1/2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Invoices Data Table */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading invoices...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
            No invoices found matching criteria.
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 w-10">
                      <button onClick={toggleSelectAll} className="text-slate-400 hover:text-emerald-400">
                        {selectedIds.length === filteredInvoices.length ? (
                          <CheckSquare size={18} className="text-emerald-400" />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">Invoice #</th>
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Amount</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredInvoices.map((inv) => {
                    const isSelected = selectedIds.includes(inv.id!);

                    return (
                      <tr
                        key={inv.id}
                        className={`hover:bg-slate-800/40 transition ${
                          isSelected ? 'bg-slate-800/60' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <button onClick={() => toggleSelectOne(inv.id!)} className="text-slate-400 hover:text-emerald-400">
                            {isSelected ? (
                              <CheckSquare size={18} className="text-emerald-400" />
                            ) : (
                              <Square size={18} />
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white">
                          <Link href={`/invoices/${inv.id}`} className="hover:text-emerald-400 transition">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{inv.customer_name}</td>
                        <td className="py-3.5 px-4 text-xs text-slate-400">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                              inv.status === 'Paid'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : inv.status === 'Overdue'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-white">
                          {currency} {inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            {inv.status !== 'Paid' && (
                              <button
                                onClick={() => handleMarkAsPaid(inv.id!)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white text-xs font-semibold transition flex items-center space-x-1"
                                title="Mark as Paid"
                              >
                                <CheckCircle size={14} />
                                <span>Paid</span>
                              </button>
                            )}
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                              title="View Invoice & Print/Export"
                            >
                              <Eye size={16} />
                            </Link>
                            <button
                              onClick={() => handleBulkExportPdf([inv.id!])}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 transition"
                              title="Export Vector PDF"
                            >
                              <Download size={16} />
                            </button>
                            <button
                              onClick={() => handlePrintInvoices([inv.id!])}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                              title="Print Single Invoice"
                            >
                              <Printer size={16} />
                            </button>
                            <Link
                              href={`/invoices/${inv.id}/edit`}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition"
                              title="Edit Invoice"
                            >
                              <Edit2 size={16} />
                            </Link>
                            <button
                              onClick={() => handleDeleteInvoice(inv.id!)}
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
      </div>

      {/* Clean Print-Only Wrapper for Bulk / Single Invoice Printing */}
      {printPayload.length > 0 && (
        <div className="hidden print:block printable-bulk-wrapper">
          {printPayload.map((data, idx) => (
            <div key={idx} className="bulk-invoice-page">
              <InvoiceTemplate
                invoice={data.invoice}
                customer={data.customer}
                items={data.items}
                businessInfo={data.businessInfo}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
