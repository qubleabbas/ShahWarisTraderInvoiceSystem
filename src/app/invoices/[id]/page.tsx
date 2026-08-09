'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Printer,
  Download,
  Share2,
  CheckCircle,
  Clock,
  Sparkles,
  Edit2
} from 'lucide-react';
import { db, Invoice, InvoiceItem, Customer, Product, Category } from '@/lib/db';
import InvoiceTemplate from '@/components/InvoiceTemplate';
import { useToast } from '@/components/ToastProvider';
import { printVectorPdf } from '@/lib/pdfPrint';

export default function SingleInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const { showToast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [items, setItems] = useState<(InvoiceItem & { product_name?: string; category_name?: string; unit?: string })[]>([]);
  const [businessInfo, setBusinessInfo] = useState<{
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
    logo_url?: string;
  }>({
    name: 'Qureshi Sharbat & Majoon House',
    tagline: 'Manufacturers of Pure Herbal Sharbats, Majoons & Distillates',
    address: '14-B Industrial Area, Station Road, Gujranwala',
    phone: '+92 300 8889900',
    email: 'orders@qureshisharbat.com',
    currency: 'Rs.'
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadInvoiceData();
  }, [id]);

  async function loadInvoiceData() {
    try {
      const inv = await db.invoices.get(id);
      if (!inv) {
        setLoading(false);
        return;
      }

      const cust = await db.customers.get(inv.customer_id);
      const invItems = await db.invoice_items.where('invoice_id').equals(id).toArray();
      const prods = await db.products.toArray();
      const cats = await db.categories.toArray();

      const prodMap = new Map(prods.map(p => [p.id!, p]));
      const catMap = new Map(cats.map(c => [c.id!, c.name]));

      const enrichedItems = invItems.map(item => {
        const prod = prodMap.get(item.product_id);
        return {
          ...item,
          product_name: prod ? prod.name : 'Unknown Product',
          category_name: prod ? catMap.get(prod.category_id) || 'Herbal' : 'Herbal',
          unit: prod ? prod.unit : undefined
        };
      });

      // Settings
      const name = await db.settings.get('business_name');
      const tagline = await db.settings.get('business_tagline');
      const address = await db.settings.get('business_address');
      const phone = await db.settings.get('business_phone');
      const email = await db.settings.get('business_email');
      const curr = await db.settings.get('currency_symbol');
      const logo = await db.settings.get('business_logo_url');

      setInvoice(inv);
      setCustomer(cust);
      setItems(enrichedItems);
      setBusinessInfo({
        name: name?.value || 'Qureshi Sharbat & Majoon House',
        tagline: tagline?.value || 'Manufacturers of Pure Herbal Sharbats, Majoons & Distillates',
        address: address?.value || '14-B Industrial Area, Station Road, Gujranwala',
        phone: phone?.value || '+92 300 8889900',
        email: email?.value || 'orders@qureshisharbat.com',
        currency: curr?.value || 'Rs.',
        logo_url: logo?.value || undefined
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Toggle Mark as Paid
  async function handleTogglePaid() {
    if (!invoice?.id) return;
    const newStatus = invoice.status === 'Paid' ? 'Pending' : 'Paid';
    await db.invoices.update(invoice.id, { status: newStatus });
    setInvoice({ ...invoice, status: newStatus });
    showToast(`Invoice #${invoice.invoice_number} marked as ${newStatus}!`, 'success');
  }

  // Web Share API (WhatsApp / Email / Mobile)
  async function handleShareInvoice() {
    if (navigator.share && invoice) {
      try {
        await navigator.share({
          title: `Invoice #${invoice.invoice_number}`,
          text: `Invoice #${invoice.invoice_number} for ${customer?.name || 'Customer'}. Grand Total: ${businessInfo.currency} ${invoice.total_amount}.`,
          url: window.location.href,
        });
      } catch (err) {
        console.log("Share dismissed");
      }
    } else {
      // Fallback to copying link
      navigator.clipboard.writeText(window.location.href);
      showToast("Invoice link copied to clipboard!", 'info');
    }
  }

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrintingPdf, setIsPrintingPdf] = useState(false);

  // Exact Vector Print using server-generated PDF (100% match with Export PDF)
  async function handlePrint() {
    if (!invoice) return;
    setIsPrintingPdf(true);
    showToast("Preparing exact vector PDF for printing...", "info");
    try {
      await printVectorPdf([{
        invoice,
        customer,
        items,
        businessInfo
      }]);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to print PDF", "error");
    } finally {
      setIsPrintingPdf(false);
    }
  }

  // Server-Side Puppeteer Crisp Vector PDF Export
  async function handleExportPdf() {
    if (!invoice) return;
    setIsExportingPdf(true);
    showToast("Generating vector PDF...", "info");
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoices: [{
            invoice,
            customer,
            items,
            businessInfo
          }]
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate PDF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("Vector PDF exported successfully!", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to export PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading invoice viewer...</div>;
  }

  if (!invoice) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-4">
        <p className="text-lg font-bold">Invoice Not Found</p>
        <Link href="/invoices" className="inline-block text-emerald-400 font-semibold underline">
          Back to Invoices
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Toolbar (Hidden when printing) */}
      <div className="no-print bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center space-x-3">
          <Link
            href="/invoices"
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-extrabold text-white text-lg sm:text-xl">
              Invoice #{invoice.invoice_number}
            </h1>
            <p className="text-xs text-slate-400">
              Customer: {customer?.name || invoice.customer_name || 'Walk-in'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/invoices/${invoice.id}/edit`}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-amber-300 hover:bg-slate-700 border border-slate-700 flex items-center space-x-1.5 transition"
          >
            <Edit2 size={16} />
            <span>Edit Invoice</span>
          </Link>

          <button
            onClick={handleTogglePaid}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border flex items-center space-x-1.5 transition ${
              invoice.status === 'Paid'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30'
                : 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 shadow-md'
            }`}
          >
            <CheckCircle size={16} />
            <span>{invoice.status === 'Paid' ? 'Status: PAID (Click to Unpay)' : 'Mark as PAID'}</span>
          </button>

          <button
            onClick={handleShareInvoice}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 flex items-center space-x-1.5 transition"
          >
            <Share2 size={16} />
            <span>Share</span>
          </button>

          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 flex items-center space-x-1.5 transition disabled:opacity-50"
          >
            <Download size={16} />
            <span>{isExportingPdf ? 'Generating PDF...' : 'Export PDF'}</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={isPrintingPdf}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 flex items-center space-x-1.5 transition shadow-md disabled:opacity-50"
          >
            <Printer size={16} />
            <span>{isPrintingPdf ? 'Opening Print...' : 'Print'}</span>
          </button>
        </div>
      </div>

      {/* Render Business Invoice Template */}
      <InvoiceTemplate
        invoice={invoice}
        customer={customer}
        items={items}
        businessInfo={businessInfo}
      />
    </div>
  );
}
