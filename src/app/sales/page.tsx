'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  PieChart as PieIcon,
  Users,
  Download,
  Printer,
  Search,
  ShoppingBag,
  Wallet,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Trophy,
  Receipt,
  Coins
} from 'lucide-react';
import { db, Invoice, Category, Product, InvoiceItem, Customer, subscribeDataChanged } from '@/lib/db';
import { fuzzyFilter } from '@/lib/fuzzySearch';
import Pagination from '@/components/Pagination';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e', '#64748b'];

// Small growth-delta chip used across the KPI cards
function DeltaBadge({ pct, active }: { pct: number; active: boolean }) {
  if (!active) {
    return <span className="text-[11px] font-medium text-slate-500">No prior period</span>;
  }
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
        up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
      }`}
    >
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function SalesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [currency, setCurrency] = useState('Rs.');

  // Date Filters
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<'products' | 'customers' | 'categories'>('products');

  // Table Search & Sorting State & Pagination
  const [productSearch, setProductSearch] = useState('');
  const [productSortKey, setProductSortKey] = useState<'qty' | 'revenue' | 'profit' | 'margin'>('revenue');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSortKey, setCustomerSortKey] = useState<'spend' | 'qty' | 'profit' | 'orders'>('spend');

  const [prodSalesPage, setProdSalesPage] = useState(1);
  const [prodSalesPageSize, setProdSalesPageSize] = useState(25);
  const [custSalesPage, setCustSalesPage] = useState(1);
  const [custSalesPageSize, setCustSalesPageSize] = useState(25);

  useEffect(() => {
    setProdSalesPage(1);
  }, [productSearch, productSortKey, dateFilter, startDate, endDate]);

  useEffect(() => {
    setCustSalesPage(1);
  }, [customerSearch, customerSortKey, dateFilter, startDate, endDate]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const invs = await db.invoices.toArray();
        const cats = await db.categories.toArray();
        const prods = await db.products.toArray();
        const custs = await db.customers.toArray();
        const items = await db.invoice_items.toArray();
        const curr = await db.settings.get('currency_symbol');

        setInvoices(invs);
        setCategories(cats);
        setProducts(prods);
        setCustomers(custs);
        setInvoiceItems(items);
        if (curr) setCurrency(curr.value);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
    const unsub = subscribeDataChanged(() => loadData());
    return () => unsub();
  }, []);

  // Compute Maps & Lookup tables
  const productMap = new Map(products.map(p => [p.id!, p]));
  const categoryMap = new Map(categories.map(c => [c.id!, c.name]));
  const customerMap = new Map(customers.map(c => [c.id!, c]));

  // Formatting helpers
  const money = (n: number, dec = 0) =>
    `${currency} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  const compact = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(Math.round(n));
  };

  // Helper to determine exact unit purchase cost for profit calculation
  function getItemUnitCost(item: InvoiceItem, p?: Product): number {
    if (item.purchase_price !== undefined && item.purchase_price > 0) return item.purchase_price;
    if (p?.purchase_price !== undefined && p.purchase_price > 0) return p.purchase_price;
    if (p?.cost_price !== undefined && p.cost_price > 0) return p.cost_price;
    return 0;
  }

  // Filter invoices by selected date range
  const now = new Date();
  function inCurrentRange(inv: Invoice): boolean {
    const invDate = new Date(inv.created_at);
    if (dateFilter === 'today') return invDate.toDateString() === now.toDateString();
    if (dateFilter === 'week') return invDate >= new Date(now.getTime() - 7 * 864e5);
    if (dateFilter === 'month') return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
    if (dateFilter === 'year') return invDate.getFullYear() === now.getFullYear();
    if (dateFilter === 'custom') {
      let matches = true;
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        matches = matches && invDate >= s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        matches = matches && invDate <= e;
      }
      return matches;
    }
    return true;
  }

  const filteredInvoices = invoices.filter(inCurrentRange);
  const filteredInvoiceIds = new Set(filteredInvoices.map(i => i.id));
  const filteredItems = invoiceItems.filter(item => item.invoice_id && filteredInvoiceIds.has(item.invoice_id));

  // --- Previous comparable period (for growth deltas) ---
  const comparisonActive = ['today', 'week', 'month', 'year'].includes(dateFilter);
  const periodLabel =
    dateFilter === 'today' ? 'yesterday'
    : dateFilter === 'week' ? 'last week'
    : dateFilter === 'month' ? 'last month'
    : dateFilter === 'year' ? 'last year'
    : 'previous period';

  function inPreviousRange(inv: Invoice): boolean {
    const d = new Date(inv.created_at);
    if (dateFilter === 'today') {
      const y = new Date(now); y.setDate(now.getDate() - 1);
      return d.toDateString() === y.toDateString();
    }
    if (dateFilter === 'week') {
      return d >= new Date(now.getTime() - 14 * 864e5) && d < new Date(now.getTime() - 7 * 864e5);
    }
    if (dateFilter === 'month') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return d >= s && d <= e;
    }
    if (dateFilter === 'year') {
      return d.getFullYear() === now.getFullYear() - 1;
    }
    return false;
  }

  const prevInvoices = comparisonActive ? invoices.filter(inPreviousRange) : [];
  const prevIds = new Set(prevInvoices.map(i => i.id));
  const prevItems = invoiceItems.filter(it => it.invoice_id && prevIds.has(it.invoice_id));

  // --- Overall Financial Summary Metrics ---
  const getInvoiceNetTotal = (i: Invoice) =>
    i.include_previous_balance && i.previous_balance ? Math.max(0, i.total_amount - i.previous_balance) : i.total_amount;

  const totalRevenue = filteredInvoices.reduce((sum, i) => sum + getInvoiceNetTotal(i), 0);
  // Ledger-accurate: paid = money actually received (includes partial payments);
  // pending = outstanding balance across every not-fully-paid invoice.
  const paidSales = filteredInvoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0);
  const pendingSales = filteredInvoices.reduce(
    (sum, i) => sum + Math.max(0, (i.total_amount || 0) - (i.amount_paid || 0)),
    0
  );
  const overdueSales = filteredInvoices
    .filter(i => i.status === 'Overdue')
    .reduce((sum, i) => sum + Math.max(0, (i.total_amount || 0) - (i.amount_paid || 0)), 0);
  const totalUnitsSold = filteredItems.reduce((sum, item) => sum + item.quantity, 0);
  const avgOrderValue = filteredInvoices.length > 0 ? totalRevenue / filteredInvoices.length : 0;

  let totalCost = 0;
  filteredItems.forEach(item => {
    const p = productMap.get(item.product_id);
    totalCost += item.quantity * getItemUnitCost(item, p);
  });
  const grossProfit = Math.max(0, totalRevenue - totalCost);
  const profitMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Previous period aggregates
  const prevRevenue = prevInvoices.reduce((s, i) => s + getInvoiceNetTotal(i), 0);
  let prevCost = 0;
  prevItems.forEach(it => { prevCost += it.quantity * getItemUnitCost(it, productMap.get(it.product_id)); });
  const prevProfit = Math.max(0, prevRevenue - prevCost);
  const prevOrders = prevInvoices.length;
  const prevUnits = prevItems.reduce((s, it) => s + it.quantity, 0);
  const prevAov = prevOrders > 0 ? prevRevenue / prevOrders : 0;

  const pct = (cur: number, prev: number) => {
    if (prev <= 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  };

  // --- Sales Trend Data (chronological) ---
  const salesByDateMap = new Map<string, { label: string; ts: number; revenue: number; profit: number }>();
  filteredInvoices.forEach(inv => {
    const d = new Date(inv.created_at);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const existing = salesByDateMap.get(key) || { label, ts: d.getTime(), revenue: 0, profit: 0 };
    existing.revenue += inv.total_amount;
    salesByDateMap.set(key, existing);
  });
  filteredItems.forEach(item => {
    const inv = invoices.find(i => i.id === item.invoice_id);
    if (!inv) return;
    const key = new Date(inv.created_at).toISOString().slice(0, 10);
    const existing = salesByDateMap.get(key);
    if (existing) {
      const unitCost = getItemUnitCost(item, productMap.get(item.product_id));
      existing.profit += Math.max(0, item.line_total - item.quantity * unitCost);
    }
  });
  const trendData = Array.from(salesByDateMap.values())
    .sort((a, b) => a.ts - b.ts)
    .map(v => ({ date: v.label, revenue: Math.round(v.revenue), profit: Math.round(v.profit) }));

  const bestDay = [...trendData].sort((a, b) => b.revenue - a.revenue)[0];

  // --- Product Performance Breakdown ---
  const productAnalyticsMap = new Map<number, {
    id: number; name: string; categoryName: string; unit: string;
    qty: number; revenue: number; cost: number; profit: number; marginPct: number;
  }>();
  filteredItems.forEach(item => {
    const p = productMap.get(item.product_id);
    const catName = p ? categoryMap.get(p.category_id) || 'Herbal' : 'Herbal';
    const lineCost = item.quantity * getItemUnitCost(item, p);
    const existing = productAnalyticsMap.get(item.product_id) || {
      id: item.product_id,
      name: p ? p.name : (item.product_name || `Product #${item.product_id}`),
      categoryName: catName,
      unit: p ? p.unit : (item.unit || ''),
      qty: 0, revenue: 0, cost: 0, profit: 0, marginPct: 0
    };
    existing.qty += item.quantity;
    existing.revenue += item.line_total;
    existing.cost += lineCost;
    existing.profit += item.line_total - lineCost;
    existing.marginPct = existing.revenue > 0 ? (existing.profit / existing.revenue) * 100 : 0;
    productAnalyticsMap.set(item.product_id, existing);
  });
  const productAnalyticsList = Array.from(productAnalyticsMap.values());
  const maxProductRevenue = Math.max(1, ...productAnalyticsList.map(p => p.revenue));

  const filteredProductsList = fuzzyFilter(productAnalyticsList, productSearch, p => [
    p.id,
    p.name,
    p.categoryName,
    p.unit
  ]).sort((a, b) => {
    if (productSortKey === 'qty') return b.qty - a.qty;
    if (productSortKey === 'profit') return b.profit - a.profit;
    if (productSortKey === 'margin') return b.marginPct - a.marginPct;
    return b.revenue - a.revenue;
  });

  // --- Customer Intelligence Breakdown ---
  const customerAnalyticsMap = new Map<number | string, {
    id: number | string; name: string; phone: string;
    ordersCount: number; itemsBought: number; totalSpend: number; totalProfit: number; lastOrderDate: string;
  }>();
  filteredInvoices.forEach(inv => {
    const custKey = inv.customer_id || (inv.customer_name || 'Walk-in Customer');
    const custObj = customerMap.get(inv.customer_id);
    const existing = customerAnalyticsMap.get(custKey) || {
      id: custKey,
      name: custObj?.name || inv.customer_name || 'Walk-in Customer',
      phone: custObj?.phone || inv.customer_phone || 'N/A',
      ordersCount: 0, itemsBought: 0, totalSpend: 0, totalProfit: 0, lastOrderDate: inv.created_at
    };
    existing.ordersCount += 1;
    existing.totalSpend += inv.total_amount;
    if (new Date(inv.created_at) > new Date(existing.lastOrderDate)) existing.lastOrderDate = inv.created_at;
    customerAnalyticsMap.set(custKey, existing);
  });
  filteredItems.forEach(item => {
    const inv = invoices.find(i => i.id === item.invoice_id);
    if (!inv || !filteredInvoiceIds.has(inv.id!)) return;
    const custKey = inv.customer_id || (inv.customer_name || 'Walk-in Customer');
    const existing = customerAnalyticsMap.get(custKey);
    if (existing) {
      existing.itemsBought += item.quantity;
      const unitCost = getItemUnitCost(item, productMap.get(item.product_id));
      existing.totalProfit += item.line_total - item.quantity * unitCost;
    }
  });
  const customerAnalyticsList = Array.from(customerAnalyticsMap.values());
  const maxCustomerSpend = Math.max(1, ...customerAnalyticsList.map(c => c.totalSpend));
  const repeatCustomers = customerAnalyticsList.filter(c => c.ordersCount > 1).length;

  const filteredCustomersList = fuzzyFilter(customerAnalyticsList, customerSearch, c => [
    c.id,
    c.name,
    c.phone
  ]).sort((a, b) => {
    if (customerSortKey === 'qty') return b.itemsBought - a.itemsBought;
    if (customerSortKey === 'profit') return b.totalProfit - a.totalProfit;
    if (customerSortKey === 'orders') return b.ordersCount - a.ordersCount;
    return b.totalSpend - a.totalSpend;
  });

  // --- Category Breakdown ---
  const categoryAnalyticsMap = new Map<string, { name: string; revenue: number; profit: number; qty: number }>();
  productAnalyticsList.forEach(pa => {
    const existing = categoryAnalyticsMap.get(pa.categoryName) || { name: pa.categoryName, revenue: 0, profit: 0, qty: 0 };
    existing.revenue += pa.revenue;
    existing.profit += pa.profit;
    existing.qty += pa.qty;
    categoryAnalyticsMap.set(pa.categoryName, existing);
  });
  const categoryList = Array.from(categoryAnalyticsMap.values())
    .map(c => ({ ...c, marginPct: c.revenue > 0 ? (c.profit / c.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const categoryPieData = categoryList.map(c => ({ name: c.name, value: c.revenue, profit: c.profit, qty: c.qty }));

  const collectedTotal = paidSales + pendingSales + overdueSales;
  const paidPct = collectedTotal > 0 ? (paidSales / collectedTotal) * 100 : 0;
  const pendingPct = collectedTotal > 0 ? (pendingSales / collectedTotal) * 100 : 0;
  const overduePct = collectedTotal > 0 ? (overdueSales / collectedTotal) * 100 : 0;

  // Handle Export CSV Report
  function handleExportCsv() {
    let csv = 'BUSINESS SALES & PROFITABILITY ANALYTICS REPORT\n';
    csv += `Period: ${dateFilter.toUpperCase()}\n`;
    csv += `Total Revenue: ${currency} ${totalRevenue.toFixed(2)}\n`;
    csv += `Total Net Profit: ${currency} ${grossProfit.toFixed(2)}\n`;
    csv += `Profit Margin: ${profitMarginPct.toFixed(1)}%\n\n`;

    csv += 'PRODUCT PERFORMANCE ANALYSIS\n';
    csv += 'Product Name,Category,Units Sold,Total Revenue,Estimated Cost,Net Profit,Margin %\n';
    productAnalyticsList.forEach(p => {
      csv += `"${p.name}","${p.categoryName}",${p.qty},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)},${p.marginPct.toFixed(1)}%\n`;
    });

    csv += '\nCUSTOMER PERFORMANCE & VALUE ANALYSIS\n';
    csv += 'Customer Name,Phone,Total Orders,Items Purchased,Total Spend,Net Profit Generated\n';
    customerAnalyticsList.forEach(c => {
      csv += `"${c.name}","${c.phone}",${c.ordersCount},${c.itemsBought},${c.totalSpend.toFixed(2)},${c.totalProfit.toFixed(2)}\n`;
    });

    csv += '\nCATEGORY PERFORMANCE\n';
    csv += 'Category,Units Sold,Revenue,Net Profit,Margin %\n';
    categoryList.forEach(c => {
      csv += `"${c.name}",${c.qty},${c.revenue.toFixed(2)},${c.profit.toFixed(2)},${c.marginPct.toFixed(1)}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sales-Analytics-Report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handlePrintReport() {
    window.print();
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
        <p className="mb-1 text-xs font-bold text-slate-300">{label}</p>
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-400">{entry.name}:</span>
            <span className="font-bold text-white">{money(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading Business Sales Analytics...</div>;
  }

  const rankColors = ['bg-amber-400 text-slate-900', 'bg-slate-300 text-slate-900', 'bg-orange-600 text-white'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="no-print flex flex-col gap-4 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/40 p-6 shadow-lg lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center space-x-3 text-2xl font-black text-white">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <BarChart3 size={24} />
            </span>
            <span>Sales &amp; Analytics</span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Revenue, profit, growth trends and deep product / customer / category intelligence.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
          <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-1 sm:w-auto">
            {(['all', 'today', 'week', 'month', 'year', 'custom'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                  dateFilter === filter ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-1.5 text-xs">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-white focus:outline-none" />
              <span className="text-slate-500">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-white focus:outline-none" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700">
              <Download size={16} /><span>Export CSV</span>
            </button>
            <button onClick={handlePrintReport}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-emerald-500">
              <Printer size={16} /><span>Print</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards with growth deltas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Revenue */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-card">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 to-transparent" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Revenue</p>
              <p className="mt-1.5 text-2xl font-black text-white">{money(totalRevenue)}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <DollarSign size={18} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800/70 pt-2.5">
            <DeltaBadge pct={pct(totalRevenue, prevRevenue)} active={comparisonActive} />
            <span className="text-[11px] text-slate-500">vs {periodLabel}</span>
          </div>
        </div>

        {/* Net Profit */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-card">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 to-transparent" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Net Profit</p>
              <p className="mt-1.5 text-2xl font-black text-emerald-400">{money(grossProfit)}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
              <TrendingUp size={18} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800/70 pt-2.5">
            <DeltaBadge pct={pct(grossProfit, prevProfit)} active={comparisonActive} />
            <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-extrabold text-emerald-400">
              {profitMarginPct.toFixed(1)}% margin
            </span>
          </div>
        </div>

        {/* Orders */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-card">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-purple-500 to-transparent" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Orders</p>
              <p className="mt-1.5 text-2xl font-black text-white">{filteredInvoices.length.toLocaleString()}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20">
              <Receipt size={18} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800/70 pt-2.5">
            <DeltaBadge pct={pct(filteredInvoices.length, prevOrders)} active={comparisonActive} />
            <span className="text-[11px] text-slate-500">{totalUnitsSold.toLocaleString()} units sold</span>
          </div>
        </div>

        {/* Avg Order Value */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-card">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500 to-transparent" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg Order Value</p>
              <p className="mt-1.5 text-2xl font-black text-white">{money(avgOrderValue)}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
              <Coins size={18} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800/70 pt-2.5">
            <DeltaBadge pct={pct(avgOrderValue, prevAov)} active={comparisonActive} />
            <span className="text-[11px] text-slate-500">per invoice</span>
          </div>
        </div>
      </div>

      {/* Trend + Category charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Trend chart */}
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center space-x-2 text-base font-bold text-white">
              <TrendingUp className="text-emerald-400" size={18} />
              <span>Revenue &amp; Net Profit Trend</span>
            </h2>
            {bestDay && (
              <span className="hidden text-xs text-slate-400 sm:inline">
                Best day: <span className="font-bold text-emerald-400">{bestDay.date}</span> ({money(bestDay.revenue)})
              </span>
            )}
          </div>

          {trendData.length === 0 ? (
            <p className="py-20 text-center text-sm text-slate-500">No sales recorded for the selected period.</p>
          ) : (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revFill)" />
                  <Line type="monotone" dataKey="profit" name="Net Profit" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex items-center gap-5 border-t border-slate-800 pt-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Revenue</span>
            <span className="flex items-center gap-1.5 text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Net Profit</span>
          </div>
        </div>

        {/* Category donut */}
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-card">
          <h2 className="flex items-center space-x-2 text-base font-bold text-white">
            <PieIcon className="text-emerald-400" size={18} />
            <span>Category Share</span>
          </h2>

          {categoryPieData.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">No category data.</p>
          ) : (
            <>
              <div className="relative h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3} dataKey="value" stroke="none">
                      {categoryPieData.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Revenue</span>
                  <span className="text-sm font-black text-white">{compact(totalRevenue)}</span>
                </div>
              </div>

              <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                {categoryPieData.slice(0, 6).map((cat, idx) => (
                  <div key={cat.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="font-medium text-slate-300">{cat.name}</span>
                    </span>
                    <span className="font-bold text-white">
                      {totalRevenue > 0 ? ((cat.value / totalRevenue) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment collection / cash-flow strip */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center space-x-2 text-base font-bold text-white">
            <Wallet className="text-emerald-400" size={18} />
            <span>Payment Collection</span>
          </h2>
          <span className="text-xs text-slate-400">Collection rate: <span className="font-bold text-emerald-400">{paidPct.toFixed(0)}%</span></span>
        </div>

        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />
          <div className="bg-amber-500 transition-all" style={{ width: `${pendingPct}%` }} />
          <div className="bg-rose-500 transition-all" style={{ width: `${overduePct}%` }} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-500" />Paid</p>
            <p className="mt-1 text-lg font-black text-white">{money(paidSales)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-500" />Pending</p>
            <p className="mt-1 text-lg font-black text-white">{money(pendingSales)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-rose-400"><span className="h-2 w-2 rounded-full bg-rose-500" />Overdue</p>
            <p className="mt-1 text-lg font-black text-white">{money(overdueSales)}</p>
          </div>
        </div>
      </div>

      {/* Tabs: Products / Customers / Categories */}
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-1.5">
          {([
            { key: 'products', label: 'Products', icon: Package },
            { key: 'customers', label: 'Customers', icon: Users },
            { key: 'categories', label: 'Categories', icon: Layers }
          ] as const).map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:flex-none ${
                  activeTab === tab.key ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* PRODUCTS */}
        {activeTab === 'products' && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-card sm:p-6">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="flex items-center gap-2 text-base font-bold text-white">
                  <Trophy className="text-emerald-400" size={18} />
                  <span>Product Sales &amp; Profitability</span>
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input type="text" placeholder="Search product..." value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300">
                    <ArrowUpDown size={14} className="text-slate-400" />
                    <select value={productSortKey} onChange={(e: any) => setProductSortKey(e.target.value)}
                      className="cursor-pointer bg-transparent font-bold text-white focus:outline-none">
                      <option value="revenue" className="bg-slate-900">Revenue</option>
                      <option value="profit" className="bg-slate-900">Net Profit</option>
                      <option value="qty" className="bg-slate-900">Units Sold</option>
                      <option value="margin" className="bg-slate-900">Margin %</option>
                    </select>
                  </div>
                </div>
              </div>

              {filteredProductsList.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">No matching product sales in this period.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400">
                        <tr>
                          <th className="py-3 pr-2">#</th>
                          <th className="px-2 py-3">Product</th>
                          <th className="hidden px-2 py-3 md:table-cell">Category</th>
                          <th className="px-2 py-3 text-center">Units</th>
                          <th className="px-2 py-3 text-right">Revenue</th>
                          <th className="hidden px-2 py-3 text-right lg:table-cell">Est. Cost</th>
                          <th className="px-2 py-3 text-right text-emerald-400">Net Profit</th>
                          <th className="px-2 py-3 text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                        {filteredProductsList
                          .slice(0, prodSalesPage * prodSalesPageSize)
                          .map((ps, idx) => {
                            const actualRank = idx;
                            return (
                              <tr key={ps.id} className="transition hover:bg-slate-800/40">
                                <td className="py-3 pr-2">
                                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-black ${
                                    actualRank < 3 ? rankColors[actualRank] : 'bg-slate-800 text-slate-400'}`}>{actualRank + 1}</span>
                                </td>
                                <td className="px-2 py-3">
                                  <div className="font-bold text-white">{ps.name}</div>
                                  <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-800">
                                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(ps.revenue / maxProductRevenue) * 100}%` }} />
                                  </div>
                                </td>
                                <td className="hidden px-2 py-3 text-slate-400 md:table-cell">{ps.categoryName}</td>
                                <td className="px-2 py-3 text-center font-extrabold text-white">{ps.qty}</td>
                                <td className="px-2 py-3 text-right font-bold text-white">{money(ps.revenue)}</td>
                                <td className="hidden px-2 py-3 text-right text-slate-400 lg:table-cell">{money(ps.cost)}</td>
                                <td className="px-2 py-3 text-right font-black text-emerald-400">{money(ps.profit)}</td>
                                <td className="px-2 py-3 text-right">
                                  <span className="inline-block rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-extrabold text-emerald-400">
                                    {ps.marginPct.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    currentPage={prodSalesPage}
                    totalPages={Math.ceil(filteredProductsList.length / prodSalesPageSize)}
                    totalItems={filteredProductsList.length}
                    pageSize={prodSalesPageSize}
                    onPageChange={setProdSalesPage}
                    onPageSizeChange={setProdSalesPageSize}
                    itemName="products"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* CUSTOMERS */}
        {activeTab === 'customers' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-card">
                <p className="text-[11px] font-bold uppercase text-slate-400">Total Customers</p>
                <p className="mt-1 text-xl font-black text-white">{customerAnalyticsList.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-card">
                <p className="text-[11px] font-bold uppercase text-slate-400">Repeat Buyers</p>
                <p className="mt-1 text-xl font-black text-emerald-400">{repeatCustomers}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-card">
                <p className="text-[11px] font-bold uppercase text-slate-400">Avg / Customer</p>
                <p className="mt-1 text-xl font-black text-white">
                  {money(customerAnalyticsList.length > 0 ? totalRevenue / customerAnalyticsList.length : 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-card">
                <p className="text-[11px] font-bold uppercase text-slate-400">Retention</p>
                <p className="mt-1 text-xl font-black text-white">
                  {customerAnalyticsList.length > 0 ? ((repeatCustomers / customerAnalyticsList.length) * 100).toFixed(0) : 0}%
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-card sm:p-6">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="flex items-center gap-2 text-base font-bold text-white">
                  <Users className="text-emerald-400" size={18} />
                  <span>Customer Purchasing Intelligence</span>
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input type="text" placeholder="Search customer..." value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300">
                    <ArrowUpDown size={14} className="text-slate-400" />
                    <select value={customerSortKey} onChange={(e: any) => setCustomerSortKey(e.target.value)}
                      className="cursor-pointer bg-transparent font-bold text-white focus:outline-none">
                      <option value="spend" className="bg-slate-900">Highest Spend</option>
                      <option value="qty" className="bg-slate-900">Most Products</option>
                      <option value="profit" className="bg-slate-900">Most Profit</option>
                      <option value="orders" className="bg-slate-900">Most Orders</option>
                    </select>
                  </div>
                </div>
              </div>

              {filteredCustomersList.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">No customer purchases in this period.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400">
                        <tr>
                          <th className="py-3 pr-2">#</th>
                          <th className="px-2 py-3">Customer</th>
                          <th className="hidden px-2 py-3 md:table-cell">Phone</th>
                          <th className="px-2 py-3 text-center">Orders</th>
                          <th className="px-2 py-3 text-center text-emerald-400">Units</th>
                          <th className="px-2 py-3 text-right">Total Spend</th>
                          <th className="px-2 py-3 text-right text-emerald-400">Profit</th>
                          <th className="hidden px-2 py-3 text-right lg:table-cell">Last Order</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                        {filteredCustomersList
                          .slice(0, custSalesPage * custSalesPageSize)
                          .map((c, idx) => {
                            const actualRank = idx;
                            return (
                              <tr key={c.id} className="transition hover:bg-slate-800/40">
                                <td className="py-3 pr-2">
                                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-black ${
                                    actualRank < 3 ? rankColors[actualRank] : 'bg-slate-800 text-slate-400'}`}>{actualRank + 1}</span>
                                </td>
                                <td className="px-2 py-3">
                                  <div className="font-bold text-white">{c.name}</div>
                                  <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-800">
                                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${(c.totalSpend / maxCustomerSpend) * 100}%` }} />
                                  </div>
                                </td>
                                <td className="hidden px-2 py-3 text-slate-400 md:table-cell">{c.phone}</td>
                                <td className="px-2 py-3 text-center font-bold text-white">{c.ordersCount}</td>
                                <td className="px-2 py-3 text-center font-black text-emerald-400">{c.itemsBought}</td>
                                <td className="px-2 py-3 text-right font-bold text-white">{money(c.totalSpend)}</td>
                                <td className="px-2 py-3 text-right font-black text-emerald-400">{money(c.totalProfit)}</td>
                                <td className="hidden px-2 py-3 text-right text-slate-400 lg:table-cell">{new Date(c.lastOrderDate).toLocaleDateString()}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    currentPage={custSalesPage}
                    totalPages={Math.ceil(filteredCustomersList.length / custSalesPageSize)}
                    totalItems={filteredCustomersList.length}
                    pageSize={custSalesPageSize}
                    onPageChange={setCustSalesPage}
                    onPageSizeChange={setCustSalesPageSize}
                    itemName="customers"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* CATEGORIES */}
        {activeTab === 'categories' && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-card sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-white">
              <Layers className="text-emerald-400" size={18} />
              <span>Category Performance</span>
            </h2>

            {categoryList.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">No category sales in this period.</p>
            ) : (
              <div className="space-y-3">
                {categoryList.map((cat, idx) => {
                  const share = totalRevenue > 0 ? (cat.revenue / totalRevenue) * 100 : 0;
                  return (
                    <div key={cat.name} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="font-bold text-white">{cat.name}</span>
                          <span className="text-[11px] text-slate-500">{cat.qty} units</span>
                        </span>
                        <span className="text-sm font-black text-white">{money(cat.revenue)}</span>
                      </div>
                      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: COLORS[idx % COLORS.length] }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">{share.toFixed(1)}% of revenue</span>
                        <span className="text-slate-400">
                          Profit: <span className="font-bold text-emerald-400">{money(cat.profit)}</span>
                          <span className="ml-1.5 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-extrabold text-emerald-400">
                            {cat.marginPct.toFixed(1)}%
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
