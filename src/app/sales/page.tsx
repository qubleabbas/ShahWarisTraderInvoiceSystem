'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Filter,
  DollarSign,
  Package,
  PieChart as PieIcon,
  Users,
  Award,
  ArrowUpRight,
  Download,
  Printer,
  Search,
  Sparkles,
  Percent,
  ShoppingBag,
  Clock,
  ArrowUpDown
} from 'lucide-react';
import { db, Invoice, Category, Product, InvoiceItem, Customer } from '@/lib/db';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

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

  // Table Search & Sorting State
  const [productSearch, setProductSearch] = useState('');
  const [productSortKey, setProductSortKey] = useState<'qty' | 'revenue' | 'profit' | 'margin'>('revenue');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSortKey, setCustomerSortKey] = useState<'spend' | 'qty' | 'profit' | 'orders'>('spend');

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
  }, []);

  // Filter invoices by selected date range
  const now = new Date();
  const filteredInvoices = invoices.filter(inv => {
    const invDate = new Date(inv.created_at);
    if (dateFilter === 'today') {
      return invDate.toDateString() === now.toDateString();
    }
    if (dateFilter === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return invDate >= oneWeekAgo;
    }
    if (dateFilter === 'month') {
      return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
    }
    if (dateFilter === 'year') {
      return invDate.getFullYear() === now.getFullYear();
    }
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
  });

  const filteredInvoiceIds = new Set(filteredInvoices.map(i => i.id));
  const filteredItems = invoiceItems.filter(item => item.invoice_id && filteredInvoiceIds.has(item.invoice_id));

  // Compute Maps & Lookup tables
  const productMap = new Map(products.map(p => [p.id!, p]));
  const categoryMap = new Map(categories.map(c => [c.id!, c.name]));
  const customerMap = new Map(customers.map(c => [c.id!, c]));

  // --- Overall Financial Summary Metrics ---
  const totalRevenue = filteredInvoices.reduce((sum, i) => sum + i.total_amount, 0);
  const paidSales = filteredInvoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.total_amount, 0);
  const pendingSales = filteredInvoices.filter(i => i.status === 'Pending').reduce((sum, i) => sum + i.total_amount, 0);
  const overdueSales = filteredInvoices.filter(i => i.status === 'Overdue').reduce((sum, i) => sum + i.total_amount, 0);
  const totalUnitsSold = filteredItems.reduce((sum, item) => sum + item.quantity, 0);
  const avgOrderValue = filteredInvoices.length > 0 ? totalRevenue / filteredInvoices.length : 0;

  // Helper to determine exact unit purchase cost for profit calculation
  function getItemUnitCost(item: InvoiceItem, p?: Product): number {
    if (item.purchase_price !== undefined && item.purchase_price > 0) return item.purchase_price;
    if (p?.purchase_price !== undefined && p.purchase_price > 0) return p.purchase_price;
    if (p?.cost_price !== undefined && p.cost_price > 0) return p.cost_price;
    return item.unit_price * 0.6;
  }

  // Compute Total Cost & Net Profit for all items
  let totalCost = 0;
  filteredItems.forEach(item => {
    const p = productMap.get(item.product_id);
    const unitCost = getItemUnitCost(item, p);
    totalCost += item.quantity * unitCost;
  });

  const grossProfit = Math.max(0, totalRevenue - totalCost);
  const profitMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // --- Sales Trend Data for Bar Chart ---
  const salesByDateMap = new Map<string, { revenue: number; profit: number }>();
  filteredInvoices.forEach(inv => {
    const dStr = new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const existing = salesByDateMap.get(dStr) || { revenue: 0, profit: 0 };
    existing.revenue += inv.total_amount;
    salesByDateMap.set(dStr, existing);
  });

  // Attach profit to daily trend
  filteredItems.forEach(item => {
    const inv = invoices.find(i => i.id === item.invoice_id);
    if (!inv) return;
    const dStr = new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const existing = salesByDateMap.get(dStr);
    if (existing) {
      const p = productMap.get(item.product_id);
      const unitCost = getItemUnitCost(item, p);
      const lineCost = item.quantity * unitCost;
      const lineProfit = Math.max(0, item.line_total - lineCost);
      existing.profit += lineProfit;
    }
  });

  const trendData = Array.from(salesByDateMap.entries()).map(([date, val]) => ({
    date,
    revenue: Math.round(val.revenue),
    profit: Math.round(val.profit)
  }));

  // --- Product Performance Breakdown ---
  const productAnalyticsMap = new Map<number, {
    id: number;
    name: string;
    categoryName: string;
    unit: string;
    qty: number;
    revenue: number;
    cost: number;
    profit: number;
    marginPct: number;
  }>();

  filteredItems.forEach(item => {
    const p = productMap.get(item.product_id);
    const catName = p ? categoryMap.get(p.category_id) || 'Herbal' : 'Herbal';
    const unitCost = getItemUnitCost(item, p);
    const lineCost = item.quantity * unitCost;
    const lineProfit = item.line_total - lineCost;

    const existing = productAnalyticsMap.get(item.product_id) || {
      id: item.product_id,
      name: p ? p.name : (item.product_name || `Product #${item.product_id}`),
      categoryName: catName,
      unit: p ? p.unit : (item.unit || ''),
      qty: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      marginPct: 0
    };

    existing.qty += item.quantity;
    existing.revenue += item.line_total;
    existing.cost += lineCost;
    existing.profit += lineProfit;
    existing.marginPct = existing.revenue > 0 ? (existing.profit / existing.revenue) * 100 : 0;

    productAnalyticsMap.set(item.product_id, existing);
  });

  const productAnalyticsList = Array.from(productAnalyticsMap.values());

  // Filter & Sort Products
  const filteredProductsList = productAnalyticsList
    .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.categoryName.toLowerCase().includes(productSearch.toLowerCase()))
    .sort((a, b) => {
      if (productSortKey === 'qty') return b.qty - a.qty;
      if (productSortKey === 'profit') return b.profit - a.profit;
      if (productSortKey === 'margin') return b.marginPct - a.marginPct;
      return b.revenue - a.revenue;
    });

  // Product Champions
  const topProductByQty = [...productAnalyticsList].sort((a, b) => b.qty - a.qty)[0];
  const topProductByProfit = [...productAnalyticsList].sort((a, b) => b.profit - a.profit)[0];
  const topProductByRevenue = [...productAnalyticsList].sort((a, b) => b.revenue - a.revenue)[0];

  // --- Customer Intelligence Breakdown ---
  const customerAnalyticsMap = new Map<number | string, {
    id: number | string;
    name: string;
    phone: string;
    ordersCount: number;
    itemsBought: number;
    totalSpend: number;
    totalProfit: number;
    lastOrderDate: string;
  }>();

  filteredInvoices.forEach(inv => {
    const custKey = inv.customer_id || (inv.customer_name || 'Walk-in Customer');
    const custObj = customerMap.get(inv.customer_id);

    const existing = customerAnalyticsMap.get(custKey) || {
      id: custKey,
      name: custObj?.name || inv.customer_name || 'Walk-in Customer',
      phone: custObj?.phone || inv.customer_phone || 'N/A',
      ordersCount: 0,
      itemsBought: 0,
      totalSpend: 0,
      totalProfit: 0,
      lastOrderDate: inv.created_at
    };

    existing.ordersCount += 1;
    existing.totalSpend += inv.total_amount;
    if (new Date(inv.created_at) > new Date(existing.lastOrderDate)) {
      existing.lastOrderDate = inv.created_at;
    }

    customerAnalyticsMap.set(custKey, existing);
  });

  // Calculate items bought & profit generated per customer
  filteredItems.forEach(item => {
    const inv = invoices.find(i => i.id === item.invoice_id);
    if (!inv || !filteredInvoiceIds.has(inv.id!)) return;

    const custKey = inv.customer_id || (inv.customer_name || 'Walk-in Customer');
    const existing = customerAnalyticsMap.get(custKey);
    if (existing) {
      existing.itemsBought += item.quantity;
      const p = productMap.get(item.product_id);
      const unitCost = getItemUnitCost(item, p);
      const lineProfit = item.line_total - (item.quantity * unitCost);
      existing.totalProfit += lineProfit;
    }
  });

  const customerAnalyticsList = Array.from(customerAnalyticsMap.values());

  // Filter & Sort Customers
  const filteredCustomersList = customerAnalyticsList
    .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch))
    .sort((a, b) => {
      if (customerSortKey === 'qty') return b.itemsBought - a.itemsBought;
      if (customerSortKey === 'profit') return b.totalProfit - a.totalProfit;
      if (customerSortKey === 'orders') return b.ordersCount - a.ordersCount;
      return b.totalSpend - a.totalSpend;
    });

  // Customer Champions
  const topCustomerByQty = [...customerAnalyticsList].sort((a, b) => b.itemsBought - a.itemsBought)[0];
  const topCustomerBySpend = [...customerAnalyticsList].sort((a, b) => b.totalSpend - a.totalSpend)[0];
  const topCustomerByProfit = [...customerAnalyticsList].sort((a, b) => b.totalProfit - a.totalProfit)[0];

  // --- Category Breakdown ---
  const categoryAnalyticsMap = new Map<string, { name: string; revenue: number; profit: number; qty: number }>();
  productAnalyticsList.forEach(pa => {
    const existing = categoryAnalyticsMap.get(pa.categoryName) || {
      name: pa.categoryName,
      revenue: 0,
      profit: 0,
      qty: 0
    };
    existing.revenue += pa.revenue;
    existing.profit += pa.profit;
    existing.qty += pa.qty;
    categoryAnalyticsMap.set(pa.categoryName, existing);
  });

  const categoryPieData = Array.from(categoryAnalyticsMap.values()).map(c => ({
    name: c.name,
    value: c.revenue,
    profit: c.profit,
    qty: c.qty
  }));

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];

  // Handle Export CSV Report
  function handleExportCsv() {
    let csv = "BUSINESS SALES & PROFITABILITY ANALYTICS REPORT\n";
    csv += `Period: ${dateFilter.toUpperCase()}\n`;
    csv += `Total Revenue: ${currency} ${totalRevenue.toFixed(2)}\n`;
    csv += `Total Net Profit: ${currency} ${grossProfit.toFixed(2)}\n`;
    csv += `Profit Margin: ${profitMarginPct.toFixed(1)}%\n\n`;

    csv += "PRODUCT PERFORMANCE ANALYSIS\n";
    csv += "Product Name,Category,Units Sold,Total Revenue,Estimated Cost,Net Profit,Margin %\n";
    productAnalyticsList.forEach(p => {
      csv += `"${p.name}","${p.categoryName}",${p.qty},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)},${p.marginPct.toFixed(1)}%\n`;
    });

    csv += "\nCUSTOMER PERFORMANCE & VALUE ANALYSIS\n";
    csv += "Customer Name,Phone,Total Orders,Items Purchased,Total Spend,Net Profit Generated\n";
    customerAnalyticsList.forEach(c => {
      csv += `"${c.name}","${c.phone}",${c.ordersCount},${c.itemsBought},${c.totalSpend.toFixed(2)},${c.totalProfit.toFixed(2)}\n`;
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

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading Business Sales Analytics...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Top Action Header Bar */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-3">
            <BarChart3 className="text-emerald-400" size={28} />
            <span>Business Sales & Profit Analytics</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Track revenue, net profit, top-selling products, most profitable items & customer purchasing intelligence
          </p>
        </div>

        {/* Date Filter & Export Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            {(['all', 'today', 'week', 'month', 'year', 'custom'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                  dateFilter === filter
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {dateFilter === 'custom' && (
            <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-900 text-white px-2.5 py-1 rounded-lg border border-slate-800 focus:outline-none"
              />
              <span className="text-slate-500">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-900 text-white px-2.5 py-1 rounded-lg border border-slate-800 focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs transition"
              title="Export Full CSV Report"
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handlePrintReport}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3.5 py-2.5 rounded-xl shadow-md text-xs transition"
              title="Print Executive Report"
            >
              <Printer size={16} />
              <span>Print Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Financial KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Revenue */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Revenue</p>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-2">{currency} {totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-xs">
            <span className="text-slate-400">{filteredInvoices.length} total orders</span>
            <span className="font-bold text-slate-300">AOV: {currency} {Math.round(avgOrderValue).toLocaleString()}</span>
          </div>
        </div>

        {/* Total Net Profit & Margin */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Gross Profit</p>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-400 mt-2">{currency} {grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-xs">
            <span className="text-slate-400">Profit Margin</span>
            <span className="font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{profitMarginPct.toFixed(1)}%</span>
          </div>
        </div>

        {/* Units Sold */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Items / Units Sold</p>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShoppingBag size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-2">{totalUnitsSold.toLocaleString()} units</p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
            <span>Across {productAnalyticsList.length} distinct products</span>
          </div>
        </div>

        {/* Payment Collection Status */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Receivables / Pending</p>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-400 mt-2">{currency} {pendingSales.toLocaleString()}</p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-xs">
            <span className="text-slate-400">Paid: {currency} {Math.round(paidSales).toLocaleString()}</span>
            {overdueSales > 0 && <span className="font-bold text-rose-400">Overdue: {currency} {overdueSales.toLocaleString()}</span>}
          </div>
        </div>
      </div>

      {/* Main Trends & Category Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Sales & Profit Bar Chart (2 cols wide) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <TrendingUp className="text-emerald-400" size={20} />
              <span>Revenue & Net Profit Trend</span>
            </h2>
            <span className="text-xs text-slate-400 font-medium">Daily / Period Performance</span>
          </div>

          {trendData.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No sales recorded for the selected date period.</p>
          ) : (
            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                    formatter={(value: any, name: any) => [
                      `${currency} ${Number(value).toLocaleString()}`,
                      name === 'revenue' ? 'Revenue' : 'Net Profit'
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Net Profit" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right Column: Category Sales & Profit Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <PieIcon className="text-emerald-400" size={20} />
              <span>Category Share</span>
            </h2>

            {categoryPieData.length === 0 ? (
              <p className="text-sm text-slate-500 py-12 text-center">No category data.</p>
            ) : (
              <>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {categoryPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                        formatter={(val: any) => [`${currency} ${Number(val).toLocaleString()}`, 'Revenue']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  {categoryPieData.map((cat, idx) => (
                    <div key={cat.name} className="flex justify-between items-center text-xs">
                      <div className="flex items-center space-x-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                        />
                        <span className="text-slate-300 font-medium">{cat.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-white">{currency} {cat.value.toLocaleString()}</span>
                        <span className="text-[10px] text-emerald-400 ml-1.5">({currency} {cat.profit.toLocaleString()} profit)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs: Product Performance vs Customer Intelligence */}
      <div className="space-y-6">
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center space-x-2 py-3 px-6 text-sm font-bold border-b-2 transition ${
              activeTab === 'products'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900/60 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package size={18} />
            <span>Product Sales & Profitability</span>
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center space-x-2 py-3 px-6 text-sm font-bold border-b-2 transition ${
              activeTab === 'customers'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900/60 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={18} />
            <span>Customer Purchasing Intelligence</span>
          </button>
        </div>

        {/* TAB 1: PRODUCT SALES & PROFITABILITY ANALYTICS */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            {/* Top Product Champions Showcase Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Most Quantity Sold */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <Award size={24} />
                </div>
                <div className="overflow-hidden">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Most Units Sold
                  </span>
                  <h3 className="font-bold text-white text-base mt-1.5 truncate">
                    {topProductByQty ? topProductByQty.name : 'N/A'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-black text-emerald-400">{topProductByQty ? topProductByQty.qty : 0} units</span> sold ({currency} {topProductByQty ? topProductByQty.revenue.toLocaleString() : 0})
                  </p>
                </div>
              </div>

              {/* Most Profitable Product */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                  <DollarSign size={24} />
                </div>
                <div className="overflow-hidden">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    Highest Net Profit
                  </span>
                  <h3 className="font-bold text-white text-base mt-1.5 truncate">
                    {topProductByProfit ? topProductByProfit.name : 'N/A'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-black text-blue-400">{currency} {topProductByProfit ? topProductByProfit.profit.toLocaleString() : 0} profit</span> ({topProductByProfit ? topProductByProfit.marginPct.toFixed(1) : 0}% margin)
                  </p>
                </div>
              </div>

              {/* Highest Revenue Product */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0">
                  <TrendingUp size={24} />
                </div>
                <div className="overflow-hidden">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    Highest Revenue
                  </span>
                  <h3 className="font-bold text-white text-base mt-1.5 truncate">
                    {topProductByRevenue ? topProductByRevenue.name : 'N/A'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-black text-purple-400">{currency} {topProductByRevenue ? topProductByRevenue.revenue.toLocaleString() : 0} sales</span> ({topProductByRevenue ? topProductByRevenue.qty : 0} units)
                  </p>
                </div>
              </div>
            </div>

            {/* Products Table with Search & Sort Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Package className="text-emerald-400" size={20} />
                  <span>Each Product Revenue & Profitability Breakdown</span>
                </h2>

                <div className="flex items-center space-x-3">
                  {/* Search Input */}
                  <div className="relative w-60">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search product..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Sort Selector */}
                  <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
                    <ArrowUpDown size={14} className="text-slate-400" />
                    <span>Sort by:</span>
                    <select
                      value={productSortKey}
                      onChange={(e: any) => setProductSortKey(e.target.value)}
                      className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="revenue" className="bg-slate-900">Highest Revenue</option>
                      <option value="profit" className="bg-slate-900">Highest Net Profit</option>
                      <option value="qty" className="bg-slate-900">Most Units Sold</option>
                      <option value="margin" className="bg-slate-900">Profit Margin %</option>
                    </select>
                  </div>
                </div>
              </div>

              {filteredProductsList.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No matching product sales in selected period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Product Name</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4 text-center">Units Sold</th>
                        <th className="py-3 px-4 text-right">Total Revenue</th>
                        <th className="py-3 px-4 text-right">Est. Cost</th>
                        <th className="py-3 px-4 text-right text-emerald-400">Net Profit</th>
                        <th className="py-3 px-4 text-right">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                      {filteredProductsList.map((ps, idx) => (
                        <tr key={ps.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 font-bold text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-white">
                            <div>{ps.name}</div>
                            {ps.unit && <div className="text-[11px] text-slate-400 font-normal">{ps.unit}</div>}
                          </td>
                          <td className="py-3 px-4 text-slate-400">{ps.categoryName}</td>
                          <td className="py-3 px-4 text-center font-extrabold text-white">{ps.qty}</td>
                          <td className="py-3 px-4 text-right font-bold text-white">
                            {currency} {ps.revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-400">
                            {currency} {ps.cost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-emerald-400">
                            {currency} {ps.profit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-emerald-400">
                            <span className="inline-block bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-xs">
                              {ps.marginPct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOMER PURCHASING INTELLIGENCE */}
        {activeTab === 'customers' && (
          <div className="space-y-6">
            {/* Top Customer Champions Showcase Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Top Customer by Quantity */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <Award size={24} />
                </div>
                <div className="overflow-hidden">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Takes Most Products
                  </span>
                  <h3 className="font-bold text-white text-base mt-1.5 truncate">
                    {topCustomerByQty ? topCustomerByQty.name : 'N/A'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-black text-emerald-400">{topCustomerByQty ? topCustomerByQty.itemsBought : 0} items</span> bought ({topCustomerByQty ? topCustomerByQty.ordersCount : 0} orders)
                  </p>
                </div>
              </div>

              {/* Top Customer by Spend */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                  <DollarSign size={24} />
                </div>
                <div className="overflow-hidden">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    Highest Total Spend
                  </span>
                  <h3 className="font-bold text-white text-base mt-1.5 truncate">
                    {topCustomerBySpend ? topCustomerBySpend.name : 'N/A'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-black text-blue-400">{currency} {topCustomerBySpend ? topCustomerBySpend.totalSpend.toLocaleString() : 0}</span> spent
                  </p>
                </div>
              </div>

              {/* Top Customer by Profit Generated */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-card flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0">
                  <TrendingUp size={24} />
                </div>
                <div className="overflow-hidden">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    Most Profitable Customer
                  </span>
                  <h3 className="font-bold text-white text-base mt-1.5 truncate">
                    {topCustomerByProfit ? topCustomerByProfit.name : 'N/A'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-black text-purple-400">{currency} {topCustomerByProfit ? topCustomerByProfit.totalProfit.toLocaleString() : 0}</span> net profit generated
                  </p>
                </div>
              </div>
            </div>

            {/* Customers Performance Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Users className="text-emerald-400" size={20} />
                  <span>Customer Purchasing & Profit Breakdown</span>
                </h2>

                <div className="flex items-center space-x-3">
                  {/* Search Input */}
                  <div className="relative w-60">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search customer..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Sort Selector */}
                  <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
                    <ArrowUpDown size={14} className="text-slate-400" />
                    <span>Sort by:</span>
                    <select
                      value={customerSortKey}
                      onChange={(e: any) => setCustomerSortKey(e.target.value)}
                      className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="spend" className="bg-slate-900">Highest Spend</option>
                      <option value="qty" className="bg-slate-900">Most Products Taken</option>
                      <option value="profit" className="bg-slate-900">Most Net Profit</option>
                      <option value="orders" className="bg-slate-900">Most Orders</option>
                    </select>
                  </div>
                </div>
              </div>

              {filteredCustomersList.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No customer purchases in selected period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Phone</th>
                        <th className="py-3 px-4 text-center">Total Orders</th>
                        <th className="py-3 px-4 text-center text-emerald-400">Products Taken</th>
                        <th className="py-3 px-4 text-right">Total Spend</th>
                        <th className="py-3 px-4 text-right text-emerald-400">Net Profit Generated</th>
                        <th className="py-3 px-4 text-right">Last Purchase</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                      {filteredCustomersList.map((c, idx) => (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 font-bold text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-white">{c.name}</td>
                          <td className="py-3 px-4 text-slate-400">{c.phone}</td>
                          <td className="py-3 px-4 text-center font-bold">{c.ordersCount}</td>
                          <td className="py-3 px-4 text-center font-black text-emerald-400">{c.itemsBought} units</td>
                          <td className="py-3 px-4 text-right font-bold text-white">
                            {currency} {c.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-emerald-400">
                            {currency} {c.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-xs text-slate-400">
                            {new Date(c.lastOrderDate).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
