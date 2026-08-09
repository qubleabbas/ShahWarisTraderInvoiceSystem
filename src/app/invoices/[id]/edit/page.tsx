'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Trash2,
  AlertOctagon,
  ArrowLeft,
  CheckCircle2,
  Upload,
  UserPlus
} from 'lucide-react';
import { db, Product, Customer, Invoice, InvoiceItem, Category } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';
import SearchableProductSelect from '@/components/SearchableProductSelect';
import SearchableCustomerSelect from '@/components/SearchableCustomerSelect';

interface LineItemInput {
  id?: number;
  product_id: number;
  quantity: string;
  unit_price: string;
  item_discount: string;
  item_discount_type: 'percent' | 'fixed';
}

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currency, setCurrency] = useState('Rs.');

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerId, setCustomerId] = useState<number>(0);
  const [status, setStatus] = useState<'Paid' | 'Pending'>('Pending');
  const [dueDate, setDueDate] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<string>('');
  const [terms, setTerms] = useState('');
  const [overallDiscount, setOverallDiscount] = useState<string>('0');
  const [overallDiscountType, setOverallDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [taxPercent, setTaxPercent] = useState<string>('0');

  // Signature & Stamp Toggles and URLs
  const [includeSignature, setIncludeSignature] = useState<boolean>(true);
  const [includeStamp, setIncludeStamp] = useState<boolean>(true);
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [stampUrl, setStampUrl] = useState<string>('');

  // Line items state
  const [items, setItems] = useState<LineItemInput[]>([]);
  const [originalItems, setOriginalItems] = useState<InvoiceItem[]>([]);

  // Inline Quick Add Customer Modal
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadInvoiceForEdit();
  }, [id]);

  async function loadInvoiceForEdit() {
    try {
      const inv = await db.invoices.get(id);
      if (!inv) {
        setLoading(false);
        return;
      }

      const prods = await db.products.toArray();
      const cats = await db.categories.toArray();
      const custs = await db.customers.toArray();
      const rawItems = await db.invoice_items.where('invoice_id').equals(id).toArray();
      const curr = await db.settings.get('currency_symbol');

      setProducts(prods);
      setCategories(cats);
      setCustomers(custs);
      if (curr) setCurrency(curr.value);

      setInvoiceNumber(inv.invoice_number);
      setCustomerId(inv.customer_id);
      setStatus(inv.status === 'Paid' ? 'Paid' : 'Pending');
      setCreatedAt(inv.created_at);
      setDueDate(inv.due_date || '');
      setTerms(inv.terms_conditions || '');
      setOverallDiscount(inv.overall_discount !== undefined ? String(inv.overall_discount) : '0');
      setOverallDiscountType(inv.overall_discount_type || 'percent');
      setTaxPercent(inv.tax_percent !== undefined ? String(inv.tax_percent) : '0');

      setSignatureUrl(inv.signature_url || '');
      setStampUrl(inv.stamp_url || '');
      setIncludeSignature(!!inv.signature_url);
      setIncludeStamp(!!inv.stamp_url);

      setOriginalItems(rawItems);
      setItems(
        rawItems.map(item => ({
          id: item.id,
          product_id: item.product_id,
          quantity: String(item.quantity),
          unit_price: String(item.unit_price),
          item_discount: item.item_discount !== undefined ? String(item.item_discount) : '0',
          item_discount_type: item.item_discount_type || 'percent'
        }))
      );
    } catch (err) {
      console.error("Error loading invoice for edit:", err);
    } finally {
      setLoading(false);
    }
  }

  // Save Signature & Stamp Preferences to DB Settings
  async function persistSignatureStampPreferences(
    hasSigChoice: boolean,
    hasStpChoice: boolean,
    sigVal: string,
    stpVal: string
  ) {
    try {
      await db.settings.put({ key: 'default_show_signature', value: String(hasSigChoice) });
      await db.settings.put({ key: 'default_show_stamp', value: String(hasStpChoice) });
      if (sigVal) await db.settings.put({ key: 'default_signature_url', value: sigVal });
      if (stpVal) await db.settings.put({ key: 'default_stamp_url', value: stpVal });
    } catch (err) {
      console.error("Error saving signature/stamp settings:", err);
    }
  }

  const productMap = new Map(products.map(p => [p.id!, p]));

  // Calculate adjusted effective stock for each product (Current Stock + Original Quantity deducted by this invoice)
  const effectiveStockMap = new Map<number, number>();
  products.forEach(p => effectiveStockMap.set(p.id!, p.stock_quantity));
  originalItems.forEach(orig => {
    const current = effectiveStockMap.get(orig.product_id) || 0;
    effectiveStockMap.set(orig.product_id, current + orig.quantity);
  });

  // Add Item Row
  function handleAddItem() {
    if (products.length === 0) return;
    const firstProd = products[0];
    setItems([
      ...items,
      {
        product_id: firstProd.id!,
        quantity: '1',
        unit_price: String(firstProd.price),
        item_discount: '0',
        item_discount_type: 'percent'
      }
    ]);
  }

  function handleRemoveItem(index: number) {
    if (items.length <= 1) {
      alert("An invoice must have at least one line item.");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  }

  function handleProductChange(index: number, pId: number) {
    const p = productMap.get(pId);
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      product_id: pId,
      unit_price: p ? String(p.price) : '0'
    };
    setItems(updated);
  }

  // Stock Validation Check based on effective available stock
  let stockErrors: string[] = [];
  items.forEach((item, idx) => {
    const qNum = parseFloat(item.quantity) || 0;
    const p = productMap.get(item.product_id);
    const availableEff = effectiveStockMap.get(item.product_id) || 0;
    if (p && qNum > availableEff) {
      stockErrors.push(`Item #${idx + 1} (${p.name}): Requested ${qNum} units, but only ${availableEff} available (including current invoice stock).`);
    }
  });

  // Calculate Gross Subtotal & Net Subtotal
  const grossSubtotal = items.reduce((sum, item) => {
    const q = parseFloat(item.quantity) || 0;
    const p = parseFloat(item.unit_price) || 0;
    return sum + (q * p);
  }, 0);

  const totalItemDiscounts = items.reduce((sum, item) => {
    const q = parseFloat(item.quantity) || 0;
    const p = parseFloat(item.unit_price) || 0;
    const disc = parseFloat(item.item_discount) || 0;
    const grossLine = q * p;
    if (item.item_discount_type === 'percent') {
      return sum + (grossLine * (disc / 100));
    }
    return sum + disc;
  }, 0);

  const subtotal = Math.max(0, grossSubtotal - totalItemDiscounts);

  const overallDiscNum = parseFloat(overallDiscount) || 0;
  let overallDiscAmount = 0;
  if (overallDiscountType === 'percent') {
    overallDiscAmount = (subtotal * overallDiscNum) / 100;
  } else {
    overallDiscAmount = overallDiscNum;
  }

  const subtotalAfterDiscount = Math.max(0, subtotal - overallDiscAmount);
  const taxNum = parseFloat(taxPercent) || 0;
  const taxAmount = (subtotalAfterDiscount * taxNum) / 100;
  const grandTotal = Math.max(0, subtotalAfterDiscount + taxAmount);

  // File Upload Helpers
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void, isSig: boolean) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const val = event.target.result as string;
        setter(val);
        if (isSig) {
          persistSignatureStampPreferences(includeSignature, includeStamp, val, stampUrl);
        } else {
          persistSignatureStampPreferences(includeSignature, includeStamp, signatureUrl, val);
        }
      }
    };
    reader.readAsDataURL(file);
  }

  // Handle Quick Add Customer
  async function handleCreateQuickCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustName.trim()) return;

    const newId = await db.customers.add({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim(),
      created_at: new Date().toISOString()
    });

    const updatedCusts = await db.customers.toArray();
    setCustomers(updatedCusts);
    showToast(`Customer "${newCustName.trim()}" added successfully!`, 'success');
    setCustomerId(newId);
    setIsCustomerModalOpen(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
  }

  // Save Updated Invoice & Adjust Inventory Stock
  async function handleUpdateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (stockErrors.length > 0) {
      alert("Please fix out-of-stock validation errors before saving.");
      return;
    }
    if (customerId === 0) {
      alert("Please select a customer.");
      return;
    }

    // Validate quantities & prices
    for (let i = 0; i < items.length; i++) {
      const q = parseFloat(items[i].quantity);
      const p = parseFloat(items[i].unit_price);
      if (isNaN(q) || q <= 0) {
        alert(`Line Item #${i + 1} must have a valid quantity greater than 0.`);
        return;
      }
      if (isNaN(p) || p < 0) {
        alert(`Line Item #${i + 1} must have a valid non-negative unit price.`);
        return;
      }
    }

    await persistSignatureStampPreferences(includeSignature, includeStamp, signatureUrl, stampUrl);

    setIsSubmitting(true);
    try {
      await db.transaction('rw', [db.invoices, db.invoice_items, db.products], async () => {
        // 1. Revert stock impact of original items
        for (const orig of originalItems) {
          const p = await db.products.get(orig.product_id);
          if (p) {
            await db.products.update(p.id!, { stock_quantity: p.stock_quantity + orig.quantity });
          }
        }

        // 2. Delete old invoice items
        await db.invoice_items.where('invoice_id').equals(id).delete();

        // 3. Update main Invoice record
        await db.invoices.update(id, {
          customer_id: customerId,
          subtotal,
          overall_discount: overallDiscNum,
          overall_discount_type: overallDiscountType,
          tax_percent: taxNum,
          tax_amount: taxAmount,
          total_amount: grandTotal,
          status,
          terms_conditions: terms,
          signature_url: includeSignature ? (signatureUrl || undefined) : undefined,
          stamp_url: includeStamp ? (stampUrl || undefined) : undefined
        });

        // 4. Add new line items & apply updated stock deduction
        for (const item of items) {
          const q = parseFloat(item.quantity) || 0;
          const pPrice = parseFloat(item.unit_price) || 0;
          const disc = parseFloat(item.item_discount) || 0;
          const p = await db.products.get(item.product_id);
          const purPrice = p ? (p.purchase_price ?? p.cost_price ?? 0) : 0;
          const grossLine = q * pPrice;
          const lineDiscVal = item.item_discount_type === 'percent'
            ? (grossLine * (disc / 100))
            : disc;
          const lineTotal = Math.max(0, grossLine - lineDiscVal);

          await db.invoice_items.add({
            invoice_id: id,
            product_id: item.product_id,
            quantity: q,
            unit_price: pPrice,
            purchase_price: purPrice,
            item_discount: disc,
            item_discount_type: item.item_discount_type || 'percent',
            line_total: lineTotal
          });

          if (p) {
            const updatedStock = Math.max(0, p.stock_quantity - q);
            await db.products.update(p.id!, { stock_quantity: updatedStock });
          }
        }

        showToast(`Invoice #${invoiceNumber} updated successfully!`, 'success');
        router.push(`/invoices/${id}`);
      });
    } catch (err) {
      console.error(err);
      showToast("Failed to update invoice.", 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading invoice for editing...</div>;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-4">
          <Link
            href={`/invoices/${id}`}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
              <FileText className="text-emerald-400" size={26} />
              <span>Edit Invoice #{invoiceNumber}</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Modify items, prices, discounts or customer info
            </p>
          </div>
        </div>
      </div>

      {/* Out of Stock Warning Bar */}
      {stockErrors.length > 0 && (
        <div className="bg-rose-500/10 border-2 border-rose-500/40 rounded-2xl p-4 text-rose-300 space-y-1 animate-pulse">
          <div className="flex items-center space-x-2 font-bold text-rose-400">
            <AlertOctagon size={20} />
            <span>Out-of-Stock Validation Alert</span>
          </div>
          {stockErrors.map((err, i) => (
            <p key={i} className="text-xs pl-7 text-rose-300 font-medium">{err}</p>
          ))}
        </div>
      )}

      {/* Main Billing Form */}
      <form onSubmit={handleUpdateInvoice} className="space-y-8">
        {/* Customer & Details Header Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Customer Selection */}
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Customer
              </label>
            </div>
            <SearchableCustomerSelect
              customers={customers}
              selectedCustomerId={customerId}
              onSelectCustomer={(cId) => setCustomerId(cId)}
              onAddQuickCustomer={() => setIsCustomerModalOpen(true)}
            />
          </div>

          {/* Payment Status & Due Date */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Payment Status
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('Pending')}
                  className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                    status === 'Pending'
                      ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  PENDING
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('Paid')}
                  className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                    status === 'Paid'
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  PAID
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Product Line Items Manager */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-lg font-bold text-white">Line Items</h2>
          </div>

          {items.map((item, idx) => {
            const p = productMap.get(item.product_id);
            const qNum = parseFloat(item.quantity) || 0;
            const pNum = parseFloat(item.unit_price) || 0;
            const dNum = parseFloat(item.item_discount) || 0;

            const effStock = effectiveStockMap.get(item.product_id) || 0;
            const currentItemInForm = items.filter(it => it.product_id === item.product_id);
            const otherFormSum = currentItemInForm
              .filter((_, i) => i !== idx)
              .reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);

            const availableEff = effStock - otherFormSum;
            const isExceeded = qNum > availableEff;

            const grossAmount = qNum * pNum;
            const lineDiscVal = item.item_discount_type === 'percent'
              ? (grossAmount * (dNum / 100))
              : dNum;
            const lineTotal = Math.max(0, grossAmount - lineDiscVal);

            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border transition space-y-3 ${
                  isExceeded
                    ? 'bg-rose-950/20 border-rose-500/50'
                    : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  {/* Searchable Product Dropdown */}
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Product (#{idx + 1})
                    </label>
                    <SearchableProductSelect
                      products={products}
                      categories={categories}
                      selectedProductId={item.product_id}
                      onSelectProduct={(id) => handleProductChange(idx, id)}
                      currency={currency}
                    />
                  </div>

                  {/* Quantity */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Qty
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*\.?\d*$/.test(val)) {
                          const updated = [...items];
                          updated[idx].quantity = val;
                          setItems(updated);
                        }
                      }}
                      className={`w-full bg-slate-900 border rounded-xl px-2 py-2 text-xs text-white font-bold text-center focus:outline-none ${
                        isExceeded ? 'border-rose-500 text-rose-300' : 'border-slate-800 focus:border-emerald-500'
                      }`}
                    />
                  </div>

                  {/* Unit Price */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Unit Price ({currency})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.unit_price}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*\.?\d*$/.test(val)) {
                          const updated = [...items];
                          updated[idx].unit_price = val;
                          setItems(updated);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white text-right focus:outline-none focus:border-emerald-500 font-semibold"
                    />
                  </div>

                  {/* Item Discount & Type Selector */}
                  <div className="sm:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400">
                        Item Discount
                      </label>
                      <div className="flex items-center space-x-1 bg-slate-950 rounded p-0.5 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...items];
                            updated[idx].item_discount_type = 'percent';
                            setItems(updated);
                          }}
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                            item.item_discount_type === 'percent'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...items];
                            updated[idx].item_discount_type = 'fixed';
                            setItems(updated);
                          }}
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                            item.item_discount_type === 'fixed'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {currency}
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={item.item_discount_type === 'percent' ? '%' : currency}
                      value={item.item_discount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*\.?\d*$/.test(val)) {
                          const updated = [...items];
                          updated[idx].item_discount = val;
                          setItems(updated);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-2 text-xs text-rose-400 text-right focus:outline-none focus:border-emerald-500 font-semibold"
                    />
                  </div>

                  {/* Remove Button */}
                  <div className="sm:col-span-1 flex justify-end pt-3 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 transition"
                      title="Remove Row"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap justify-between items-center text-xs pt-1.5 border-t border-slate-900 gap-2">
                  <div className="flex items-center space-x-3 text-slate-500">
                    <span>Effective Available Stock: <span className={isExceeded ? 'text-rose-400 font-bold' : 'text-slate-300 font-semibold'}>{availableEff}</span></span>
                    {p && (
                      <span className="text-slate-400 border-l border-slate-800 pl-3">
                        Cost: <span className="font-semibold text-slate-300">{currency} {(p.purchase_price ?? p.cost_price ?? 0)}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    {p && (
                      <span className="text-slate-400 text-[11px]">
                        Line Profit: <span className="font-bold text-emerald-400">{currency} {(lineTotal - (qNum * (p.purchase_price ?? p.cost_price ?? 0))).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                      </span>
                    )}
                    <span className="font-extrabold text-emerald-400 text-sm">
                      Total: {currency} {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add Row Button - Positioned conveniently at bottom of items list for superior UX */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleAddItem}
              className="w-full flex items-center justify-center space-x-2 bg-slate-800/80 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 font-extrabold py-3.5 px-4 rounded-xl border border-dashed border-emerald-500/40 hover:border-emerald-500 transition-all duration-150 shadow-md"
            >
              <Plus size={18} />
              <span>+ Add Item Row</span>
            </button>
          </div>
        </div>

        {/* Calculation Summary & T&Cs Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Terms & Stamp/Signature Uploaders */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Editable Terms & Conditions
              </label>
              <textarea
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Signature & Stamp Selectors with Persistence */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
              {/* Signature Options */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase text-slate-300 flex items-center space-x-1.5">
                    <input
                      type="checkbox"
                      checked={includeSignature}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setIncludeSignature(val);
                        persistSignatureStampPreferences(val, includeStamp, signatureUrl, stampUrl);
                      }}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Include Signature</span>
                  </label>
                </div>

                {includeSignature && (
                  <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-800 rounded-xl cursor-pointer hover:border-emerald-500 bg-slate-950 transition">
                    <Upload size={18} className="text-slate-400 mb-1" />
                    <span className="text-[10px] text-slate-400">{signatureUrl ? 'Signature Loaded (Saved)' : 'Choose file'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, setSignatureUrl, true)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Stamp Options */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase text-slate-300 flex items-center space-x-1.5">
                    <input
                      type="checkbox"
                      checked={includeStamp}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setIncludeStamp(val);
                        persistSignatureStampPreferences(includeSignature, val, signatureUrl, stampUrl);
                      }}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Include Stamp</span>
                  </label>
                </div>

                {includeStamp && (
                  <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-800 rounded-xl cursor-pointer hover:border-emerald-500 bg-slate-950 transition">
                    <Upload size={18} className="text-slate-400 mb-1" />
                    <span className="text-[10px] text-slate-400">{stampUrl ? 'Stamp Loaded (Saved)' : 'Choose file'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, setStampUrl, false)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Grand Calculations */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-2">
              Bill Calculations
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Gross Amount (Subtotal):</span>
                <span className="font-bold">{currency} {grossSubtotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
              </div>

              {totalItemDiscounts > 0 && (
                <div className="flex justify-between text-rose-400 text-xs">
                  <span>Line Items Discount:</span>
                  <span>-{currency} {totalItemDiscounts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs uppercase font-bold text-slate-400">Overall Bill Discount:</span>
                  <div className="flex bg-slate-950 rounded-md p-0.5 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setOverallDiscountType('percent')}
                      className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        overallDiscountType === 'percent'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setOverallDiscountType('fixed')}
                      className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        overallDiscountType === 'fixed'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {currency}
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={overallDiscountType === 'percent' ? '%' : currency}
                  value={overallDiscount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*\.?\d*$/.test(val)) {
                      setOverallDiscount(val);
                    }
                  }}
                  className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-right font-bold text-rose-400 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-slate-400">Tax Percentage (%):</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxPercent}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*\.?\d*$/.test(val)) {
                      setTaxPercent(val);
                    }
                  }}
                  className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-right font-bold text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-lg font-black">
                <span className="text-white">Final Grand Total:</span>
                <span className="text-emerald-400">{currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting || stockErrors.length > 0}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white font-extrabold text-base rounded-xl shadow-xl shadow-emerald-900/40 transition transform active:scale-98 flex items-center justify-center space-x-2"
              >
                <CheckCircle2 size={20} />
                <span>{isSubmitting ? 'Updating Invoice...' : 'Save Invoice Changes'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Quick Add Customer Modal */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-white">Quick Add Customer</h2>
            <form onSubmit={handleCreateQuickCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Customer / Business Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Al-Hamd Traders"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="+92 300 0000000"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  placeholder="City / Market"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
