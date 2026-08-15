'use client';

import React, { useEffect, useState } from 'react';
import { Plus, X, Bookmark, Trash2, Percent } from 'lucide-react';
import { db, TaxRate, recordTombstone } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';

export interface TaxLine {
  label: string;
  rate: string; // kept as string for controlled inputs
}

interface TaxManagerProps {
  value: TaxLine[];
  onChange: (lines: TaxLine[]) => void;
  baseAmount: number; // post-discount amount taxes are applied to
  currency: string;
}

/**
 * Multi-tax editor with reusable presets.
 *  - Each invoice can carry several named tax lines (label + rate), each with a
 *    live computed amount.
 *  - Saved presets (db.tax_rates) let the user click to add a tax instantly, or
 *    save a line they just typed for reuse next time.
 */
export default function TaxManager({ value, onChange, baseAmount, currency }: TaxManagerProps) {
  const { showToast } = useToast();
  const [presets, setPresets] = useState<TaxRate[]>([]);
  const [showNewPreset, setShowNewPreset] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newRate, setNewRate] = useState('');

  useEffect(() => {
    loadPresets();
  }, []);

  async function loadPresets() {
    try {
      const rows = await db.tax_rates.orderBy('label').toArray();
      setPresets(rows);
    } catch (err) {
      console.error('Failed to load tax presets:', err);
    }
  }

  const money = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  function lineAmount(rate: string): number {
    const r = parseFloat(rate) || 0;
    return (baseAmount * r) / 100;
  }

  function addLine(label = '', rate = '') {
    onChange([...value, { label, rate }]);
  }

  function updateLine(index: number, patch: Partial<TaxLine>) {
    onChange(value.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addFromPreset(preset: TaxRate) {
    addLine(preset.label, String(preset.rate));
  }

  // Persist a saved preset (upsert by label). Used both from the inline "new
  // preset" form and from the save-icon on an existing tax line.
  async function savePreset(label: string, rate: string) {
    const trimmed = label.trim();
    const r = parseFloat(rate);
    if (!trimmed) {
      showToast('Enter a tax name to save it.', 'error');
      return false;
    }
    if (isNaN(r) || r <= 0) {
      showToast('Enter a valid tax rate to save it.', 'error');
      return false;
    }
    try {
      const existing = await db.tax_rates.where('label').equalsIgnoreCase(trimmed).first();
      if (existing?.id) {
        await db.tax_rates.update(existing.id, { rate: r });
      } else {
        await db.tax_rates.add({ label: trimmed, rate: r });
      }
      await loadPresets();
      showToast(`Tax "${trimmed}" saved for reuse.`, 'success');
      return true;
    } catch (err) {
      console.error(err);
      showToast('Failed to save tax.', 'error');
      return false;
    }
  }

  async function deletePreset(preset: TaxRate) {
    if (!preset.id) return;
    if (!confirm(`Remove saved tax "${preset.label}"? Existing invoices are unaffected.`)) return;
    try {
      await db.tax_rates.delete(preset.id);
      await recordTombstone('tax_rates', preset.id);
      await loadPresets();
    } catch (err) {
      console.error(err);
      showToast('Failed to remove tax.', 'error');
    }
  }

  async function handleAddNewPreset() {
    const ok = await savePreset(newLabel, newRate);
    if (ok) {
      addLine(newLabel.trim(), newRate);
      setNewLabel('');
      setNewRate('');
      setShowNewPreset(false);
    }
  }

  const totalTax = value.reduce((sum, l) => sum + lineAmount(l.rate), 0);

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
          <Percent size={13} className="text-emerald-400" />
          Taxes
        </span>
        {totalTax > 0 && (
          <span className="text-xs font-bold text-slate-200">+{money(totalTax)}</span>
        )}
      </div>

      {/* Saved preset chips — click to apply instantly */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <span
              key={p.id}
              className="group inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-slate-200"
            >
              <button
                type="button"
                onClick={() => addFromPreset(p)}
                className="flex items-center gap-1 text-slate-200 hover:text-emerald-400"
                title={`Add ${p.label} (${p.rate}%)`}
              >
                <Plus size={11} />
                {p.label} {p.rate}%
              </button>
              <button
                type="button"
                onClick={() => deletePreset(p)}
                className="rounded-full p-0.5 text-slate-500 hover:bg-rose-900/40 hover:text-rose-400"
                title="Delete saved tax"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Current tax lines */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((line, i) => {
            const isSavedPreset = presets.some(
              (p) => p.label.toLowerCase() === line.label.trim().toLowerCase() && p.rate === (parseFloat(line.rate) || 0)
            );
            return (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Tax name (e.g. GST)"
                  value={line.label}
                  onChange={(e) => updateLine(i, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
                <div className="relative w-20 shrink-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={line.rate}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^\d*\.?\d*$/.test(val)) updateLine(i, { rate: val });
                    }}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-2.5 pr-5 text-right text-xs font-bold text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="pointer-events-none absolute right-2 top-1.5 text-[11px] text-slate-500">%</span>
                </div>
                <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-300">
                  {money(lineAmount(line.rate))}
                </span>
                <button
                  type="button"
                  onClick={() => savePreset(line.label, line.rate)}
                  disabled={isSavedPreset}
                  title={isSavedPreset ? 'Already saved' : 'Save this tax for reuse'}
                  className={`shrink-0 rounded-lg p-1.5 transition ${
                    isSavedPreset
                      ? 'text-emerald-500/60'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-emerald-400'
                  }`}
                >
                  <Bookmark size={14} className={isSavedPreset ? 'fill-current' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  title="Remove tax"
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-900/40 hover:text-rose-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add controls */}
      {showNewPreset ? (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-2.5">
          <p className="text-[10px] font-semibold uppercase text-slate-500">New reusable tax</p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              placeholder="Tax name (e.g. GST)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
            />
            <div className="relative w-20 shrink-0">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={newRate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^\d*\.?\d*$/.test(val)) setNewRate(val);
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-2.5 pr-5 text-right text-xs font-bold text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-2 top-1.5 text-[11px] text-slate-500">%</span>
            </div>
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShowNewPreset(false);
                setNewLabel('');
                setNewRate('');
              }}
              className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddNewPreset}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500"
            >
              Save &amp; Add
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => addLine()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            <Plus size={12} /> Add Tax
          </button>
          <button
            type="button"
            onClick={() => setShowNewPreset(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/40 bg-emerald-600/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-600/25"
          >
            <Bookmark size={12} /> New Saved Tax
          </button>
        </div>
      )}
    </div>
  );
}
