'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Wallet,
  FileText,
  TrendingDown,
  CheckCircle2,
  Plus,
  Phone,
  MapPin,
  Receipt,
  BookOpen,
  ListChecks,
  Edit2,
  Trash2,
  Eye,
} from 'lucide-react';
import { db, Customer, Payment, subscribeDataChanged } from '@/lib/db';
import {
  getCustomerLedger,
  CustomerLedger,
  LedgerInvoice,
  deletePayment,
  statusBadgeClasses,
  displayStatus,
  formatDateTime,
  PAYMENT_METHODS,
} from '@/lib/ledger';
import { useToast } from '@/components/ToastProvider';
import AddPaymentModal, { PaymentTargetInvoice } from '@/components/AddPaymentModal';

type Tab = 'invoices' | 'history' | 'statement';
type DatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export default function CustomerLedgerPage() {
  const params = useParams();
  const customerId = Number(params?.id);
  const { showToast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<CustomerLedger | null>(null);
  const [currency, setCurrency] = useState('Rs.');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('invoices');

  // Payment modal state
  const [payTarget, setPayTarget] = useState<PaymentTargetInvoice | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // History filters
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    if (!customerId) return;
    loadAll();
    const unsub = subscribeDataChanged(() => loadAll());
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function loadAll() {
    try {
      const cust = await db.customers.get(customerId);
      const curr = await db.settings.get('currency_symbol');
      const led = await getCustomerLedger(customerId);
      setCustomer(cust || null);
      if (curr) setCurrency(curr.value);
      setLedger(led);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const money = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  function openAddPayment(inv: LedgerInvoice) {
    setEditingPayment(null);
    setPayTarget({
      id: inv.id!,
      invoice_number: inv.invoice_number,
      total: inv.total,
      paid: inv.paid,
      remaining: inv.remaining,
    });
    setModalOpen(true);
  }

  function openEditPayment(p: Payment) {
    const inv = ledger?.invoices.find((i) => i.id === p.invoice_id);
    if (!inv) return;
    setEditingPayment(p);
    setPayTarget({
      id: inv.id!,
      invoice_number: inv.invoice_number,
      total: inv.total,
      paid: inv.paid,
      remaining: inv.remaining,
    });
    setModalOpen(true);
  }

  async function handleDeletePayment(p: Payment) {
    if (!p.id) return;
    if (!confirm(`Delete this payment of ${money(p.amount)}? The invoice balance will be recalculated.`))
      return;
    try {
      await deletePayment(p.id);
      showToast('Payment deleted. Balance recalculated.', 'success');
      loadAll();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to delete payment.', 'error');
    }
  }

  // ---- History filtering ----
  const filteredPayments = useMemo(() => {
    if (!ledger) return [];
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    let from: Date | null = null;
    let to: Date | null = null;

    if (datePreset === 'today') {
      from = startOfDay(now);
      to = endOfDay(now);
    } else if (datePreset === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      from = startOfDay(y);
      to = endOfDay(y);
    } else if (datePreset === 'week') {
      // Current week starting Monday.
      const day = (now.getDay() + 6) % 7; // 0 = Monday
      const monday = new Date(now);
      monday.setDate(now.getDate() - day);
      from = startOfDay(monday);
      to = endOfDay(now);
    } else if (datePreset === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      to = endOfDay(now);
    } else if (datePreset === 'custom') {
      if (customStart) from = startOfDay(new Date(customStart));
      if (customEnd) to = endOfDay(new Date(customEnd));
    }

    let list = ledger.payments.filter((p) => {
      const t = new Date(p.payment_date).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      if (invoiceFilter !== 'all' && String(p.invoice_id) !== invoiceFilter) return false;
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      return true;
    });

    list = list.sort((a, b) => {
      const diff = new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime();
      return sortOrder === 'newest' ? -diff : diff;
    });

    return list;
  }, [ledger, datePreset, customStart, customEnd, invoiceFilter, methodFilter, sortOrder]);

  const filteredTotal = useMemo(
    () => filteredPayments.reduce((a, p) => a + (Number(p.amount) || 0), 0),
    [filteredPayments]
  );

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Loading customer ledger…</div>;
  }

  if (!customer) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
        <p className="text-lg font-bold">Customer not found</p>
        <Link href="/customers" className="inline-block font-semibold text-emerald-400 underline">
          Back to Customers
        </Link>
      </div>
    );
  }

  const s = ledger!.summary;

  const methodsInUse = Array.from(new Set(ledger!.payments.map((p) => p.method)));
  const methodOptions = Array.from(new Set([...PAYMENT_METHODS, ...methodsInUse]));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Link
            href="/customers"
            className="mt-0.5 rounded-xl bg-slate-800 p-2 text-slate-300 transition hover:text-white"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-extrabold text-white">
              <Wallet className="text-emerald-400" size={26} />
              <span>{customer.name}</span>
            </h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Phone size={13} className="text-emerald-400" />
                {customer.phone || 'No phone'}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-emerald-400" />
                {customer.address || 'No address'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
            Customer Ledger
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Invoiced"
          value={money(s.totalInvoiced)}
          icon={<FileText size={20} />}
          tone="slate"
          sub={`${s.invoiceCount} invoice${s.invoiceCount === 1 ? '' : 's'}`}
        />
        <SummaryCard
          label="Total Paid"
          value={money(s.totalPaid)}
          icon={<CheckCircle2 size={20} />}
          tone="emerald"
          sub="Received to date"
        />
        <SummaryCard
          label="Total Outstanding"
          value={money(s.totalOutstanding)}
          icon={<TrendingDown size={20} />}
          tone="amber"
          sub="Pending balance"
        />
        <SummaryCard
          label="Invoice Status"
          value={`${s.paidCount} Paid`}
          icon={<ListChecks size={20} />}
          tone="sky"
          sub={`${s.partialCount} partial · ${s.unpaidCount} unpaid · ${s.overdueCount} overdue`}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800">
        <TabButton active={tab === 'invoices'} onClick={() => setTab('invoices')} icon={<FileText size={16} />}>
          Invoices
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={<Receipt size={16} />}>
          Payment History
        </TabButton>
        <TabButton
          active={tab === 'statement'}
          onClick={() => setTab('statement')}
          icon={<BookOpen size={16} />}
        >
          Ledger Statement
        </TabButton>
      </div>

      {/* ---- Invoices tab ---- */}
      {tab === 'invoices' &&
        (ledger!.invoices.length === 0 ? (
          <EmptyState text="This customer has no invoices yet." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-card md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="border-b border-slate-800 bg-slate-950/70 text-xs font-semibold uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3.5">Invoice #</th>
                      <th className="px-4 py-3.5">Date</th>
                      <th className="px-4 py-3.5 text-right">Total</th>
                      <th className="px-4 py-3.5 text-right">Paid</th>
                      <th className="px-4 py-3.5 text-right">Pending</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {ledger!.invoices
                      .slice()
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((inv) => (
                        <tr key={inv.id} className="transition hover:bg-slate-800/40">
                          <td className="px-4 py-3.5 font-bold text-white">
                            <Link href={`/invoices/${inv.id}`} className="hover:text-emerald-400">
                              {inv.invoice_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-400">
                            {formatDateTime(inv.created_at).date}
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-white">
                            {money(inv.total)}
                          </td>
                          <td className="px-4 py-3.5 text-right text-emerald-400">{money(inv.paid)}</td>
                          <td className="px-4 py-3.5 text-right font-semibold text-amber-400">
                            {money(Math.max(0, inv.remaining))}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClasses(
                                inv.derivedStatus
                              )}`}
                            >
                              {displayStatus(inv.derivedStatus)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-2">
                              {inv.remaining > 0.009 ? (
                                <button
                                  onClick={() => openAddPayment(inv)}
                                  className="flex items-center gap-1 rounded-lg bg-emerald-600/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-600 hover:text-white"
                                >
                                  <Plus size={14} />
                                  <span>Add Payment</span>
                                </button>
                              ) : (
                                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                                  <CheckCircle2 size={14} /> Settled
                                </span>
                              )}
                              <Link
                                href={`/invoices/${inv.id}`}
                                className="rounded-lg bg-slate-800 p-1.5 text-slate-300 transition hover:bg-slate-700 hover:text-white"
                                title="View invoice"
                              >
                                <Eye size={15} />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {ledger!.invoices
                .slice()
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((inv) => (
                  <div key={inv.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <Link href={`/invoices/${inv.id}`} className="font-bold text-white hover:text-emerald-400">
                          {inv.invoice_number}
                        </Link>
                        <p className="text-[11px] text-slate-500">{formatDateTime(inv.created_at).date}</p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${statusBadgeClasses(
                          inv.derivedStatus
                        )}`}
                      >
                        {displayStatus(inv.derivedStatus)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Total</p>
                        <p className="font-semibold text-white">{money(inv.total)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Paid</p>
                        <p className="font-semibold text-emerald-400">{money(inv.paid)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Pending</p>
                        <p className="font-semibold text-amber-400">{money(Math.max(0, inv.remaining))}</p>
                      </div>
                    </div>
                    {inv.remaining > 0.009 && (
                      <button
                        onClick={() => openAddPayment(inv)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
                      >
                        <Plus size={14} /> Add Payment
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </>
        ))}

      {/* ---- Payment History tab ---- */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-card">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', 'All Time'],
                  ['today', 'Today'],
                  ['yesterday', 'Yesterday'],
                  ['week', 'This Week'],
                  ['month', 'This Month'],
                  ['custom', 'Custom'],
                ] as [DatePreset, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDatePreset(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    datePreset === key
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {datePreset === 'custom' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-xs text-slate-500">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                value={invoiceFilter}
                onChange={(e) => setInvoiceFilter(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Invoices</option>
                {ledger!.invoices.map((inv) => (
                  <option key={inv.id} value={String(inv.id)}>
                    {inv.invoice_number}
                  </option>
                ))}
              </select>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Methods</option>
                {methodOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-2.5 text-sm">
              <span className="text-slate-400">
                {filteredPayments.length} payment{filteredPayments.length === 1 ? '' : 's'}
              </span>
              <span className="font-bold text-emerald-400">{money(filteredTotal)}</span>
            </div>
          </div>

          {/* Payment list */}
          {filteredPayments.length === 0 ? (
            <EmptyState text="No payments match the selected filters." />
          ) : (
            <div className="space-y-2.5">
              {filteredPayments.map((p) => {
                const dt = formatDateTime(p.payment_date);
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                        <Wallet size={18} />
                      </span>
                      <div>
                        <p className="font-bold text-white">{money(p.amount)}</p>
                        <p className="text-xs text-slate-400">
                          {dt.date} · {dt.time} · {p.method}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Invoice {p.invoice_number}
                          {p.reference ? ` · Ref: ${p.reference}` : ''}
                          {p.is_migrated ? ' · (opening balance)' : ''}
                        </p>
                        {p.notes && <p className="mt-0.5 text-[11px] italic text-slate-500">“{p.notes}”</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => openEditPayment(p)}
                        className="rounded-lg bg-slate-800 p-2 text-amber-400 transition hover:bg-slate-700"
                        title="Edit payment"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeletePayment(p)}
                        className="rounded-lg bg-slate-800 p-2 text-slate-400 transition hover:bg-rose-900/50 hover:text-rose-400"
                        title="Delete payment"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- Ledger Statement tab ---- */}
      {tab === 'statement' && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-card">
          {ledger!.transactions.length === 0 ? (
            <EmptyState text="No ledger activity yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/70 text-xs font-semibold uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Time</th>
                    <th className="px-4 py-3.5">Type</th>
                    <th className="px-4 py-3.5">Invoice</th>
                    <th className="px-4 py-3.5 text-right">Debit</th>
                    <th className="px-4 py-3.5 text-right">Credit</th>
                    <th className="px-4 py-3.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {ledger!.transactions
                    .slice()
                    .reverse()
                    .map((tx, idx) => {
                      const dt = formatDateTime(tx.date);
                      return (
                        <tr key={idx} className="transition hover:bg-slate-800/40">
                          <td className="px-4 py-3 text-xs text-slate-400">{dt.date}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{dt.time}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                tx.type === 'Payment'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-slate-700/40 text-slate-300'
                              }`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            <Link href={`/invoices/${tx.invoice_id}`} className="hover:text-emerald-400">
                              {tx.invoice_number}
                            </Link>
                            {tx.method && <span className="ml-1 text-[11px] text-slate-500">({tx.method})</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-300">
                            {tx.debit > 0 ? money(tx.debit) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-400">
                            {tx.credit > 0 ? money(tx.credit) : '—'}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-bold ${
                              tx.balance > 0.009 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {money(tx.balance)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-800 bg-slate-950/70 text-xs font-bold text-slate-200">
                    <td className="px-4 py-3" colSpan={4}>
                      Closing Balance (Outstanding)
                    </td>
                    <td className="px-4 py-3 text-right">{money(s.totalInvoiced)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">{money(s.totalPaid)}</td>
                    <td className="px-4 py-3 text-right text-amber-400">{money(s.totalOutstanding)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit payment modal */}
      {payTarget && (
        <AddPaymentModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={loadAll}
          currency={currency}
          customerName={customer.name}
          invoice={payTarget}
          editingPayment={editingPayment}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'slate' | 'emerald' | 'amber' | 'sky';
  sub?: string;
}) {
  const toneClasses: Record<string, string> = {
    slate: 'bg-slate-500/10 text-slate-300',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    sky: 'bg-sky-500/10 text-sky-400',
  };
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-card transition hover:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`rounded-xl p-2.5 ${toneClasses[tone]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      {sub && <p className="mt-1.5 text-xs font-medium text-slate-400">{sub}</p>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? 'border-emerald-500 text-emerald-400'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
      {text}
    </div>
  );
}
