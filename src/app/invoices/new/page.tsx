'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Trash2,
  AlertOctagon,
  ArrowLeft,
  CheckCircle2,
  UserPlus
} from 'lucide-react';
import { db, Product, Customer, Category, City, InvoiceTax, getCustomerProductDiscount, saveCustomerProductDiscount } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';
import SearchableProductSelect from '@/components/SearchableProductSelect';
import SearchableCustomerSelect from '@/components/SearchableCustomerSelect';
import SearchableCitySelect from '@/components/SearchableCitySelect';
import TaxManager, { TaxLine } from '@/components/TaxManager';
import { getCustomerPendingBalance } from '@/lib/ledger';

interface LineItemInput {
  product_id: number;
  quantity: string;
  unit_price: string;
  item_discount: string;
  item_discount_type: 'percent' | 'fixed';
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [currency, setCurrency] = useState('Rs.');
  const [defaultTerms, setDefaultTerms] = useState('');

  // Invoice Form Fields
  const [customerId, setCustomerId] = useState<number>(0);
  const [status, setStatus] = useState<'Paid' | 'Pending'>('Pending');
  const [dueDateDays, setDueDateDays] = useState<number>(15);
  const [terms, setTerms] = useState('');
  const [overallDiscount, setOverallDiscount] = useState<string>('0');
  const [overallDiscountType, setOverallDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [taxes, setTaxes] = useState<TaxLine[]>([]);

  // Customer Pending Balance State
  const [customerPendingBalance, setCustomerPendingBalance] = useState<number>(0);
  const [includePendingBalance, setIncludePendingBalance] = useState<boolean>(false);

  useEffect(() => {
    async function loadPendingBalance() {
      if (!customerId) {
        setCustomerPendingBalance(0);
        setIncludePendingBalance(false);
        return;
      }
      const balance = await getCustomerPendingBalance(customerId);
      setCustomerPendingBalance(balance);
      if (balance <= 0) {
        setIncludePendingBalance(false);
      }
    }
    loadPendingBalance();
  }, [customerId]);

  // Signature & Stamp Toggles and URLs
  const [includeSignature, setIncludeSignature] = useState<boolean>(true);
  const [includeStamp, setIncludeStamp] = useState<boolean>(true);
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [stampUrl, setStampUrl] = useState<string>('');

  // Line items state
  const [items, setItems] = useState<LineItemInput[]>([]);

  // Inline Quick Add Customer
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustCityId, setNewCustCityId] = useState<number | undefined>(undefined);
  const [newCustNtn, setNewCustNtn] = useState('');
  const [newCustStn, setNewCustStn] = useState('');
  const [newCustDiscount, setNewCustDiscount] = useState('');

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function initData() {
      try {
        const prods = await db.products.toArray();
        const cats = await db.categories.toArray();
        const custs = await db.customers.toArray();
        const cityList = await db.cities.toArray();
        const curr = await db.settings.get('currency_symbol');
        const termsSetting = await db.settings.get('default_terms');

        // Signature & Stamp stored defaults
        const showSig = await db.settings.get('default_show_signature');
        const showStp = await db.settings.get('default_show_stamp');
        const sigUrl = await db.settings.get('default_signature_url');
        const stpUrl = await db.settings.get('default_stamp_url');

        if (showSig) setIncludeSignature(showSig.value === 'true');
        if (showStp) setIncludeStamp(showStp.value === 'true');
        if (sigUrl) setSignatureUrl(sigUrl.value);
        if (stpUrl) setStampUrl(stpUrl.value);

        setProducts(prods);
        setCategories(cats);
        setCustomers(custs);
        setCities(cityList);
        if (curr) setCurrency(curr.value);
        if (termsSetting) {
          setDefaultTerms(termsSetting.value);
          setTerms(termsSetting.value);
        }

        let initialCust = custs.length > 0 ? custs[0] : null;
        if (initialCust) setCustomerId(initialCust.id!);

        if (prods.length > 0) {
          let discVal = '0';
          let discType: 'percent' | 'fixed' = 'percent';
          if (initialCust) {
            const savedDisc = await getCustomerProductDiscount(initialCust.id!, prods[0].id!);
            if (savedDisc) {
              discVal = String(savedDisc.discount);
              discType = savedDisc.discount_type;
            }
          }

          setItems([
            {
              product_id: prods[0].id!,
              quantity: '1',
              unit_price: String(prods[0].price),
              item_discount: discVal,
              item_discount_type: discType
            }
          ]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    initData();
  }, []);

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

  // Product Map
  const productMap = new Map(products.map(p => [p.id!, p]));

  // Customer selection with auto-applied customer-product discount logic
  async function handleSelectCustomer(cId: number) {
    setCustomerId(cId);
    if (!cId) return;

    const updated = await Promise.all(
      items.map(async (item) => {
        const saved = await getCustomerProductDiscount(cId, item.product_id);
        return {
          ...item,
          item_discount: saved ? String(saved.discount) : '0',
          item_discount_type: saved ? saved.discount_type : 'percent'
        };
      })
    );
    setItems(updated);
  }

  // Add Item Row
  async function handleAddItem() {
    if (products.length === 0) return;
    const firstProd = products[0];
    let discVal = '0';
    let discType: 'percent' | 'fixed' = 'percent';

    if (customerId) {
      const saved = await getCustomerProductDiscount(customerId, firstProd.id!);
      if (saved) {
        discVal = String(saved.discount);
        discType = saved.discount_type;
      }
    }

    setItems(prev => [
      ...prev,
      {
        product_id: firstProd.id!,
        quantity: '1',
        unit_price: String(firstProd.price),
        item_discount: discVal,
        item_discount_type: discType
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

  async function handleProductChange(index: number, pId: number) {
    const p = productMap.get(pId);
    let discVal = '0';
    let discType: 'percent' | 'fixed' = 'percent';

    if (customerId) {
      const saved = await getCustomerProductDiscount(customerId, pId);
      if (saved) {
        discVal = String(saved.discount);
        discType = saved.discount_type;
      }
    }

    setItems(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          product_id: pId,
          unit_price: p ? String(p.price) : '0',
          item_discount: discVal,
          item_discount_type: discType
        };
      }
      return updated;
    });
  }

  // Quick quantity stepper (+/-) for fast invoice entry
  function adjustQty(index: number, delta: number) {
    const updated = [...items];
    const current = parseFloat(updated[index].quantity) || 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    updated[index].quantity = String(next);
    setItems(updated);
  }

  // Stock Validation Check
  let stockErrors: string[] = [];
  items.forEach((item, idx) => {
    const qtyNum = parseFloat(item.quantity) || 0;
    const p = productMap.get(item.product_id);
    if (p && qtyNum > p.stock_quantity) {
      stockErrors.push(`Item #${idx + 1} (${p.name}): Requested ${qtyNum} units, but only ${p.stock_quantity} available in stock.`);
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
  // Multiple tax lines, each applied to the post-discount amount.
  const taxAmount = taxes.reduce(
    (sum, t) => sum + (subtotalAfterDiscount * (parseFloat(t.rate) || 0)) / 100,
    0
  );
  const combinedTaxRate = taxes.reduce((sum, t) => sum + (parseFloat(t.rate) || 0), 0);
  const baseGrandTotal = Math.max(0, subtotalAfterDiscount + taxAmount);
  const pendingAmountToAdd = (includePendingBalance && customerPendingBalance > 0) ? customerPendingBalance : 0;
  const grandTotal = Math.max(0, baseGrandTotal + pendingAmountToAdd);

  // Handle Quick Add Customer
  async function handleCreateQuickCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustName.trim()) return;

    let parsedDisc: number | undefined = undefined;
    if (newCustDiscount.trim() !== '') {
      const d = parseFloat(newCustDiscount);
      if (isNaN(d) || d < 0 || d > 100) {
        showToast('Discount percentage must be a number between 0 and 100.', 'error');
        return;
      }
      parsedDisc = d;
    }

    const newId = await db.customers.add({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim(),
      city_id: newCustCityId,
      ntn_number: newCustNtn.trim() || undefined,
      stn_number: newCustStn.trim() || undefined,
      discount_percentage: parsedDisc,
      created_at: new Date().toISOString()
    });

    const updatedCusts = await db.customers.toArray();
    setCustomers(updatedCusts);
    showToast(`Customer "${newCustName.trim()}" added successfully!`, 'success');
    setCustomerId(newId);

    if (parsedDisc !== undefined) {
      const discStr = String(parsedDisc);
      setItems(prevItems =>
        prevItems.map(item => ({
          ...item,
          item_discount: discStr,
          item_discount_type: 'percent'
        }))
      );
    }

    setIsCustomerModalOpen(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setNewCustCityId(undefined);
    setNewCustNtn('');
    setNewCustStn('');
    setNewCustDiscount('');
  }

  // Save Invoice & Deduct Stock
  async function handleSaveInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (stockErrors.length > 0) {
      alert("Please fix out-of-stock validation errors before saving.");
      return;
    }
    if (customerId === 0) {
      alert("Please select or create a customer.");
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
      // Generate Professional Invoice Number SWT-YEAR-COUNT safely without collisions
      const year = new Date().getFullYear();
      const prefix = `SWT-${year}-`;
      const allInvoices = await db.invoices.toArray();
      let maxNum = 0;
      for (const inv of allInvoices) {
        if (inv.invoice_number && inv.invoice_number.startsWith(prefix)) {
          const num = parseInt(inv.invoice_number.replace(prefix, ''), 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
      let nextNum = maxNum + 1;
      let invoiceNumber = `${prefix}${String(nextNum).padStart(3, '0')}`;
      while (await db.invoices.get({ invoice_number: invoiceNumber })) {
        nextNum++;
        invoiceNumber = `${prefix}${String(nextNum).padStart(3, '0')}`;
      }

      const createdAt = new Date().toISOString();
      const dueDate = new Date(Date.now() + dueDateDays * 24 * 60 * 60 * 1000).toISOString();

      // Build the persisted tax lines (only keep rows with a positive rate).
      const invoiceTaxes: InvoiceTax[] = taxes
        .filter((t) => (parseFloat(t.rate) || 0) > 0)
        .map((t) => ({
          label: t.label.trim() || 'Tax',
          rate: parseFloat(t.rate) || 0,
          amount: (subtotalAfterDiscount * (parseFloat(t.rate) || 0)) / 100,
        }));

      await db.transaction('rw', [db.invoices, db.invoice_items, db.products, db.payments, db.customer_product_discounts], async () => {
        // Ledger-aware status: a brand-new invoice is Unpaid unless the user marks
        // it Paid, in which case a full payment record is created below so the
        // payment history and derived totals stay consistent.
        const isPaidNow = status === 'Paid';

        // 1. Create Invoice
        const invId = await db.invoices.add({
          invoice_number: invoiceNumber,
          customer_id: customerId,
          subtotal,
          overall_discount: overallDiscNum,
          overall_discount_type: overallDiscountType,
          tax_percent: combinedTaxRate,
          tax_amount: taxAmount,
          taxes: invoiceTaxes,
          previous_balance: customerPendingBalance,
          include_previous_balance: includePendingBalance && customerPendingBalance > 0,
          total_amount: grandTotal,
          status: isPaidNow ? 'Paid' : 'Unpaid',
          amount_paid: isPaidNow ? grandTotal : 0,
          terms_conditions: terms,
          signature_url: includeSignature ? (signatureUrl || undefined) : undefined,
          stamp_url: includeStamp ? (stampUrl || undefined) : undefined,
          created_at: createdAt,
          due_date: dueDate
        });

        // 1b. Record the full payment when the invoice is created as Paid.
        if (isPaidNow && grandTotal > 0) {
          await db.payments.add({
            invoice_id: invId,
            customer_id: customerId,
            amount: grandTotal,
            payment_date: createdAt,
            method: 'Cash',
            notes: 'Paid in full at invoice creation',
            is_auto: true,
            created_at: createdAt
          });
        }

        // 2. Add Line Items & Deduct Stock & Save Customer-Product Discount
        for (const item of items) {
          const q = parseFloat(item.quantity) || 0;
          const pPrice = parseFloat(item.unit_price) || 0;
          const disc = parseFloat(item.item_discount) || 0;
          const p = productMap.get(item.product_id);
          const purPrice = p ? (p.purchase_price ?? p.cost_price ?? 0) : 0;
          const grossLine = q * pPrice;
          const lineDiscVal = item.item_discount_type === 'percent'
            ? (grossLine * (disc / 100))
            : disc;
          const lineTotal = Math.max(0, grossLine - lineDiscVal);

          await db.invoice_items.add({
            invoice_id: invId,
            product_id: item.product_id,
            quantity: q,
            unit_price: pPrice,
            purchase_price: purPrice,
            item_discount: disc,
            item_discount_type: item.item_discount_type || 'percent',
            line_total: lineTotal
          });

          // Save / update Customer-Product discount preference for future invoices
          await saveCustomerProductDiscount(
            customerId,
            item.product_id,
            disc,
            item.item_discount_type || 'percent'
          );

          // Stock Deduction dynamically from database
          const currentProduct = await db.products.get(item.product_id);
          if (currentProduct) {
            const newStock = Math.max(0, currentProduct.stock_quantity - q);
            await db.products.update(currentProduct.id!, { stock_quantity: newStock });
          }
        }

        showToast(`Invoice #${invoiceNumber} created successfully!`, 'success');
        router.push(`/invoices/${invId}`);
      });
    } catch (err) {
      console.error(err);
      alert("Failed to save invoice.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading Billing Engine...</div>;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-4">
          <Link
            href="/invoices"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
              <FileText className="text-emerald-400" size={26} />
              <span>Create New Invoice</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Professional Billing Engine
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
      <form onSubmit={handleSaveInvoice} className="space-y-8">
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
              cities={cities}
              selectedCustomerId={customerId}
              onSelectCustomer={handleSelectCustomer}
              onAddQuickCustomer={() => setIsCustomerModalOpen(true)}
            />
          </div>

          {/* Payment Status & Due Date */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Initial Status (Default: UNPAID)
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
                  UNPAID
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
            const isExceeded = p ? qNum > p.stock_quantity : false;
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
                      rowIndex={idx}
                    />
                  </div>

                  {/* Quantity with quick steppers */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Qty
                    </label>
                    <div className={`flex items-stretch bg-slate-900 border rounded-xl overflow-hidden ${
                      isExceeded ? 'border-rose-500' : 'border-slate-800 focus-within:border-emerald-500'
                    }`}>
                      <button
                        type="button"
                        onClick={() => adjustQty(idx, -1)}
                        className="px-2 text-slate-400 hover:text-white hover:bg-slate-800 transition text-sm font-bold select-none"
                        tabIndex={-1}
                      >
                        −
                      </button>
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
                        className={`w-full min-w-0 bg-transparent px-1 py-2 text-xs font-bold text-center focus:outline-none ${
                          isExceeded ? 'text-rose-300' : 'text-white'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => adjustQty(idx, 1)}
                        className="px-2 text-slate-400 hover:text-white hover:bg-slate-800 transition text-sm font-bold select-none"
                        tabIndex={-1}
                      >
                        +
                      </button>
                    </div>
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

                  {/* Discount */}
                  <div className="sm:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400">
                        Item Discount
                      </label>
                      <div className="flex items-center space-x-1 bg-slate-900 rounded p-0.5 border border-slate-800">
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

                {/* Live Stock Meter — updates instantly as quantity changes */}
                {p && (() => {
                  const available = p.stock_quantity;
                  const remaining = available - qNum;
                  const usedPct = available > 0
                    ? Math.min(100, (qNum / available) * 100)
                    : (qNum > 0 ? 100 : 0);
                  const barColor = remaining < 0
                    ? 'bg-rose-500'
                    : remaining === 0
                      ? 'bg-amber-500'
                      : remaining <= available * 0.2
                        ? 'bg-amber-400'
                        : 'bg-emerald-500';
                  const remainLabel = remaining < 0
                    ? `Short by ${Math.abs(remaining)}`
                    : `${remaining} left after sale`;
                  const remainColor = remaining < 0
                    ? 'text-rose-400'
                    : remaining <= available * 0.2
                      ? 'text-amber-400'
                      : 'text-emerald-400';

                  return (
                    <div className="pt-2 border-t border-slate-900 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          In stock: <span className="font-bold text-slate-200">{available}</span>
                          <span className="text-slate-600 mx-1.5">•</span>
                          Using: <span className="font-bold text-slate-200">{qNum || 0}</span>
                        </span>
                        <span className={`font-extrabold ${remainColor}`}>
                          {remainLabel}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
                          style={{ width: `${usedPct}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap justify-between items-center gap-2 pt-0.5">
                        <span className="text-slate-500 text-[11px]">
                          Cost: <span className="font-semibold text-slate-300">{currency} {(p.purchase_price ?? p.cost_price ?? 0)}</span>
                          <span className="text-slate-700 mx-2">|</span>
                          Line Profit: <span className="font-bold text-emerald-400">{currency} {(lineTotal - (qNum * (p.purchase_price ?? p.cost_price ?? 0))).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                        </span>
                        <span className="font-extrabold text-emerald-400 text-sm">
                          Total: {currency} {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })()}
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

        {/* Full-Width Bill Calculations & Summary Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-card space-y-6">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Bill Calculations & Summary</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Review final itemized totals, bill discounts, taxes, and pending customer balances. Warranty terms are automatically applied from <Link href="/settings" className="text-emerald-400 underline font-semibold">Settings</Link>.
              </p>
            </div>

            {/* Signature & Company Seal Toggles */}
            <div className="flex items-center space-x-4 bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeSignature}
                  onChange={(e) => setIncludeSignature(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-300">Include Signature</span>
              </label>
              <div className="h-4 w-px bg-slate-800" />
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeStamp}
                  onChange={(e) => setIncludeStamp(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-300">Include Company Seal</span>
              </label>
            </div>
          </div>

          {/* Main 2-Column Full Width Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Subtotal, Line Discounts, Overall Discount, Taxes */}
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm text-slate-300 pb-2 border-b border-slate-800/80">
                <span className="font-medium">Gross Amount (Subtotal):</span>
                <span className="font-bold text-white text-base">
                  {currency} {grossSubtotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </div>

              {totalItemDiscounts > 0 && (
                <div className="flex justify-between items-center text-xs text-rose-400 pb-2 border-b border-slate-800/60 font-semibold">
                  <span>Line Items Discount Total:</span>
                  <span>-{currency} {totalItemDiscounts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              {/* Overall Bill Discount */}
              <div className="flex items-center justify-between py-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2">
                  <span className="text-xs uppercase font-bold text-slate-400">Overall Bill Discount:</span>
                  <div className="flex bg-slate-950 rounded-md p-0.5 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setOverallDiscountType('percent')}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded ${
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
                      className={`px-2 py-0.5 text-[10px] font-bold rounded ${
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
                  className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-right font-bold text-rose-400 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>

              {/* Tax Manager */}
              <TaxManager
                value={taxes}
                onChange={setTaxes}
                baseAmount={subtotalAfterDiscount}
                currency={currency}
              />
            </div>

            {/* Right Column: Customer Pending Ledger Balance & Grand Total Box */}
            <div className="space-y-4 flex flex-col justify-between">
              {/* Customer Pending Ledger Balance */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="includePendingBalanceCheckbox" className={`flex items-center space-x-2.5 ${customerPendingBalance > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                    <input
                      type="checkbox"
                      id="includePendingBalanceCheckbox"
                      disabled={customerPendingBalance <= 0}
                      checked={includePendingBalance && customerPendingBalance > 0}
                      onChange={(e) => setIncludePendingBalance(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    />
                    <span className={`text-xs font-bold uppercase tracking-wider ${customerPendingBalance > 0 ? 'text-slate-200' : 'text-slate-500'}`}>
                      Include Previous Pending Balance
                    </span>
                  </label>
                  <span className={`text-xs font-extrabold ${customerPendingBalance > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {currency} {customerPendingBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {includePendingBalance && customerPendingBalance > 0 ? (
                  <div className="flex justify-between text-xs text-amber-400 font-bold pt-2 border-t border-slate-800/80">
                    <span>Previous Ledger Balance Added:</span>
                    <span>+{currency} {customerPendingBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                  </div>
                ) : customerPendingBalance <= 0 ? (
                  <p className="text-[11px] text-slate-500 italic">No previous pending ledger balance for this customer.</p>
                ) : null}
              </div>

              {/* Prominent Grand Total Box */}
              <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-emerald-950/40">
                <div>
                  <span className="text-xs uppercase font-bold text-slate-400 block tracking-wider">
                    Final Grand Total
                  </span>
                  <span className="text-xs text-emerald-400/80 font-medium">
                    (Includes net items, discounts & taxes)
                  </span>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
                  {currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Full Width Submit Button */}
          <div className="pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={isSubmitting || stockErrors.length > 0}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white font-black text-lg rounded-xl shadow-xl shadow-emerald-900/40 transition transform active:scale-98 flex items-center justify-center space-x-2 cursor-pointer"
            >
              <CheckCircle2 size={22} />
              <span>{isSubmitting ? 'Saving Invoice...' : 'Create & Generate Invoice'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Quick Add Customer Modal */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white">Quick Add Customer</h2>
            <form onSubmit={handleCreateQuickCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Customer / Business Name <span className="text-rose-400">*</span>
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
                  City <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                </label>
                <SearchableCitySelect
                  cities={cities}
                  selectedCityId={newCustCityId}
                  onSelectCity={(cityId) => setNewCustCityId(cityId)}
                  onCityCreated={async () => {
                    const updatedCities = await db.cities.toArray();
                    setCities(updatedCities);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  placeholder="Main Market / Street..."
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    NTN Number <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1234567-8"
                    value={newCustNtn}
                    onChange={(e) => setNewCustNtn(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    STN Number <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543-2"
                    value={newCustStn}
                    onChange={(e) => setNewCustStn(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Discount (%) <span className="text-[10px] lowercase text-slate-500 font-normal ml-1 border border-slate-800 px-1.5 py-0.5 rounded">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    placeholder="e.g. 5"
                    value={newCustDiscount}
                    onChange={(e) => setNewCustDiscount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                  />
                </div>
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
