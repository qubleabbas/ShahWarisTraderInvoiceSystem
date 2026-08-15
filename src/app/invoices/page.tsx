'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  Square,
  ChevronLeft,
  ChevronRight,
  Truck,
  Building2,
  Calendar,
  FileSpreadsheet,
  Clock
} from 'lucide-react';
import { db, Invoice, Customer, City, InvoiceItem, recordTombstone, subscribeDataChanged } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';
import { printVectorPdf, PrintFormat } from '@/lib/pdfPrint';
import PrintFormatMenu from '@/components/PrintFormatMenu';
import { addPayment, statusBadgeClasses, displayStatus, round2 } from '@/lib/ledger';
import DeliverySheetPrintView from '@/components/DeliverySheetPrintView';
import PendingPaymentsPrintView from '@/components/PendingPaymentsPrintView';
import { DeliverySheetItem } from '@/components/pdf/DeliveryCollectionDocument';
import { CustomerPendingGroup, PendingPaymentItem } from '@/components/pdf/PendingPaymentsDocument';

function InvoicesContent() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'pending-payments'
    ? 'pending-payments'
    : tabParam === 'delivery-sheet'
    ? 'delivery-sheet'
    : 'invoices';

  const [activeTab, setActiveTab] = useState<'invoices' | 'delivery-sheet' | 'pending-payments'>(initialTab);
  const PAGE_SIZE = 25;
  const [invoices, setInvoices] = useState<(Invoice & { customer_name?: string })[]>([]); // current page only
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [currency, setCurrency] = useState('Rs.');

  // Standard Invoices Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Delivery & Collection Sheet States
  const [selectedCityId, setSelectedCityId] = useState<number | 'all'>('all');
  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'custom' | 'range' | 'all'>('today');
  const [customSingleDate, setCustomSingleDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [rangeStartDate, setRangeStartDate] = useState<string>('');
  const [rangeEndDate, setRangeEndDate] = useState<string>('');
  const [deliverySelectedIds, setDeliverySelectedIds] = useState<number[]>([]);
  const [allDeliverySheetItems, setAllDeliverySheetItems] = useState<DeliverySheetItem[]>([]);
  const [isDeliveryPrintViewOpen, setIsDeliveryPrintViewOpen] = useState(false);

  // Pending Payments Sheet States
  const [pendingSelectedCityId, setPendingSelectedCityId] = useState<number | 'all'>('all');
  const [pendingDateFilterMode, setPendingDateFilterMode] = useState<'custom' | 'range' | 'all'>('all');
  const [pendingCustomSingleDate, setPendingCustomSingleDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [pendingRangeStartDate, setPendingRangeStartDate] = useState<string>('');
  const [pendingRangeEndDate, setPendingRangeEndDate] = useState<string>('');
  const [pendingSelectedIds, setPendingSelectedIds] = useState<number[]>([]);
  const [allPendingItems, setAllPendingItems] = useState<PendingPaymentItem[]>([]);
  const [isPendingPrintViewOpen, setIsPendingPrintViewOpen] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isBulkExporting, setIsBulkExporting] = useState(false);

  const reqSeq = useRef(0);
  const customersRef = useRef<Customer[]>([]);
  const invoicesRef = useRef<(Invoice & { customer_name?: string })[]>([]);
  const pageRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadMoreRef = useRef<() => void>(() => {});

  useEffect(() => { customersRef.current = customers; }, [customers]);
  useEffect(() => { invoicesRef.current = invoices; }, [invoices]);
  useEffect(() => { pageRef.current = page; }, [page]);

  const startIndex = page * PAGE_SIZE;
  const loadedEnd = startIndex + invoices.length;
  const hasMore = loadedEnd < totalCount;

  function matchInvoice(inv: Invoice, custMap: Map<number, string>): boolean {
    const term = search.trim().toLowerCase();
    if (term) {
      const name = (custMap.get(inv.customer_id) || '').toLowerCase();
      if (!inv.invoice_number.toLowerCase().includes(term) && !name.includes(term)) return false;
    }
    if (statusFilter !== 'all') {
      const ns = inv.status.toLowerCase() === 'pending' ? 'unpaid' : inv.status.toLowerCase();
      if (ns !== statusFilter.toLowerCase()) return false;
    }
    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      if (new Date(inv.created_at) < s) return false;
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      if (new Date(inv.created_at) > e) return false;
    }
    return true;
  }

  const filtersActive = () =>
    statusFilter !== 'all' || !!startDate || !!endDate || !!search.trim();

  function baseCollection() {
    const custMap = new Map(customersRef.current.map((c) => [c.id!, c.name]));
    const base = db.invoices.orderBy('created_at').reverse();
    return filtersActive() ? base.filter((inv) => matchInvoice(inv, custMap)) : base;
  }

  async function queryRange(offset: number, limit: number) {
    const custMap = new Map(customersRef.current.map((c) => [c.id!, c.name]));
    const rows = await baseCollection().offset(offset).limit(limit).toArray();
    return rows.map((i) => ({ ...i, customer_name: custMap.get(i.customer_id) || 'Walk-in Customer' }));
  }

  async function countAll(): Promise<number> {
    const custMap = new Map(customersRef.current.map((c) => [c.id!, c.name]));
    return filtersActive()
      ? db.invoices.filter((inv) => matchInvoice(inv, custMap)).count()
      : db.invoices.count();
  }

  async function loadFirst(targetPage: number) {
    const seq = ++reqSeq.current;
    try {
      const total = await countAll();
      const rows = await queryRange(targetPage * PAGE_SIZE, PAGE_SIZE);
      if (seq !== reqSeq.current) return;
      setInvoices(rows);
      setTotalCount(total);
    } catch (err) {
      console.error(err);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }

  async function loadMore() {
    if (loadingMoreRef.current || loading) return;
    const total = totalCount;
    const currentEnd = pageRef.current * PAGE_SIZE + invoicesRef.current.length;
    if (total > 0 && currentEnd >= total) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const seq = ++reqSeq.current;
    try {
      const rows = await queryRange(currentEnd, PAGE_SIZE);
      if (seq !== reqSeq.current) return;
      setInvoices((prev) => [...prev, ...rows]);
    } catch (err) {
      console.error(err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  async function reloadCurrent() {
    const seq = ++reqSeq.current;
    try {
      const total = await countAll();
      const limit = Math.max(PAGE_SIZE, invoicesRef.current.length);
      const rows = await queryRange(pageRef.current * PAGE_SIZE, limit);
      if (seq !== reqSeq.current) return;
      setInvoices(rows);
      setTotalCount(total);
    } catch (err) {
      console.error(err);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }

  // Load all Delivery Sheet Items for Delivery Tab
  async function loadDeliverySheetData() {
    try {
      const allInvs = await db.invoices.orderBy('created_at').reverse().toArray();
      const custs = await db.customers.toArray();
      const cityList = await db.cities.toArray();
      const items = await db.invoice_items.toArray();
      const prods = await db.products.toArray();

      const custMap = new Map(custs.map(c => [c.id!, c]));
      const cityMap = new Map(cityList.map(c => [c.id!, c.name]));
      const prodMap = new Map(prods.map(p => [p.id!, p.name]));

      const itemsByInvoice = new Map<number, InvoiceItem[]>();
      items.forEach(it => {
        if (it.invoice_id) {
          const list = itemsByInvoice.get(it.invoice_id) || [];
          list.push({
            ...it,
            product_name: prodMap.get(it.product_id) || `Product #${it.product_id}`
          });
          itemsByInvoice.set(it.invoice_id, list);
        }
      });

      const deliveryItems: DeliverySheetItem[] = allInvs.map(inv => {
        const cust = custMap.get(inv.customer_id);
        const cityName = cust?.city_id ? cityMap.get(cust.city_id) : undefined;
        return {
          invoice: inv,
          customerName: cust?.name || inv.customer_name || 'Walk-in Customer',
          customerPhone: cust?.phone || inv.customer_phone,
          customerAddress: cust?.address || inv.customer_address,
          cityName: cityName,
          items: itemsByInvoice.get(inv.id!) || []
        };
      });

      setCities(cityList);
      setAllDeliverySheetItems(deliveryItems);
    } catch (err) {
      console.error("Error loading delivery sheet data:", err);
    }
  }

  // Load Pending / Partially Paid Invoices Data
  async function loadPendingPaymentsData() {
    try {
      const allInvs = await db.invoices.orderBy('created_at').reverse().toArray();
      const custs = await db.customers.toArray();
      const cityList = await db.cities.toArray();

      const custMap = new Map(custs.map(c => [c.id!, c]));
      const cityMap = new Map(cityList.map(c => [c.id!, c.name]));

      const pendingList: PendingPaymentItem[] = [];

      allInvs.forEach(inv => {
        const statusLower = inv.status.toLowerCase();
        const pendingAmount = round2((inv.total_amount || 0) - (inv.amount_paid || 0));

        // Strictly include ONLY Pending or Partially Paid invoices (pendingAmount > 0)
        if ((statusLower === 'pending' || statusLower === 'unpaid' || statusLower === 'partially paid' || statusLower === 'partial' || statusLower === 'overdue') && pendingAmount > 0.009) {
          const cust = custMap.get(inv.customer_id);
          const cityName = cust?.city_id ? cityMap.get(cust.city_id) : undefined;

          pendingList.push({
            invoice: inv,
            customerName: cust?.name || inv.customer_name || 'Walk-in Customer',
            customerPhone: cust?.phone || inv.customer_phone,
            customerAddress: cust?.address || inv.customer_address,
            cityName: cityName,
            pendingAmount: pendingAmount
          });
        }
      });

      setAllPendingItems(pendingList);
    } catch (err) {
      console.error("Error loading pending payments data:", err);
    }
  }

  useEffect(() => {
    loadFirst(0);
    (async () => {
      const custs = await db.customers.toArray();
      const cityList = await db.cities.toArray();
      setCustomers(custs);
      setCities(cityList);
      const curr = await db.settings.get('currency_symbol');
      if (curr) setCurrency(curr.value);
    })();
    loadDeliverySheetData();
    loadPendingPaymentsData();

    const unsub = subscribeDataChanged(() => {
      db.customers.toArray().then(setCustomers);
      db.cities.toArray().then(setCities);
      reloadCurrent();
      loadDeliverySheetData();
      loadPendingPaymentsData();
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (customers.length) reloadCurrent();
  }, [customers]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      pageRef.current = 0;
      loadFirst(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search, statusFilter, startDate, endDate]);

  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  useEffect(() => {
    function onScroll() {
      if (typeof window === 'undefined') return;
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 500;
      if (nearBottom) loadMoreRef.current();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  function scrollToTop() {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goPrev() {
    if (page === 0) return;
    const np = page - 1;
    setPage(np);
    pageRef.current = np;
    loadFirst(np);
    scrollToTop();
  }

  function goNext() {
    if (!hasMore) return;
    const np = Math.floor(loadedEnd / PAGE_SIZE);
    setPage(np);
    pageRef.current = np;
    loadFirst(np);
    scrollToTop();
  }

  async function getFilteredIds(): Promise<number[]> {
    return (await baseCollection().primaryKeys()) as number[];
  }

  async function handleMarkAsPaid(id: number) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    const remaining = round2((inv.total_amount || 0) - (inv.amount_paid || 0));
    if (remaining <= 0.009) {
      showToast(`Invoice #${inv.invoice_number} is already fully paid.`, 'info');
      return;
    }
    try {
      await addPayment({
        invoice_id: id,
        amount: remaining,
        payment_date: new Date().toISOString(),
        method: 'Cash',
        notes: 'Marked as paid (full balance) from invoice list',
        is_auto: true,
      });
      showToast(`Invoice #${inv.invoice_number} marked as Paid! (${currency} ${remaining.toLocaleString()} recorded)`, 'success');
      reloadCurrent();
      loadDeliverySheetData();
      loadPendingPaymentsData();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to mark as paid.', 'error');
    }
  }

  async function handleDeleteInvoice(id: number) {
    const inv = invoices.find(i => i.id === id);
    if (confirm("Are you sure you want to delete this invoice?")) {
      const itemKeys = await db.invoice_items.where('invoice_id').equals(id).primaryKeys();
      const paymentKeys = await db.payments.where('invoice_id').equals(id).primaryKeys();
      await db.transaction('rw', [db.invoices, db.invoice_items, db.payments], async () => {
        await db.invoices.delete(id);
        await db.invoice_items.where('invoice_id').equals(id).delete();
        await db.payments.where('invoice_id').equals(id).delete();
      });
      await recordTombstone('invoices', id);
      for (const k of itemKeys) await recordTombstone('invoice_items', k as number);
      for (const k of paymentKeys) await recordTombstone('payments', k as number);
      showToast(`Invoice #${inv?.invoice_number || id} deleted!`, 'success');
      reloadCurrent();
      loadDeliverySheetData();
      loadPendingPaymentsData();
    }
  }

  const filteredInvoices = invoices;

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

  async function preparePayloads(targetIds?: number[]) {
    let idsToExport: number[];
    if (targetIds && targetIds.length > 0) idsToExport = targetIds;
    else if (selectedIds.length > 0) idsToExport = selectedIds;
    else idsToExport = await getFilteredIds();

    if (idsToExport.length === 0) return [];

    const name = await db.settings.get('business_name');
    const tagline = await db.settings.get('business_tagline');
    const address = await db.settings.get('business_address');
    const phone = await db.settings.get('business_phone');
    const email = await db.settings.get('business_email');
    const curr = await db.settings.get('currency_symbol');
    const logo = await db.settings.get('business_logo_url');

    const businessInfo = {
      name: name?.value || 'SHAH WARIS TRADERS',
      tagline: tagline?.value || 'Pure Quality Goods & Wholesalers',
      address: address?.value || 'Main Market, Lahore, Pakistan',
      phone: phone?.value || '+92 300 0000000',
      email: email?.value || 'info@shahwaris.com',
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
          category_name: prod ? catMap.get(prod.category_id) || 'General' : 'General',
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

  const [isPrinting, setIsPrinting] = useState(false);

  async function handlePrintInvoices(targetIds?: number[], format: PrintFormat = 'a4') {
    setIsPrinting(true);
    showToast(
      format === 'thermal' ? 'Preparing thermal receipt(s) for printing...' : 'Preparing A4 invoice(s) for printing...',
      'info'
    );
    try {
      const payloadList = await preparePayloads(targetIds);
      if (payloadList.length === 0) {
        showToast("No invoices to print.", "info");
        return;
      }
      await printVectorPdf(payloadList, format);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to print PDF", "error");
    } finally {
      setIsPrinting(false);
    }
  }

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

  // ---------------------------------------------------------------------------
  // Delivery & Collection Sheet Filtering & Handlers
  // ---------------------------------------------------------------------------

  const filteredDeliveryItems = allDeliverySheetItems.filter((item) => {
    if (selectedCityId !== 'all') {
      const cust = customers.find(c => c.id === item.invoice.customer_id);
      if (cust?.city_id !== Number(selectedCityId)) return false;
    }

    const invDateStr = item.invoice.created_at.slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    if (dateFilterMode === 'today') {
      if (invDateStr !== todayStr) return false;
    } else if (dateFilterMode === 'yesterday') {
      if (invDateStr !== yesterdayStr) return false;
    } else if (dateFilterMode === 'custom') {
      if (customSingleDate && invDateStr !== customSingleDate) return false;
    } else if (dateFilterMode === 'range') {
      if (rangeStartDate && invDateStr < rangeStartDate) return false;
      if (rangeEndDate && invDateStr > rangeEndDate) return false;
    }

    return true;
  });

  function toggleDeliverySelectAll() {
    if (deliverySelectedIds.length === filteredDeliveryItems.length) {
      setDeliverySelectedIds([]);
    } else {
      setDeliverySelectedIds(filteredDeliveryItems.map(item => item.invoice.id!));
    }
  }

  function toggleDeliverySelectOne(id: number) {
    if (deliverySelectedIds.includes(id)) {
      setDeliverySelectedIds(deliverySelectedIds.filter(i => i !== id));
    } else {
      setDeliverySelectedIds([...deliverySelectedIds, id]);
    }
  }

  const selectedDeliveryItems = filteredDeliveryItems.filter(item =>
    deliverySelectedIds.includes(item.invoice.id!)
  );

  const selectedDeliveryTotalValue = selectedDeliveryItems.reduce(
    (sum, item) => sum + (item.invoice.total_amount || 0),
    0
  );

  const cityFilterName = selectedCityId === 'all'
    ? 'All Cities'
    : cities.find(c => c.id === Number(selectedCityId))?.name || 'Selected City';

  const dateFilterName = dateFilterMode === 'today'
    ? 'Today'
    : dateFilterMode === 'yesterday'
    ? 'Yesterday'
    : dateFilterMode === 'custom'
    ? `Custom Date (${customSingleDate})`
    : dateFilterMode === 'range'
    ? `Date Range (${rangeStartDate || '...'} to ${rangeEndDate || '...'})`
    : 'All Dates';

  async function handleDirectPrintDeliverySheet(itemsToPrint?: DeliverySheetItem[]) {
    const list = itemsToPrint && itemsToPrint.length > 0 ? itemsToPrint : selectedDeliveryItems;
    if (list.length === 0) {
      showToast("Please select at least one invoice.", "info");
      return;
    }

    showToast(`Preparing vector PDF print for ${list.length} invoice(s)...`, "info");
    try {
      const name = await db.settings.get('business_name');
      const address = await db.settings.get('business_address');
      const phone = await db.settings.get('business_phone');
      const email = await db.settings.get('business_email');
      const curr = await db.settings.get('currency_symbol');

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'delivery-sheet',
          sheetItems: list,
          cityFilterLabel: cityFilterName,
          dateFilterLabel: dateFilterName,
          businessName: name?.value || 'Qureshi Sharbat & Majoon House',
          businessAddress: address?.value || '14-B Industrial Area, Station Road, Gujranwala',
          businessPhone: phone?.value || '+92 300 8889900 / +92 55 4231100',
          businessEmail: email?.value || 'orders@qureshisharbat.com',
          currency: curr?.value || 'Rs.'
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate delivery sheet PDF");
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      iframe.src = blobUrl;

      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            window.open(blobUrl, '_blank');
          }
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
          }, 60000);
        }, 300);
      };
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || "Failed to print delivery sheet.", "error");
    }
  }

  async function handleExportDeliverySheetPdf(itemsToExport?: DeliverySheetItem[]) {
    const list = itemsToExport && itemsToExport.length > 0 ? itemsToExport : selectedDeliveryItems;
    if (list.length === 0) {
      showToast("Please select at least one invoice.", "info");
      return;
    }

    showToast(`Generating vector PDF for ${list.length} invoice(s)...`, "info");
    try {
      const name = await db.settings.get('business_name');
      const address = await db.settings.get('business_address');
      const phone = await db.settings.get('business_phone');
      const email = await db.settings.get('business_email');
      const curr = await db.settings.get('currency_symbol');

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'delivery-sheet',
          sheetItems: list,
          cityFilterLabel: cityFilterName,
          dateFilterLabel: dateFilterName,
          businessName: name?.value || 'Qureshi Sharbat & Majoon House',
          businessAddress: address?.value || '14-B Industrial Area, Station Road, Gujranwala',
          businessPhone: phone?.value || '+92 300 8889900 / +92 55 4231100',
          businessEmail: email?.value || 'orders@qureshisharbat.com',
          currency: curr?.value || 'Rs.'
        })
      });

      if (!res.ok) throw new Error('Failed to generate PDF');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Delivery-Collection-Sheet-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Delivery Sheet PDF exported successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Failed to export PDF file.', 'error');
    }
  }

  function handleExportDeliverySheetCsv(itemsToExport?: DeliverySheetItem[]) {
    const list = itemsToExport && itemsToExport.length > 0 ? itemsToExport : selectedDeliveryItems;
    if (list.length === 0) {
      showToast("Please select at least one invoice.", "info");
      return;
    }

    try {
      const nowStr = new Date().toLocaleDateString('en-GB');
      const rows: string[][] = [
        ['Delivery & Collection Sheet'],
        [`Print Date: ${nowStr}`, `City Filter: ${cityFilterName}`, `Date Filter: ${dateFilterName}`],
        [],
        ['Invoice #', 'Customer Name', 'City', 'Phone', 'Invoice Date', 'Grand Total', 'Status', 'Received Payment (Field)', 'Remaining Payment (Field)']
      ];

      list.forEach((item) => {
        const isPaid = item.invoice.status.toLowerCase() === 'paid';
        const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB');

        rows.push([
          item.invoice.invoice_number,
          item.customerName,
          item.cityName || '',
          item.customerPhone || '',
          invDate,
          String(item.invoice.total_amount),
          item.invoice.status,
          isPaid ? 'PAID IN FULL' : '',
          isPaid ? '0' : ''
        ]);
      });

      const processRow = (row: string[]) => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(processRow).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Delivery-Collection-Sheet-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Excel/CSV spreadsheet exported successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export CSV file.', 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Pending Payments Sheet Filtering & Handlers
  // ---------------------------------------------------------------------------

  const filteredPendingItems = allPendingItems.filter((item) => {
    // City Filter
    if (pendingSelectedCityId !== 'all') {
      const cust = customers.find(c => c.id === item.invoice.customer_id);
      if (cust?.city_id !== Number(pendingSelectedCityId)) return false;
    }

    // Date Filter
    const invDateStr = item.invoice.created_at.slice(0, 10);
    if (pendingDateFilterMode === 'custom') {
      if (pendingCustomSingleDate && invDateStr !== pendingCustomSingleDate) return false;
    } else if (pendingDateFilterMode === 'range') {
      if (pendingRangeStartDate && invDateStr < pendingRangeStartDate) return false;
      if (pendingRangeEndDate && invDateStr > pendingRangeEndDate) return false;
    }

    return true;
  });

  function togglePendingSelectAll() {
    if (pendingSelectedIds.length === filteredPendingItems.length) {
      setPendingSelectedIds([]);
    } else {
      setPendingSelectedIds(filteredPendingItems.map(item => item.invoice.id!));
    }
  }

  function togglePendingSelectOne(id: number) {
    if (pendingSelectedIds.includes(id)) {
      setPendingSelectedIds(pendingSelectedIds.filter(i => i !== id));
    } else {
      setPendingSelectedIds([...pendingSelectedIds, id]);
    }
  }

  const selectedPendingItems = filteredPendingItems.filter(item =>
    pendingSelectedIds.includes(item.invoice.id!)
  );

  const selectedPendingTotalValue = selectedPendingItems.reduce(
    (sum, item) => sum + (item.pendingAmount || 0),
    0
  );

  const pendingCityFilterName = pendingSelectedCityId === 'all'
    ? 'All Cities'
    : cities.find(c => c.id === Number(pendingSelectedCityId))?.name || 'Selected City';

  const pendingDateFilterName = pendingDateFilterMode === 'custom'
    ? `Custom Date (${pendingCustomSingleDate})`
    : pendingDateFilterMode === 'range'
    ? `Date Range (${pendingRangeStartDate || '...'} to ${pendingRangeEndDate || '...'})`
    : 'All Dates';

  // Helper to group selected pending items by Customer
  function getGroupedCustomerPendingItems(items: PendingPaymentItem[]): CustomerPendingGroup[] {
    const map = new Map<number, CustomerPendingGroup>();

    items.forEach(item => {
      const custId = item.invoice.customer_id;
      if (!map.has(custId)) {
        map.set(custId, {
          customerId: custId,
          customerName: item.customerName,
          customerPhone: item.customerPhone,
          customerAddress: item.customerAddress,
          cityName: item.cityName,
          items: [],
          customerTotalPending: 0
        });
      }
      const grp = map.get(custId)!;
      grp.items.push(item);
      grp.customerTotalPending = round2(grp.customerTotalPending + item.pendingAmount);
    });

    const groupsArray = Array.from(map.values());
    groupsArray.sort((a, b) => a.customerName.localeCompare(b.customerName));
    return groupsArray;
  }

  async function handleDirectPrintPendingPayments() {
    if (selectedPendingItems.length === 0) {
      showToast("Please select at least one invoice.", "info");
      return;
    }

    const customerGroups = getGroupedCustomerPendingItems(selectedPendingItems);
    showToast(`Preparing pending payments vector PDF print for ${selectedPendingItems.length} invoice(s)...`, "info");

    try {
      const name = await db.settings.get('business_name');
      const address = await db.settings.get('business_address');
      const phone = await db.settings.get('business_phone');
      const email = await db.settings.get('business_email');
      const curr = await db.settings.get('currency_symbol');

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'pending-payments',
          customerGroups,
          cityFilterLabel: pendingCityFilterName,
          dateFilterLabel: pendingDateFilterName,
          businessName: name?.value || 'Qureshi Sharbat & Majoon House',
          businessAddress: address?.value || '14-B Industrial Area, Station Road, Gujranwala',
          businessPhone: phone?.value || '+92 300 8889900 / +92 55 4231100',
          businessEmail: email?.value || 'orders@qureshisharbat.com',
          currency: curr?.value || 'Rs.'
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate pending payments PDF");
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      iframe.src = blobUrl;

      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            window.open(blobUrl, '_blank');
          }
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
          }, 60000);
        }, 300);
      };
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || "Failed to print pending payments sheet.", "error");
    }
  }

  async function handleExportPendingPaymentsPdf() {
    if (selectedPendingItems.length === 0) {
      showToast("Please select at least one invoice.", "info");
      return;
    }

    const customerGroups = getGroupedCustomerPendingItems(selectedPendingItems);
    showToast(`Generating vector PDF for ${selectedPendingItems.length} invoice(s)...`, "info");

    try {
      const name = await db.settings.get('business_name');
      const address = await db.settings.get('business_address');
      const phone = await db.settings.get('business_phone');
      const email = await db.settings.get('business_email');
      const curr = await db.settings.get('currency_symbol');

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'pending-payments',
          customerGroups,
          cityFilterLabel: pendingCityFilterName,
          dateFilterLabel: pendingDateFilterName,
          businessName: name?.value || 'Qureshi Sharbat & Majoon House',
          businessAddress: address?.value || '14-B Industrial Area, Station Road, Gujranwala',
          businessPhone: phone?.value || '+92 300 8889900 / +92 55 4231100',
          businessEmail: email?.value || 'orders@qureshisharbat.com',
          currency: curr?.value || 'Rs.'
        })
      });

      if (!res.ok) throw new Error('Failed to generate PDF');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pending-Payments-Sheet-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Pending Payments Sheet PDF exported successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Failed to export PDF file.', 'error');
    }
  }

  function handleExportPendingPaymentsCsv() {
    if (selectedPendingItems.length === 0) {
      showToast("Please select at least one invoice.", "info");
      return;
    }

    try {
      const customerGroups = getGroupedCustomerPendingItems(selectedPendingItems);
      const nowStr = new Date().toLocaleDateString('en-GB');
      const rows: string[][] = [
        ['Pending Payments Sheet (Grouped by Customer)'],
        [`Print Date: ${nowStr}`, `City Filter: ${pendingCityFilterName}`, `Date Filter: ${pendingDateFilterName}`],
        [],
        ['Customer Name', 'City', 'Phone', 'Invoice #', 'Invoice Date', 'Grand Total', 'Pending Amount', 'Received Payment (Field)', 'Remaining Payment (Field)']
      ];

      customerGroups.forEach((group) => {
        group.items.forEach((item) => {
          const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB');
          rows.push([
            group.customerName,
            group.cityName || '',
            group.customerPhone || '',
            item.invoice.invoice_number,
            invDate,
            String(item.invoice.total_amount),
            String(item.pendingAmount),
            '',
            ''
          ]);
        });
        rows.push([
          `SUBTOTAL FOR ${group.customerName.toUpperCase()}`,
          '',
          '',
          '',
          '',
          '',
          String(group.customerTotalPending),
          '',
          ''
        ]);
        rows.push([]);
      });

      rows.push(['GRAND TOTAL PENDING AMOUNT', '', '', '', '', '', String(selectedPendingTotalValue), '', '']);

      const processRow = (row: string[]) => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(processRow).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Pending-Payments-Sheet-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Excel/CSV spreadsheet exported successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export CSV file.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Module Header & Sub-Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <div className="flex items-center space-x-3">
            {activeTab === 'invoices' ? (
              <FileText className="text-emerald-400" size={28} />
            ) : activeTab === 'delivery-sheet' ? (
              <Truck className="text-emerald-400" size={28} />
            ) : (
              <Clock className="text-amber-400" size={28} />
            )}
            <h1 className="text-2xl font-extrabold text-white">Billing & Invoices</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {activeTab === 'invoices'
              ? 'Manage Customer Invoices, Partial Payments & Vector PDF Printing'
              : activeTab === 'delivery-sheet'
              ? 'Generate Printable Delivery & Collection Sheets for Field Market Delivery'
              : 'Generate Outstanding Balance Summary Sheets Grouped by Customer'}
          </p>
        </div>

        {activeTab === 'invoices' ? (
          <Link
            href="/invoices/new"
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition transform active:scale-95"
          >
            <Plus size={18} />
            <span>Create New Invoice</span>
          </Link>
        ) : activeTab === 'delivery-sheet' ? (
          <button
            onClick={() => handleDirectPrintDeliverySheet()}
            disabled={deliverySelectedIds.length === 0}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition disabled:opacity-50"
          >
            <Printer size={18} />
            <span>Print Delivery Sheet ({deliverySelectedIds.length})</span>
          </button>
        ) : (
          <button
            onClick={() => handleDirectPrintPendingPayments()}
            disabled={pendingSelectedIds.length === 0}
            className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition disabled:opacity-50"
          >
            <Printer size={18} />
            <span>Print Pending Sheet ({pendingSelectedIds.length})</span>
          </button>
        )}
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'invoices'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText size={16} />
          <span>Invoices</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('delivery-sheet')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'delivery-sheet'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Truck size={16} />
          <span>Delivery & Collection Sheet</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pending-payments')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'pending-payments'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Clock size={16} />
          <span>Pending Payments Sheet</span>
        </button>
      </div>

      {/* TAB 1: ALL INVOICES LIST */}
      {activeTab === 'invoices' && (
        <>
          {/* Filters & Search */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by invoice number or customer name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="partially paid">Partially Paid</option>
                <option value="unpaid">Unpaid / Pending</option>
                <option value="overdue">Overdue</option>
              </select>

              <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-400">
                <span>From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-400">
                <span>To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-white focus:outline-none"
                />
              </div>

              {selectedIds.length > 0 && (
                <div className="flex items-center space-x-2">
                  <PrintFormatMenu
                    onSelect={(fmt: PrintFormat) => handlePrintInvoices(selectedIds, fmt)}
                    disabled={isPrinting}
                    label={`Print (${selectedIds.length})`}
                    icon={<Printer size={14} />}
                  />
                  <button
                    onClick={() => handleBulkExportPdf(selectedIds)}
                    disabled={isBulkExporting}
                    className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-50"
                  >
                    <Download size={14} />
                    <span>Export PDF ({selectedIds.length})</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Invoices Table */}
          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading invoices...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              No invoices found matching your filter criteria.
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-xs border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-10 text-center">
                        <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white">
                          {selectedIds.length > 0 && selectedIds.length === filteredInvoices.length ? (
                            <CheckSquare size={16} className="text-emerald-400" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Grand Total</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredInvoices.map((inv) => {
                      const isSelected = selectedIds.includes(inv.id!);
                      const invDate = new Date(inv.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                      return (
                        <tr key={inv.id} className={`hover:bg-slate-800/40 transition ${isSelected ? 'bg-slate-800/60' : ''}`}>
                          <td className="py-3 px-4 text-center">
                            <button onClick={() => toggleSelectOne(inv.id!)} className="text-slate-400 hover:text-white">
                              {isSelected ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} />}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-bold text-white">{inv.invoice_number}</td>
                          <td className="py-3 px-4 font-medium text-slate-200">{inv.customer_name}</td>
                          <td className="py-3 px-4 text-slate-400 text-xs">{invDate}</td>
                          <td className="py-3 px-4 text-right font-extrabold text-emerald-400">
                            {currency} {inv.total_amount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClasses(inv.status)}`}>
                              {displayStatus(inv.status)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {inv.status !== 'Paid' && (
                                <button
                                  onClick={() => handleMarkAsPaid(inv.id!)}
                                  className="p-1.5 rounded-lg bg-emerald-950 text-emerald-400 hover:bg-emerald-600 hover:text-white transition"
                                  title="Mark as Paid"
                                >
                                  <CheckCircle size={15} />
                                </button>
                              )}
                              <PrintFormatMenu
                                onSelect={(fmt: PrintFormat) => handlePrintInvoices([inv.id!], fmt)}
                                disabled={isPrinting}
                                label="Print"
                                icon={<Printer size={14} />}
                              />
                              <Link
                                href={`/invoices/${inv.id}`}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                title="View Invoice"
                              >
                                <Eye size={15} />
                              </Link>
                              <Link
                                href={`/invoices/${inv.id}/edit`}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition"
                                title="Edit Invoice"
                              >
                                <Edit2 size={15} />
                              </Link>
                              <button
                                onClick={() => handleDeleteInvoice(inv.id!)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition"
                                title="Delete Invoice"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-950">
                <div>
                  Showing {totalCount === 0 ? 0 : startIndex + 1}–{loadedEnd} of {totalCount} invoices
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={goPrev}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition text-slate-200"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-semibold text-white">Page {page + 1}</span>
                  <button
                    onClick={goNext}
                    disabled={!hasMore}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition text-slate-200"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: DELIVERY & COLLECTION SHEET */}
      {activeTab === 'delivery-sheet' && (
        <>
          {/* Combined Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-white text-base flex items-center space-x-2">
                <Truck className="text-emerald-400" size={20} />
                <span>Delivery & Collection Sheet Filters</span>
              </h2>
              <span className="text-xs text-slate-400">
                Both filters work together (AND condition)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* City Filter */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5 flex items-center space-x-1.5">
                  <Building2 size={14} className="text-emerald-400" />
                  <span>City Filter</span>
                </label>
                <select
                  value={selectedCityId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedCityId(val === 'all' ? 'all' : Number(val));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">All Cities</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filter Mode */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5 flex items-center space-x-1.5">
                  <Calendar size={14} className="text-emerald-400" />
                  <span>Date Filter Option</span>
                </label>
                <select
                  value={dateFilterMode}
                  onChange={(e) => setDateFilterMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="custom">Custom Specific Date</option>
                  <option value="range">Date Range (From / To)</option>
                  <option value="all">All Dates</option>
                </select>
              </div>

              {/* Custom Date Single Picker */}
              {dateFilterMode === 'custom' && (
                <div className="sm:col-span-2 md:col-span-2">
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                    Select Specific Date
                  </label>
                  <input
                    type="date"
                    value={customSingleDate}
                    onChange={(e) => setCustomSingleDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Date Range Pickers */}
              {dateFilterMode === 'range' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={rangeStartDate}
                      onChange={(e) => setRangeStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={rangeEndDate}
                      onChange={(e) => setRangeEndDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action & Summary Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-card flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 text-xs text-slate-300">
              <span className="font-bold text-white text-sm">
                {deliverySelectedIds.length} of {filteredDeliveryItems.length} Invoices Selected
              </span>
              {deliverySelectedIds.length > 0 && (
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-3 py-1 rounded-lg font-bold">
                  Total Value: {currency} {selectedDeliveryTotalValue.toLocaleString()}
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => handleDirectPrintDeliverySheet()}
                disabled={deliverySelectedIds.length === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-md transition disabled:opacity-50"
                title="Direct Vector Print (No Modal Background)"
              >
                <Printer size={15} />
                <span>Print Sheet ({deliverySelectedIds.length})</span>
              </button>

              <button
                onClick={() => {
                  if (deliverySelectedIds.length === 0) {
                    showToast("Please select at least one invoice.", "info");
                    return;
                  }
                  setIsDeliveryPrintViewOpen(true);
                }}
                disabled={deliverySelectedIds.length === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
                title="Preview On-Screen"
              >
                <Eye size={15} />
                <span>Preview Sheet</span>
              </button>

              <button
                onClick={() => handleExportDeliverySheetPdf()}
                disabled={deliverySelectedIds.length === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
                title="Export Vector PDF File"
              >
                <Download size={15} />
                <span>Export PDF</span>
              </button>

              <button
                onClick={() => handleExportDeliverySheetCsv()}
                disabled={deliverySelectedIds.length === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-emerald-400 hover:bg-slate-700 transition disabled:opacity-50"
                title="Export Excel/CSV File"
              >
                <FileSpreadsheet size={15} />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* Filtered Invoices Multi-Select Table */}
          {filteredDeliveryItems.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              No invoices match your selected city and date criteria.
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-xs border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-10 text-center">
                        <button onClick={toggleDeliverySelectAll} className="text-slate-400 hover:text-white">
                          {deliverySelectedIds.length > 0 && deliverySelectedIds.length === filteredDeliveryItems.length ? (
                            <CheckSquare size={16} className="text-emerald-400" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">City</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Grand Total</th>
                      <th className="py-3 px-4 text-center">Payment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredDeliveryItems.map((item) => {
                      const isSelected = deliverySelectedIds.includes(item.invoice.id!);
                      const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                      return (
                        <tr
                          key={item.invoice.id}
                          className={`hover:bg-slate-800/40 transition cursor-pointer ${
                            isSelected ? 'bg-slate-800/60' : ''
                          }`}
                          onClick={() => toggleDeliverySelectOne(item.invoice.id!)}
                        >
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => toggleDeliverySelectOne(item.invoice.id!)} className="text-slate-400 hover:text-white">
                              {isSelected ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} />}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-bold text-white">{item.invoice.invoice_number}</td>
                          <td className="py-3 px-4 font-medium text-slate-200">{item.customerName}</td>
                          <td className="py-3 px-4 text-xs font-semibold text-emerald-400">{item.cityName || 'N/A'}</td>
                          <td className="py-3 px-4 text-slate-400 text-xs">{invDate}</td>
                          <td className="py-3 px-4 text-right font-extrabold text-emerald-400">
                            {currency} {item.invoice.total_amount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClasses(item.invoice.status)}`}>
                              {displayStatus(item.invoice.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Delivery Sheet Print & Export Modal */}
          {isDeliveryPrintViewOpen && (
            <DeliverySheetPrintView
              sheetItems={selectedDeliveryItems}
              cityFilterLabel={cityFilterName}
              dateFilterLabel={dateFilterName}
              onClose={() => setIsDeliveryPrintViewOpen(false)}
            />
          )}
        </>
      )}

      {/* TAB 3: PENDING PAYMENTS SHEET */}
      {activeTab === 'pending-payments' && (
        <>
          {/* Combined Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-white text-base flex items-center space-x-2">
                <Clock className="text-amber-400" size={20} />
                <span>Pending Payments Filters</span>
              </h2>
              <span className="text-xs text-amber-400 font-semibold bg-amber-950/80 px-2.5 py-1 rounded-md border border-amber-800/40">
                Automatic Filter: Unpaid / Partially Paid Invoices Only
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* City Filter */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5 flex items-center space-x-1.5">
                  <Building2 size={14} className="text-amber-400" />
                  <span>City Filter</span>
                </label>
                <select
                  value={pendingSelectedCityId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPendingSelectedCityId(val === 'all' ? 'all' : Number(val));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="all">All Cities</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filter Mode */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5 flex items-center space-x-1.5">
                  <Calendar size={14} className="text-amber-400" />
                  <span>Date Filter Option</span>
                </label>
                <select
                  value={pendingDateFilterMode}
                  onChange={(e) => setPendingDateFilterMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="all">All Dates</option>
                  <option value="custom">Custom Specific Date</option>
                  <option value="range">Date Range (From / To)</option>
                </select>
              </div>

              {/* Custom Date Single Picker */}
              {pendingDateFilterMode === 'custom' && (
                <div className="sm:col-span-2 md:col-span-2">
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                    Select Specific Date
                  </label>
                  <input
                    type="date"
                    value={pendingCustomSingleDate}
                    onChange={(e) => setPendingCustomSingleDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Date Range Pickers */}
              {pendingDateFilterMode === 'range' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={pendingRangeStartDate}
                      onChange={(e) => setPendingRangeStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={pendingRangeEndDate}
                      onChange={(e) => setPendingRangeEndDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action & Summary Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-card flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 text-xs text-slate-300">
              <span className="font-bold text-white text-sm">
                {pendingSelectedIds.length} of {filteredPendingItems.length} Invoices Selected
              </span>
              {pendingSelectedIds.length > 0 && (
                <span className="bg-amber-950 text-amber-400 border border-amber-800/60 px-3 py-1 rounded-lg font-bold">
                  Total Pending: {currency} {selectedPendingTotalValue.toLocaleString()}
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => handleDirectPrintPendingPayments()}
                disabled={pendingSelectedIds.length === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 text-white hover:bg-amber-500 shadow-md transition disabled:opacity-50"
                title="Direct Vector Print (Grouped by Customer)"
              >
                <Printer size={15} />
                <span>Print Sheet ({pendingSelectedIds.length})</span>
              </button>

              <button
                onClick={() => {
                  if (pendingSelectedIds.length === 0) {
                    showToast("Please select at least one invoice.", "info");
                    return;
                  }
                  setIsPendingPrintViewOpen(true);
                }}
                disabled={pendingSelectedIds.length === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
                title="Preview On-Screen"
              >
                <Eye size={15} />
                <span>Preview Sheet</span>
              </button>

              <button
                onClick={() => handleExportPendingPaymentsPdf()}
                disabled={pendingSelectedIds.length === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
                title="Export Vector PDF File"
              >
                <Download size={15} />
                <span>Export PDF</span>
              </button>

              <button
                onClick={() => handleExportPendingPaymentsCsv()}
                disabled={pendingSelectedIds.length === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-amber-400 hover:bg-slate-700 transition disabled:opacity-50"
                title="Export Excel/CSV File"
              >
                <FileSpreadsheet size={15} />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* Filtered Pending Invoices Multi-Select Table */}
          {filteredPendingItems.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              No pending or partially paid invoices match your selected city and date criteria.
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-xs border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-10 text-center">
                        <button onClick={togglePendingSelectAll} className="text-slate-400 hover:text-white">
                          {pendingSelectedIds.length > 0 && pendingSelectedIds.length === filteredPendingItems.length ? (
                            <CheckSquare size={16} className="text-amber-400" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">City</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Grand Total</th>
                      <th className="py-3 px-4 text-right">Pending Amount</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredPendingItems.map((item) => {
                      const isSelected = pendingSelectedIds.includes(item.invoice.id!);
                      const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                      return (
                        <tr
                          key={item.invoice.id}
                          className={`hover:bg-slate-800/40 transition cursor-pointer ${
                            isSelected ? 'bg-slate-800/60' : ''
                          }`}
                          onClick={() => togglePendingSelectOne(item.invoice.id!)}
                        >
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => togglePendingSelectOne(item.invoice.id!)} className="text-slate-400 hover:text-white">
                              {isSelected ? <CheckSquare size={16} className="text-amber-400" /> : <Square size={16} />}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-bold text-white">{item.invoice.invoice_number}</td>
                          <td className="py-3 px-4 font-medium text-slate-200">{item.customerName}</td>
                          <td className="py-3 px-4 text-xs font-semibold text-amber-400">{item.cityName || 'N/A'}</td>
                          <td className="py-3 px-4 text-slate-400 text-xs">{invDate}</td>
                          <td className="py-3 px-4 text-right font-medium text-slate-300">
                            {currency} {item.invoice.total_amount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-amber-400">
                            {currency} {item.pendingAmount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClasses(item.invoice.status)}`}>
                              {displayStatus(item.invoice.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pending Payments Print & Export Modal */}
          {isPendingPrintViewOpen && (
            <PendingPaymentsPrintView
              customerGroups={getGroupedCustomerPendingItems(selectedPendingItems)}
              cityFilterLabel={pendingCityFilterName}
              dateFilterLabel={pendingDateFilterName}
              onClose={() => setIsPendingPrintViewOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-slate-400">Loading Billing & Invoices...</div>}>
      <InvoicesContent />
    </Suspense>
  );
}
