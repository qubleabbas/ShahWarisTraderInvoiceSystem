import { db, Invoice, Payment, PaymentStatus, notifyDbMutation, recordTombstone } from './db';

/**
 * Customer Ledger & Partial Payment engine.
 *
 * Design principles (per requirements):
 *  - Payments are the single source of truth for money received. Each payment is
 *    an individual, immutable-by-history record; totals are always derived.
 *  - An invoice's `amount_paid` and `status` are derived caches kept in sync
 *    atomically whenever payments change — never hard-coded.
 *  - Everything is idempotent so restoring backups / multi-device sync stays safe.
 */

// Tolerance for floating-point money comparisons (values are whole Rupees mostly).
const EPS = 0.009;

export const PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'Cheque',
  'Card',
  'Easypaisa',
  'JazzCash',
  'Other',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Sum of an invoice's payment records. */
export function sumPayments(payments: Payment[]): number {
  return payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
}

/**
 * Derive the canonical payment status of an invoice.
 *   remaining <= 0            -> Paid
 *   paid > 0 (remaining > 0)  -> Partially Paid
 *   paid == 0 & past due date -> Overdue
 *   paid == 0                 -> Unpaid
 */
export function derivePaymentStatus(
  total: number,
  paid: number,
  dueDate?: string,
  now: Date = new Date()
): PaymentStatus {
  const remaining = round2(total - paid);
  if (total > 0 && remaining <= EPS) return 'Paid';
  if (paid > EPS) return 'Partially Paid';
  if (dueDate) {
    const due = new Date(dueDate);
    due.setHours(23, 59, 59, 999);
    if (!isNaN(due.getTime()) && now.getTime() > due.getTime()) return 'Overdue';
  }
  return 'Unpaid';
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface InvoiceLedgerInfo {
  total: number;
  paid: number;
  remaining: number;
  status: PaymentStatus;
}

/** Compute derived ledger values for an invoice given its payments. */
export function computeInvoiceInfo(invoice: Invoice, payments: Payment[]): InvoiceLedgerInfo {
  const total = Number(invoice.total_amount) || 0;
  const paid = round2(sumPayments(payments));
  const remaining = round2(total - paid);
  return {
    total,
    paid,
    remaining,
    status: derivePaymentStatus(total, paid, invoice.due_date),
  };
}

/**
 * Recompute an invoice's amount_paid + status from its payment records and
 * persist the result. Returns the updated ledger info. Runs inside its own
 * transaction unless already inside one (Dexie nests transparently).
 */
export async function reconcileInvoiceStatus(invoiceId: number): Promise<InvoiceLedgerInfo | null> {
  return db.transaction('rw', [db.invoices, db.payments], async () => {
    const invoice = await db.invoices.get(invoiceId);
    if (!invoice) return null;
    const payments = await db.payments.where('invoice_id').equals(invoiceId).toArray();
    const info = computeInvoiceInfo(invoice, payments);
    await db.invoices.update(invoiceId, { amount_paid: info.paid, status: info.status });
    return info;
  });
}

export interface AddPaymentInput {
  invoice_id: number;
  amount: number;
  payment_date: string; // ISO datetime
  method: string;
  reference?: string;
  notes?: string;
  allowOverpayment?: boolean;
  is_auto?: boolean; // convenience "paid in full" shortcut, reversible by the status toggle
}

/**
 * Record a new payment against an invoice, then reconcile the invoice.
 * Rejects a payment larger than the outstanding amount unless overpayment
 * is explicitly allowed.
 */
export async function addPayment(input: AddPaymentInput): Promise<Payment> {
  const amount = round2(Number(input.amount) || 0);
  if (amount <= 0) throw new Error('Payment amount must be greater than zero.');

  const created = await db.transaction('rw', [db.invoices, db.payments], async () => {
    const invoice = await db.invoices.get(input.invoice_id);
    if (!invoice) throw new Error('Invoice not found.');

    const existing = await db.payments.where('invoice_id').equals(input.invoice_id).toArray();
    const paid = round2(sumPayments(existing));
    const remaining = round2((Number(invoice.total_amount) || 0) - paid);

    if (!input.allowOverpayment && amount - remaining > EPS) {
      throw new Error(
        `Payment (${amount.toLocaleString()}) exceeds the outstanding balance (${remaining.toLocaleString()}).`
      );
    }

    const payment: Payment = {
      invoice_id: input.invoice_id,
      customer_id: invoice.customer_id,
      amount,
      payment_date: input.payment_date,
      method: input.method,
      reference: input.reference?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      is_auto: input.is_auto || undefined,
      created_at: new Date().toISOString(),
    };

    const id = await db.payments.add(payment);

    // Reconcile inline within the same transaction.
    const allPayments = [...existing, { ...payment, id }];
    const info = computeInvoiceInfo(invoice, allPayments);
    await db.invoices.update(input.invoice_id, { amount_paid: info.paid, status: info.status });

    return { ...payment, id };
  });

  notifyDbMutation();
  return created;
}

export interface UpdatePaymentInput {
  amount?: number;
  payment_date?: string;
  method?: string;
  reference?: string;
  notes?: string;
  allowOverpayment?: boolean;
}

/** Edit an existing payment, then recalculate its invoice's balance & status. */
export async function updatePayment(paymentId: number, input: UpdatePaymentInput): Promise<void> {
  await db.transaction('rw', [db.invoices, db.payments], async () => {
    const payment = await db.payments.get(paymentId);
    if (!payment) throw new Error('Payment not found.');

    const nextAmount = input.amount != null ? round2(Number(input.amount) || 0) : payment.amount;
    if (nextAmount <= 0) throw new Error('Payment amount must be greater than zero.');

    const invoice = await db.invoices.get(payment.invoice_id);
    if (!invoice) throw new Error('Invoice not found.');

    // Outstanding excluding this payment.
    const others = (await db.payments.where('invoice_id').equals(payment.invoice_id).toArray()).filter(
      (p) => p.id !== paymentId
    );
    const remainingForOthers = round2((Number(invoice.total_amount) || 0) - sumPayments(others));
    if (!input.allowOverpayment && nextAmount - remainingForOthers > EPS) {
      throw new Error(
        `Payment (${nextAmount.toLocaleString()}) exceeds the outstanding balance (${remainingForOthers.toLocaleString()}).`
      );
    }

    await db.payments.update(paymentId, {
      amount: nextAmount,
      payment_date: input.payment_date ?? payment.payment_date,
      method: input.method ?? payment.method,
      reference: input.reference !== undefined ? input.reference.trim() || undefined : payment.reference,
      notes: input.notes !== undefined ? input.notes.trim() || undefined : payment.notes,
    });

    const updated = [...others, { ...payment, amount: nextAmount }];
    const info = computeInvoiceInfo(invoice, updated);
    await db.invoices.update(payment.invoice_id, { amount_paid: info.paid, status: info.status });
  });

  notifyDbMutation();
}

/** Delete a payment and recalculate its invoice's balance & status. */
export async function deletePayment(paymentId: number): Promise<void> {
  let deleted = false;
  await db.transaction('rw', [db.invoices, db.payments], async () => {
    const payment = await db.payments.get(paymentId);
    if (!payment) return;
    await db.payments.delete(paymentId);
    deleted = true;

    const invoice = await db.invoices.get(payment.invoice_id);
    if (!invoice) return;
    const remainingPayments = await db.payments.where('invoice_id').equals(payment.invoice_id).toArray();
    const info = computeInvoiceInfo(invoice, remainingPayments);
    await db.invoices.update(payment.invoice_id, { amount_paid: info.paid, status: info.status });
  });

  // Tombstone outside the transaction (tombstones aren't in its scope) so the
  // deletion propagates across devices.
  if (deleted) await recordTombstone('payments', paymentId);

  notifyDbMutation();
}

// ---------------------------------------------------------------------------
// Customer ledger aggregation
// ---------------------------------------------------------------------------

export interface LedgerInvoice extends Invoice {
  total: number;
  paid: number;
  remaining: number;
  derivedStatus: PaymentStatus;
}

export interface LedgerTransaction {
  type: 'Invoice' | 'Payment';
  date: string; // ISO datetime
  invoice_id: number;
  invoice_number: string;
  debit: number; // charges to the customer (invoice totals)
  credit: number; // payments received
  method?: string;
  reference?: string;
  notes?: string;
  payment_id?: number;
}

export interface CustomerLedger {
  invoices: LedgerInvoice[];
  payments: (Payment & { invoice_number: string })[];
  transactions: (LedgerTransaction & { balance: number })[]; // chronological, running balance
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    invoiceCount: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
    overdueCount: number;
  };
}

/**
 * Calculate total outstanding pending balance for a customer across all prior invoices.
 * Optionally exclude a specific invoice ID (useful when editing an invoice).
 */
export async function getCustomerPendingBalance(customerId: number, excludeInvoiceId?: number): Promise<number> {
  const invoices = await db.invoices.where('customer_id').equals(customerId).toArray();
  const payments = await db.payments.where('customer_id').equals(customerId).toArray();

  const paymentsByInvoice = new Map<number, Payment[]>();
  for (const p of payments) {
    const list = paymentsByInvoice.get(p.invoice_id) || [];
    list.push(p);
    paymentsByInvoice.set(p.invoice_id, list);
  }

  let totalOutstanding = 0;
  for (const inv of invoices) {
    if (excludeInvoiceId && inv.id === excludeInvoiceId) continue;
    const invPayments = paymentsByInvoice.get(inv.id!) || [];
    const baseTotal = (inv.include_previous_balance && inv.previous_balance)
      ? Math.max(0, inv.total_amount - inv.previous_balance)
      : inv.total_amount;
    const invForInfo = (inv.include_previous_balance && inv.previous_balance)
      ? { ...inv, total_amount: baseTotal }
      : inv;
    const info = computeInvoiceInfo(invForInfo, invPayments);
    if (info.remaining > 0) {
      totalOutstanding += info.remaining;
    }
  }

  return round2(totalOutstanding);
}

/** Build the complete ledger for a single customer. */
export async function getCustomerLedger(customerId: number): Promise<CustomerLedger> {
  const invoices = await db.invoices.where('customer_id').equals(customerId).toArray();
  const payments = await db.payments.where('customer_id').equals(customerId).toArray();

  const paymentsByInvoice = new Map<number, Payment[]>();
  for (const p of payments) {
    const list = paymentsByInvoice.get(p.invoice_id) || [];
    list.push(p);
    paymentsByInvoice.set(p.invoice_id, list);
  }

  const invoiceNumberById = new Map<number, string>();
  const ledgerInvoices: LedgerInvoice[] = invoices.map((inv) => {
    invoiceNumberById.set(inv.id!, inv.invoice_number);
    const info = computeInvoiceInfo(inv, paymentsByInvoice.get(inv.id!) || []);
    return { ...inv, total: info.total, paid: info.paid, remaining: info.remaining, derivedStatus: info.status };
  });

  const summary = {
    totalInvoiced: round2(ledgerInvoices.reduce((a, i) => a + i.total, 0)),
    totalPaid: round2(ledgerInvoices.reduce((a, i) => a + i.paid, 0)),
    totalOutstanding: round2(ledgerInvoices.reduce((a, i) => a + Math.max(0, i.remaining), 0)),
    invoiceCount: ledgerInvoices.length,
    paidCount: ledgerInvoices.filter((i) => i.derivedStatus === 'Paid').length,
    partialCount: ledgerInvoices.filter((i) => i.derivedStatus === 'Partially Paid').length,
    unpaidCount: ledgerInvoices.filter((i) => i.derivedStatus === 'Unpaid').length,
    overdueCount: ledgerInvoices.filter((i) => i.derivedStatus === 'Overdue').length,
  };

  // Build chronological transaction stream: invoices (debit) + payments (credit).
  const rawTx: LedgerTransaction[] = [];
  for (const inv of invoices) {
    rawTx.push({
      type: 'Invoice',
      date: inv.created_at,
      invoice_id: inv.id!,
      invoice_number: inv.invoice_number,
      debit: Number(inv.total_amount) || 0,
      credit: 0,
    });
  }
  for (const p of payments) {
    rawTx.push({
      type: 'Payment',
      date: p.payment_date,
      invoice_id: p.invoice_id,
      invoice_number: invoiceNumberById.get(p.invoice_id) || '—',
      debit: 0,
      credit: Number(p.amount) || 0,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      payment_id: p.id,
    });
  }

  rawTx.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  const transactions = rawTx.map((tx) => {
    running = round2(running + tx.debit - tx.credit);
    return { ...tx, balance: running };
  });

  const paymentsWithInvoice = payments.map((p) => ({
    ...p,
    invoice_number: invoiceNumberById.get(p.invoice_id) || '—',
  }));

  return { invoices: ledgerInvoices, payments: paymentsWithInvoice, transactions, summary };
}

// ---------------------------------------------------------------------------
// Migration / reconciliation
// ---------------------------------------------------------------------------

let reconcilePromise: Promise<void> | null = null;

/**
 * Idempotently bring every invoice's ledger state in sync with its payment
 * records. For legacy invoices that were marked 'Paid' before payments existed
 * (and therefore have no payment records), a single "opening balance" payment
 * is created so the ledger and payment history stay consistent and dynamic.
 * Safe to run on every app start and after any backup restore.
 */
export async function reconcileAllLedger(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!reconcilePromise) {
    reconcilePromise = doReconcileAll().catch((err) => {
      reconcilePromise = null;
      throw err;
    });
  }
  return reconcilePromise;
}

async function doReconcileAll(): Promise<void> {
  let mutated = false;

  await db.transaction('rw', [db.invoices, db.payments], async () => {
    const invoices = await db.invoices.toArray();
    for (const inv of invoices) {
      const payments = await db.payments.where('invoice_id').equals(inv.id!).toArray();
      let effectivePayments = payments;

      // Legacy fully-paid invoice with no payment history -> seed opening payment.
      const total = Number(inv.total_amount) || 0;
      if (payments.length === 0 && inv.status === 'Paid' && total > 0) {
        const opening: Payment = {
          invoice_id: inv.id!,
          customer_id: inv.customer_id,
          amount: round2(total),
          payment_date: inv.created_at,
          method: 'Opening Balance',
          notes: 'Migrated from existing paid invoice',
          is_migrated: true,
          created_at: new Date().toISOString(),
        };
        const id = await db.payments.add(opening);
        effectivePayments = [{ ...opening, id }];
        mutated = true;
      }

      const info = computeInvoiceInfo(inv, effectivePayments);
      if (round2(inv.amount_paid ?? -1) !== info.paid || inv.status !== info.status) {
        await db.invoices.update(inv.id!, { amount_paid: info.paid, status: info.status });
        mutated = true;
      }
    }
  });

  if (mutated) notifyDbMutation();
}

// ---------------------------------------------------------------------------
// Small shared UI helpers
// ---------------------------------------------------------------------------

export function statusBadgeClasses(status: PaymentStatus): string {
  switch (status) {
    case 'Paid':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    case 'Partially Paid':
      return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
    case 'Overdue':
      return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
    // Unpaid / Pending (legacy)
    default:
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  }
}

/** Normalise a legacy 'Pending' label to the user-facing 'Unpaid'. */
export function displayStatus(status: PaymentStatus): string {
  return status === 'Pending' ? 'Unpaid' : status;
}

export function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: '—', time: '' };
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}
