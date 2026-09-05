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
  Edit2,
  MessageCircle,
  Briefcase,
  Mail,
  X,
  Wallet,
  Plus,
  Trash2,
  BookOpen
} from 'lucide-react';
import { db, Invoice, InvoiceItem, Customer, Payment, subscribeDataChanged } from '@/lib/db';
import InvoiceTemplate from '@/components/InvoiceTemplate';
import { useToast } from '@/components/ToastProvider';
import { printVectorPdf, PrintFormat } from '@/lib/pdfPrint';
import PrintFormatMenu from '@/components/PrintFormatMenu';
import AddPaymentModal, { PaymentTargetInvoice } from '@/components/AddPaymentModal';
import {
  computeInvoiceInfo,
  deletePayment,
  statusBadgeClasses,
  displayStatus,
  formatDateTime,
  round2,
} from '@/lib/ledger';

export default function SingleInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const { showToast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [items, setItems] = useState<(InvoiceItem & { product_name?: string; category_name?: string; unit?: string })[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
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
    const unsub = subscribeDataChanged(() => loadInvoiceData());
    return () => unsub();
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
      const invPayments = await db.payments.where('invoice_id').equals(id).toArray();
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
      const termsSetting = await db.settings.get('default_terms');

      const activeInvoice = {
        ...inv,
        terms_conditions: termsSetting?.value !== undefined ? termsSetting.value : (inv.terms_conditions || '')
      };

      setInvoice(activeInvoice);
      setCustomer(cust);
      setItems(enrichedItems);
      setPayments(invPayments.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()));
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

  // Derived ledger figures for this invoice.
  const ledgerInfo = invoice
    ? computeInvoiceInfo(invoice, payments)
    : { total: 0, paid: 0, remaining: 0, status: 'Unpaid' as const };

  function openAddPayment(payment?: Payment) {
    setEditingPayment(payment || null);
    setPaymentModalOpen(true);
  }

  async function handleDeletePayment(p: Payment) {
    if (!p.id) return;
    if (!confirm(`Delete this payment of ${businessInfo.currency} ${p.amount.toLocaleString()}? The invoice balance will be recalculated.`)) return;
    try {
      await deletePayment(p.id);
      showToast('Payment deleted. Balance recalculated.', 'success');
      loadInvoiceData();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to delete payment.', 'error');
    }
  }

  const paymentTarget: PaymentTargetInvoice | null = invoice?.id
    ? {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        total: ledgerInfo.total,
        paid: ledgerInfo.paid,
        remaining: ledgerInfo.remaining,
      }
    : null;

  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Open the share options popup (WhatsApp / WhatsApp Business / Email)
  function handleShareInvoice() {
    setShowShareModal(true);
  }

  // Generate the invoice PDF as a File (same vector output as Export/Print)
  async function generatePdfFile(): Promise<File> {
    if (!invoice) throw new Error("Invoice not loaded");
    const res = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices: [{ invoice, customer, items, businessInfo }] })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to generate PDF");
    }
    const blob = await res.blob();
    return new File([blob], `Invoice-${invoice.invoice_number}.pdf`, { type: 'application/pdf' });
  }

  // Share the invoice PDF through the chosen channel
  async function shareViaChannel(channel: 'whatsapp' | 'whatsapp-business' | 'email') {
    if (!invoice || isSharing) return;
    setIsSharing(true);
    showToast("Preparing invoice PDF...", "info");

    const message =
      `Invoice #${invoice.invoice_number} for ${customer?.name || invoice.customer_name || 'Customer'}\n` +
      `Grand Total: ${businessInfo.currency} ${invoice.total_amount.toLocaleString()}\n\n` +
      `Thank you for your business — ${businessInfo.name}`;

    try {
      const file = await generatePdfFile();

      // Preferred path: attach the real PDF via the Web Share API (mobile)
      const shareData: ShareData & { files?: File[] } = {
        title: `Invoice #${invoice.invoice_number}`,
        text: message,
        files: [file]
      };

      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share(shareData);
        setShowShareModal(false);
        return;
      }

      // Fallback: download the PDF so it can be attached, then open the channel
      const url = window.URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const encoded = encodeURIComponent(message);
      if (channel === 'email') {
        const subject = encodeURIComponent(`Invoice #${invoice.invoice_number} — ${businessInfo.name}`);
        window.location.href = `mailto:?subject=${subject}&body=${encoded}`;
        showToast("PDF downloaded — attach it to your email.", "info");
      } else if (channel === 'whatsapp-business') {
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
        showToast("PDF downloaded — attach it in WhatsApp Business.", "info");
      } else {
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
        showToast("PDF downloaded — attach it in WhatsApp.", "info");
      }
      setShowShareModal(false);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // User dismissed the native share sheet — no error
        return;
      }
      console.error(err);
      showToast(err.message || "Failed to share invoice", "error");
    } finally {
      setIsSharing(false);
    }
  }

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrintingPdf, setIsPrintingPdf] = useState(false);

  // Exact Vector Print using server-generated PDF (A4 invoice or thermal receipt)
  async function handlePrint(format: PrintFormat = 'a4') {
    if (!invoice) return;
    setIsPrintingPdf(true);
    showToast(
      format === 'thermal'
        ? 'Preparing thermal receipt for printing...'
        : format === 'a5'
        ? 'Preparing A5 invoice for printing...'
        : 'Preparing A4 invoice for printing...',
      'info'
    );
    try {
      await printVectorPdf([{
        invoice,
        customer,
        items,
        businessInfo
      }], format);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to print PDF", "error");
    } finally {
      setIsPrintingPdf(false);
    }
  }

  // Server-Side Crisp Vector PDF Export (A4 invoice, A5 invoice, or thermal receipt)
  async function handleExportPdf(format: PrintFormat = 'a4') {
    if (!invoice) return;
    setIsExportingPdf(true);
    showToast(
      format === 'thermal'
        ? 'Generating thermal receipt PDF...'
        : format === 'a5'
        ? 'Generating A5 invoice PDF...'
        : 'Generating A4 invoice PDF...',
      'info'
    );
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
          }],
          format
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
      a.download = `${format === 'thermal' ? 'Receipt' : 'Invoice'}-${invoice.invoice_number}.pdf`;
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

          {ledgerInfo.remaining > 0.009 ? (
            <button
              onClick={() => openAddPayment()}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold border border-emerald-500 bg-emerald-600 text-white shadow-md hover:bg-emerald-500 flex items-center space-x-1.5 transition"
            >
              <Plus size={16} />
              <span>Add Payment</span>
            </button>
          ) : (
            <span className="px-3.5 py-2 rounded-xl text-xs font-extrabold border border-emerald-500/30 bg-emerald-500/20 text-emerald-300 flex items-center space-x-1.5">
              <CheckCircle size={16} />
              <span>PAID IN FULL</span>
            </span>
          )}

          <Link
            href={`/customers/${invoice.customer_id}/ledger`}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 flex items-center space-x-1.5 transition"
          >
            <BookOpen size={16} />
            <span>Ledger</span>
          </Link>

          <button
            onClick={handleShareInvoice}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 flex items-center space-x-1.5 transition"
          >
            <Share2 size={16} />
            <span>Share</span>
          </button>

          <PrintFormatMenu
            label="Export PDF"
            icon={<Download size={16} />}
            variant="secondary"
            busy={isExportingPdf}
            onSelect={handleExportPdf}
          />

          <PrintFormatMenu
            label="Print"
            icon={<Printer size={16} />}
            variant="primary"
            busy={isPrintingPdf}
            onSelect={handlePrint}
          />
        </div>
      </div>

      {/* Payment / Ledger Panel (screen only) */}
      <div className="no-print bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-200">
            <Wallet size={18} className="text-emerald-400" />
            Payment Tracking
          </h2>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClasses(ledgerInfo.status)}`}>
            {displayStatus(ledgerInfo.status)}
          </span>
        </div>

        {/* Figures */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Invoice Total</p>
            <p className="mt-1 text-base font-bold text-white">{businessInfo.currency} {ledgerInfo.total.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Amount Paid</p>
            <p className="mt-1 text-base font-bold text-emerald-400">{businessInfo.currency} {ledgerInfo.paid.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Pending</p>
            <p className="mt-1 text-base font-bold text-amber-400">{businessInfo.currency} {Math.max(0, ledgerInfo.remaining).toLocaleString()}</p>
          </div>
          <div className="flex items-center">
            {ledgerInfo.remaining > 0.009 ? (
              <button
                onClick={() => openAddPayment()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                <Plus size={16} /> Add Payment
              </button>
            ) : (
              <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-400">
                <CheckCircle size={16} /> Settled
              </div>
            )}
          </div>
        </div>

        {/* Payment history */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Payment History</p>
          {payments.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm italic text-slate-500">
              No payments recorded yet for this invoice.
            </p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => {
                const dt = formatDateTime(p.payment_date);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                        <Wallet size={16} />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white">
                          {businessInfo.currency} {p.amount.toLocaleString()}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {dt.date} · {dt.time} · {p.method}
                          {p.reference ? ` · Ref: ${p.reference}` : ''}
                          {p.is_migrated ? ' · (opening balance)' : ''}
                        </p>
                        {p.notes && <p className="text-[11px] italic text-slate-500">“{p.notes}”</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openAddPayment(p)}
                        className="rounded-lg bg-slate-800 p-2 text-amber-400 transition hover:bg-slate-700"
                        title="Edit payment"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeletePayment(p)}
                        className="rounded-lg bg-slate-800 p-2 text-slate-400 transition hover:bg-rose-900/50 hover:text-rose-400"
                        title="Delete payment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Render Business Invoice Template */}
      <InvoiceTemplate
        invoice={invoice}
        customer={customer}
        items={items}
        businessInfo={businessInfo}
      />

      {/* Share Options Popup */}
      {showShareModal && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !isSharing && setShowShareModal(false)}
        >
          <div
            className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-extrabold text-lg">Share Invoice</h3>
                <p className="text-xs text-slate-400">Send Invoice #{invoice.invoice_number} as PDF</p>
              </div>
              <button
                onClick={() => !isSharing && setShowShareModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition disabled:opacity-50"
                disabled={isSharing}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => shareViaChannel('whatsapp')}
                disabled={isSharing}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition disabled:opacity-50"
              >
                <span className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <MessageCircle size={20} />
                </span>
                <span className="text-sm font-semibold text-white">WhatsApp</span>
              </button>

              <button
                onClick={() => shareViaChannel('whatsapp-business')}
                disabled={isSharing}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition disabled:opacity-50"
              >
                <span className="p-2 rounded-lg bg-teal-500/20 text-teal-400">
                  <Briefcase size={20} />
                </span>
                <span className="text-sm font-semibold text-white">WhatsApp Business</span>
              </button>

              <button
                onClick={() => shareViaChannel('email')}
                disabled={isSharing}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition disabled:opacity-50"
              >
                <span className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
                  <Mail size={20} />
                </span>
                <span className="text-sm font-semibold text-white">Email</span>
              </button>
            </div>

            {isSharing && (
              <p className="text-xs text-center text-slate-400 animate-pulse">
                Generating PDF and opening share…
              </p>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Payment Modal */}
      {paymentTarget && (
        <AddPaymentModal
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSaved={loadInvoiceData}
          currency={businessInfo.currency}
          customerName={customer?.name || invoice.customer_name || 'Customer'}
          invoice={paymentTarget}
          editingPayment={editingPayment}
        />
      )}
    </div>
  );
}
