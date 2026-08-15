'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Wallet, AlertTriangle } from 'lucide-react';
import { Payment } from '@/lib/db';
import { addPayment, updatePayment, PAYMENT_METHODS, round2 } from '@/lib/ledger';
import { useToast } from '@/components/ToastProvider';

export interface PaymentTargetInvoice {
  id: number;
  invoice_number: string;
  total: number;
  paid: number;
  remaining: number;
}

interface AddPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  currency: string;
  customerName: string;
  invoice: PaymentTargetInvoice;
  editingPayment?: Payment | null;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function AddPaymentModal({
  open,
  onClose,
  onSaved,
  currency,
  customerName,
  invoice,
  editingPayment,
}: AddPaymentModalProps) {
  const { showToast } = useToast();
  const isEditing = !!editingPayment;

  const [amount, setAmount] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [method, setMethod] = useState<string>('Cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [saving, setSaving] = useState(false);

  // When editing, the invoice's "remaining" excludes the payment being edited so
  // the pending figure and validation reflect the balance without this record.
  const baseRemaining = isEditing
    ? round2(invoice.remaining + (Number(editingPayment?.amount) || 0))
    : invoice.remaining;
  const basePaid = isEditing
    ? round2(invoice.paid - (Number(editingPayment?.amount) || 0))
    : invoice.paid;

  useEffect(() => {
    if (!open) return;
    if (editingPayment) {
      setAmount(String(editingPayment.amount));
      setDateTime(toLocalInputValue(new Date(editingPayment.payment_date)));
      setMethod(editingPayment.method || 'Cash');
      setReference(editingPayment.reference || '');
      setNotes(editingPayment.notes || '');
    } else {
      setAmount('');
      setDateTime(toLocalInputValue(new Date()));
      setMethod('Cash');
      setReference('');
      setNotes('');
    }
    setAllowOverpayment(false);
    setSaving(false);
  }, [open, editingPayment]);

  const parsedAmount = parseFloat(amount) || 0;
  const remainingAfter = useMemo(
    () => round2(baseRemaining - parsedAmount),
    [baseRemaining, parsedAmount]
  );
  const exceeds = parsedAmount - baseRemaining > 0.009;

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (parsedAmount <= 0) {
      showToast('Enter a payment amount greater than zero.', 'error');
      return;
    }
    if (exceeds && !allowOverpayment) {
      showToast('Payment exceeds the pending amount. Tick "Allow overpayment" to continue.', 'error');
      return;
    }
    if (!dateTime) {
      showToast('Select a payment date & time.', 'error');
      return;
    }

    setSaving(true);
    try {
      const iso = new Date(dateTime).toISOString();
      if (isEditing && editingPayment?.id) {
        await updatePayment(editingPayment.id, {
          amount: parsedAmount,
          payment_date: iso,
          method,
          reference,
          notes,
          allowOverpayment,
        });
        showToast('Payment updated successfully.', 'success');
      } else {
        await addPayment({
          invoice_id: invoice.id,
          amount: parsedAmount,
          payment_date: iso,
          method,
          reference,
          notes,
          allowOverpayment,
        });
        showToast(`Payment of ${currency} ${parsedAmount.toLocaleString()} recorded.`, 'success');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to save payment.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const money = (n: number) => `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div
      className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <Wallet size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">{isEditing ? 'Edit Payment' : 'Add Payment'}</h2>
              <p className="text-xs text-slate-400">
                {customerName} · Invoice {invoice.invoice_number}
              </p>
            </div>
          </div>
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Context figures */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Invoice Total</p>
            <p className="mt-1 text-sm font-bold text-white">{money(invoice.total)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Previously Paid</p>
            <p className="mt-1 text-sm font-bold text-sky-400">{money(basePaid)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Current Pending</p>
            <p className="mt-1 text-sm font-bold text-amber-400">{money(baseRemaining)}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount + quick fill */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
              Payment Amount
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-2.5 text-sm text-slate-500">
                  {currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-11 pr-4 text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setAmount(String(baseRemaining))}
                className="whitespace-nowrap rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Full ({money(baseRemaining)})
              </button>
            </div>
          </div>

          {/* Date/time + method */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
                Payment Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
                Payment Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reference + notes */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
              Reference / Transaction ID
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. TRX-88213, cheque #, bank ref…"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note about this payment…"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Live preview */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-sm">
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Invoice Total</span>
              <span className="font-semibold text-white">{money(invoice.total)}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Previously Paid</span>
              <span className="font-semibold text-sky-400">{money(basePaid)}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Current Pending</span>
              <span className="font-semibold text-amber-400">{money(baseRemaining)}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">New Payment</span>
              <span className="font-semibold text-emerald-400">{money(parsedAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-slate-800 pt-2">
              <span className="font-semibold text-slate-200">Remaining After Payment</span>
              <span
                className={`text-base font-extrabold ${
                  remainingAfter <= 0.009 ? 'text-emerald-400' : 'text-white'
                }`}
              >
                {money(Math.max(0, remainingAfter))}
                {remainingAfter <= 0.009 && parsedAmount > 0 && (
                  <span className="ml-1 text-xs font-semibold text-emerald-400">· Fully Paid</span>
                )}
              </span>
            </div>
          </div>

          {/* Overpayment guard */}
          {exceeds && (
            <label className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <input
                type="checkbox"
                checked={allowOverpayment}
                onChange={(e) => setAllowOverpayment(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span className="flex items-start gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  This payment is larger than the pending balance. Tick to allow an overpayment /
                  advance of <strong>{money(parsedAmount - baseRemaining)}</strong>.
                </span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEditing ? 'Update Payment' : 'Save Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
